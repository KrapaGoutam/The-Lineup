import { money } from "@/features/tips/domain/tips-format";

import type {
  AttendanceCard,
  LowStockCard,
  PayrollCard,
  TipsCard,
} from "./dashboard-model";

/** `2026-11-19` -> "Thursday, November 19". Pure calendar math: no time-zone shift. */
export function formatServiceDate(serviceDate: string): string {
  const [year, month, day] = serviceDate.split("-").map(Number);
  if (!year || !month || !day) return serviceDate;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** `2026-11-01` -> "November 2026". */
export function formatPeriodMonth(periodMonth: string): string {
  const [year, month] = periodMonth.split("-").map(Number);
  if (!year || !month) return periodMonth;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function formatClock(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

export type CardFigures = {
  /** The headline number or amount. */
  value: string;
  /** What the headline is. */
  label: string;
  /** Supporting lines, most important first. */
  lines: string[];
};

export function attendanceFigures(card: AttendanceCard): CardFigures {
  return {
    value: String(card.clockedIn),
    label: "Currently clocked in",
    lines: [
      card.clockedIn === 0
        ? "Nobody is clocked in right now"
        : card.onBreak > 0
          ? `${card.onBreak} on a break`
          : "None on a break",
      card.sourceLabel,
    ],
  };
}

export function payrollFigures(card: PayrollCard): CardFigures {
  return {
    value: String(card.draftPeriods),
    label: "Draft payroll periods",
    lines: [
      `${formatPeriodMonth(card.periodMonth)} · not yet locked`,
      `Outstanding balance ${money(card.outstandingBalanceCents)}`,
      card.periodsCounted === 0
        ? "No payroll periods at this branch yet"
        : `Across ${plural(card.periodsCounted, "period")} at this branch`,
    ],
  };
}

export function tipsFigures(card: TipsCard, timeZone: string): CardFigures {
  if (card.view === "staff") {
    const lines = [
      `Cash ${money(card.cashCents)} · Card ${money(card.cardCents)}`,
    ];
    if (card.notSplitCents > 0) {
      lines.push(`Not split ${money(card.notSplitCents)}`);
    }
    if (card.totalCents === 0)
      lines.unshift("No tips allocated to you yet today");
    return { value: money(card.totalCents), label: "My tips today", lines };
  }
  const lines: string[] = [];
  if (card.intervalCount === 0) {
    lines.push("No tips saved yet today");
  } else {
    lines.push(plural(card.intervalCount, "saved interval"));
    lines.push(`Cash ${money(card.cashCents)} · Card ${money(card.cardCents)}`);
    if (card.notSplitCents > 0) {
      lines.push(`Not split ${money(card.notSplitCents)}`);
    }
    if (card.lastUpdatedAt) {
      const at = formatClock(card.lastUpdatedAt, timeZone);
      if (at) lines.push(`Updated ${at}`);
    }
  }
  return { value: money(card.totalCents), label: "Recorded tips today", lines };
}

export function lowStockFigures(card: LowStockCard): CardFigures {
  return {
    value: String(card.needsOrdering),
    label: "Items needing ordering",
    lines: [
      card.needsOrdering === 0
        ? "Nothing is low right now"
        : `${card.critical} critical · ${card.low} low`,
    ],
  };
}
