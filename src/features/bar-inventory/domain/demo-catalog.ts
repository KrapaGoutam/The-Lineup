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
    now: new Date("2026-10-20T16:00:00Z"),
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
  return state;
}
