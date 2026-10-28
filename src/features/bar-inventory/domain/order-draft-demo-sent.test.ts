import { describe, expect, it } from "vitest";

import { applyCatalogCommand, type CatalogContext } from "./catalog-engine";
import { buildDemoCatalog } from "./demo-catalog";
import type { CatalogState } from "./inventory-types";
import {
  activeDraftsOf,
  clearDraftDemo,
  draftsOf,
  fillDraftDemo,
  markSentDemo,
  openDraftDemo,
  saveDraftDemo,
  syncDraftDemo,
  type DraftEngineResult,
} from "./order-draft-demo";
import { pageSentDrafts } from "./order-draft-sent";
import { copyOrderText, withLiveLabels } from "./order-draft-share";

let counter = 0;
const at = (iso: string, actorName = "Mia"): CatalogContext => ({
  actorName,
  now: new Date(iso),
  newId: () => `draft-${++counter}`,
});
const T1 = "2026-10-27T16:00:00Z";
const T2 = "2026-10-27T18:30:00Z";

function ok(result: DraftEngineResult) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

const vendorId = (state: CatalogState, name: string) =>
  state.vendors.find((v) => v.name === name)!.id;

/** A Faust draft (one line: Tito's, suggested 9) with Order Qty 6 saved. */
function readyDraft(state = buildDemoCatalog()) {
  const opened = ok(openDraftDemo(state, vendorId(state, "Faust"), at(T1)));
  const draft = draftsOf(opened.state)[0]!;
  const saved = ok(
    saveDraftDemo(
      opened.state,
      {
        draftId: draft.id,
        expectedVersion: draft.version,
        vendorNote: "Deliver Thursday.",
        lines: [
          {
            productId: draft.lines[0]!.productId,
            orderQty: 6,
            itemNote: "weekend",
            included: true,
          },
        ],
      },
      at(T1),
    ),
  );
  return { state: saved.state, draft: draftsOf(saved.state)[0]! };
}

describe("Mark Sent (VOD-070/072/073/076)", () => {
  it("sets the sent facts, bumps the version and makes the order Sent", () => {
    const { state, draft } = readyDraft();
    const sent = ok(
      markSentDemo(
        state,
        { draftId: draft.id, expectedVersion: draft.version },
        at(T2, "Jo"),
      ),
    );
    const after = draftsOf(sent.state)[0]!;
    expect(sent.changed).toBe(true);
    expect(sent.sent).toEqual({
      sentByName: "Jo",
      sentAt: new Date(T2).toISOString(),
    });
    expect(after).toMatchObject({
      status: "sent",
      sentByName: "Jo",
      sentAt: new Date(T2).toISOString(),
      version: draft.version + 1,
    });
    expect(activeDraftsOf(sent.state)).toEqual([]);
  });

  it("requires an Included line with an Order Qty above zero, and changes nothing otherwise", () => {
    const opened = ok(
      openDraftDemo(
        buildDemoCatalog(),
        vendorId(buildDemoCatalog(), "Faust"),
        at(T1),
      ),
    );
    const draft = draftsOf(opened.state)[0]!;
    const blank = markSentDemo(
      opened.state,
      { draftId: draft.id, expectedVersion: 1 },
      at(T2),
    );
    expect(blank).toMatchObject({
      ok: false,
      error: "Add a quantity before marking this order sent.",
    });

    const productId = draft.lines[0]!.productId;
    for (const patch of [
      { orderQty: 0, included: true },
      { orderQty: 5, included: false },
    ]) {
      const saved = ok(
        saveDraftDemo(
          opened.state,
          {
            draftId: draft.id,
            expectedVersion: 1,
            vendorNote: null,
            lines: [{ productId, itemNote: null, ...patch }],
          },
          at(T1),
        ),
      );
      const attempt = markSentDemo(
        saved.state,
        { draftId: draft.id, expectedVersion: 2 },
        at(T2),
      );
      expect(attempt).toMatchObject({
        ok: false,
        error: "Add a quantity before marking this order sent.",
      });
      expect(draftsOf(saved.state)[0]!.status).toBe("draft");
    }
  });

  it("never touches stock, versions, the ledger or the catalog (VOD-073)", () => {
    const { state, draft } = readyDraft();
    const sent = ok(
      markSentDemo(
        state,
        { draftId: draft.id, expectedVersion: draft.version },
        at(T2),
      ),
    ).state;
    // The same objects, not merely equal ones: nothing was rebuilt or written.
    expect(sent.stock).toBe(state.stock);
    expect(sent.ledger).toBe(state.ledger);
    expect(sent.products).toBe(state.products);
    expect(sent.vendors).toBe(state.vendors);
    expect(JSON.stringify(sent.stock)).toBe(JSON.stringify(state.stock));
  });

  it("is refused when the draft changed since it was reviewed, and sends nothing (VOD-076)", () => {
    const { state, draft } = readyDraft();
    // Another manager saved a note: the draft is now version + 1.
    const theirs = ok(
      saveDraftDemo(
        state,
        {
          draftId: draft.id,
          expectedVersion: draft.version,
          vendorNote: "Deliver Friday instead.",
          lines: [],
        },
        at(T2, "Jo"),
      ),
    );
    const stale = markSentDemo(
      theirs.state,
      { draftId: draft.id, expectedVersion: draft.version },
      at(T2),
    );
    expect(stale).toMatchObject({
      ok: false,
      conflict: {
        kind: "stale",
        entity: "order_draft",
        id: draft.id,
        currentVersion: draft.version + 1,
        updatedBy: "Jo",
      },
    });
    expect(draftsOf(theirs.state)[0]!.status).toBe("draft");
    // With the version they actually reviewed, it goes through.
    ok(
      markSentDemo(
        theirs.state,
        { draftId: draft.id, expectedVersion: draft.version + 1 },
        at(T2),
      ),
    );
  });

  it("is idempotent: a retry or a second manager gets the first send's facts and changes nothing", () => {
    const { state, draft } = readyDraft();
    const first = ok(
      markSentDemo(
        state,
        { draftId: draft.id, expectedVersion: draft.version },
        at(T2, "Jo"),
      ),
    );
    const retry = ok(
      markSentDemo(
        first.state,
        { draftId: draft.id, expectedVersion: draft.version },
        at("2026-10-27T19:00:00Z", "Sam"),
      ),
    );
    expect(retry.changed).toBe(false);
    expect(retry.sent).toEqual(first.sent);
    // The exact same state object: no second record, no version bump.
    expect(retry.state).toBe(first.state);
    expect(draftsOf(retry.state)).toHaveLength(1);
    expect(draftsOf(retry.state)[0]!.version).toBe(draft.version + 1);
    expect(pageSentDrafts(draftsOf(retry.state), 0).total).toBe(1);
  });

  it("refuses an unknown draft", () => {
    expect(
      markSentDemo(
        buildDemoCatalog(),
        { draftId: "nope", expectedVersion: 1 },
        at(T2),
      ),
    ).toMatchObject({ ok: false });
  });
});

describe("Sent is read-only (VOD-075)", () => {
  function sentState() {
    const { state, draft } = readyDraft();
    const sent = ok(
      markSentDemo(
        state,
        { draftId: draft.id, expectedVersion: draft.version },
        at(T2),
      ),
    );
    return { state: sent.state, draft: draftsOf(sent.state)[0]! };
  }

  it("refuses save, fill, clear and update suggestions", () => {
    const { state, draft } = sentState();
    const ref = { draftId: draft.id, expectedVersion: draft.version };
    const refusal = {
      ok: false,
      error: "A sent order cannot be changed.",
    };
    expect(
      saveDraftDemo(
        state,
        {
          ...ref,
          vendorNote: "edit",
          lines: [
            {
              productId: draft.lines[0]!.productId,
              orderQty: 1,
              itemNote: null,
              included: true,
            },
          ],
        },
        at(T2),
      ),
    ).toMatchObject(refusal);
    expect(
      fillDraftDemo(state, { ...ref, mode: "replace_all" }, at(T2)),
    ).toMatchObject(refusal);
    expect(clearDraftDemo(state, ref, at(T2))).toMatchObject(refusal);
    expect(syncDraftDemo(state, ref, at(T2))).toMatchObject(refusal);
    // Nothing moved.
    expect(draftsOf(state)[0]).toBe(draft);
  });

  it("allows a new DRAFT for the same vendor, starting from current stock, not the sent quantities (VOD-005)", () => {
    const { state, draft } = sentState();
    const reopened = ok(openDraftDemo(state, draft.vendorId, at(T2)));
    expect(reopened.changed).toBe(true);
    expect(reopened.draftId).not.toBe(draft.id);
    const fresh = activeDraftsOf(reopened.state)[0]!;
    expect(fresh).toMatchObject({
      status: "draft",
      version: 1,
      vendorNote: null,
    });
    expect(fresh.lines[0]).toMatchObject({
      orderQty: null,
      itemNote: null,
      suggestedQty: 9,
    });
    // The Sent order is untouched and still the only Sent order.
    expect(draftsOf(reopened.state).filter((d) => d.status === "sent")).toEqual(
      [draft],
    );
  });
});

describe("Sent keeps its frozen labels (VOD-082)", () => {
  it("is unchanged by a later product rename, vendor rename, archive or par change", () => {
    const { state, draft } = readyDraft();
    const sent = ok(
      markSentDemo(
        state,
        { draftId: draft.id, expectedVersion: draft.version },
        at(T2),
      ),
    );
    const frozen = draftsOf(sent.state)[0]!;
    const original = copyOrderText(frozen);
    expect(original).toContain("Faust — Order Request");
    expect(original).toContain("Tito's Handmade Vodka 750 mL — 6 (weekend)");

    let next = sent.state;
    const step = (command: Parameters<typeof applyCatalogCommand>[1]) => {
      const result = applyCatalogCommand(next, command, at(T2));
      if (!result.ok) throw new Error(result.error);
      next = result.state;
    };
    const product = next.products.find(
      (p) => p.id === frozen.lines[0]!.productId,
    )!;
    const faust = next.vendors.find((v) => v.id === frozen.vendorId)!;
    step({
      type: "vendorUpdate",
      id: faust.id,
      name: "Faust Wine & Spirits",
      notes: null,
      expectedVersion: faust.version,
    });
    step({
      type: "productUpdate",
      id: product.id,
      expectedVersion: product.version,
      input: {
        vendorId: product.vendorId,
        name: "Renamed Vodka",
        categoryId: product.categoryId,
        subcategoryId: product.subcategoryId,
        size: "1 L",
        unitType: product.unitType,
        unitLabel: product.unitLabel,
        sku: "NEW-SKU",
        notes: null,
      },
    });
    const stock = next.stock.find((s) => s.productId === product.id)!;
    step({
      type: "stockSetLevels",
      productId: product.id,
      cutoff: stock.cutoff,
      warning: stock.warning,
      par: 99,
      expectedVersion: stock.version,
    });
    const renamed = next.products.find((p) => p.id === product.id)!;
    step({
      type: "productSetActive",
      id: product.id,
      active: false,
      expectedVersion: renamed.version,
    });

    // The catalog moved on...
    expect(next.products.find((p) => p.id === product.id)).toMatchObject({
      name: "Renamed Vodka",
      active: false,
    });
    // ...but the Sent order, copied or exported, reads as it was sent.
    const after = draftsOf(next)[0]!;
    expect(after).toBe(frozen);
    expect(copyOrderText(withLiveLabels(after, next))).toBe(original);
    expect(after.lines[0]).toMatchObject({
      name: "Tito's Handmade Vodka",
      parAtSnapshot: 12,
      suggestedQty: 9,
    });
  });

  it("a Draft, by contrast, follows the catalog until it is sent", () => {
    const { state, draft } = readyDraft();
    const product = state.products.find(
      (p) => p.id === draft.lines[0]!.productId,
    )!;
    const renamed = applyCatalogCommand(
      state,
      {
        type: "productUpdate",
        id: product.id,
        expectedVersion: product.version,
        input: {
          vendorId: product.vendorId,
          name: "Renamed Vodka",
          categoryId: product.categoryId,
          subcategoryId: product.subcategoryId,
          size: product.size,
          unitType: product.unitType,
          unitLabel: product.unitLabel,
          sku: product.sku,
          notes: null,
        },
      },
      at(T2),
    );
    if (!renamed.ok) throw new Error(renamed.error);
    expect(copyOrderText(withLiveLabels(draft, renamed.state))).toContain(
      "Renamed Vodka",
    );
    // Sending freezes the NEW name, once.
    const sent = ok(
      markSentDemo(
        renamed.state,
        { draftId: draft.id, expectedVersion: draft.version },
        at(T2),
      ),
    );
    expect(draftsOf(sent.state)[0]!.lines[0]!.name).toBe("Renamed Vodka");
  });
});
