import {
  zonedWallTimeFromInstant,
  zonedWallTimeToInstant,
} from "@/lib/timezone";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar-date arithmetic on a plain `YYYY-MM-DD`, never touching the machine zone. */
export function addDays(date: string, days: number): string {
  const match = DATE.exec(date);
  if (!match) throw new Error("Use a valid service date.");
  const probe = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  );
  return probe.toISOString().slice(0, 10);
}

export type IntervalInstants = {
  startsAt: Date;
  endsAt: Date;
  /** The end is on the calendar day after the service date. */
  crossesMidnight: boolean;
};

/**
 * Turns "service date + wall-clock start/end" into real instants in the location's zone.
 * An end at or before the start means the interval runs past midnight into the next
 * calendar day (a 23:00–01:00 interval); equal times are rejected as ambiguous. DST is
 * handled by `zonedWallTimeToInstant` (a skipped wall time moves forward; a repeated wall
 * time takes the first occurrence), so the REAL elapsed time is what the database stores.
 */
export function resolveIntervalInstants(input: {
  serviceDate: string;
  start: string;
  end: string;
  timeZone: string;
}): IntervalInstants {
  if (!TIME.test(input.start) || !TIME.test(input.end)) {
    throw new Error("Use 24-hour HH:mm interval times.");
  }
  if (input.start === input.end) {
    throw new Error("Tip interval start and end must be different.");
  }
  const crossesMidnight = input.end < input.start;
  const startsAt = zonedWallTimeToInstant({
    date: input.serviceDate,
    time: input.start,
    timeZone: input.timeZone,
  });
  const endsAt = zonedWallTimeToInstant({
    date: crossesMidnight ? addDays(input.serviceDate, 1) : input.serviceDate,
    time: input.end,
    timeZone: input.timeZone,
  });
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("Tip interval must end after it starts.");
  }
  if (endsAt.getTime() - startsAt.getTime() > 24 * 3_600_000) {
    throw new Error("A tip interval can last at most 24 hours.");
  }
  return { startsAt, endsAt, crossesMidnight };
}

export type IntervalDisplay = {
  start: string;
  end: string;
  endsNextDay: boolean;
};

/** Wall-clock display of stored instants, in the location's zone. */
export function describeInterval(
  startsAtIso: string,
  endsAtIso: string,
  timeZone: string,
): IntervalDisplay {
  const start = zonedWallTimeFromInstant(new Date(startsAtIso), timeZone);
  const end = zonedWallTimeFromInstant(new Date(endsAtIso), timeZone);
  return {
    start: start.time,
    end: end.time,
    endsNextDay: end.date > start.date,
  };
}
