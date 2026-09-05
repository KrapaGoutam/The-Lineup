export type TipIntervalInput = {
  id: string;
  start: string;
  end: string;
  amountCents: number;
  participantIds: string[];
};

export type TipIntervalAllocation = TipIntervalInput & {
  allocations: Array<{ participantId: string; amountCents: number }>;
};

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function allocateTipInterval(
  interval: TipIntervalInput,
): TipIntervalAllocation {
  if (!Number.isInteger(interval.amountCents) || interval.amountCents < 0) {
    throw new Error("Tip amount must be a non-negative number of cents.");
  }
  if (!timePattern.test(interval.start) || !timePattern.test(interval.end)) {
    throw new Error("Use 24-hour HH:mm interval times.");
  }
  if (interval.start === interval.end) {
    throw new Error("Tip interval start and end must be different.");
  }
  const participants = [...new Set(interval.participantIds)].sort();
  if (participants.length === 0) {
    throw new Error("Choose at least one participant.");
  }
  const base = Math.floor(interval.amountCents / participants.length);
  const remainder = interval.amountCents % participants.length;
  return {
    ...interval,
    participantIds: participants,
    allocations: participants.map((participantId, index) => ({
      participantId,
      amountCents: base + (index < remainder ? 1 : 0),
    })),
  };
}

export function calculateTipSplits(intervals: TipIntervalInput[]) {
  for (let left = 0; left < intervals.length; left += 1) {
    const leftStart = minutes(intervals[left].start);
    let leftEnd = minutes(intervals[left].end);
    if (leftEnd <= leftStart) leftEnd += 24 * 60;
    for (let right = left + 1; right < intervals.length; right += 1) {
      const rightStart = minutes(intervals[right].start);
      let rightEnd = minutes(intervals[right].end);
      if (rightEnd <= rightStart) rightEnd += 24 * 60;
      if (leftStart < rightEnd && rightStart < leftEnd) {
        throw new Error("Tip intervals cannot overlap.");
      }
    }
  }
  const allocated = intervals.map(allocateTipInterval);
  const totals = new Map<string, number>();
  for (const interval of allocated) {
    for (const allocation of interval.allocations) {
      totals.set(
        allocation.participantId,
        (totals.get(allocation.participantId) ?? 0) + allocation.amountCents,
      );
    }
  }
  return {
    intervals: allocated,
    totals: [...totals.entries()]
      .map(([participantId, amountCents]) => ({ participantId, amountCents }))
      .sort((a, b) => a.participantId.localeCompare(b.participantId)),
    totalCents: intervals.reduce(
      (sum, interval) => sum + interval.amountCents,
      0,
    ),
  };
}

export function dollarsToCents(value: string) {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim())) {
    throw new Error("Enter a valid dollar amount with at most two decimals.");
  }
  const [whole, decimal = ""] = value.trim().split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
