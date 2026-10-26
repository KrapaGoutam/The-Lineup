import { describe, expect, it } from "vitest";

import type { CatalogCommand } from "./catalog-commands";
import {
  applyCatalogCommand,
  emptyCatalogState,
  type CatalogContext,
} from "./catalog-engine";
import type { CatalogState, ProductInput } from "./inventory-types";

let counter = 0;
const ctx = (actorName = "Mona"): CatalogContext => ({
  actorName,
  now: new Date("2026-10-26T20:00:00Z"),
  newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
});

function run(state: CatalogState, command: CatalogCommand, actor = "Mona") {
  const result = applyCatalogCommand(state, command, ctx(actor));
  if (!result.ok) throw new Error(`unexpected refusal: ${result.error}`);
  return result.state;
}

function refusal(state: CatalogState, command: CatalogCommand) {
  const result = applyCatalogCommand(state, command, ctx());
  if (result.ok) throw new Error("expected a refusal");
  return result;
}

const input = (over: Partial<ProductInput>): ProductInput => ({
  vendorId: "",
  name: "Tito's Handmade Vodka",
  categoryId: null,
  subcategoryId: null,
  size: "750 mL",
  unitType: "bottle",
  unitLabel: null,
  sku: null,
  notes: null,
  ...over,
});

function seeded() {
  let state = run(emptyCatalogState(), {
    type: "vendorCreate",
    name: "Faust",
    notes: null,
  });
  state = run(state, { type: "vendorCreate", name: "Del Papa", notes: null });
  state = run(state, { type: "categoryCreate", name: "Spirits" });
  const spirits = state.categories[0];
  state = run(state, {
    type: "subcategoryCreate",
    categoryId: spirits.id,
    name: "Vodka",
  });
  return state;
}

const vendor = (state: CatalogState, name: string) =>
  state.vendors.find((v) => v.name === name)!;

describe("system vendor", () => {
  it("appears on first use and is read-only", () => {
    const state = seeded();
    const system = state.vendors.find((v) => v.isSystem)!;
    expect(system.name).toBe("Unassigned");
    expect(
      refusal(state, {
        type: "vendorUpdate",
        id: system.id,
        name: "Renamed",
        notes: null,
        expectedVersion: 1,
      }).error,
    ).toMatch(/cannot be changed/);
    expect(
      refusal(state, {
        type: "vendorSetActive",
        id: system.id,
        active: false,
        expectedVersion: 1,
      }).error,
    ).toMatch(/cannot be changed/);
  });

  it("reserves the name Unassigned", () => {
    const result = refusal(seeded(), {
      type: "vendorCreate",
      name: "unassigned",
      notes: null,
    });
    expect(result.conflict?.kind).toBe("duplicate");
  });
});

describe("vendors", () => {
  it("refuses spelling variants and names the existing vendor", () => {
    const state = seeded();
    for (const name of ["DelPapa", "DEL PAPA", "  del   papa "]) {
      const result = refusal(state, {
        type: "vendorCreate",
        name,
        notes: null,
      });
      expect(result.conflict).toMatchObject({
        kind: "duplicate",
        existingLabel: "Del Papa",
      });
    }
  });

  it("rejects blank, symbol-only and over-long names", () => {
    const state = seeded();
    for (const name of ["   ", "---", "x".repeat(121)]) {
      expect(
        refusal(state, { type: "vendorCreate", name, notes: null }).conflict,
      ).toBeUndefined();
    }
  });

  it("renames with version bump, no-ops identical submits, refuses stale", () => {
    const state = seeded();
    const faust = vendor(state, "Faust");
    const renamed = run(state, {
      type: "vendorUpdate",
      id: faust.id,
      name: "Faust Distributing",
      notes: null,
      expectedVersion: 1,
    });
    expect(vendor(renamed, "Faust Distributing").version).toBe(2);

    const again = applyCatalogCommand(
      renamed,
      {
        type: "vendorUpdate",
        id: faust.id,
        name: "Faust Distributing",
        notes: null,
        expectedVersion: 2,
      },
      ctx(),
    );
    expect(again.ok && again.state).toBe(renamed);

    const stale = refusal(renamed, {
      type: "vendorUpdate",
      id: faust.id,
      name: "Faust Again",
      notes: null,
      expectedVersion: 1,
    });
    expect(stale.conflict).toMatchObject({
      kind: "stale",
      currentVersion: 2,
      updatedBy: "Mona",
    });
  });

  it("deactivates and reactivates without deleting", () => {
    const state = seeded();
    const faust = vendor(state, "Faust");
    const off = run(state, {
      type: "vendorSetActive",
      id: faust.id,
      active: false,
      expectedVersion: 1,
    });
    expect(vendor(off, "Faust").active).toBe(false);
    expect(off.vendors).toHaveLength(state.vendors.length);
    const on = run(off, {
      type: "vendorSetActive",
      id: faust.id,
      active: true,
      expectedVersion: 2,
    });
    expect(vendor(on, "Faust").version).toBe(3);
  });
});

describe("categories and subcategories", () => {
  it("allows the same subcategory name under different categories only", () => {
    let state = seeded();
    state = run(state, { type: "categoryCreate", name: "Beer" });
    const [spirits, beer] = state.categories;
    state = run(state, {
      type: "subcategoryCreate",
      categoryId: beer.id,
      name: "Vodka",
    });
    expect(
      refusal(state, {
        type: "subcategoryCreate",
        categoryId: spirits.id,
        name: "vodka",
      }).conflict?.kind,
    ).toBe("duplicate");
  });

  it("refuses new subcategories under an archived category", () => {
    let state = seeded();
    const spirits = state.categories[0];
    state = run(state, {
      type: "categorySetActive",
      id: spirits.id,
      active: false,
      expectedVersion: 1,
    });
    expect(
      refusal(state, {
        type: "subcategoryCreate",
        categoryId: spirits.id,
        name: "Gin",
      }).error,
    ).toMatch(/Reactivate the category/);
  });

  it("refuses moving a subcategory that products still use", () => {
    let state = seeded();
    state = run(state, { type: "categoryCreate", name: "Beer" });
    const [spirits, beer] = state.categories;
    const vodka = state.subcategories[0];
    state = run(state, {
      type: "productCreate",
      input: input({
        vendorId: vendor(state, "Faust").id,
        categoryId: spirits.id,
        subcategoryId: vodka.id,
      }),
    });
    expect(
      refusal(state, {
        type: "subcategoryUpdate",
        id: vodka.id,
        categoryId: beer.id,
        name: "Vodka",
        expectedVersion: 1,
      }).error,
    ).toMatch(/Products still use/);
  });
});

describe("products", () => {
  it("treats size, vendor and unit as part of identity", () => {
    let state = seeded();
    const faust = vendor(state, "Faust");
    state = run(state, {
      type: "productCreate",
      input: input({ vendorId: faust.id }),
    });

    expect(
      refusal(state, {
        type: "productCreate",
        input: input({
          vendorId: faust.id,
          name: "TITOS handmade vodka",
          size: "750ml",
        }),
      }).conflict,
    ).toMatchObject({ kind: "duplicate", field: "identity" });

    for (const over of [
      { size: "1.75 L" },
      { unitType: "keg" as const },
      { vendorId: vendor(state, "Del Papa").id },
    ]) {
      state = run(state, {
        type: "productCreate",
        input: input({ vendorId: faust.id, ...over }),
      });
    }
    expect(state.products).toHaveLength(4);
  });

  it("enforces the SKU key case/space-insensitively among active products", () => {
    let state = seeded();
    const faust = vendor(state, "Faust");
    state = run(state, {
      type: "productCreate",
      input: input({ vendorId: faust.id, sku: "TIT-750" }),
    });
    expect(
      refusal(state, {
        type: "productCreate",
        input: input({ vendorId: faust.id, name: "Other", sku: " tit-750 " }),
      }).conflict,
    ).toMatchObject({ field: "sku" });
  });

  it("validates the unit rules (D8)", () => {
    const state = seeded();
    const faust = vendor(state, "Faust");
    const attempt = (over: Partial<ProductInput>) =>
      refusal(state, {
        type: "productCreate",
        input: input({ vendorId: faust.id, ...over }),
      }).error;
    expect(attempt({ unitType: "other" })).toMatch(/Name the unit/);
    expect(attempt({ unitType: "bottle", unitLabel: "Growler" })).toMatch(
      /only used with Other/,
    );
    const ok = run(state, {
      type: "productCreate",
      input: input({
        vendorId: faust.id,
        unitType: "other",
        unitLabel: "Growler",
      }),
    });
    expect(ok.products[0].unitLabel).toBe("Growler");
  });

  it("requires a category for a subcategory and a matching pair", () => {
    let state = seeded();
    state = run(state, { type: "categoryCreate", name: "Beer" });
    const faust = vendor(state, "Faust");
    const vodka = state.subcategories[0];
    const beer = state.categories[1];
    expect(
      refusal(state, {
        type: "productCreate",
        input: input({ vendorId: faust.id, subcategoryId: vodka.id }),
      }).error,
    ).toMatch(/Pick a category/);
    expect(
      refusal(state, {
        type: "productCreate",
        input: input({
          vendorId: faust.id,
          categoryId: beer.id,
          subcategoryId: vodka.id,
        }),
      }).error,
    ).toMatch(/does not belong/);
  });

  it("archives, frees the identity for re-creation, then re-checks on reactivation", () => {
    let state = seeded();
    const faust = vendor(state, "Faust");
    state = run(state, {
      type: "productCreate",
      input: input({ vendorId: faust.id, sku: "TIT-750" }),
    });
    const original = state.products[0];
    state = run(state, {
      type: "productSetActive",
      id: original.id,
      active: false,
      expectedVersion: 1,
    });
    expect(
      refusal(state, {
        type: "productUpdate",
        id: original.id,
        input: input({ vendorId: faust.id, name: "Edited" }),
        expectedVersion: 2,
      }).error,
    ).toMatch(/Reactivate this product/);

    state = run(state, {
      type: "productCreate",
      input: input({ vendorId: faust.id, sku: "TIT-750" }),
    });
    expect(
      refusal(state, {
        type: "productSetActive",
        id: original.id,
        active: true,
        expectedVersion: 2,
      }).conflict?.kind,
    ).toBe("duplicate");
  });

  it("refuses products for an inactive vendor, keeps existing ones readable", () => {
    let state = seeded();
    const del = vendor(state, "Del Papa");
    state = run(state, {
      type: "productCreate",
      input: input({ vendorId: del.id }),
    });
    state = run(state, {
      type: "vendorSetActive",
      id: del.id,
      active: false,
      expectedVersion: 1,
    });
    expect(
      refusal(state, {
        type: "productCreate",
        input: input({ vendorId: del.id, name: "Late" }),
      }).error,
    ).toMatch(/inactive/);
    expect(state.products.filter((p) => p.vendorId === del.id)).toHaveLength(1);
  });
});
