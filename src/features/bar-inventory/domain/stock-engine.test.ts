import { describe, expect, it } from "vitest";

import type { CatalogCommand } from "./catalog-commands";
import {
  applyCatalogCommand,
  emptyCatalogState,
  type CatalogContext,
} from "./catalog-engine";
import type { CatalogState } from "./inventory-types";

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

function seeded() {
  let state = run(emptyCatalogState(), {
    type: "vendorCreate",
    name: "Faust",
    notes: null,
  });
  const faust = state.vendors.find((v) => v.name === "Faust")!.id;
  state = run(state, {
    type: "productCreate",
    input: {
      vendorId: faust,
      name: "Tito's",
      categoryId: null,
      subcategoryId: null,
      size: "750 mL",
      unitType: "bottle",
      unitLabel: null,
      sku: null,
      notes: null,
    },
  });
  return { state, product: state.products[0].id };
}

const adjust = (
  productId: string,
  over: Partial<Extract<CatalogCommand, { type: "stockAdjust" }>>,
): CatalogCommand => ({
  type: "stockAdjust",
  productId,
  mode: "set",
  onHand: null,
  backup: null,
  reason: "stock_count",
  note: null,
  expectedVersion: 1,
  ...over,
});
const stockOf = (state: CatalogState, id: string) =>
  state.stock.find((s) => s.productId === id)!;

describe("stock in the demo engine mirrors inventory_stock_adjust", () => {
  it("a new product has a zero stock row at version 1", () => {
    const { state, product } = seeded();
    expect(stockOf(state, product)).toMatchObject({
      onHand: 0,
      backup: 0,
      version: 1,
      cutoff: null,
    });
  });

  it("set bumps the version and records who", () => {
    const { state, product } = seeded();
    const next = run(state, adjust(product, { onHand: 6, backup: 3 }), "Asa");
    expect(stockOf(next, product)).toMatchObject({
      onHand: 6,
      backup: 3,
      version: 2,
      updatedByName: "Asa",
    });
  });

  it("an identical set is a no-op even with an old version", () => {
    const { state, product } = seeded();
    const next = run(state, adjust(product, { onHand: 6, backup: 3 }));
    const again = applyCatalogCommand(
      next,
      adjust(product, { onHand: 6, backup: 3, expectedVersion: 1 }),
      ctx(),
    );
    expect(again.ok && again.state).toBe(next);
  });

  it("a stale set is refused with the current counts", () => {
    const { state, product } = seeded();
    const next = run(state, adjust(product, { onHand: 5 }));
    const stale = refusal(
      next,
      adjust(product, { onHand: 9, expectedVersion: 1 }),
    );
    expect(stale.conflict).toMatchObject({
      kind: "stale",
      entity: "stock",
      currentVersion: 2,
      current: { onHand: 5, backup: 0 },
    });
    expect(
      refusal(next, adjust(product, { onHand: 9, expectedVersion: null }))
        .error,
    ).toMatch(/Reload/);
  });

  it("a partial set changes only the fields given", () => {
    const { state, product } = seeded();
    let next = run(state, adjust(product, { onHand: 4, backup: 2 }));
    next = run(next, adjust(product, { onHand: 8, expectedVersion: 2 }));
    expect(stockOf(next, product)).toMatchObject({ onHand: 8, backup: 2 });
  });

  it("deltas need no version, are exact and cannot go below zero", () => {
    const { state, product } = seeded();
    let next = run(state, adjust(product, { onHand: 0.1, backup: 0 }));
    next = run(
      next,
      adjust(product, { mode: "delta", onHand: 0.2, expectedVersion: null }),
    );
    expect(stockOf(next, product).onHand).toBe(0.3);
    expect(
      refusal(
        next,
        adjust(product, { mode: "delta", onHand: -1, expectedVersion: null }),
      ).error,
    ).toMatch(/below zero/);
    const zero = applyCatalogCommand(
      next,
      adjust(product, {
        mode: "delta",
        onHand: 0,
        backup: 0,
        expectedVersion: null,
      }),
      ctx(),
    );
    expect(zero.ok && zero.state).toBe(next);
  });

  it("validates quantities, requires a quantity and refuses archived products", () => {
    const { state, product } = seeded();
    expect(refusal(state, adjust(product, {})).error).toMatch(
      /Enter a quantity/,
    );
    expect(refusal(state, adjust(product, { onHand: 1.234 })).error).toMatch(
      /two decimal/,
    );
    expect(refusal(state, adjust(product, { onHand: -1 })).error).toMatch(
      /negative/,
    );
    expect(
      refusal(state, adjust(product, { onHand: 99_999_999_999 })).error,
    ).toMatch(/too large/);
    const archived = run(state, {
      type: "productSetActive",
      id: product,
      active: false,
      expectedVersion: 1,
    });
    expect(refusal(archived, adjust(product, { onHand: 1 })).error).toMatch(
      /Reactivate/,
    );
  });
});

describe("levels mirror inventory_stock_set_levels", () => {
  const levels = (
    productId: string,
    cutoff: number | null,
    warning: number | null,
    par: number | null,
    expectedVersion: number,
  ): CatalogCommand => ({
    type: "stockSetLevels",
    productId,
    cutoff,
    warning,
    par,
    expectedVersion,
  });

  it("sets, no-ops on identical, and refuses stale", () => {
    const { state, product } = seeded();
    const next = run(state, levels(product, 4, 6, 12, 1));
    expect(stockOf(next, product)).toMatchObject({
      cutoff: 4,
      warning: 6,
      par: 12,
      version: 2,
    });
    const again = applyCatalogCommand(
      next,
      levels(product, 4, 6, 12, 1),
      ctx(),
    );
    expect(again.ok && again.state).toBe(next);
    expect(refusal(next, levels(product, 5, 6, 12, 1)).conflict).toMatchObject({
      kind: "stale",
    });
  });

  it("rejects a warning below the cutoff, negatives and extra decimals; allows clearing", () => {
    const { state, product } = seeded();
    expect(refusal(state, levels(product, 6, 4, null, 1)).error).toMatch(
      /at least the cutoff/,
    );
    expect(refusal(state, levels(product, -1, null, null, 1)).error).toMatch(
      /negative/,
    );
    expect(refusal(state, levels(product, 4.123, null, null, 1)).error).toMatch(
      /two decimal/,
    );
    const set = run(state, levels(product, 4, null, null, 1));
    const cleared = run(set, levels(product, null, null, null, 2));
    expect(stockOf(cleared, product)).toMatchObject({
      cutoff: null,
      version: 3,
    });
  });
});
