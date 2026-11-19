import { addDays } from "@/features/tips/domain/interval-times";
import {
  formatReportPeriodLabel,
  monthBounds,
  shiftMonth,
} from "@/lib/report-period";

export type TipsPeriodPreset =
  | "today"
  | "yesterday"
  | "this-week"
  | "this-month"
  | "previous-month"
  | "custom";

export const TIPS_PERIOD_PRESETS: ReadonlyArray<{
  id: TipsPeriodPreset;
  label: string;
}> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this-week", label: "This week" },
  { id: "this-month", label: "This month" },
  { id: "previous-month", label: "Previous month" },
  { id: "custom", label: "Custom range" },
];

/** Matches the database (`tips_get_range` accepts at most 400 days). */
export const MAX_TIPS_RANGE_DAYS = 366;

export type TipsPeriod = {
  preset: TipsPeriodPreset;
  from: string;
  to: string;
  label: string;
};

export type TipsPeriodResult =
  | { ok: true; period: TipsPeriod }
  | { ok: false; error: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!ISO.test(value)) return false;
  return addDays(value, 0) === value;
}

function dayCount(from: string, to: string): number {
  return (
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000,
    ) + 1
  );
}

/**
 * `today` is the LOCATION's business date (never the machine's). Weeks run Monday to
 * Sunday. Every period is a plain inclusive pair of service dates.
 */
export function resolveTipsPeriod(
  preset: TipsPeriodPreset,
  today: string,
  custom?: { from: string; to: string },
): TipsPeriodResult {
  if (!isRealDate(today))
    return { ok: false, error: "Today is not a valid date." };
  let from: string;
  let to: string;
  switch (preset) {
    case "today":
      from = to = today;
      break;
    case "yesterday":
      from = to = addDays(today, -1);
      break;
    case "this-week": {
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
      from = addDays(today, -((weekday + 6) % 7));
      to = addDays(from, 6);
      break;
    }
    case "this-month": {
      const bounds = monthBounds(today);
      if (!bounds) return { ok: false, error: "Today is not a valid date." };
      from = bounds.start;
      to = bounds.end;
      break;
    }
    case "previous-month": {
      const bounds = shiftMonth(today, -1);
      if (!bounds) return { ok: false, error: "Today is not a valid date." };
      from = bounds.start;
      to = bounds.end;
      break;
    }
    case "custom": {
      if (!custom || !isRealDate(custom.from) || !isRealDate(custom.to)) {
        return { ok: false, error: "Choose a valid start and end date." };
      }
      if (custom.from > custom.to) {
        return {
          ok: false,
          error: "The start date must be on or before the end date.",
        };
      }
      if (dayCount(custom.from, custom.to) > MAX_TIPS_RANGE_DAYS) {
        return {
          ok: false,
          error: `Choose a range of at most ${MAX_TIPS_RANGE_DAYS} days.`,
        };
      }
      from = custom.from;
      to = custom.to;
      break;
    }
  }
  return {
    ok: true,
    period: { preset, from, to, label: formatReportPeriodLabel(from, to) },
  };
}
