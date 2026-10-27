import type { CatalogContext } from "./catalog-engine";
import type { CatalogConflict, CatalogState } from "./inventory-types";
import { buildInventoryRows, type InventoryRow } from "./inventory-rows";
import {
  clearOrderDraft,
  fillOrderDraft,
  normalizeItemNote,
  normalizeVendorNote,
  validateOrderQuantity,
  type OrderDraftFillMode,
} from "./order-draft";
import { hasPurchaseLines } from "./order-draft-share";
import type {
  OrderDraftLine,
  OrderDraftSavePayload,
  OrderDraftView,
} from "./order-draft-view";

/**
 * Pure, in-memory twin of the six `inventory_order_draft_*` RPCs (migrations
 * 20261027195142 and 20261027210000). It powers demo mode with the same rules,
 * wording, no-op behaviour and `PT409` conflict shape, so the screen behaves
 * identically with or without a database. In real mode the database is the
 * authority and this engine is never consulted.
 */

export type DraftEngineResult =
  | {
      ok: true;
      state: CatalogState;
      draftId: string;
      changed: boolean;
      /** Mark Sent only: who sent the order and when. */
      sent?: { sentByName: string | null; sentAt: string | null };
    }
  | { ok: false; error: string; conflict?: CatalogConflict };

const fail = (error: string, conflict?: CatalogConflict) =>
  ({ ok: false, error, conflict }) as const;

/** Every order draft in the demo state, active and sent. */
export const draftsOf = (state: CatalogState): OrderDraftView[] =>
  state.orderDrafts ?? [];

/** The ACTIVE (still editable) drafts: what the Order Drafts editor lists. */
export const activeDraftsOf = (state: CatalogState): OrderDraftView[] =>
  draftsOf(state).filter((d) => d.status === "draft");

function lineFromRow(row: InventoryRow): OrderDraftLine {
  return {
    productId: row.productId,
    name: row.name,
    size: row.size,
    unit: row.unit,
    sku: row.sku,
    suggestedQty: row.suggestedOrder,
    totalAtSnapshot: row.total,
    parAtSnapshot: row.par,
    statusAtSnapshot: row.status,
    orderQty: null,
    included: true,
    itemNote: null,
  };
}

/** The vendor's active Critical/Low items: the set Order soon shows. */
function neededRows(state: CatalogState, vendorId: string): InventoryRow[] {
  const mine = new Set(
    state.products
      .filter((p) => p.active && p.vendorId === vendorId)
      .map((p) => p.id),
  );
  return buildInventoryRows(state).filter(
    (row) =>
      mine.has(row.productId) &&
      (row.status === "critical" || row.status === "low"),
  );
}

function replaceDraft(state: CatalogState, next: OrderDraftView): CatalogState {
  return {
    ...state,
    orderDrafts: draftsOf(state).map((d) => (d.id === next.id ? next : d)),
  };
}

function stale(draft: OrderDraftView): ReturnType<typeof fail> {
  return fail(
    "Someone else changed this order draft. Review the latest and try again.",
    {
      kind: "stale",
      entity: "order_draft",
      id: draft.id,
      currentVersion: draft.version,
      updatedBy: draft.updatedByName,
      updatedAt: draft.updatedAt,
    },
  );
}

function touch(
  draft: OrderDraftView,
  ctx: CatalogContext,
  patch: Partial<OrderDraftView>,
): OrderDraftView {
  return {
    ...draft,
    ...patch,
    version: draft.version + 1,
    updatedAt: ctx.now.toISOString(),
    updatedByName: ctx.actorName,
  };
}

function find(state: CatalogState, draftId: string) {
  return draftsOf(state).find((d) => d.id === draftId) ?? null;
}

const MISSING = "That order draft is not available.";
const SENT_READ_ONLY = "A sent order cannot be changed.";

/** `inventory_order_draft_open`: reuse the active draft or create and seed it. */
export function openDraftDemo(
  state: CatalogState,
  vendorId: string,
  ctx: CatalogContext,
): DraftEngineResult {
  const existing = draftsOf(state).find(
    (d) => d.vendorId === vendorId && d.status === "draft",
  );
  if (existing) {
    return { ok: true, state, draftId: existing.id, changed: false };
  }
  const vendor = state.vendors.find((v) => v.id === vendorId);
  if (!vendor)
    return fail("That vendor is not available for this organization.");
  if (vendor.isSystem) return fail("Assign a vendor before drafting an order.");
  if (!vendor.active) {
    return fail(
      "That vendor is inactive. Reactivate it before drafting a new order.",
    );
  }
  const draft: OrderDraftView = {
    id: ctx.newId(),
    vendorId: vendor.id,
    vendorName: vendor.name,
    status: "draft",
    vendorNote: null,
    version: 1,
    updatedAt: ctx.now.toISOString(),
    updatedByName: ctx.actorName,
    sentAt: null,
    sentByName: null,
    lines: neededRows(state, vendor.id).map(lineFromRow),
  };
  return {
    ok: true,
    state: { ...state, orderDrafts: [...draftsOf(state), draft] },
    draftId: draft.id,
    changed: true,
  };
}

/** `inventory_order_draft_save` (as corrected by VOD-1.1). */
export function saveDraftDemo(
  state: CatalogState,
  input: { draftId: string; expectedVersion: number } & OrderDraftSavePayload,
  ctx: CatalogContext,
): DraftEngineResult {
  const draft = find(state, input.draftId);
  if (!draft) return fail(MISSING);
  if (draft.status === "sent") return fail(SENT_READ_ONLY);

  const note = normalizeVendorNote(input.vendorNote);
  if (!note.ok) return fail(note.error);
  const seen = new Set<string>();
  const next = new Map(draft.lines.map((l) => [l.productId, l]));
  let changed = note.value !== draft.vendorNote;

  for (const line of input.lines) {
    if (seen.has(line.productId)) {
      return fail("Each item may appear only once in a save.");
    }
    seen.add(line.productId);
    const current = next.get(line.productId);
    if (!current) return fail("Choose an active item from this draft vendor.");
    const qty = validateOrderQuantity(line.orderQty, current.name);
    if (!qty.ok) return fail(qty.error);
    const itemNote = normalizeItemNote(line.itemNote);
    if (!itemNote.ok) return fail(itemNote.error);
    if (
      current.orderQty !== qty.value ||
      current.itemNote !== itemNote.value ||
      current.included !== line.included
    ) {
      changed = true;
      next.set(line.productId, {
        ...current,
        orderQty: qty.value,
        itemNote: itemNote.value,
        included: line.included,
      });
    }
  }

  if (!changed) {
    return { ok: true, state, draftId: draft.id, changed: false };
  }
  if (input.expectedVersion !== draft.version) return stale(draft);
  const updated = touch(draft, ctx, {
    vendorNote: note.value,
    lines: draft.lines.map((l) => next.get(l.productId) ?? l),
  });
  return {
    ok: true,
    state: replaceDraft(state, updated),
    draftId: draft.id,
    changed: true,
  };
}

/** `inventory_order_draft_fill`: from the stored suggestion snapshots only. */
export function fillDraftDemo(
  state: CatalogState,
  input: { draftId: string; expectedVersion: number; mode: OrderDraftFillMode },
  ctx: CatalogContext,
): DraftEngineResult {
  const draft = find(state, input.draftId);
  if (!draft) return fail(MISSING);
  if (draft.status === "sent") return fail(SENT_READ_ONLY);
  const filled = fillOrderDraft(
    {
      status: draft.status,
      vendorNote: draft.vendorNote,
      items: draft.lines,
    },
    input.mode,
  );
  const lines = draft.lines.map((line, i) => ({
    ...line,
    orderQty: filled.items[i]!.orderQty,
  }));
  if (lines.every((line, i) => line.orderQty === draft.lines[i]!.orderQty)) {
    return { ok: true, state, draftId: draft.id, changed: false };
  }
  if (input.expectedVersion !== draft.version) return stale(draft);
  return {
    ok: true,
    state: replaceDraft(state, touch(draft, ctx, { lines })),
    draftId: draft.id,
    changed: true,
  };
}

/** `inventory_order_draft_clear`: draft-planning state only. */
export function clearDraftDemo(
  state: CatalogState,
  input: { draftId: string; expectedVersion: number },
  ctx: CatalogContext,
): DraftEngineResult {
  const draft = find(state, input.draftId);
  if (!draft) return fail(MISSING);
  if (draft.status === "sent") return fail(SENT_READ_ONLY);
  const cleared = clearOrderDraft({
    status: draft.status,
    vendorNote: draft.vendorNote,
    items: draft.lines,
  });
  const lines = draft.lines.map((line, i) => ({
    ...line,
    orderQty: null,
    itemNote: null,
    included: cleared.items[i]!.included,
  }));
  const changed =
    draft.vendorNote !== null ||
    draft.lines.some(
      (l) => l.orderQty !== null || l.itemNote !== null || !l.included,
    );
  if (!changed) return { ok: true, state, draftId: draft.id, changed: false };
  if (input.expectedVersion !== draft.version) return stale(draft);
  return {
    ok: true,
    state: replaceDraft(state, touch(draft, ctx, { vendorNote: null, lines })),
    draftId: draft.id,
    changed: true,
  };
}

/**
 * `inventory_order_draft_sync` ("Update suggestions"): re-stamps the snapshots
 * and appends newly Critical/Low items; never touches Order Qty, notes or
 * Included.
 */
export function syncDraftDemo(
  state: CatalogState,
  input: { draftId: string; expectedVersion: number },
  ctx: CatalogContext,
): DraftEngineResult {
  const draft = find(state, input.draftId);
  if (!draft) return fail(MISSING);
  if (draft.status === "sent") return fail(SENT_READ_ONLY);
  const rows = new Map(buildInventoryRows(state).map((r) => [r.productId, r]));
  const lines = draft.lines.map((line) => {
    const row = rows.get(line.productId);
    if (!row) return line;
    return {
      ...line,
      suggestedQty: row.suggestedOrder,
      totalAtSnapshot: row.total,
      parAtSnapshot: row.par,
      statusAtSnapshot: row.status,
    };
  });
  const have = new Set(draft.lines.map((l) => l.productId));
  const added = neededRows(state, draft.vendorId)
    .filter((row) => !have.has(row.productId))
    .map(lineFromRow);
  const all = [...lines, ...added];
  const changed =
    added.length > 0 ||
    lines.some(
      (l, i) =>
        l.suggestedQty !== draft.lines[i]!.suggestedQty ||
        l.totalAtSnapshot !== draft.lines[i]!.totalAtSnapshot ||
        l.parAtSnapshot !== draft.lines[i]!.parAtSnapshot ||
        l.statusAtSnapshot !== draft.lines[i]!.statusAtSnapshot,
    );
  if (!changed) return { ok: true, state, draftId: draft.id, changed: false };
  if (input.expectedVersion !== draft.version) return stale(draft);
  return {
    ok: true,
    state: replaceDraft(state, touch(draft, ctx, { lines: all })),
    draftId: draft.id,
    changed: true,
  };
}

/**
 * `inventory_order_draft_mark_sent`: record that the manager sent or shared the
 * order outside the app. It freezes the labels, sets the sent facts, bumps the
 * version and makes the order read-only. It never touches stock or the ledger
 * (this function only ever writes `orderDrafts`). A retry on an already-Sent
 * order changes nothing and returns the first send's facts.
 */
export function markSentDemo(
  state: CatalogState,
  input: { draftId: string; expectedVersion: number },
  ctx: CatalogContext,
): DraftEngineResult {
  const draft = find(state, input.draftId);
  if (!draft) return fail(MISSING);
  if (draft.status === "sent") {
    return {
      ok: true,
      state,
      draftId: draft.id,
      changed: false,
      sent: { sentByName: draft.sentByName, sentAt: draft.sentAt },
    };
  }
  if (input.expectedVersion !== draft.version) return stale(draft);
  if (!hasPurchaseLines(draft.lines)) {
    return fail("Add a quantity before marking this order sent.");
  }

  // Freeze today's catalog labels, once, before the order becomes read-only.
  const rows = new Map(buildInventoryRows(state).map((r) => [r.productId, r]));
  const vendor = state.vendors.find((v) => v.id === draft.vendorId);
  const lines = draft.lines.map((line) => {
    const row = rows.get(line.productId);
    return row
      ? {
          ...line,
          name: row.name,
          size: row.size,
          unit: row.unit,
          sku: row.sku,
        }
      : line;
  });
  const sentAt = ctx.now.toISOString();
  const sent = touch(draft, ctx, {
    status: "sent",
    vendorName: vendor?.name ?? draft.vendorName,
    sentAt,
    sentByName: ctx.actorName,
    lines,
  });
  return {
    ok: true,
    state: replaceDraft(state, sent),
    draftId: draft.id,
    changed: true,
    sent: { sentByName: ctx.actorName, sentAt },
  };
}
