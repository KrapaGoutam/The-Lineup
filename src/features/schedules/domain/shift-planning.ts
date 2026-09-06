export type ShiftKind = "morning" | "evening" | "full_day";

export type ShiftTime = {
  start: string;
  end: string;
};

export type ShiftDefaults = Record<ShiftKind, ShiftTime>;

export type ShiftInstance = {
  serviceDate: string;
  endDate: string;
  shiftKind: ShiftKind;
  startLocal: string;
  endLocal: string;
  usesDefaultTime: boolean;
};

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseIsoDate(date: string) {
  if (!isoDatePattern.test(date)) throw new Error("Use an ISO date.");
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    throw new Error("Date does not exist.");
  }
  return value;
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nextDate(date: string) {
  const value = parseIsoDate(date);
  value.setUTCDate(value.getUTCDate() + 1);
  return formatIsoDate(value);
}

/**
 * The Monday-Sunday week containing `anchorDate` (an ISO date), as 7
 * consecutive ISO date strings starting on Monday -- matching the
 * schedule grid's fixed Mon..Sun column order. Feature 015 (Phase B):
 * real mode needs the actual current week, computed from the location's
 * local "today"; demo mode keeps its own fixed September 2026 week
 * (matching its seeded shift data) rather than calling this.
 */
export function getWeekDates(anchorDate: string): string[] {
  const anchor = parseIsoDate(anchorDate);
  // getUTCDay(): 0=Sun..6=Sat. Days to subtract to reach that week's Monday.
  const daysSinceMonday = (anchor.getUTCDay() + 6) % 7;
  const monday = new Date(anchor);
  monday.setUTCDate(anchor.getUTCDate() - daysSinceMonday);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return formatIsoDate(date);
  });
}

/**
 * Every date in the calendar month containing `anchorDate`, in order.
 * Feature 015 (Phase B): drives the month view's grid (day count and
 * which weekday it starts on) from the actual month, replacing a
 * hardcoded 30-cell September grid -- used for both demo and real mode,
 * since demo's fixed anchor date already resolves to the same September
 * 2026 grid this replaces.
 */
export function getMonthDates(anchorDate: string): string[] {
  const anchor = parseIsoDate(anchorDate);
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: daysInMonth }, (_, index) =>
    formatIsoDate(new Date(Date.UTC(year, month, index + 1))),
  );
}

export function expandDateRange(fromDate: string, toDate?: string) {
  const start = parseIsoDate(fromDate);
  const end = parseIsoDate(toDate || fromDate);
  if (end < start) throw new Error("To date must be on or after from date.");

  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > 62) throw new Error("A shift range cannot exceed 62 days.");

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return formatIsoDate(date);
  });
}

export function createShiftInstances(input: {
  fromDate: string;
  toDate?: string;
  shiftKind: ShiftKind;
  customStart?: string;
  customEnd?: string;
  defaults: ShiftDefaults;
}): ShiftInstance[] {
  const hasCustomStart = Boolean(input.customStart);
  const hasCustomEnd = Boolean(input.customEnd);
  if (hasCustomStart !== hasCustomEnd) {
    throw new Error("Custom start and end time must be supplied together.");
  }

  const time = hasCustomStart
    ? { start: input.customStart!, end: input.customEnd! }
    : input.defaults[input.shiftKind];
  if (!localTimePattern.test(time.start) || !localTimePattern.test(time.end)) {
    throw new Error("Use 24-hour HH:mm times.");
  }

  return expandDateRange(input.fromDate, input.toDate).map((serviceDate) => ({
    serviceDate,
    endDate: time.end <= time.start ? nextDate(serviceDate) : serviceDate,
    shiftKind: input.shiftKind,
    startLocal: time.start,
    endLocal: time.end,
    usesDefaultTime: !hasCustomStart,
  }));
}

export function findShiftConflicts(
  shifts: Array<ShiftInstance & { employeeId: string }>,
) {
  const conflicts = new Set<number>();
  for (let left = 0; left < shifts.length; left += 1) {
    for (let right = left + 1; right < shifts.length; right += 1) {
      const a = shifts[left];
      const b = shifts[right];
      if (a.employeeId !== b.employeeId) continue;
      const aStart = `${a.serviceDate}T${a.startLocal}`;
      const aEnd = `${a.endDate}T${a.endLocal}`;
      const bStart = `${b.serviceDate}T${b.startLocal}`;
      const bEnd = `${b.endDate}T${b.endLocal}`;
      if (aStart < bEnd && bStart < aEnd) {
        conflicts.add(left);
        conflicts.add(right);
      }
    }
  }
  return [...conflicts].sort((a, b) => a - b);
}
