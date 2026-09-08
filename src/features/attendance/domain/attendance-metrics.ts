import { aggregateHours } from "./attendance-report";

// Shared by the month/year navigator (component) and PersonSection's own
// "of N days in <Month>" stat-tile subtitle, so the two never drift to
// different month names for the same numeric month.
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// row.date/a bare "YYYY-MM-DD" is a local calendar date, not an instant --
// its weekday and day-of-month are properties of that calendar date alone,
// independent of any time zone. Parsed as UTC noon (any UTC hour would do;
// noon just avoids ever landing on a DST-adjacent midnight by habit) and
// formatted with `timeZone: "UTC"` so the *rendering* step can't
// reintroduce a timezone-dependent shift either. Promoted here from what
// was originally attendance-report.tsx's private `mobileDateParts` -- same
// technique, now shared by the desktop table's new Day column and the
// mobile ledger both, and independently unit-tested per the spec's own
// Test Plan ("accurate calendar weekday calculation across month
// boundaries and leap years").
export function calendarWeekday(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(utcDate);
}

export function dayOfMonth(isoDate: string): string {
  const [, , day] = isoDate.split("-");
  return day;
}

// The day-0-of-next-month trick (see attendance-report.ts's monthRange,
// which this deliberately does not import from -- a one-line UTC
// computation isn't worth a cross-file dependency) -- correctly returns
// 28 or 29 for February depending on the year, including real leap years,
// without a separate leap-year rule of its own.
export function daysInMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

export type AttendanceSummary = {
  daysWorked: number;
  totalHours: number;
  avgPerDay: number;
  excludedRowCount: number;
};

/**
 * The three stat-card numbers (`Days Worked`/`Total Hours`/`Avg per Day`)
 * as one named, tested function -- previously inline arithmetic in
 * PersonSection. Wraps the existing `aggregateHours` rather than
 * reimplementing its null-`hoursWorked` exclusion rule: a row with no
 * recorded hours was never a worked day, so it's excluded from
 * `daysWorked` (and therefore `avgPerDay`) the exact same way it's
 * already excluded from `totalHours`. Returns full-precision numbers --
 * rounding to the spec's "0.1h resolution" happens only at display time
 * (`formatHours`), the same separation this app already keeps everywhere
 * else between exact domain math and edge-of-render formatting.
 */
export function computeAttendanceSummary(
  rows: Array<{ hoursWorked: number | null }>,
): AttendanceSummary {
  const { totalHours, excludedRowCount } = aggregateHours(rows);
  const daysWorked = rows.length - excludedRowCount;
  const avgPerDay = daysWorked > 0 ? totalHours / daysWorked : 0;
  return { daysWorked, totalHours, avgPerDay, excludedRowCount };
}
