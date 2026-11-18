/**
 * Reporting-period labelling (V2.0.7 C0.1).
 *
 * Every period label identifies the YEAR. A "business date" here is a plain `YYYY-MM-DD`
 * calendar date with no time zone: all arithmetic is done on UTC calendar fields so the
 * result can never shift with the machine's zone (the same rule the rest of the app follows
 * for service dates).
 */

export type ReportPeriodKind = "day" | "month" | "custom";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const WEEKDAY_MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});
const WEEKDAY_MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

function at(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** "Mon, Nov 30, 2026" — one business date, always with its year. */
export function formatReportDate(date: string): string {
  return parseIsoDate(date) ? WEEKDAY_MONTH_DAY_YEAR.format(at(date)) : date;
}

/**
 * Whether `start..end` is exactly one calendar day, exactly one whole calendar month, or
 * anything else. Invalid input is "custom" (it is never relabelled as a month).
 */
export function classifyReportPeriod(
  start: string,
  end: string,
): ReportPeriodKind {
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  if (!a || !b) return "custom";
  if (start === end) return "day";
  if (
    a.year === b.year &&
    a.month === b.month &&
    a.day === 1 &&
    b.day === lastDayOfMonth(b.year, b.month)
  ) {
    return "month";
  }
  return "custom";
}

/**
 * The label printed on a statement and shown in the UI. The year is always present:
 *  - one day            → "Mon, Nov 30, 2026"
 *  - one whole month    → "November 2026"
 *  - same-year range    → "Sun, Nov 1 – Mon, Nov 30, 2026"
 *  - cross-year range   → "Wed, Dec 31, 2025 – Thu, Jan 1, 2026"
 */
export function formatReportPeriodLabel(start: string, end: string): string {
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  if (!a || !b) return `${start} – ${end}`;
  const kind = classifyReportPeriod(start, end);
  if (kind === "day") return formatReportDate(start);
  if (kind === "month") return MONTH_YEAR.format(at(start));
  if (a.year === b.year) {
    return `${WEEKDAY_MONTH_DAY.format(at(start))} – ${formatReportDate(end)}`;
  }
  return `${formatReportDate(start)} – ${formatReportDate(end)}`;
}

/** Title of an attendance statement: only a whole month is called "monthly". */
export function attendanceStatementTitle(kind: ReportPeriodKind): string {
  return kind === "month"
    ? "Monthly Staff Attendance Timesheet"
    : "Staff Attendance Statement";
}

/** First and last day of the calendar month containing `date` (`YYYY-MM-DD`). */
export function monthBounds(
  date: string,
): { start: string; end: string } | null {
  const parts = parseIsoDate(date);
  if (!parts) return null;
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(lastDayOfMonth(parts.year, parts.month)).padStart(2, "0");
  return { start: `${parts.year}-${mm}-01`, end: `${parts.year}-${mm}-${dd}` };
}

/** Month `offset` months away from the month containing `date`, as whole-month bounds. */
export function shiftMonth(
  date: string,
  offset: number,
): { start: string; end: string } | null {
  const parts = parseIsoDate(date);
  if (!parts) return null;
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + offset, 1));
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return monthBounds(`${shifted.getUTCFullYear()}-${mm}-01`);
}

/** Inclusive number of calendar days in `start..end`, or null for invalid / reversed input. */
export function inclusiveDayCount(start: string, end: string): number | null {
  if (!parseIsoDate(start) || !parseIsoDate(end) || start > end) return null;
  return Math.round((at(end).getTime() - at(start).getTime()) / 86_400_000) + 1;
}

/** "November 2026" for a `YYYY-MM-01` payroll accounting month (or any date in the month). */
export function formatPeriodMonth(periodMonth: string): string {
  const bounds = monthBounds(periodMonth);
  return bounds
    ? formatReportPeriodLabel(bounds.start, bounds.end)
    : periodMonth;
}
