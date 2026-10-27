import { describe, expect, it } from "vitest";

import { buildDemoCatalog } from "./demo-catalog";
import {
  buildInventoryRows,
  INVENTORY_DEFAULT_SORT,
  INVENTORY_SORT_ONLY_COLUMNS,
} from "./inventory-rows";
import { sortRows, type ColumnSpec } from "./table-filters";

const rows = buildInventoryRows(buildDemoCatalog());
const byName = (name: string) => rows.find((r) => r.name === name)!;

describe("inventory rows from the demo catalog", () => {
  it("joins catalog and stock with the golden status rules", () => {
    expect(byName("Tito's Handmade Vodka")).toMatchObject({
      vendor: "Faust",
      category: "Spirits",
      subcategory: "Vodka",
      unit: "Bottle",
      total: 3,
      effectiveWarning: 6,
      status: "critical",
      suggestedOrder: 9,
    });
    expect(byName("Casamigos Blanco")).toMatchObject({
      total: 8,
      status: "healthy",
      suggestedOrder: null,
    });
    // cutoff 2 -> fallback warning 3; total 3 -> low
    expect(byName("Modelo Especial")).toMatchObject({
      status: "low",
      effectiveWarning: 3,
      suggestedOrder: 9,
      unit: "Case",
    });
    expect(byName("House Rail Gin")).toMatchObject({
      status: "no_cutoff",
      suggestedOrder: null,
      orderNeeded: false,
    });
  });

  it("archived products report the archived status", () => {
    const state = buildDemoCatalog();
    state.products = state.products.map((p) =>
      p.name === "House Rail Gin" ? { ...p, active: false } : p,
    );
    expect(
      buildInventoryRows(state).find((r) => r.name === "House Rail Gin")!
        .status,
    ).toBe("archived");
  });

  it("default sort is severity then name", () => {
    const specs: ColumnSpec<(typeof rows)[number]>[] = [
      { id: "name", label: "Name", type: "text", get: (r) => r.name },
      ...INVENTORY_SORT_ONLY_COLUMNS,
    ];
    expect(
      sortRows(rows, specs, INVENTORY_DEFAULT_SORT).map((r) => r.status),
    ).toEqual(["critical", "low", "healthy", "no_cutoff"]);
  });

  it("a product without a stock row shows zeros, not a crash", () => {
    const state = buildDemoCatalog();
    state.stock = [];
    expect(buildInventoryRows(state)[0]).toMatchObject({
      onHand: 0,
      backup: 0,
      status: "no_cutoff",
    });
  });
});
