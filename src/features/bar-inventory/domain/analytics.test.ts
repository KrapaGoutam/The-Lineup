import { describe, expect, it } from "vitest";

import {
  ANALYTICS_ITEM_COLUMNS,
  ANALYTICS_SORT_PRESETS,
  buildItemAnalytics,
  classifyEntry,
  describeDaysToCutoff,
  estimateDaysToCutoff,
  fastestMoving,
  frequentlyHittingCutoff,
  isCutoffCrossing,
  presetWindow,
  slowestMoving,
  summarize,
  vendorDemand,
  windowDays,
  type AnalyticsOptions,
} from "./analytics";
import type { InventoryRow } from "./inventory-rows";
import type { HistoryEntry } from "./inventory-types";
import { evaluateStock, type AdjustmentReason } from "./stock-rules";
import { applyFilters, sortRows } from "./table-filters";

const TZ = "America/New_York";
// 2026-10-27 12:00 local; Daylight Time until Nov 1, so "n days ago" keeps its clock time.
const NOW = new Date("2026-10-27T16:00:00Z");
const ago = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString();

const options = (over: Partial<AnalyticsOptions> = {}): AnalyticsOptions => ({
  window: presetWindow(30, TZ, NOW),
  includeObserved: true,
  includeShrink: false,
  timeZone: TZ,
  now: NOW,
  ...over,
});

let seq = 0;
function row(
  name: string,
  levels: {
    onHand: number;
    cutoff: number | null;
    par?: number | null;
    vendor?: string;
    archived?: boolean;
  },
): InventoryRow {
  seq += 1;
  const stock = {
    onHand: levels.onHand,
    backup: 0,
    cutoff: levels.cutoff,
    warning: null,
    par: levels.par ?? null,
  };
  const e = evaluateStock(stock, { archived: levels.archived ?? false });
  return {
    productId: name,
    vendor: levels.vendor ?? "Faust",
    name,
    category: null,
    subcategory: null,
    size: null,
    unit: "Bottle",
    sku: null,
    notes: null,
    onHand: levels.onHand,
    backup: 0,
    total: e.total,
    cutoff: levels.cutoff,
    warning: null,
    par: levels.par ?? null,
    effectiveWarning: e.effectiveWarning,
    status: e.status,
    suggestedOrder: e.suggestedOrder,
    orderNeeded: e.orderNeeded,
    updatedAt: null,
    updatedBy: null,
    stockVersion: 1,
  };
}

function entry(
  productId: string,
  daysAgo: number,
  reason: AdjustmentReason,
  prev: number,
  next: number,
  over: Partial<HistoryEntry> = {},
): HistoryEntry {
  seq += 1;
  return {
    id: String(seq),
    at: ago(daysAgo),
    productId,
    reason,
    source: "manual_edit",
    note: null,
    prevOnHand: prev,
    newOnHand: next,
    prevBackup: 0,
    newBackup: 0,
    statusAfter: "healthy",
    cutoffAtTime: null,
    actorName: "Manager",
    importBatchId: null,
    ...over,
  };
}

/** The item's first recorded change, long enough ago to count as history. */
const first = (productId: string, daysAgo = 40) =>
  entry(productId, daysAgo, "stock_count", 0, 20);

describe("classifyEntry: only the right events are consumption", () => {
  const c = (reason: AdjustmentReason, prev: number, next: number) =>
    classifyEntry({
      reason,
      prevOnHand: prev,
      newOnHand: next,
      prevBackup: 0,
      newBackup: 0,
    });

  it("a negative Usage is Confirmed Usage", () => {
    expect(c("usage", 5, 3)).toEqual({ kind: "confirmed_usage", units: 2 });
  });

  it("a negative Stock Count is Observed Depletion, never confirmed", () => {
    expect(c("stock_count", 6, 3)).toEqual({
      kind: "observed_depletion",
      units: 3,
    });
  });

  it("a positive Stock Count is a count gain, not inflow or consumption", () => {
    expect(c("stock_count", 3, 5)).toEqual({ kind: "count_gain", units: 2 });
  });

  it.each([
    ["correction", 5, 3],
    ["correction", 3, 5],
    ["transfer_out", 5, 3],
    ["transfer_in", 3, 5],
    ["other", 5, 3],
    ["delivery_restock", 5, 3],
    ["usage", 3, 5],
  ] as const)("%s %i → %i is not consumption", (reason, prev, next) => {
    expect(c(reason, prev, next).kind).toBe("ignored");
  });

  it("Delivery / Restock going up is a restock", () => {
    expect(c("delivery_restock", 1, 5)).toEqual({ kind: "restock", units: 4 });
  });

  it("Breakage and Comp are shrink, kept apart", () => {
    expect(c("breakage", 5, 4).kind).toBe("breakage");
    expect(c("comp", 5, 4).kind).toBe("comp");
  });

  it("a move between on hand and backup (total unchanged) is ignored", () => {
    expect(
      classifyEntry({
        reason: "usage",
        prevOnHand: 5,
        newOnHand: 3,
        prevBackup: 1,
        newBackup: 3,
      }).kind,
    ).toBe("ignored");
  });

  it("is exact in cents", () => {
    expect(c("usage", 0.3, 0.1).units).toBe(0.2);
  });
});

describe("isCutoffCrossing: one hit per fall below the cutoff", () => {
  const x = (over: Partial<HistoryEntry>) =>
    isCutoffCrossing({
      statusAfter: "critical",
      cutoffAtTime: 4,
      prevOnHand: 6,
      prevBackup: 0,
      ...over,
    });

  it("above → at/below is a hit", () => {
    expect(x({})).toBe(true);
    expect(x({ prevOnHand: 5 })).toBe(true);
  });
  it("already at/below is not another hit", () => {
    expect(x({ prevOnHand: 4 })).toBe(false);
    expect(x({ prevOnHand: 2 })).toBe(false);
  });
  it("needs a cutoff and a critical result", () => {
    expect(x({ cutoffAtTime: null })).toBe(false);
    expect(x({ statusAfter: "low" })).toBe(false);
  });
  it("uses the cutoff recorded at the time, not today's", () => {
    // Cutoff was 10 then (changed to 6 later): 12 → 9 was a hit.
    expect(x({ cutoffAtTime: 10, prevOnHand: 12 })).toBe(true);
  });
});

describe("estimateDaysToCutoff (spec §4 vectors)", () => {
  const e = (over: Partial<Parameters<typeof estimateDaysToCutoff>[0]>) =>
    describeDaysToCutoff(
      estimateDaysToCutoff({
        total: 20,
        cutoff: 8,
        rate7: 1,
        rate30: 0.5,
        enoughHistory: true,
        ...over,
      }),
    );

  it("total 20, cutoff 8, rate 1.0 / 0.5 → 12–24 days", () => {
    expect(e({})).toBe("12–24 days");
  });
  it("total at the cutoff → At or below cutoff", () => {
    expect(e({ total: 8 })).toBe("At or below cutoff");
    expect(e({ total: 5 })).toBe("At or below cutoff");
  });
  it("no cutoff is its own state, checked first", () => {
    expect(e({ cutoff: null })).toBe("No cutoff set");
  });
  it("without enough history there is no estimate", () => {
    expect(e({ enoughHistory: false })).toBe("Not enough history");
  });
  it("no recent movement", () => {
    expect(e({ rate7: 0, rate30: 0 })).toBe("No recent movement");
  });
  it("whole days only: equal ends, open ends and the 30+ cap", () => {
    expect(e({ total: 11, rate7: 1, rate30: 1 })).toBe("about 3 days");
    expect(e({ total: 9, rate7: 1, rate30: 1 })).toBe("about 1 day");
    expect(e({ total: 28, rate7: 1, rate30: 0.5 })).toBe("20–30+ days");
    expect(e({ total: 13, rate7: 1, rate30: 0 })).toBe("5–30+ days");
    expect(e({ total: 48, rate7: 1, rate30: 1 })).toBe("30+ days");
    expect(e({ total: 9, rate7: 2, rate30: 1.5 })).toBe("0–1 days");
  });
  it("is not thrown by floating-point noise at the 30-day line", () => {
    // 5 / (5/30) is 30.000000000000004 in floating point.
    expect(e({ total: 13, rate7: 5 / 30, rate30: 5 / 30 })).toBe("30+ days");
  });
  it("never shows a decimal", () => {
    expect(e({ total: 21.7, rate7: 0.37, rate30: 0.29 })).not.toMatch(/\./);
  });
});

describe("windows (location time zone)", () => {
  it("a preset ends today and spans exactly its days", () => {
    const w = presetWindow(30, TZ, NOW);
    expect(w).toEqual({ from: "2026-09-28", to: "2026-10-27" });
    expect(windowDays(w)).toBe(30);
  });
  it("uses the local date even when UTC has already rolled over", () => {
    // 2026-10-28 02:00Z is still Oct 27 in New York.
    expect(presetWindow(7, TZ, new Date("2026-10-28T02:00:00Z")).to).toBe(
      "2026-10-27",
    );
  });
  it("a one-day window is 1 day, never 0", () => {
    expect(windowDays({ from: "2026-10-27", to: "2026-10-27" })).toBe(1);
    expect(windowDays({ from: "2026-10-27", to: "2026-10-20" })).toBe(1);
  });
});

describe("buildItemAnalytics", () => {
  const one = (
    entries: HistoryEntry[],
    item = row("Tito's", { onHand: 5, cutoff: 3, par: 12 }),
    opts = options(),
  ) => buildItemAnalytics(entries, [item], opts)[0];

  // 12 units of usage over 30 days, 4 events, item first seen 40 days ago.
  const twelveUnits = [
    first("Tito's"),
    entry("Tito's", 25, "usage", 20, 17),
    entry("Tito's", 18, "usage", 17, 14),
    entry("Tito's", 11, "usage", 14, 11),
    entry("Tito's", 4, "usage", 11, 8),
  ];

  it("30-day window, 12 units, ≥ 3 events, age 40 d → 0.4/day, 2.8/week", () => {
    const a = one(twelveUnits);
    expect(a).toMatchObject({
      depletion: 12,
      confirmedUsage: 12,
      depletionEvents: 4,
      perDay: 0.4,
      perWeek: 2.8,
      evidence: "Enough history",
      historyDays: 40,
    });
  });

  it("par turns per week is weekly depletion ÷ par", () => {
    expect(one(twelveUnits).parTurnsPerWeek).toBeCloseTo(2.8 / 12, 3);
    expect(
      one(twelveUnits, row("Tito's", { onHand: 5, cutoff: 3 })).parTurnsPerWeek,
    ).toBeNull();
  });

  it("2 depletion events is not enough history: no rate, no precision", () => {
    const a = one(twelveUnits.slice(0, 3));
    expect(a).toMatchObject({
      depletionEvents: 2,
      perDay: null,
      perWeek: null,
      evidence: "Not enough history",
    });
  });

  it("an item younger than 14 days is not enough, even with many events", () => {
    const young = [
      first("Tito's", 10),
      entry("Tito's", 8, "usage", 20, 18),
      entry("Tito's", 6, "usage", 18, 16),
      entry("Tito's", 4, "usage", 16, 14),
      entry("Tito's", 2, "usage", 14, 12),
    ];
    expect(one(young)).toMatchObject({
      depletionEvents: 4,
      perDay: null,
      evidence: "Not enough history",
    });
  });

  it("corrections, transfers, restocks and deliveries are never depletion", () => {
    const a = one([
      ...twelveUnits,
      entry("Tito's", 3, "correction", 8, 5),
      entry("Tito's", 3, "transfer_out", 5, 2),
      entry("Tito's", 2, "delivery_restock", 2, 12),
    ]);
    expect(a.depletion).toBe(12);
    expect(a.restockQuantity).toBe(10);
    expect(a.restockCount).toBe(1);
  });

  it("observed depletion (negative Stock Count) is separate and toggleable", () => {
    const withCount = [...twelveUnits, entry("Tito's", 2, "stock_count", 8, 5)];
    const on = one(withCount);
    expect(on).toMatchObject({
      confirmedUsage: 12,
      observedDepletion: 3,
      depletion: 15,
    });
    const off = one(withCount, undefined, options({ includeObserved: false }));
    expect(off).toMatchObject({
      confirmedUsage: 12,
      observedDepletion: 3,
      depletion: 12,
    });
  });

  it("shrink (breakage / comp) joins depletion only when asked", () => {
    const withShrink = [
      ...twelveUnits,
      entry("Tito's", 2, "breakage", 8, 7),
      entry("Tito's", 1, "comp", 7, 5),
    ];
    expect(one(withShrink)).toMatchObject({ shrink: 3, depletion: 12 });
    expect(
      one(withShrink, undefined, options({ includeShrink: true })).depletion,
    ).toBe(15);
  });

  it("the date range is inclusive and read in the location time zone", () => {
    // Window Oct 20..Oct 27 (8 days). An event at 2026-10-20 03:30Z is
    // Oct 19 23:30 in New York: outside. 04:30Z is Oct 20 00:30: inside.
    const edge = [
      first("Tito's"),
      entry("Tito's", 0, "usage", 20, 19, { at: "2026-10-20T03:30:00Z" }),
      entry("Tito's", 0, "usage", 19, 17, { at: "2026-10-20T04:30:00Z" }),
    ];
    const a = one(
      edge,
      undefined,
      options({ window: { from: "2026-10-20", to: "2026-10-27" } }),
    );
    expect(a.depletion).toBe(2);
    expect(a.depletionEvents).toBe(1);
  });

  it("counts a cutoff hit once per fall, not per later adjustment", () => {
    const dip = [
      first("Tito's"),
      // 6 → 3 crosses the cutoff of 3? (≤ 3) → hit
      entry("Tito's", 20, "usage", 6, 3, {
        statusAfter: "critical",
        cutoffAtTime: 3,
      }),
      // already critical: 3 → 2 is not a new hit
      entry("Tito's", 19, "usage", 3, 2, {
        statusAfter: "critical",
        cutoffAtTime: 3,
      }),
      entry("Tito's", 15, "delivery_restock", 2, 10, { cutoffAtTime: 3 }),
      // second fall: hit
      entry("Tito's", 5, "usage", 5, 2, {
        statusAfter: "critical",
        cutoffAtTime: 3,
      }),
    ];
    const a = one(dip);
    expect(a.cutoffHits).toBe(2);
    expect(a.chronic).toBe(true);
    expect(one(dip.slice(0, 3)).chronic).toBe(false);
  });

  it("flags dead stock: nothing used over a 30-day window, in stock, 14+ days of history", () => {
    const idle = [first("Tito's")];
    const a = one(idle);
    expect(a).toMatchObject({ perDay: 0, evidence: "No movement" });
    // A 7-day window is too short to call it dead stock.
    expect(
      one(idle, undefined, options({ window: presetWindow(7, TZ, NOW) }))
        .perDay,
    ).toBeNull();
  });

  it("estimates days to cutoff from the last 7 and 30 days, whatever the window", () => {
    const a = one(
      twelveUnits,
      row("Tito's", { onHand: 20, cutoff: 8 }),
      options({ window: presetWindow(90, TZ, NOW) }),
    );
    // 12 units / 30 d = 0.4/day, 3 units / 7 d = 0.4286 (the Oct 23 event).
    expect(a.daysToCutoff.kind).toBe("estimate");
    expect(a.daysToCutoffText).toMatch(/^\d+–\d+ days$|^about \d+ days?$/);
  });

  it("leaves archived items out", () => {
    expect(
      buildItemAnalytics(
        twelveUnits,
        [row("Tito's", { onHand: 5, cutoff: 3, archived: true })],
        options(),
      ),
    ).toEqual([]);
  });

  it("ignores entries for items it has no row for", () => {
    expect(buildItemAnalytics(twelveUnits, [], options())).toEqual([]);
  });
});

describe("rankings, vendor demand, summary", () => {
  const rows = [
    row("Fast", { onHand: 10, cutoff: 3, par: 12, vendor: "Faust" }),
    row("Slow", { onHand: 10, cutoff: 3, par: 12, vendor: "Faust" }),
    row("Idle", { onHand: 10, cutoff: 3, par: 12, vendor: "Del Papa" }),
    row("Few", { onHand: 2, cutoff: 3, par: 12, vendor: "Del Papa" }),
  ];
  const used = (id: string, n: number, units: number) =>
    Array.from({ length: n }, (_, i) =>
      entry(id, 3 + i * 3, "usage", 30, 30 - units),
    );
  const entries = [
    ...["Fast", "Slow", "Idle", "Few"].map((id) => first(id)),
    ...used("Fast", 5, 3), // 15 units
    ...used("Slow", 3, 1), // 3 units
    ...used("Few", 2, 1), // 2 events: not enough
    entry("Fast", 2, "delivery_restock", 5, 15),
  ];
  const items = buildItemAnalytics(entries, rows, options());

  it("fastest moving: highest rate first, only with enough history", () => {
    expect(fastestMoving(items).map((i) => i.item)).toEqual(["Fast", "Slow"]);
  });

  it("slowest moving: lowest rate first, dead stock included, thin data excluded", () => {
    expect(slowestMoving(items).map((i) => i.item)).toEqual([
      "Idle",
      "Slow",
      "Fast",
    ]);
  });

  it("the table sort presets put unranked items last", () => {
    const fastest = sortRows(
      items,
      ANALYTICS_ITEM_COLUMNS,
      ANALYTICS_SORT_PRESETS[0].keys,
    );
    expect(fastest.map((i) => i.item)).toEqual(["Fast", "Slow", "Idle", "Few"]);
    const slowest = sortRows(
      items,
      ANALYTICS_ITEM_COLUMNS,
      ANALYTICS_SORT_PRESETS[1].keys,
    );
    expect(slowest.at(-1)?.item).toBe("Few");
  });

  it("vendor demand: depletion, counts, restocks and the order to place now", () => {
    const demand = vendorDemand(items);
    expect(demand.map((d) => d.vendor)).toEqual(["Faust", "Del Papa"]);
    expect(demand[0]).toMatchObject({
      vendor: "Faust",
      items: 2,
      depletion: 18,
      restockCount: 1,
      restockQuantity: 10,
    });
    // "Few" is Critical (2 ≤ 3) with par 12: order 10.
    expect(demand[1]).toMatchObject({
      critical: 1,
      suggestedOrderNow: 10,
      depletion: 2,
    });
  });

  it("summary totals, per-day and per-week over the items given", () => {
    const s = summarize(items, options().window);
    expect(s.depletion).toBe(20);
    expect(s.confirmedUsage).toBe(20);
    expect(s.perDay).toBe(round(20 / 30));
    expect(s.perWeek).toBe(round((20 / 30) * 7));
    expect(s.restockCount).toBe(1);
    expect(summarize([], options().window).perDay).toBe(0);
  });

  it("frequently hitting cutoff lists chronic items, most hits first", () => {
    expect(frequentlyHittingCutoff(items)).toEqual([]);
  });

  it("every analytics column filters by its type (vendor, item, evidence, range)", () => {
    const filtered = applyFilters(
      items,
      ANALYTICS_ITEM_COLUMNS,
      {
        filters: {
          vendor: { type: "select", values: ["Faust"] },
          perDay: { type: "number", op: "gt", value: 0.2 },
        },
        search: "",
      },
      { timeZone: TZ, now: NOW },
    );
    expect(filtered.map((i) => i.item)).toEqual(["Fast"]);
  });
});

const round = (value: number) => Math.round(value * 10_000) / 10_000;
