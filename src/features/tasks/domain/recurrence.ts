import { addDaysToDate } from "./task-rules";
import type { RecurrenceRuleView } from "./task-types";

/**
 * Pure mirror of `private.recurrence_dates` (the database is authoritative;
 * this powers demo mode and the "next occurrences" preview). Patterns:
 * daily, weekdays (Mon-Fri), weekly (the start date's weekday), selected
 * weekdays, monthly (day of month, clamped to the month's last day). Ends:
 * never, on a date, or after N occurrences counted from the start date.
 * There is deliberately no custom interval in V1.
 */
export type RecurrencePattern = Pick<
  RecurrenceRuleView,
  | "frequency"
  | "weekdays"
  | "dayOfMonth"
  | "startsOn"
  | "endType"
  | "endsOn"
  | "maxOccurrences"
>;

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function daysInMonth(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function matches(rule: RecurrencePattern, date: string): boolean {
  const dow = weekdayOf(date);
  switch (rule.frequency) {
    case "daily":
      return true;
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "weekly":
    case "selected_weekdays":
      return (rule.weekdays ?? []).includes(dow);
    case "monthly": {
      const day = Number(date.slice(8, 10));
      return day === Math.min(rule.dayOfMonth ?? 1, daysInMonth(date));
    }
  }
}

/** Occurrence dates in [from, through] (inclusive), honouring the end rule. */
export function occurrenceDates(
  rule: RecurrencePattern,
  from: string,
  through: string,
): string[] {
  const last =
    rule.endType === "on_date" && rule.endsOn && rule.endsOn < through
      ? rule.endsOn
      : through;
  const dates: string[] = [];
  let count = 0;
  for (let d = rule.startsOn; d <= last; d = addDaysToDate(d, 1)) {
    if (!matches(rule, d)) continue;
    count += 1;
    if (rule.endType === "after_count" && count > (rule.maxOccurrences ?? 0)) {
      break;
    }
    if (d >= from) dates.push(d);
  }
  return dates;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Every day", "Weekdays", "Weekly on Fri", "Mon, Wed", "Monthly on the 15th". */
export function recurrenceSummary(rule: RecurrencePattern): string {
  const base = (() => {
    switch (rule.frequency) {
      case "daily":
        return "Every day";
      case "weekdays":
        return "Weekdays";
      case "weekly":
        return `Weekly on ${WEEKDAY_NAMES[weekdayOf(rule.startsOn)]}`;
      case "selected_weekdays":
        return (rule.weekdays ?? []).map((d) => WEEKDAY_NAMES[d]).join(", ");
      case "monthly":
        return `Monthly on day ${rule.dayOfMonth ?? Number(rule.startsOn.slice(8, 10))}`;
    }
  })();
  if (rule.endType === "on_date" && rule.endsOn)
    return `${base}, until ${rule.endsOn}`;
  if (rule.endType === "after_count") {
    return `${base}, ${rule.maxOccurrences} times`;
  }
  return base;
}
