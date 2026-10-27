import { describe, expect, it } from "vitest";

import {
  buildKpis,
  needsOrdering,
  recentlyChangedRows,
  tileDrillDown,
} from "./dashboard";
import type { InventoryRow } from "./inventory-rows";
import type { StockStatus } from "./stock-rules";
import { applyFilters, type ColumnSpec } from "./table-filters";

const TZ = "America/New_York";
// 2026-10-26 12:00 local.
const NOW = new Date("2026-10-26T16:00:00Z");
const ctx = { timeZone: TZ, now: NOW };

let seq = 0;
function row(
  over: Partial<InventoryRow> & { status: StockStatus },
): InventoryRow {
  seq += 1;
  return {
    productId: `p${seq}`,
    vendor: "Faust",
    name: `Item ${seq}`,
    category: null,
    subcategory: null,
    size: null,
    unit: "Bottle",
    sku: null,
    notes: null,
    onHand: 0,
    backup: 0,
    total: 0,
    cutoff: null,
    warning: null,
    par: null,
    effectiveWarning: null,
    suggestedOrder: null,
    orderNeeded: false,
    updatedAt: null,
    updatedBy: null,
    stockVersion: 1,
    ...over,
  };
}

const rows: InventoryRow[] = [
  row({
    status: "critical",
    total: 3,
    cutoff: 4,
    updatedAt: "2026-10-26T15:00:00Z",
  }),
  row({
    status: "critical",
    total: 5,
    cutoff: 5,
    updatedAt: "2026-10-20T15:00:00Z",
  }),
  row({
    status: "low",
    total: 9,
    cutoff: 6,
    updatedAt: "2026-10-19T15:00:00Z",
  }),
  row({
    status: "healthy",
    total: 30,
    cutoff: 6,
    updatedAt: "2026-10-21T04:30:00Z",
  }),
  row({ status: "healthy", total: 20, cutoff: 6 }),
  row({ status: "no_cutoff", total: 5 }),
  row({
    status: "archived",
    total: 1,
    cutoff: 4,
    updatedAt: "2026-10-26T15:00:00Z",
  }),
];

describe("buildKpis (BI-DASH-001, BI-CALC-005)", () => {
  const kpis = buildKpis(rows, ctx);

  it("counts each status over active items only", () => {
    expect(kpis).toMatchObject({
      active: 6,
      critical: 2,
      low: 1,
      healthy: 2,
      noCutoff: 1,
    });
  });

  it("the four status tiles always add up to Active items", () => {
    expect(kpis.critical + kpis.low + kpis.healthy + kpis.noCutoff).toBe(
      kpis.active,
    );
  });

  it("recently changed is the last 7 local days, archived excluded", () => {
    // Oct 20 is 6 days back (inside); Oct 19 is 7 days back (outside);
    // Oct 21 04:30Z is Oct 21 00:30 local (inside); never-edited is excluded.
    expect(kpis.recentlyChanged).toBe(3);
  });

  it("is empty-safe", () => {
    expect(buildKpis([], ctx)).toEqual({
      active: 0,
      critical: 0,
      low: 0,
      healthy: 0,
      noCutoff: 0,
      recentlyChanged: 0,
    });
  });
});

describe("recentlyChangedRows", () => {
  it("lists newest first", () => {
    const list = recentlyChangedRows(rows, ctx).map((r) => r.updatedAt);
    expect(list).toEqual([...list].sort().reverse());
  });

  it("uses the location time zone at the day boundary", () => {
    // 2026-10-20 03:30Z is Oct 19 23:30 in New York: outside; Oct 20 04:30Z is inside.
    const edge = [
      row({ status: "healthy", updatedAt: "2026-10-20T03:30:00Z" }),
      row({ status: "healthy", updatedAt: "2026-10-20T04:30:00Z" }),
    ];
    expect(recentlyChangedRows(edge, ctx)).toHaveLength(1);
  });
});

describe("needsOrdering", () => {
  it("is Critical, then Low, then closest to cutoff", () => {
    const list = needsOrdering(rows);
    expect(list.map((r) => r.status)).toEqual(["critical", "critical", "low"]);
    // Total 3 vs cutoff 4 (-1) sorts before total 5 vs cutoff 5 (0).
    expect(list.map((r) => r.total)).toEqual([3, 5, 9]);
  });

  it("excludes healthy, no-cutoff and archived items", () => {
    expect(needsOrdering(rows)).toHaveLength(3);
  });

  it("breaks ties by vendor then name", () => {
    const tied = [
      row({ status: "low", total: 7, cutoff: 6, vendor: "Zed", name: "A" }),
      row({ status: "low", total: 7, cutoff: 6, vendor: "Alpha", name: "B" }),
      row({ status: "low", total: 7, cutoff: 6, vendor: "Alpha", name: "A" }),
    ];
    expect(needsOrdering(tied).map((r) => `${r.vendor}/${r.name}`)).toEqual([
      "Alpha/A",
      "Alpha/B",
      "Zed/A",
    ]);
  });
});

describe("tileDrillDown (BI-DASH-006)", () => {
  const columns: ColumnSpec<InventoryRow>[] = [
    {
      id: "status",
      label: "Status",
      type: "select",
      get: (r) =>
        ({
          critical: "Critical",
          low: "Low",
          healthy: "Healthy",
          no_cutoff: "No cutoff",
          archived: "Archived",
        })[r.status],
    },
    {
      id: "updated",
      label: "Last updated",
      type: "date",
      get: (r) => r.updatedAt,
    },
  ];
  const visible = rows.filter((r) => r.status !== "archived");

  it.each([
    ["critical", 2],
    ["low", 1],
    ["healthy", 2],
    ["noCutoff", 1],
    ["active", 6],
    ["recent", 3],
  ] as const)("the %s tile opens exactly the rows it counted", (tile, n) => {
    const state = tileDrillDown(tile);
    expect(applyFilters(visible, columns, state, ctx)).toHaveLength(n);
  });
});
