import { describe, expect, it } from "vitest";

import { applyCatalogCommand, type CatalogContext } from "./catalog-engine";
import { buildDemoCatalog } from "./demo-catalog";
import type { CatalogState } from "./inventory-types";
import {
  clearDraftDemo,
  draftsOf,
  fillDraftDemo,
  openDraftDemo,
  saveDraftDemo,
  syncDraftDemo,
  type DraftEngineResult,
} from "./order-draft-demo";
import { diffDraftEdits } from "./order-draft-view";

let counter = 0;
const ctx = (actorName = "Mia"): CatalogContext => ({
  actorName,
  now: new Date("2026-10-27T16:00:00Z"),
  newId: () => `draft-${++counter}`,
});

function ok(result: DraftEngineResult) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

const vendorId = (state: CatalogState, name: string) =>
  state.vendors.find((v) => v.name === name)!.id;
const productId = (state: CatalogState, name: string) =>
  state.products.find((p) => p.name === name)!.id;

/** Faust has one Critical item (Tito's, suggested 9); Del Papa one Low (Modelo). */
function openFaust(state = buildDemoCatalog()) {
  const result = ok(openDraftDemo(state, vendorId(state, "Faust"), ctx()));
  const draft = draftsOf(result.state).find((d) => d.id === result.draftId)!;
  return { state: result.state, draft };
}

describe("open (VOD-001, VOD-002, VOD-006)", () => {
  it("seeds one line per Critical/Low item of that vendor, with a read-only snapshot", () => {
    const { draft } = openFaust();
    expect(draft.vendorName).toBe("Faust");
    expect(draft.lines.map((l) => l.name)).toEqual(["Tito's Handmade Vodka"]);
    expect(draft.lines[0]).toMatchObject({
      suggestedQty: 9,
      totalAtSnapshot: 3,
      parAtSnapshot: 12,
      statusAtSnapshot: "critical",
      orderQty: null,
      included: true,
      itemNote: null,
    });
    expect(draft.version).toBe(1);
  });

  it("returns the existing active draft instead of creating a second", () => {
    const first = openFaust();
    const again = ok(openDraftDemo(first.state, first.draft.vendorId, ctx()));
    expect(again.draftId).toBe(first.draft.id);
    expect(again.changed).toBe(false);
    expect(draftsOf(again.state)).toHaveLength(1);
  });

  it("refuses the system Unassigned vendor, an inactive vendor and an unknown vendor", () => {
    const state = buildDemoCatalog();
    const system = state.vendors.find((v) => v.isSystem)!;
    expect(openDraftDemo(state, system.id, ctx())).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Assign a vendor/),
    });
    const faust = vendorId(state, "Faust");
    const inactive = applyCatalogCommand(
      state,
      {
        type: "vendorSetActive",
        id: faust,
        active: false,
        expectedVersion: state.vendors.find((v) => v.id === faust)!.version,
      },
      ctx(),
    );
    if (!inactive.ok) throw new Error(inactive.error);
    expect(openDraftDemo(inactive.state, faust, ctx())).toMatchObject({
      ok: false,
      error: expect.stringMatching(/inactive/),
    });
    expect(openDraftDemo(state, "nope", ctx())).toMatchObject({ ok: false });
  });
});

describe("quantity-only save persists (VOD-046 / VOD-1.1 user flow)", () => {
  const save = (
    state: CatalogState,
    draftId: string,
    expectedVersion: number,
    lines: {
      productId: string;
      orderQty: number | null;
      itemNote?: string | null;
      included?: boolean;
    }[],
    vendorNote: string | null = null,
  ) =>
    saveDraftDemo(
      state,
      {
        draftId,
        expectedVersion,
        vendorNote,
        lines: lines.map((l) => ({
          itemNote: null,
          included: true,
          ...l,
        })),
      },
      ctx(),
    );

  it("blank → 5, then reload: the quantity is still there and the version moved", () => {
    const { state, draft } = openFaust();
    const tito = draft.lines[0]!.productId;
    const saved = ok(
      save(state, draft.id, draft.version, [{ productId: tito, orderQty: 5 }]),
    );
    expect(saved.changed).toBe(true);
    const reloaded = draftsOf(saved.state).find((d) => d.id === draft.id)!;
    expect(reloaded.lines[0]!.orderQty).toBe(5);
    expect(reloaded.lines[0]!.itemNote).toBeNull();
    expect(reloaded.version).toBe(2);
    // The suggestion snapshot is untouched by the typed quantity.
    expect(reloaded.lines[0]!.suggestedQty).toBe(9);
  });

  it("blank → 0 persists as 0 (not blank)", () => {
    const { state, draft } = openFaust();
    const tito = draft.lines[0]!.productId;
    const saved = ok(
      save(state, draft.id, 1, [{ productId: tito, orderQty: 0 }]),
    );
    expect(draftsOf(saved.state)[0]!.lines[0]!.orderQty).toBe(0);
  });

  it("5 → blank clears it where allowed", () => {
    const first = openFaust();
    const tito = first.draft.lines[0]!.productId;
    const withQty = ok(
      save(first.state, first.draft.id, 1, [{ productId: tito, orderQty: 5 }]),
    );
    const cleared = ok(
      save(withQty.state, first.draft.id, 2, [
        { productId: tito, orderQty: null },
      ]),
    );
    expect(cleared.changed).toBe(true);
    expect(draftsOf(cleared.state)[0]!.lines[0]!.orderQty).toBeNull();
  });

  it("saving the same value is a no-op: no version bump", () => {
    const first = openFaust();
    const tito = first.draft.lines[0]!.productId;
    const withQty = ok(
      save(first.state, first.draft.id, 1, [{ productId: tito, orderQty: 5 }]),
    );
    const same = ok(
      save(withQty.state, first.draft.id, 2, [
        { productId: tito, orderQty: 5 },
      ]),
    );
    expect(same.changed).toBe(false);
    expect(draftsOf(same.state)[0]!.version).toBe(2);
    // ...and a retried identical save with a stale version is still harmless.
    const retry = ok(
      save(withQty.state, first.draft.id, 1, [
        { productId: tito, orderQty: 5 },
      ]),
    );
    expect(retry.changed).toBe(false);
  });

  it("works end to end from what the editor sends (diff → save → reload)", () => {
    const { state, draft } = openFaust();
    const diff = diffDraftEdits(draft, {
      lines: { [draft.lines[0]!.productId]: { orderQty: "6.5" } },
    });
    if (!diff.ok || !diff.payload) throw new Error("expected a payload");
    const saved = ok(
      saveDraftDemo(
        state,
        { draftId: draft.id, expectedVersion: draft.version, ...diff.payload },
        ctx(),
      ),
    );
    expect(draftsOf(saved.state)[0]!.lines[0]!.orderQty).toBe(6.5);
  });

  it("a stale write is refused with the PT409 shape and applies nothing", () => {
    const first = openFaust();
    const tito = first.draft.lines[0]!.productId;
    const theirs = ok(
      saveDraftDemo(
        first.state,
        {
          draftId: first.draft.id,
          expectedVersion: 1,
          vendorNote: "Deliver Thursday",
          lines: [],
        },
        ctx("Ben"),
      ),
    );
    const mine = save(theirs.state, first.draft.id, 1, [
      { productId: tito, orderQty: 5 },
    ]);
    expect(mine).toMatchObject({
      ok: false,
      conflict: {
        kind: "stale",
        entity: "order_draft",
        id: first.draft.id,
        currentVersion: 2,
        updatedBy: "Ben",
      },
    });
    const after = draftsOf(theirs.state)[0]!;
    expect(after.lines[0]!.orderQty).toBeNull();
    expect(after.vendorNote).toBe("Deliver Thursday");
  });

  it("validates server-side too: negative, too many decimals, notes over the limit", () => {
    const { state, draft } = openFaust();
    const tito = draft.lines[0]!.productId;
    expect(
      save(state, draft.id, 1, [{ productId: tito, orderQty: -1 }]),
    ).toMatchObject({ ok: false });
    expect(
      save(state, draft.id, 1, [{ productId: tito, orderQty: 1.234 }]),
    ).toMatchObject({ ok: false });
    expect(
      save(state, draft.id, 1, [
        { productId: tito, orderQty: 1, itemNote: "x".repeat(201) },
      ]),
    ).toMatchObject({ ok: false });
    expect(save(state, draft.id, 1, [], "y".repeat(1001))).toMatchObject({
      ok: false,
    });
    expect(
      save(state, draft.id, 1, [{ productId: "other", orderQty: 1 }]),
    ).toMatchObject({ ok: false });
  });

  it("persists item notes (with newlines), the vendor note and include/exclude", () => {
    const { state, draft } = openFaust();
    const tito = draft.lines[0]!.productId;
    const saved = ok(
      save(
        state,
        draft.id,
        1,
        [
          {
            productId: tito,
            orderQty: 12,
            itemNote: "Weekend stock\nrush",
            included: false,
          },
        ],
        "Deliver Thursday",
      ),
    );
    const reloaded = draftsOf(saved.state)[0]!;
    expect(reloaded.lines[0]).toMatchObject({
      orderQty: 12,
      itemNote: "Weekend stock\nrush",
      included: false,
    });
    expect(reloaded.vendorNote).toBe("Deliver Thursday");
  });
});

describe("fill from suggestions (VOD-030, VOD-031, VOD-012)", () => {
  /** Gin gets a cutoff but no Par: Critical, "Order needed", no numeric suggestion. */
  function withNoParItem() {
    const state = buildDemoCatalog();
    const gin = productId(state, "House Rail Gin");
    const stock = state.stock.find((s) => s.productId === gin)!;
    const result = applyCatalogCommand(
      state,
      {
        type: "stockSetLevels",
        productId: gin,
        cutoff: 6,
        warning: null,
        par: null,
        expectedVersion: stock.version,
      },
      ctx(),
    );
    if (!result.ok) throw new Error(result.error);
    return result.state;
  }

  it("fills numeric suggestions into blanks and leaves no-Par lines blank", () => {
    const base = withNoParItem();
    const opened = ok(openDraftDemo(base, vendorId(base, "Faust"), ctx()));
    const draft = draftsOf(opened.state)[0]!;
    expect(draft.lines.map((l) => [l.name, l.suggestedQty])).toEqual(
      expect.arrayContaining([
        ["Tito's Handmade Vodka", 9],
        ["House Rail Gin", null],
      ]),
    );
    const filled = ok(
      fillDraftDemo(
        opened.state,
        { draftId: draft.id, expectedVersion: 1, mode: "empty_only" },
        ctx(),
      ),
    );
    const lines = draftsOf(filled.state)[0]!.lines;
    expect(
      lines.find((l) => l.name === "Tito's Handmade Vodka")!.orderQty,
    ).toBe(9);
    expect(lines.find((l) => l.name === "House Rail Gin")!.orderQty).toBeNull();
    expect(draftsOf(filled.state)[0]!.version).toBe(2);
  });

  it("empty-only never overwrites a typed quantity; replace-all does", () => {
    const first = openFaust();
    const tito = first.draft.lines[0]!.productId;
    const typed = ok(
      saveDraftDemo(
        first.state,
        {
          draftId: first.draft.id,
          expectedVersion: 1,
          vendorNote: null,
          lines: [
            { productId: tito, orderQty: 12, itemNote: null, included: true },
          ],
        },
        ctx(),
      ),
    );
    const keep = ok(
      fillDraftDemo(
        typed.state,
        { draftId: first.draft.id, expectedVersion: 2, mode: "empty_only" },
        ctx(),
      ),
    );
    expect(keep.changed).toBe(false);
    expect(draftsOf(keep.state)[0]!.lines[0]!.orderQty).toBe(12);
    const replaced = ok(
      fillDraftDemo(
        typed.state,
        { draftId: first.draft.id, expectedVersion: 2, mode: "replace_all" },
        ctx(),
      ),
    );
    expect(replaced.changed).toBe(true);
    expect(draftsOf(replaced.state)[0]!.lines[0]!.orderQty).toBe(9);
  });

  it("refuses a stale fill", () => {
    const first = openFaust();
    expect(
      fillDraftDemo(
        first.state,
        { draftId: first.draft.id, expectedVersion: 7, mode: "empty_only" },
        ctx(),
      ),
    ).toMatchObject({
      ok: false,
      conflict: { kind: "stale", currentVersion: 1 },
    });
  });
});

describe("clear and sync (VOD-032, VOD-008)", () => {
  it("clear resets quantities, notes, Included and the vendor note but keeps lines and snapshots", () => {
    const first = openFaust();
    const tito = first.draft.lines[0]!.productId;
    const typed = ok(
      saveDraftDemo(
        first.state,
        {
          draftId: first.draft.id,
          expectedVersion: 1,
          vendorNote: "Call first",
          lines: [
            {
              productId: tito,
              orderQty: 4,
              itemNote: "promo",
              included: false,
            },
          ],
        },
        ctx(),
      ),
    );
    const cleared = ok(
      clearDraftDemo(
        typed.state,
        { draftId: first.draft.id, expectedVersion: 2 },
        ctx(),
      ),
    );
    const draft = draftsOf(cleared.state)[0]!;
    expect(draft.vendorNote).toBeNull();
    expect(draft.lines[0]).toMatchObject({
      orderQty: null,
      itemNote: null,
      included: true,
      suggestedQty: 9,
      totalAtSnapshot: 3,
    });
    // Clearing an already clear draft changes nothing.
    const again = ok(
      clearDraftDemo(
        cleared.state,
        { draftId: first.draft.id, expectedVersion: 3 },
        ctx(),
      ),
    );
    expect(again.changed).toBe(false);
  });

  it("clear never touches inventory", () => {
    const first = openFaust();
    const cleared = ok(
      clearDraftDemo(
        first.state,
        { draftId: first.draft.id, expectedVersion: 1 },
        ctx(),
      ),
    );
    expect(cleared.state.stock).toBe(first.state.stock);
    expect(cleared.state.ledger).toBe(first.state.ledger);
  });

  it("sync re-stamps snapshots and appends newly low items, never touching typed values", () => {
    const first = openFaust();
    const tito = first.draft.lines[0]!.productId;
    const typed = ok(
      saveDraftDemo(
        first.state,
        {
          draftId: first.draft.id,
          expectedVersion: 1,
          vendorNote: "keep",
          lines: [
            { productId: tito, orderQty: 5, itemNote: "note", included: false },
          ],
        },
        ctx(),
      ),
    );
    // Stock moves: Tito's is restocked to 10 (par 12 → suggestion 2) and
    // Casamigos drops to its cutoff, so it newly needs ordering.
    let state = typed.state;
    for (const [name, onHand] of [
      ["Tito's Handmade Vodka", 9],
      ["Casamigos Blanco", 1],
    ] as const) {
      const id = productId(state, name);
      const stock = state.stock.find((s) => s.productId === id)!;
      const adjusted = applyCatalogCommand(
        state,
        {
          type: "stockAdjust",
          productId: id,
          mode: "set",
          onHand,
          backup: 1,
          reason: "stock_count",
          note: null,
          expectedVersion: stock.version,
        },
        ctx(),
      );
      if (!adjusted.ok) throw new Error(adjusted.error);
      state = adjusted.state;
    }
    const synced = ok(
      syncDraftDemo(
        state,
        { draftId: first.draft.id, expectedVersion: 2 },
        ctx(),
      ),
    );
    expect(synced.changed).toBe(true);
    const draft = draftsOf(synced.state)[0]!;
    expect(draft.lines.map((l) => l.name).toSorted()).toEqual([
      "Casamigos Blanco",
      "Tito's Handmade Vodka",
    ]);
    const titos = draft.lines.find((l) => l.productId === tito)!;
    expect(titos).toMatchObject({
      totalAtSnapshot: 10,
      orderQty: 5,
      itemNote: "note",
      included: false,
    });
    expect(draft.vendorNote).toBe("keep");
    expect(draft.version).toBe(3);
    // Nothing further to update.
    expect(
      ok(
        syncDraftDemo(
          synced.state,
          { draftId: first.draft.id, expectedVersion: 3 },
          ctx(),
        ),
      ).changed,
    ).toBe(false);
  });
});

describe("snapshot survives later stock changes (VOD-011)", () => {
  it("a stored suggestion does not move until Update suggestions", () => {
    const first = openFaust();
    const id = first.draft.lines[0]!.productId;
    const stock = first.state.stock.find((s) => s.productId === id)!;
    const adjusted = applyCatalogCommand(
      first.state,
      {
        type: "stockAdjust",
        productId: id,
        mode: "set",
        onHand: 11,
        backup: 0,
        reason: "delivery_restock",
        note: null,
        expectedVersion: stock.version,
      },
      ctx(),
    );
    if (!adjusted.ok) throw new Error(adjusted.error);
    expect(draftsOf(adjusted.state)[0]!.lines[0]!.suggestedQty).toBe(9);
  });
});
