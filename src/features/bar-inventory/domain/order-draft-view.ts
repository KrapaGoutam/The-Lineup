import {
  normalizeItemNote,
  normalizeVendorNote,
  orderDraftTotals,
  validateOrderQuantity,
  type OrderDraftItemState,
  type OrderDraftStatus,
  type OrderDraftTotals,
} from "./order-draft";
import type { VendorView } from "./inventory-types";

/**
 * Vendor Order Drafts -- the view model the Order Drafts screen works with.
 *
 * One line is one product's row of a DRAFT. The suggestion fields are the
 * system's snapshot (read-only everywhere); `orderQty`, `itemNote` and
 * `included` are what the manager decides.
 */
export type OrderDraftLine = {
  productId: string;
  name: string;
  size: string | null;
  unit: string;
  sku: string | null;
  /** Snapshot of the system suggestion. Null = "Order needed" (no Par). */
  suggestedQty: number | null;
  totalAtSnapshot: number;
  parAtSnapshot: number | null;
  statusAtSnapshot: string;
  /** Manager-entered. Null = undecided; 0 is valid. */
  orderQty: number | null;
  included: boolean;
  itemNote: string | null;
};

export type OrderDraftView = {
  id: string;
  vendorId: string;
  vendorName: string;
  status: OrderDraftStatus;
  vendorNote: string | null;
  /** Draft-level optimistic-concurrency version. */
  version: number;
  updatedAt: string;
  updatedByName: string | null;
  lines: OrderDraftLine[];
};

/** One changed line, in the shape `inventory_order_draft_save` takes. */
export type OrderDraftSaveLine = {
  productId: string;
  orderQty: number | null;
  itemNote: string | null;
  included: boolean;
};

export type OrderDraftSavePayload = {
  vendorNote: string | null;
  lines: OrderDraftSaveLine[];
};

/** What the person has typed but not saved yet, by field. */
export type LineEdit = {
  /** The raw text of the Order Qty box (so "5." and "" survive typing). */
  orderQty?: string;
  itemNote?: string;
  included?: boolean;
};

export type DraftEdits = {
  vendorNote?: string;
  lines: Record<string, LineEdit>;
};

export const EMPTY_EDITS: DraftEdits = { lines: {} };

export type DraftErrors = {
  vendorNote?: string;
  lines: Record<string, { orderQty?: string; itemNote?: string }>;
};

/** The one place Order Qty text becomes a number (or blank). */
export function parseOrderQtyInput(
  text: string,
  itemName: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return {
      ok: false,
      error: /^-/.test(trimmed)
        ? `The order quantity for ${itemName} cannot be negative.`
        : `Enter a number for ${itemName}.`,
    };
  }
  return validateOrderQuantity(Number(trimmed), itemName);
}

export function orderQtyText(value: number | null): string {
  return value === null ? "" : String(value);
}

export const lineLabel = (line: Pick<OrderDraftLine, "name" | "size">) =>
  line.size ? `${line.name} ${line.size}` : line.name;

/**
 * Compares what the person typed with the saved draft and returns the sparse
 * save (only changed lines, so a conflict re-send is a deliberate, field-level
 * act) or the per-field errors. `payload` is null when nothing differs.
 */
export function diffDraftEdits(
  draft: OrderDraftView,
  edits: DraftEdits,
):
  | { ok: true; payload: OrderDraftSavePayload | null }
  | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = { lines: {} };
  const lines: OrderDraftSaveLine[] = [];

  let vendorNote = draft.vendorNote;
  let vendorNoteChanged = false;
  if (edits.vendorNote !== undefined) {
    const parsed = normalizeVendorNote(edits.vendorNote);
    if (parsed.ok) {
      vendorNote = parsed.value;
      vendorNoteChanged = parsed.value !== draft.vendorNote;
    } else {
      errors.vendorNote = parsed.error;
    }
  }

  for (const line of draft.lines) {
    const edit = edits.lines[line.productId];
    if (!edit) continue;
    const name = lineLabel(line);
    let orderQty = line.orderQty;
    let itemNote = line.itemNote;
    let included = line.included;
    let invalid = false;

    if (edit.orderQty !== undefined) {
      const parsed = parseOrderQtyInput(edit.orderQty, name);
      if (parsed.ok) orderQty = parsed.value;
      else {
        invalid = true;
        errors.lines[line.productId] = {
          ...errors.lines[line.productId],
          orderQty: parsed.error,
        };
      }
    }
    if (edit.itemNote !== undefined) {
      const parsed = normalizeItemNote(edit.itemNote);
      if (parsed.ok) itemNote = parsed.value;
      else {
        invalid = true;
        errors.lines[line.productId] = {
          ...errors.lines[line.productId],
          itemNote: `${name}: ${parsed.error}`,
        };
      }
    }
    if (edit.included !== undefined) included = edit.included;

    if (invalid) continue;
    if (
      orderQty !== line.orderQty ||
      itemNote !== line.itemNote ||
      included !== line.included
    ) {
      lines.push({ productId: line.productId, orderQty, itemNote, included });
    }
  }

  if (errors.vendorNote || Object.keys(errors.lines).length > 0) {
    return { ok: false, errors };
  }
  if (!vendorNoteChanged && lines.length === 0) {
    return { ok: true, payload: null };
  }
  return { ok: true, payload: { vendorNote, lines } };
}

/** True when anything typed differs from the saved draft (valid or not). */
export function hasUnsavedEdits(
  draft: OrderDraftView,
  edits: DraftEdits,
): boolean {
  const diff = diffDraftEdits(draft, edits);
  return !diff.ok || diff.payload !== null;
}

/**
 * The draft as it would be if the valid edits were saved. A box with
 * unparseable text keeps its saved value in the totals (nothing is guessed).
 */
export function effectiveItems(
  draft: OrderDraftView,
  edits: DraftEdits,
): OrderDraftItemState[] {
  return draft.lines.map((line) => {
    const edit = edits.lines[line.productId];
    let orderQty = line.orderQty;
    if (edit?.orderQty !== undefined) {
      const parsed = parseOrderQtyInput(edit.orderQty, lineLabel(line));
      if (parsed.ok) orderQty = parsed.value;
    }
    return {
      suggestedQty: line.suggestedQty,
      orderQty,
      included: edit?.included ?? line.included,
      itemNote: line.itemNote,
    };
  });
}

export const draftTotals = (
  draft: OrderDraftView,
  edits: DraftEdits = EMPTY_EDITS,
): OrderDraftTotals => orderDraftTotals(effectiveItems(draft, edits));

/**
 * Lines that name a quantity the manager typed that differs from the
 * suggestion: what "replace all" would overwrite.
 */
export function replaceableQuantityCount(draft: OrderDraftView): number {
  return draft.lines.filter(
    (line) => line.orderQty !== null && line.orderQty !== line.suggestedQty,
  ).length;
}

/** Lines "empty only" would fill: blank quantity with a numeric suggestion. */
export function fillableBlankCount(draft: OrderDraftView): number {
  return draft.lines.filter(
    (line) => line.orderQty === null && line.suggestedQty !== null,
  ).length;
}

/** An included line that needs a manual quantity: no suggestion to fill from. */
export function needsManualQuantity(line: OrderDraftLine): boolean {
  return (
    line.included &&
    line.suggestedQty === null &&
    !(line.orderQty !== null && line.orderQty > 0)
  );
}

/** Critical first (by stored status), then by name -- stable and readable. */
export function sortDraftLines(lines: readonly OrderDraftLine[]) {
  const rank = (status: string) =>
    status === "critical" ? 0 : status === "low" ? 1 : 2;
  return [...lines].sort(
    (a, b) =>
      rank(a.statusAtSnapshot) - rank(b.statusAtSnapshot) ||
      a.name.localeCompare(b.name) ||
      (a.size ?? "").localeCompare(b.size ?? ""),
  );
}

/** What the Dashboard and the Order Drafts picker need to know per vendor. */
export type VendorDraftTarget = {
  vendorId: string;
  /** The stable system "Unassigned" vendor: it can never have a draft. */
  isSystem: boolean;
  active: boolean;
  draftId: string | null;
};

export function vendorDraftTargets(
  vendors: readonly VendorView[],
  drafts: readonly OrderDraftView[],
): Map<string, VendorDraftTarget> {
  const draftByVendor = new Map(
    drafts.filter((d) => d.status === "draft").map((d) => [d.vendorId, d.id]),
  );
  return new Map(
    vendors.map((vendor) => [
      vendor.name,
      {
        vendorId: vendor.id,
        isSystem: vendor.isSystem,
        active: vendor.active,
        draftId: draftByVendor.get(vendor.id) ?? null,
      },
    ]),
  );
}

/** Vendors a new draft may be started for (never Unassigned or inactive). */
export function draftableVendors(
  vendors: readonly VendorView[],
  drafts: readonly OrderDraftView[],
): VendorView[] {
  const taken = new Set(
    drafts.filter((d) => d.status === "draft").map((d) => d.vendorId),
  );
  return vendors
    .filter((v) => !v.isSystem && v.active && !taken.has(v.id))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/** "Mar 3, 2:15 PM" in the location's time zone. */
export function formatDraftTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}
