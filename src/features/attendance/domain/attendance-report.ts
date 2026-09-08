import type { NeonUser } from "../data/attendance-data";

export type AttendancePeriodSelection =
  | { type: "this-month" }
  | { type: "previous-month" }
  | { type: "custom"; start: string; end: string }
  // Feature 025: the month/year navigator's own selection -- month is
  // 1-12 (January = 1), matching every other calendar-month convention
  // in this app (todayLocalDate's own "YYYY-MM-DD" split, for one).
  // Deliberately a variant of the same union every existing caller
  // (the component, the Server Action's zod schema) already resolves
  // through `resolvePeriodRange`, not a parallel type -- one period
  // concept, one resolver.
  | { type: "month"; year: number; month: number };

// Day 0 of the following month is the last day of this one -- avoids a
// separate "days in month" lookup, including for February and leap
// years. Shared by this-month/previous-month/month below so there is
// exactly one place that ever does this arithmetic, not three
// near-identical Date.UTC blocks that could quietly drift apart.
function monthRange(
  year: number,
  month1To12: number,
): {
  start: string;
  end: string;
} {
  const start = new Date(Date.UTC(year, month1To12 - 1, 1));
  const end = new Date(Date.UTC(year, month1To12, 0));
  const toDateString = (date: Date) => date.toISOString().slice(0, 10);
  return { start: toDateString(start), end: toDateString(end) };
}

/**
 * "This month"/"Previous month" resolve against the restaurant's own wall
 * clock date (`todayLocalDate`, computed by the caller via the same
 * `zonedWallTimeFromInstant` helper `getScheduleContext` already uses for
 * "today" -- never the server's or browser's local time) -- a manager
 * checking this near midnight shouldn't see a month boundary that
 * doesn't match the restaurant's actual calendar day. `month` resolves a
 * caller-chosen year/month directly (Feature 025's navigator), completely
 * independent of `todayLocalDate` -- the whole point of being able to
 * browse to an arbitrary past month.
 */
export function resolvePeriodRange(
  selection: AttendancePeriodSelection,
  todayLocalDate: string,
): { start: string; end: string } {
  if (selection.type === "custom") {
    return { start: selection.start, end: selection.end };
  }
  if (selection.type === "month") {
    return monthRange(selection.year, selection.month);
  }
  const [year, month] = todayLocalDate.split("-").map(Number);
  if (selection.type === "this-month") {
    return monthRange(year, month);
  }
  // previous-month: roll back one month, wrapping January to December of
  // the prior year -- monthRange itself only ever sees a valid 1-12.
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  return monthRange(previousYear, previousMonth);
}

/**
 * "Full Name (role)" is the default display label -- falls back to
 * appending a short id suffix only when both name AND role collide too
 * (two people who share a name and happen to have the identically-typo'd
 * free-text role). Neon's `role` is displayed verbatim (whitespace
 * trimmed only, never corrected or mapped onto this app's own
 * designations) -- see docs/features/018-neon-attendance-report.md.
 */
export function buildDisplayLabels(
  users: Array<Pick<NeonUser, "id" | "fullName" | "role">>,
): Map<number, string> {
  const baseLabelCounts = new Map<string, number>();
  const withBaseLabel = users.map((user) => {
    const trimmedRole = user.role.trim();
    const base = trimmedRole
      ? `${user.fullName} (${trimmedRole})`
      : user.fullName;
    baseLabelCounts.set(base, (baseLabelCounts.get(base) ?? 0) + 1);
    return { user, base };
  });

  const labels = new Map<number, string>();
  for (const { user, base } of withBaseLabel) {
    const collides = (baseLabelCounts.get(base) ?? 0) > 1;
    labels.set(user.id, collides ? `${base} #${user.id}` : base);
  }
  return labels;
}

export type HoursAggregate = {
  totalHours: number;
  // A null hours_worked row is never silently folded into "0" without a
  // trace -- the total says how many rows it had to exclude, so a
  // number that looks lower than expected has an explanation attached
  // to it, not just a bare figure.
  excludedRowCount: number;
};

export function aggregateHours(
  rows: Array<{ hoursWorked: number | null }>,
): HoursAggregate {
  let totalHours = 0;
  let excludedRowCount = 0;
  for (const row of rows) {
    if (row.hoursWorked === null) {
      excludedRowCount += 1;
      continue;
    }
    totalHours += row.hoursWorked;
  }
  return { totalHours, excludedRowCount };
}
