import { zonedWallTimeFromInstant } from "@/lib/timezone";

import type { InventoryRow } from "./inventory-rows";
import type { HistoryEntry } from "./inventory-types";
import { fromCents, STATUS_LABEL, toCents } from "./stock-rules";
import { localDate, shiftDate, type ColumnSpec } from "./table-filters";

/**
 * Inventory analytics, computed from the immutable adjustment ledger
 * (ANALYTICS_SPEC.md). Everything here is a pure function of the ledger rows,
 * the current stock rows and the options, so the rules are unit-tested and the
 * database never stores a derived figure.
 */

// ---------------------------------------------------------------------
// 1. What counts as consumption
// ---------------------------------------------------------------------

export type MovementKind =
  /** Reason "Usage", count went down: explicit, confirmed. */
  | "confirmed_usage"
  /** Reason "Stock Count", count went down: observed, never called a sale. */
  | "observed_depletion"
  | "breakage"
  | "comp"
  /** Reason "Delivery / Restock", count went up. */
  | "restock"
  /** Reason "Stock Count", count went up: found stock, a variance. */
  | "count_gain"
  /** Corrections, transfers, "Other", wrong-direction rows, on-hand ⇄ backup moves. */
  | "ignored";

export type Movement = { kind: MovementKind; units: number };

/** Change in total available (on hand + backup), in cents. */
export function totalDeltaCents(
  entry: Pick<
    HistoryEntry,
    "prevOnHand" | "newOnHand" | "prevBackup" | "newBackup"
  >,
): number {
  return (
    toCents(entry.newOnHand) +
    toCents(entry.newBackup) -
    (toCents(entry.prevOnHand) + toCents(entry.prevBackup))
  );
}

/**
 * Classifies one ledger row by its reason and the direction of the change in
 * total available. Correction, Transfer In / Out, Delivery and Restock are
 * never consumption; a move between on hand and backup (total unchanged) is
 * ignored altogether.
 */
export function classifyEntry(
  entry: Pick<
    HistoryEntry,
    "reason" | "prevOnHand" | "newOnHand" | "prevBackup" | "newBackup"
  >,
): Movement {
  const cents = totalDeltaCents(entry);
  const units = fromCents(Math.abs(cents));
  const ignored: Movement = { kind: "ignored", units: 0 };
  if (cents === 0) return ignored;
  switch (entry.reason) {
    case "usage":
      return cents < 0 ? { kind: "confirmed_usage", units } : ignored;
    case "stock_count":
      return cents < 0
        ? { kind: "observed_depletion", units }
        : { kind: "count_gain", units };
    case "breakage":
      return cents < 0 ? { kind: "breakage", units } : ignored;
    case "comp":
      return cents < 0 ? { kind: "comp", units } : ignored;
    case "delivery_restock":
      return cents > 0 ? { kind: "restock", units } : ignored;
    default:
      return ignored; // transfer_in, transfer_out, correction, other
  }
}

/**
 * A cutoff crossing (a "hit"): a change that leaves the item at or below the
 * cutoff that was in force then, from above it. One incident per fall below,
 * not one per later adjustment while it stays down.
 */
export function isCutoffCrossing(
  entry: Pick<
    HistoryEntry,
    "statusAfter" | "cutoffAtTime" | "prevOnHand" | "prevBackup"
  >,
): boolean {
  if (entry.statusAfter !== "critical" || entry.cutoffAtTime === null) {
    return false;
  }
  const prevTotal = toCents(entry.prevOnHand) + toCents(entry.prevBackup);
  return prevTotal > toCents(entry.cutoffAtTime);
}

// ---------------------------------------------------------------------
// 2. Windows and data sufficiency
// ---------------------------------------------------------------------

/** An inclusive range of location-local calendar dates (YYYY-MM-DD). */
export type DateWindow = { from: string; to: string };

/** At least this many depletion events in the window, and this much history. */
export const MIN_DEPLETION_EVENTS = 3;
export const MIN_HISTORY_DAYS = 14;
/** Dead stock: no depletion at all over a window at least this long. */
export const DEAD_STOCK_WINDOW_DAYS = 30;
export const CHRONIC_CROSSINGS = 2;
export const WINDOW_PRESET_DAYS = [7, 14, 30, 90] as const;

const MS_PER_DAY = 86_400_000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/** Calendar days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

/** Days in an inclusive window (always at least 1). */
export function windowDays(window: DateWindow): number {
  return Math.max(1, daysBetween(window.from, window.to) + 1);
}

export function todayIn(timeZone: string, now: Date): string {
  return zonedWallTimeFromInstant(now, timeZone).date;
}

/** The last `days` calendar days including today, in the location's time zone. */
export function presetWindow(
  days: number,
  timeZone: string,
  now: Date,
): DateWindow {
  const to = todayIn(timeZone, now);
  return { from: shiftDate(to, -(days - 1)), to };
}

export type AnalyticsOptions = {
  window: DateWindow;
  /** Count negative Stock Count variances as depletion (owner decision D3). Default on. */
  includeObserved: boolean;
  /** Count Breakage and Comp as depletion. Default off: they are shrink. */
  includeShrink: boolean;
  timeZone: string;
  now: Date;
};

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** A rate for people to read: at most 2 decimals, "—" when there is none. */
export function formatRate(value: number | null, digits = 2): string {
  return value === null ? "—" : String(Number(value.toFixed(digits)));
}

// ---------------------------------------------------------------------
// 3. Estimated days to cutoff
// ---------------------------------------------------------------------

export type DaysToCutoff =
  | { kind: "no_cutoff" }
  | { kind: "at_or_below" }
  | { kind: "not_enough_history" }
  | { kind: "no_movement" }
  | {
      kind: "estimate";
      /** Whole days, rounded down. */
      low: number;
      /** Whole days, rounded up; null when open-ended ("30+"). */
      high: number | null;
    };

const EPSILON = 0.001;
const OPEN_ENDED_AT = 30;

/** Guards float noise (5 / (5/30) = 30.000000000000004) before floor / ceil. */
const clean = (value: number) => Math.round(value * 1e6) / 1e6;

export function estimateDaysToCutoff(input: {
  total: number;
  cutoff: number | null;
  rate7: number;
  rate30: number;
  enoughHistory: boolean;
}): DaysToCutoff {
  const { total, cutoff } = input;
  if (cutoff === null) return { kind: "no_cutoff" };
  if (toCents(total) <= toCents(cutoff)) return { kind: "at_or_below" };
  if (!input.enoughHistory) return { kind: "not_enough_history" };
  const fast = Math.max(input.rate7, input.rate30);
  const slow = Math.min(input.rate7, input.rate30);
  if (fast <= 0) return { kind: "no_movement" };
  const room = fromCents(toCents(total) - toCents(cutoff));
  const low = Math.floor(clean(room / fast));
  const high = Math.ceil(clean(room / Math.max(slow, EPSILON)));
  return { kind: "estimate", low, high: high > OPEN_ENDED_AT ? null : high };
}

export function describeDaysToCutoff(estimate: DaysToCutoff): string {
  switch (estimate.kind) {
    case "no_cutoff":
      return "No cutoff set";
    case "at_or_below":
      return "At or below cutoff";
    case "not_enough_history":
      return "Not enough history";
    case "no_movement":
      return "No recent movement";
    case "estimate": {
      const { low, high } = estimate;
      if (low >= OPEN_ENDED_AT) return "30+ days";
      if (high === null) return `${low}–30+ days`;
      if (low === high) return `about ${low} ${low === 1 ? "day" : "days"}`;
      return `${low}–${high} days`;
    }
  }
}

/** Soonest first: at/below cutoff, then by the low end of the range. */
function daysToCutoffSort(estimate: DaysToCutoff): number | null {
  if (estimate.kind === "at_or_below") return -1;
  if (estimate.kind === "estimate") return estimate.low;
  return null;
}

// ---------------------------------------------------------------------
// 4. Per-item analytics
// ---------------------------------------------------------------------

export type Evidence = "Enough history" | "Not enough history" | "No movement";

export type ItemAnalytics = {
  productId: string;
  vendor: string;
  item: string;
  size: string | null;
  unit: string;
  category: string | null;
  subcategory: string | null;
  currentTotal: number;
  cutoff: number | null;
  par: number | null;
  status: string;
  suggestedOrder: number | null;
  orderNeeded: boolean;
  /** Reason "Usage", counted down, in the window. */
  confirmedUsage: number;
  /** Reason "Stock Count", counted down, in the window. */
  observedDepletion: number;
  /** Breakage + Comp in the window (shrink). */
  shrink: number;
  /** What the toggles count as depletion, in the window. */
  depletion: number;
  depletionEvents: number;
  /** Null without enough history (no false precision). */
  perDay: number | null;
  perWeek: number | null;
  /** Weekly depletion ÷ par; needs a par. */
  parTurnsPerWeek: number | null;
  restockQuantity: number;
  restockCount: number;
  cutoffHits: number;
  /** Two or more cutoff crossings in the last 30 days. */
  chronic: boolean;
  /** Days between the item's first recorded change and today. */
  historyDays: number | null;
  evidence: Evidence;
  daysToCutoff: DaysToCutoff;
  daysToCutoffText: string;
  /** Sort key for "running out soonest" (null = no estimate). */
  daysToCutoffSort: number | null;
};

type Dated = { entry: HistoryEntry; date: string; movement: Movement };

export function buildItemAnalytics(
  entries: readonly HistoryEntry[],
  rows: readonly InventoryRow[],
  options: AnalyticsOptions,
): ItemAnalytics[] {
  const today = todayIn(options.timeZone, options.now);
  const days = windowDays(options.window);

  const byProduct = new Map<string, Dated[]>();
  for (const entry of entries) {
    const date = localDate(entry.at, options.timeZone);
    if (date === null) continue;
    const list = byProduct.get(entry.productId) ?? [];
    list.push({ entry, date, movement: classifyEntry(entry) });
    byProduct.set(entry.productId, list);
  }

  const isDepletion = (kind: MovementKind) =>
    kind === "confirmed_usage" ||
    (options.includeObserved && kind === "observed_depletion") ||
    (options.includeShrink && (kind === "breakage" || kind === "comp"));

  const sumUnits = (list: Dated[], pick: (m: Movement) => boolean) =>
    fromCents(
      list.reduce(
        (sum, d) => (pick(d.movement) ? sum + toCents(d.movement.units) : sum),
        0,
      ),
    );

  const within = (list: Dated[], from: string, to: string) =>
    list.filter((d) => d.date >= from && d.date <= to);

  return rows
    .filter((row) => row.status !== "archived")
    .map((row): ItemAnalytics => {
      const all = byProduct.get(row.productId) ?? [];
      const first = all.reduce<string | null>(
        (min, d) => (min === null || d.date < min ? d.date : min),
        null,
      );
      const historyDays = first === null ? null : daysBetween(first, today);

      const inWindow = within(all, options.window.from, options.window.to);
      const depletionRows = inWindow.filter((d) =>
        isDepletion(d.movement.kind),
      );
      const depletion = sumUnits(inWindow, (m) => isDepletion(m.kind));
      const events = depletionRows.length;
      const enough =
        events >= MIN_DEPLETION_EVENTS &&
        historyDays !== null &&
        historyDays >= MIN_HISTORY_DAYS;
      const deadStock =
        depletion === 0 &&
        days >= DEAD_STOCK_WINDOW_DAYS &&
        historyDays !== null &&
        historyDays >= MIN_HISTORY_DAYS &&
        row.total > 0;

      const perDay = enough ? round4(depletion / days) : deadStock ? 0 : null;
      const perWeek = perDay === null ? null : round4(perDay * 7);

      // Rates for the estimate always use the last 7 and 30 days, whatever
      // window is on screen; "enough history" is judged on the 30-day window.
      const last30 = within(all, shiftDate(today, -29), today);
      const last7 = within(all, shiftDate(today, -6), today);
      const events30 = last30.filter((d) =>
        isDepletion(d.movement.kind),
      ).length;
      const enough30 =
        events30 >= MIN_DEPLETION_EVENTS &&
        historyDays !== null &&
        historyDays >= MIN_HISTORY_DAYS;
      const rate7 = sumUnits(last7, (m) => isDepletion(m.kind)) / 7;
      const rate30 = sumUnits(last30, (m) => isDepletion(m.kind)) / 30;
      const daysToCutoff = estimateDaysToCutoff({
        total: row.total,
        cutoff: row.cutoff,
        rate7,
        rate30,
        enoughHistory: enough30,
      });

      const crossings = (list: Dated[]) =>
        list.filter((d) => isCutoffCrossing(d.entry)).length;

      return {
        productId: row.productId,
        vendor: row.vendor,
        item: row.name,
        size: row.size,
        unit: row.unit,
        category: row.category,
        subcategory: row.subcategory,
        currentTotal: row.total,
        cutoff: row.cutoff,
        par: row.par,
        status: STATUS_LABEL[row.status],
        suggestedOrder: row.suggestedOrder,
        orderNeeded: row.orderNeeded,
        confirmedUsage: sumUnits(inWindow, (m) => m.kind === "confirmed_usage"),
        observedDepletion: sumUnits(
          inWindow,
          (m) => m.kind === "observed_depletion",
        ),
        shrink: sumUnits(
          inWindow,
          (m) => m.kind === "breakage" || m.kind === "comp",
        ),
        depletion,
        depletionEvents: events,
        perDay,
        perWeek,
        parTurnsPerWeek:
          perWeek !== null && row.par !== null && row.par > 0
            ? round4(perWeek / row.par)
            : null,
        restockQuantity: sumUnits(inWindow, (m) => m.kind === "restock"),
        restockCount: inWindow.filter((d) => d.movement.kind === "restock")
          .length,
        cutoffHits: crossings(inWindow),
        chronic: crossings(last30) >= CHRONIC_CROSSINGS,
        historyDays,
        evidence: enough
          ? "Enough history"
          : deadStock
            ? "No movement"
            : "Not enough history",
        daysToCutoff,
        daysToCutoffText: describeDaysToCutoff(daysToCutoff),
        daysToCutoffSort: daysToCutoffSort(daysToCutoff),
      };
    });
}

// ---------------------------------------------------------------------
// 5. Rankings, vendor demand, summary
// ---------------------------------------------------------------------

/** Highest depletion rate first; only items with a rate (enough history). */
export function fastestMoving(
  items: readonly ItemAnalytics[],
): ItemAnalytics[] {
  return items
    .filter((i) => i.evidence === "Enough history" && i.perDay !== null)
    .sort(
      (a, b) =>
        (b.perDay ?? 0) - (a.perDay ?? 0) || a.item.localeCompare(b.item),
    );
}

/** Lowest rate first among items that are in stock and have evidence. */
export function slowestMoving(
  items: readonly ItemAnalytics[],
): ItemAnalytics[] {
  return items
    .filter((i) => i.perDay !== null && i.currentTotal > 0)
    .sort(
      (a, b) =>
        (a.perDay ?? 0) - (b.perDay ?? 0) || a.item.localeCompare(b.item),
    );
}

/** Items that crossed their cutoff repeatedly lately, most crossings first. */
export function frequentlyHittingCutoff(
  items: readonly ItemAnalytics[],
): ItemAnalytics[] {
  return items
    .filter((i) => i.chronic)
    .sort(
      (a, b) => b.cutoffHits - a.cutoffHits || a.item.localeCompare(b.item),
    );
}

export type VendorDemand = {
  vendor: string;
  items: number;
  /** Units depleted in the window across the vendor's items. */
  depletion: number;
  critical: number;
  low: number;
  /** Units to order now (Par − Total for Critical / Low items with a Par). */
  suggestedOrderNow: number;
  /** Critical / Low items with no Par: need an order, no quantity invented. */
  orderNeeded: number;
  restockCount: number;
  restockQuantity: number;
};

export function vendorDemand(items: readonly ItemAnalytics[]): VendorDemand[] {
  const byVendor = new Map<string, ItemAnalytics[]>();
  for (const item of items) {
    const list = byVendor.get(item.vendor) ?? [];
    list.push(item);
    byVendor.set(item.vendor, list);
  }
  return [...byVendor.entries()]
    .map(([vendor, list]): VendorDemand => {
      const needs = list.filter(
        (i) => i.status === "Critical" || i.status === "Low",
      );
      return {
        vendor,
        items: list.length,
        depletion: fromCents(
          list.reduce((s, i) => s + toCents(i.depletion), 0),
        ),
        critical: list.filter((i) => i.status === "Critical").length,
        low: list.filter((i) => i.status === "Low").length,
        suggestedOrderNow: fromCents(
          needs.reduce(
            (s, i) =>
              i.orderNeeded || i.suggestedOrder === null
                ? s
                : s + toCents(i.suggestedOrder),
            0,
          ),
        ),
        orderNeeded: needs.filter((i) => i.orderNeeded).length,
        restockCount: list.reduce((s, i) => s + i.restockCount, 0),
        restockQuantity: fromCents(
          list.reduce((s, i) => s + toCents(i.restockQuantity), 0),
        ),
      };
    })
    .sort(
      (a, b) => b.depletion - a.depletion || a.vendor.localeCompare(b.vendor),
    );
}

export type AnalyticsSummary = {
  depletion: number;
  confirmedUsage: number;
  observedDepletion: number;
  perDay: number;
  perWeek: number;
  restockQuantity: number;
  restockCount: number;
  cutoffHits: number;
};

/** Totals over the given items (e.g. the rows left by the table's filters). */
export function summarize(
  items: readonly ItemAnalytics[],
  window: DateWindow,
): AnalyticsSummary {
  const sum = (pick: (i: ItemAnalytics) => number) =>
    fromCents(items.reduce((s, i) => s + toCents(pick(i)), 0));
  const depletion = sum((i) => i.depletion);
  const days = windowDays(window);
  return {
    depletion,
    confirmedUsage: sum((i) => i.confirmedUsage),
    observedDepletion: sum((i) => i.observedDepletion),
    perDay: round4(depletion / days),
    perWeek: round4((depletion / days) * 7),
    restockQuantity: sum((i) => i.restockQuantity),
    restockCount: items.reduce((s, i) => s + i.restockCount, 0),
    cutoffHits: items.reduce((s, i) => s + i.cutoffHits, 0),
  };
}

// ---------------------------------------------------------------------
// 6. Filter columns (pure, shared with a later server export)
// ---------------------------------------------------------------------

export const ANALYTICS_ITEM_COLUMNS: ColumnSpec<ItemAnalytics>[] = [
  {
    id: "vendor",
    label: "Vendor",
    type: "select",
    searchable: true,
    get: (r) => r.vendor,
  },
  {
    id: "item",
    label: "Item",
    type: "text",
    searchable: true,
    get: (r) => r.item,
  },
  { id: "category", label: "Category", type: "select", get: (r) => r.category },
  {
    id: "subcategory",
    label: "Subcategory",
    type: "select",
    get: (r) => r.subcategory,
  },
  { id: "unit", label: "Unit", type: "select", get: (r) => r.unit },
  {
    id: "currentTotal",
    label: "Current stock",
    type: "number",
    get: (r) => r.currentTotal,
  },
  {
    id: "confirmedUsage",
    label: "Confirmed usage",
    type: "number",
    get: (r) => r.confirmedUsage,
  },
  {
    id: "observedDepletion",
    label: "Observed depletion",
    type: "number",
    get: (r) => r.observedDepletion,
  },
  { id: "perDay", label: "Avg / day", type: "number", get: (r) => r.perDay },
  { id: "perWeek", label: "Avg / week", type: "number", get: (r) => r.perWeek },
  {
    id: "parTurns",
    label: "Par turns / week",
    type: "number",
    get: (r) => r.parTurnsPerWeek,
  },
  {
    id: "restockQuantity",
    label: "Restocked",
    type: "number",
    get: (r) => r.restockQuantity,
  },
  {
    id: "restockCount",
    label: "Restocks",
    type: "number",
    get: (r) => r.restockCount,
  },
  {
    id: "cutoffHits",
    label: "Cutoff hits",
    type: "number",
    get: (r) => r.cutoffHits,
  },
  {
    id: "daysToCutoff",
    label: "Days to cutoff",
    type: "number",
    get: (r) => r.daysToCutoffSort,
  },
  { id: "evidence", label: "Data", type: "select", get: (r) => r.evidence },
  { id: "status", label: "Status", type: "select", get: (r) => r.status },
];

export const ANALYTICS_VENDOR_COLUMNS: ColumnSpec<VendorDemand>[] = [
  {
    id: "vendor",
    label: "Vendor",
    type: "select",
    searchable: true,
    get: (r) => r.vendor,
  },
  { id: "items", label: "Items", type: "number", get: (r) => r.items },
  {
    id: "depletion",
    label: "Depletion",
    type: "number",
    get: (r) => r.depletion,
  },
  { id: "critical", label: "Critical", type: "number", get: (r) => r.critical },
  { id: "low", label: "Low", type: "number", get: (r) => r.low },
  {
    id: "suggestedOrderNow",
    label: "Order now",
    type: "number",
    get: (r) => r.suggestedOrderNow,
  },
  {
    id: "restockCount",
    label: "Restocks",
    type: "number",
    get: (r) => r.restockCount,
  },
  {
    id: "restockQuantity",
    label: "Restocked",
    type: "number",
    get: (r) => r.restockQuantity,
  },
];

export const ANALYTICS_SORT_PRESETS = [
  { label: "Fastest moving", keys: [{ id: "perDay", dir: "desc" as const }] },
  { label: "Slowest moving", keys: [{ id: "perDay", dir: "asc" as const }] },
  {
    label: "Running out soonest",
    keys: [{ id: "daysToCutoff", dir: "asc" as const }],
  },
  {
    label: "Most cutoff hits",
    keys: [{ id: "cutoffHits", dir: "desc" as const }],
  },
  {
    label: "Most restocked",
    keys: [{ id: "restockQuantity", dir: "desc" as const }],
  },
  {
    label: "Vendor, then item",
    keys: [
      { id: "vendor", dir: "asc" as const },
      { id: "item", dir: "asc" as const },
    ],
  },
];
