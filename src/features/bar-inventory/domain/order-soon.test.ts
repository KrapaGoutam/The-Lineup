import { describe, expect, it } from "vitest";

import type { InventoryRow } from "./inventory-rows";
import { buildRecommendationsExport } from "./order-export";
import { groupByVendor } from "./order-soon";
import { evaluateStock, type StockStatus } from "./stock-rules";

let seq = 0;
/** A row whose status and suggested order come from the real stock rules. */
function row(
  vendor: string,
  name: string,
  levels: { onHand: number; cutoff: number | null; par: number | null },
  over: Partial<InventoryRow> = {},
): InventoryRow {
  seq += 1;
  const stock = {
    onHand: levels.onHand,
    backup: 0,
    cutoff: levels.cutoff,
    warning: null,
    par: levels.par,
  };
  const e = evaluateStock(stock, { archived: false });
  return {
    productId: `p${seq}`,
    vendor,
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
    par: levels.par,
    effectiveWarning: e.effectiveWarning,
    status: e.status as StockStatus,
    suggestedOrder: e.suggestedOrder,
    orderNeeded: e.orderNeeded,
    updatedAt: null,
    updatedBy: null,
    stockVersion: 1,
    ...over,
  };
}

const rows = [
  row("Faust", "Casamigos Blanco", { onHand: 3, cutoff: 4, par: 10 }), // critical, order 7
  row("Faust", "Tito's", { onHand: 5, cutoff: 5, par: 12 }), // critical, order 7
  row("Faust", "Bulleit", { onHand: 8, cutoff: 6, par: 12 }), // low (warning 8), order 4
  row("Del Papa", "Modelo", { onHand: 2, cutoff: 4, par: 12 }), // critical, order 10
  row("Del Papa", "Corona", { onHand: 2, cutoff: 4, par: null }), // critical, no par
  row("Zed", "Lime Juice", { onHand: 7, cutoff: 6, par: 8 }), // low
  row("Faust", "Fine Gin", { onHand: 40, cutoff: 6, par: 12 }), // healthy: not listed
];

describe("groupByVendor (BI-DASH-002, BI-DASH-003)", () => {
  const groups = groupByVendor(rows);

  it("orders vendors by critical count, then low count, then name", () => {
    expect(groups.map((g) => g.vendor)).toEqual(["Faust", "Del Papa", "Zed"]);
    expect(groups.map((g) => [g.critical, g.low])).toEqual([
      [2, 1],
      [2, 0],
      [0, 1],
    ]);
  });

  it("orders items Critical, then Low, then closest to cutoff", () => {
    const faust = groups[0].items.map((i) => i.name);
    // Casamigos 3 vs 4 (-1), Tito's 5 vs 5 (0), then the Low one.
    expect(faust).toEqual(["Casamigos Blanco", "Tito's", "Bulleit"]);
  });

  it("sums computed quantities and counts items with no par separately", () => {
    expect(groups[0].suggestedTotal).toBe(18);
    expect(groups[1]).toMatchObject({ suggestedTotal: 10, orderNeeded: 1 });
    expect(
      groups[1].items.find((i) => i.name === "Corona")?.suggestedOrder,
    ).toBeNull();
  });

  it("leaves healthy items out and handles nothing to order", () => {
    expect(groups.flatMap((g) => g.items.map((i) => i.name))).not.toContain(
      "Fine Gin",
    );
    expect(groupByVendor([])).toEqual([]);
  });

  it("does not drift on cents", () => {
    const cents = [
      row("V", "A", { onHand: 0.1, cutoff: 1, par: 0.4 }),
      row("V", "B", { onHand: 0.2, cutoff: 1, par: 0.5 }),
    ];
    // (0.4 - 0.1) + (0.5 - 0.2) = 0.3 + 0.3
    expect(groupByVendor(cents)[0].suggestedTotal).toBe(0.6);
  });
});

describe("buildRecommendationsExport (BI-DASH-004)", () => {
  const base = {
    rows,
    timeZone: "America/New_York",
    now: new Date("2026-10-26T16:00:00Z"),
    slug: "the-lineup",
  };

  function lines(csv: string) {
    return csv.replace(/^﻿/, "").trimEnd().split("\r\n");
  }

  it("writes one row per shown item, grouped by vendor, with the header first", () => {
    const out = buildRecommendationsExport({ ...base, filters: "" });
    const l = lines(out.csv);
    expect(l[0]).toBe(
      "Vendor,Item,Size,Unit,SKU,Category,Subcategory,Status,Total,Cutoff,Warning,Par,Suggested order",
    );
    expect(out.rowCount).toBe(6);
    expect(l.slice(1).map((x) => x.split(",").slice(0, 2).join("/"))).toEqual([
      "Faust/Casamigos Blanco",
      "Faust/Tito's",
      "Faust/Bulleit",
      // Same distance to cutoff: name breaks the tie.
      "Del Papa/Corona",
      "Del Papa/Modelo",
      "Zed/Lime Juice",
    ]);
  });

  it("writes the quantity, or 'Order needed' when there is no par", () => {
    const l = lines(buildRecommendationsExport({ ...base, filters: "" }).csv);
    expect(l.find((x) => x.startsWith("Faust,Casamigos"))?.endsWith(",7")).toBe(
      true,
    );
    expect(l.find((x) => x.startsWith("Del Papa,Corona"))).toMatch(
      /,Order needed$/,
    );
  });

  it("applies the filters it is given, and only those", () => {
    const out = buildRecommendationsExport({
      ...base,
      filters: "f.vendor=s%3ADel%20Papa",
    });
    expect(out.rowCount).toBe(2);
    expect(
      lines(out.csv)
        .slice(1)
        .every((x) => x.startsWith("Del Papa,")),
    ).toBe(true);
    const status = buildRecommendationsExport({
      ...base,
      filters: "f.status=s%3ALow",
    });
    expect(status.rowCount).toBe(2);
  });

  it("combines a search with column filters", () => {
    const out = buildRecommendationsExport({
      ...base,
      filters: "f.vendor=s%3AFaust&q=tito",
    });
    expect(out.rowCount).toBe(1);
  });

  it("ignores filters on columns it does not know instead of trusting them", () => {
    const out = buildRecommendationsExport({
      ...base,
      filters: "f.secret=s%3Ax&f.status=bogus",
    });
    expect(out.rowCount).toBe(6);
  });

  it("neutralises a formula in a product name", () => {
    const evil = row("Faust", "=cmd|' /C calc'!A0", {
      onHand: 1,
      cutoff: 4,
      par: 10,
    });
    const out = buildRecommendationsExport({
      ...base,
      rows: [evil],
      filters: "",
    });
    expect(lines(out.csv)[1]).toMatch(/^Faust,'=cmd/);
  });

  it("names the file by restaurant and the location's local date", () => {
    // 2026-10-27 02:00Z is still Oct 26 in New York.
    const out = buildRecommendationsExport({
      ...base,
      now: new Date("2026-10-27T02:00:00Z"),
      filters: "",
    });
    expect(out.filename).toBe(
      "bar-inventory_the-lineup_order-recommendations_2026-10-26.csv",
    );
  });

  it("an empty result is just the header", () => {
    const out = buildRecommendationsExport({
      ...base,
      rows: [],
      filters: "",
    });
    expect(out.rowCount).toBe(0);
    expect(lines(out.csv)).toHaveLength(1);
  });
});
