import { expandDateRange } from "./shift-planning";

// Sun-first, matching `Date.getUTCDay()`'s own 0=Sun..6=Sat convention --
// deliberately NOT the schedule grid's own Mon-first display order
// (schedule-workspace.tsx's `weekdayLabels`). The spec's own creation-form
// wording is "days-of-week checkboxes (Sunday through Saturday)", a
// different, independent ordering choice from how the grid happens to
// lay out its columns.
export const WEEKDAY_TOKENS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

const TOKEN_TO_WEEKDAY = new Map<string, number>(
  WEEKDAY_TOKENS.map((token, index) => [token.toLowerCase(), index]),
);

/** A single "Mon"/"tue"/"WED" token -> 0-6 (Sun=0). Case-insensitive. */
export function parseWeekdayToken(token: string): number {
  const weekday = TOKEN_TO_WEEKDAY.get(token.trim().toLowerCase());
  if (weekday === undefined) {
    throw new Error(
      `Unknown day "${token}". Use Sun, Mon, Tue, Wed, Thu, Fri, or Sat.`,
    );
  }
  return weekday;
}

/**
 * "Mon;Wed;Fri" or "Mon,Wed,Fri" (or a mix) -> [1, 3, 5], deduplicated and
 * sorted. Both separators are accepted per the spec's own two examples --
 * a manager pasting from a spreadsheet is exactly as likely to end up
 * with either.
 */
export function parseWeekdayList(raw: string): number[] {
  const tokens = raw
    .split(/[;,]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    throw new Error("Select at least one day.");
  }
  const weekdays = new Set(tokens.map(parseWeekdayToken));
  return [...weekdays].sort((a, b) => a - b);
}

/**
 * The dates within [fromDate, toDate] whose weekday is one of
 * `daysOfWeek` -- reuses `expandDateRange`'s own range expansion and
 * 62-day cap rather than reimplementing either, and only adds the
 * weekday filter on top. Pure date-only math: parsed and compared as
 * UTC, the same way every other calendar-date computation in this
 * module already works, so it needs no timezone/DST-awareness of its
 * own -- that already happens one layer down, in
 * `zonedWallTimeToInstant`, once each resulting date is turned into a
 * real shift instant.
 */
export function expandRecurringDates(input: {
  fromDate: string;
  toDate: string;
  daysOfWeek: number[];
}): string[] {
  const daySet = new Set(input.daysOfWeek);
  return expandDateRange(input.fromDate, input.toDate).filter((date) => {
    const [year, month, day] = date.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return daySet.has(weekday);
  });
}
