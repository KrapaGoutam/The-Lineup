import type { CatalogCommand } from "./catalog-commands";
import {
  applyCatalogCommand,
  emptyCatalogState,
  withSystemVendor,
  type CatalogContext,
} from "./catalog-engine";
import type { CatalogState } from "./inventory-types";

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
  return state;
}
