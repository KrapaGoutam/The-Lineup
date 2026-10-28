import type { CatalogCommand } from "./catalog-commands";
import {
  applyCatalogCommand,
  emptyCatalogState,
  withSystemVendor,
  type CatalogContext,
} from "./catalog-engine";
import type {
  CatalogState,
  HistoryEntry,
  HistorySource,
} from "./inventory-types";
import {
  evaluateStock,
  sourceForReason,
  type AdjustmentReason,
} from "./stock-rules";

const DAY_MS = 86_400_000;

/** [days ago, reason, change in on hand], oldest first. */
type DemoEvent = readonly [number, AdjustmentReason, number];

/**
 * Back-dated, deterministic count history for the demo, one chain per product
 * that ends exactly at its current counts (the starting count is worked out
 * backwards). Between them they show every analytics state: a chronic cutoff
 * hitter (Tito's, 2 hits, 12 units over 30 days = 0.4/day), a fast mover
 * (Modelo), a slow one (Casamigos), and an item with too little history (Gin).
 */
const DEMO_HISTORY: Record<string, DemoEvent[]> = {
  "Tito's Handmade Vodka": [
    [35, "usage", -3],
    [32, "usage", -2],
    [28, "stock_count", -3],
    [25, "delivery_restock", 10],
    [21, "usage", -2],
    [18, "stock_count", -2],
    [14, "usage", -3],
    [10, "usage", -2],
  ],
  "Casamigos Blanco": [
    [30, "delivery_restock", 6],
    [26, "usage", -1],
    [19, "usage", -1],
    [12, "stock_count", -1],
    [5, "usage", -1],
    [2, "usage", -1],
  ],
  "Modelo Especial": [
    [34, "usage", -5],
    [28, "usage", -6],
    [26, "usage", -4],
    [23, "delivery_restock", 24],
    [19, "usage", -6],
    [15, "usage", -5],
    [12, "stock_count", -4],
    [8, "usage", -6],
    [5, "usage", -5],
    [3, "usage", -5],
    [1, "usage", -4],
  ],
  "House Rail Gin": [
    [20, "usage", -1],
    [9, "usage", -2],
  ],
};
const DEMO_HISTORY_START_DAYS_AGO = 40;

function withDemoHistory(state: CatalogState, now: Date): CatalogState {
  const made: HistoryEntry[] = [];
  for (const [name, events] of Object.entries(DEMO_HISTORY)) {
    const product = state.products.find((p) => p.name === name)!;
    const stock = state.stock.find((s) => s.productId === product.id)!;
    const change = events.reduce((sum, [, , delta]) => sum + delta, 0);
    let onHand = stock.onHand - change;
    if (onHand < 0) throw new Error(`demo history for ${name} starts below 0`);
    const at = (days: number) =>
      new Date(now.getTime() - days * DAY_MS).toISOString();
    const push = (
      days: number,
      reason: AdjustmentReason,
      next: { onHand: number; backup: number },
      prev: { onHand: number; backup: number },
    ) => {
      made.push({
        id: "",
        at: at(days),
        productId: product.id,
        reason,
        source: sourceForReason(reason) as HistorySource,
        note: null,
        prevOnHand: prev.onHand,
        newOnHand: next.onHand,
        prevBackup: prev.backup,
        newBackup: next.backup,
        statusAfter: evaluateStock(
          { ...stock, onHand: next.onHand, backup: next.backup },
          { archived: false },
        ).status as HistoryEntry["statusAfter"],
        cutoffAtTime: stock.cutoff,
        actorName: "Demo Owner",
        importBatchId: null,
      });
    };
    // The first count of the item, then each change.
    push(
      DEMO_HISTORY_START_DAYS_AGO,
      "stock_count",
      { onHand, backup: stock.backup },
      { onHand: 0, backup: 0 },
    );
    for (const [days, reason, delta] of events) {
      const next = onHand + delta;
      if (next < 0) throw new Error(`demo history for ${name} goes below 0`);
      push(
        days,
        reason,
        { onHand: next, backup: stock.backup },
        { onHand, backup: stock.backup },
      );
      onHand = next;
    }
  }
  made.sort((a, b) => a.at.localeCompare(b.at));
  return {
    ...state,
    ledger: made.map((entry, index) => ({ ...entry, id: String(index + 1) })),
  };
}

/**
 * A small in-memory catalog for demo mode and the demo Playwright suite.
 * Built through the same engine the app uses, so it is always valid.
 */
export function buildDemoCatalog(): CatalogState {
  let counter = 0;
  const ctx: CatalogContext = {
    actorName: "Demo Owner",
    // Relative to now so date filters (Today / Last 7 days) behave the same
    // whenever the demo runs.
    now: new Date(),
    newId: () => `demo-${String(++counter).padStart(4, "0")}`,
  };
  let state = withSystemVendor(emptyCatalogState(), ctx);
  const run = (command: CatalogCommand) => {
    const result = applyCatalogCommand(state, command, ctx);
    if (!result.ok)
      throw new Error(`demo catalog seed failed: ${result.error}`);
    state = result.state;
  };
  const idOf = (rows: { id: string; name: string }[], name: string) =>
    rows.find((row) => row.name === name)!.id;

  run({ type: "vendorCreate", name: "Faust", notes: null });
  run({ type: "vendorCreate", name: "Del Papa", notes: null });
  run({ type: "categoryCreate", name: "Spirits" });
  run({ type: "categoryCreate", name: "Beer" });
  const spirits = idOf(state.categories, "Spirits");
  run({ type: "subcategoryCreate", categoryId: spirits, name: "Vodka" });
  run({ type: "subcategoryCreate", categoryId: spirits, name: "Tequila" });

  const faust = idOf(state.vendors, "Faust");
  const delPapa = idOf(state.vendors, "Del Papa");
  run({
    type: "productCreate",
    input: {
      vendorId: faust,
      name: "Tito's Handmade Vodka",
      categoryId: spirits,
      subcategoryId: idOf(state.subcategories, "Vodka"),
      size: "750 mL",
      unitType: "bottle",
      unitLabel: null,
      sku: "TIT-750",
      notes: null,
    },
  });
  run({
    type: "productCreate",
    input: {
      vendorId: faust,
      name: "Casamigos Blanco",
      categoryId: spirits,
      subcategoryId: idOf(state.subcategories, "Tequila"),
      size: "750 mL",
      unitType: "bottle",
      unitLabel: null,
      sku: null,
      notes: null,
    },
  });
  run({
    type: "productCreate",
    input: {
      vendorId: delPapa,
      name: "Modelo Especial",
      categoryId: idOf(state.categories, "Beer"),
      subcategoryId: null,
      size: "12 oz",
      unitType: "case",
      unitLabel: null,
      sku: null,
      notes: null,
    },
  });
  run({
    type: "productCreate",
    input: {
      vendorId: faust,
      name: "House Rail Gin",
      categoryId: spirits,
      subcategoryId: null,
      size: "1 L",
      unitType: "bottle",
      unitLabel: null,
      sku: null,
      notes: null,
    },
  });

  // Counts and levels (one of each status: critical, healthy, low, no cutoff).
  const byName = (name: string) =>
    state.products.find((p) => p.name === name)!.id;
  const stock = (
    name: string,
    cutoff: number | null,
    warning: number | null,
    par: number | null,
    onHand: number,
    backup: number,
  ) => {
    const productId = byName(name);
    if (cutoff !== null || par !== null) {
      run({
        type: "stockSetLevels",
        productId,
        cutoff,
        warning,
        par,
        expectedVersion: 1,
      });
    }
    const version = state.stock.find((s) => s.productId === productId)!.version;
    run({
      type: "stockAdjust",
      productId,
      mode: "set",
      onHand,
      backup,
      reason: "stock_count",
      note: null,
      expectedVersion: version,
    });
  };
  stock("Tito's Handmade Vodka", 4, 6, 12, 2, 1);
  stock("Casamigos Blanco", 3, null, 10, 6, 2);
  stock("Modelo Especial", 2, null, 12, 3, 0);
  stock("House Rail Gin", null, null, null, 5, 0);
  // Replaces the four same-day seed counts above with a believable past.
  return withDemoHistory(state, ctx.now);
}
