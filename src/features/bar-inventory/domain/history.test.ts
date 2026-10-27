import { describe, expect, it } from "vitest";

import { applyFilters, sortRows } from "./table-filters";
import {
  buildHistoryRows,
  HISTORY_COLUMNS,
  HISTORY_DEFAULT_SORT,
  signedQuantity,
} from "./history";
import type { CatalogState, HistoryEntry } from "./inventory-types";

const audit = {
  version: 1,
  updatedAt: "2026-10-01T00:00:00Z",
  updatedByName: null,
};

function catalog(over: Partial<CatalogState> = {}): CatalogState {
  return {
    vendors: [
      {
        id: "v1",
        name: "Faust",
        isSystem: false,
        active: true,
        notes: null,
        ...audit,
      },
      {
        id: "v2",
        name: "Del Papa",
        isSystem: false,
        active: true,
        notes: null,
        ...audit,
      },
    ],
    categories: [{ id: "c1", name: "Spirits", active: true, ...audit }],
    subcategories: [
      { id: "s1", categoryId: "c1", name: "Vodka", active: true, ...audit },
    ],
    products: [
      {
        id: "p1",
        vendorId: "v1",
        name: "Tito's",
        categoryId: "c1",
        subcategoryId: "s1",
        size: "1 L",
        unitType: "bottle",
        unitLabel: null,
        sku: null,
        notes: null,
        active: true,
        ...audit,
      },
      {
        id: "p2",
        vendorId: "v2",
        name: "Modelo",
        categoryId: null,
        subcategoryId: null,
        size: null,
        unitType: "can",
        unitLabel: null,
        sku: null,
        notes: null,
        active: true,
        ...audit,
      },
    ],
    stock: [],
    ...over,
  };
}

let seq = 0;
function entry(over: Partial<HistoryEntry>): HistoryEntry {
  seq += 1;
  return {
    id: String(seq),
    at: "2026-10-26T15:00:00Z",
    productId: "p1",
    reason: "stock_count",
    source: "count",
    note: null,
    prevOnHand: 6,
    newOnHand: 4,
    prevBackup: 0,
    newBackup: 0,
    statusAfter: "healthy",
    cutoffAtTime: 4,
    actorName: "Manager",
    importBatchId: null,
    ...over,
  };
}

const ctx = {
  timeZone: "America/New_York",
  now: new Date("2026-10-27T16:00:00Z"),
};

const entries = [
  entry({
    at: "2026-10-25T15:00:00Z",
    prevOnHand: 8,
    newOnHand: 6,
    reason: "usage",
    source: "manual_edit",
    actorName: "Sidhu",
  }),
  entry({
    at: "2026-10-26T15:00:00Z",
    prevOnHand: 2,
    newOnHand: 6,
    reason: "delivery_restock",
    source: "delivery",
  }),
  entry({
    at: "2026-10-27T15:00:00Z",
    prevOnHand: 6,
    newOnHand: 4,
    prevBackup: 1,
    newBackup: 3,
  }),
  entry({
    at: "2026-10-27T15:00:00Z",
    productId: "p2",
    prevOnHand: 10,
    newOnHand: 9,
    reason: "breakage",
    source: "manual_edit",
    actorName: "Sidhu",
    note: "dropped",
  }),
];

describe("buildHistoryRows", () => {
  const rows = buildHistoryRows(entries, catalog());

  it("is newest first, and equal timestamps keep a stable order (latest id first)", () => {
    // entries[2] and entries[3] share a timestamp: the later ledger id leads.
    expect(rows.map((r) => r.id)).toEqual([
      entries[3].id,
      entries[2].id,
      entries[1].id,
      entries[0].id,
    ]);
  });

  it("computes exact signed deltas for both counts", () => {
    const row = rows.find((r) => r.deltaBackup !== 0)!;
    expect(row).toMatchObject({ deltaOnHand: -2, deltaBackup: 2 });
  });

  it("does not drift on cents", () => {
    const [r] = buildHistoryRows(
      [entry({ prevOnHand: 0.1, newOnHand: 0.3 })],
      catalog(),
    );
    expect(r.deltaOnHand).toBe(0.2);
  });

  it("joins vendor, item, category, size and unit from the catalog", () => {
    const tito = rows.find((r) => r.item === "Tito's")!;
    expect(tito).toMatchObject({
      vendor: "Faust",
      category: "Spirits",
      subcategory: "Vodka",
      size: "1 L",
      unit: "Bottle",
      archived: false,
    });
  });

  it("shows the reason and source as readable labels", () => {
    expect(rows.find((r) => r.note === "dropped")).toMatchObject({
      reason: "Breakage",
      source: "Manual edit",
    });
    expect(rows.some((r) => r.source === "Stock count")).toBe(true);
    expect(rows.some((r) => r.source === "Delivery")).toBe(true);
  });
});

describe("history stays readable after the catalog changes", () => {
  it("a renamed product and a renamed vendor show the current names on old rows", () => {
    const renamed = catalog();
    renamed.products[0] = { ...renamed.products[0], name: "Tito's Handmade" };
    renamed.vendors[0] = { ...renamed.vendors[0], name: "Faust Distribution" };
    const rows = buildHistoryRows(entries, renamed);
    const tito = rows.filter((r) => r.productId === "p1");
    expect(tito).toHaveLength(3);
    expect(tito.every((r) => r.item === "Tito's Handmade")).toBe(true);
    expect(tito.every((r) => r.vendor === "Faust Distribution")).toBe(true);
  });

  it("an archived product's history is kept and flagged", () => {
    const archived = catalog();
    archived.products[0] = { ...archived.products[0], active: false };
    const rows = buildHistoryRows(entries, archived);
    expect(
      rows.filter((r) => r.productId === "p1").every((r) => r.archived),
    ).toBe(true);
    expect(rows).toHaveLength(4);
  });

  it("a deactivated vendor / category still resolves", () => {
    const off = catalog();
    off.vendors[0] = { ...off.vendors[0], active: false };
    off.categories[0] = { ...off.categories[0], active: false };
    const tito = buildHistoryRows(entries, off).find(
      (r) => r.productId === "p1",
    )!;
    expect(tito).toMatchObject({ vendor: "Faust", category: "Spirits" });
  });

  it("an entry whose product is somehow missing is labelled, never dropped", () => {
    const [row] = buildHistoryRows([entry({ productId: "gone" })], catalog());
    expect(row).toMatchObject({ item: "Unknown item", vendor: "Unknown" });
  });
});

describe("filters over history (BI-HIST filters)", () => {
  const rows = buildHistoryRows(entries, catalog());
  const run = (
    filters: Parameters<typeof applyFilters>[2]["filters"],
    search = "",
  ) => applyFilters(rows, HISTORY_COLUMNS, { filters, search }, ctx);

  it("date: Today / Last 7 / custom range in the location time zone", () => {
    expect(run({ at: { type: "date", preset: "today" } })).toHaveLength(2);
    expect(run({ at: { type: "date", preset: "7d" } })).toHaveLength(4);
    expect(
      run({
        at: {
          type: "date",
          preset: "custom",
          from: "2026-10-26",
          to: "2026-10-26",
        },
      }),
    ).toHaveLength(1);
  });

  it("vendor, reason, source and actor multi-selects", () => {
    expect(
      run({ vendor: { type: "select", values: ["Del Papa"] } }),
    ).toHaveLength(1);
    expect(
      run({ reason: { type: "select", values: ["Usage", "Breakage"] } }),
    ).toHaveLength(2);
    expect(
      run({ source: { type: "select", values: ["Delivery"] } }),
    ).toHaveLength(1);
    expect(run({ actor: { type: "select", values: ["Sidhu"] } })).toHaveLength(
      2,
    );
  });

  it("item text filter", () => {
    expect(
      run({ item: { type: "text", op: "startsWith", value: "tit" } }),
    ).toHaveLength(3);
    expect(
      run({ item: { type: "text", op: "equals", value: "modelo" } }),
    ).toHaveLength(1);
  });

  it("numeric delta filters: comparison and range, on both counts", () => {
    expect(
      run({ deltaOnHand: { type: "number", op: "lt", value: 0 } }),
    ).toHaveLength(3);
    expect(
      run({ deltaOnHand: { type: "number", op: "gt", value: 0 } }),
    ).toHaveLength(1);
    expect(
      run({
        deltaOnHand: { type: "number", op: "between", value: -2, to: -1 },
      }),
    ).toHaveLength(3);
    expect(
      run({ deltaBackup: { type: "number", op: "eq", value: 2 } }),
    ).toHaveLength(1);
  });

  it("filters combine (AND) and global search adds to them", () => {
    expect(
      run({
        vendor: { type: "select", values: ["Faust"] },
        deltaOnHand: { type: "number", op: "lt", value: 0 },
      }),
    ).toHaveLength(2);
    expect(
      run({ vendor: { type: "select", values: ["Faust"] } }, "dropped"),
    ).toHaveLength(0);
    expect(
      run({ vendor: { type: "select", values: ["Del Papa"] } }, "dropped"),
    ).toHaveLength(1);
  });

  it("default sort is newest first and stable", () => {
    const sorted = sortRows(rows, HISTORY_COLUMNS, HISTORY_DEFAULT_SORT);
    expect(sorted.map((r) => r.at)).toEqual(
      [...sorted.map((r) => r.at)].sort().reverse(),
    );
  });
});

describe("signedQuantity", () => {
  it("always shows direction", () => {
    expect(signedQuantity(4)).toBe("+4");
    expect(signedQuantity(-2)).toBe("−2");
    expect(signedQuantity(0)).toBe("0");
    expect(signedQuantity(-0.5)).toBe("−0.5");
  });
});
