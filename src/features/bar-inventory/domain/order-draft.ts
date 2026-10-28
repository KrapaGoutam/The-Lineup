import { fromCents, toCents } from "./stock-rules";

export const ORDER_DRAFT_STATUSES = ["draft", "sent"] as const;
export type OrderDraftStatus = (typeof ORDER_DRAFT_STATUSES)[number];

export const ORDER_DRAFT_FILL_MODES = ["empty_only", "replace_all"] as const;
export type OrderDraftFillMode = (typeof ORDER_DRAFT_FILL_MODES)[number];

/** The computational subset shared by demo mode and the later editor. */
export type OrderDraftItemState = {
  suggestedQty: number | null;
  orderQty: number | null;
  included: boolean;
  itemNote: string | null;
};

export type OrderDraftState = {
  status: OrderDraftStatus;
  vendorNote: string | null;
  items: OrderDraftItemState[];
};

export type OrderDraftTotals = {
  suggestedTotal: number;
  plannedTotal: number;
  orderNeededCount: number;
  manualQuantityRequiredCount: number;
  includedCount: number;
  excludedCount: number;
};

export type DraftValidation<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function isOrderDraftEditable(status: OrderDraftStatus): boolean {
  return status === "draft";
}

export function validateOrderQuantity(
  value: unknown,
  itemName: string,
): DraftValidation<number | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: `Enter a number for ${itemName}.` };
  }
  if (value < 0) {
    return {
      ok: false,
      error: `The order quantity for ${itemName} cannot be negative.`,
    };
  }
  try {
    return { ok: true, value: fromCents(toCents(value)) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Enter a number.";
    return {
      ok: false,
      error: `The order quantity for ${itemName} is invalid. ${detail}`,
    };
  }
}

function normalizeNote(
  value: unknown,
  label: string,
  maximum: number,
): DraftValidation<string | null> {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: `The ${label} must be plain text.` };
  }
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (Array.from(trimmed).length > maximum) {
    return {
      ok: false,
      error: `The ${label} can be at most ${maximum} characters.`,
    };
  }
  return { ok: true, value: trimmed };
}

export const normalizeItemNote = (
  value: unknown,
): DraftValidation<string | null> => normalizeNote(value, "item note", 200);

export const normalizeVendorNote = (
  value: unknown,
): DraftValidation<string | null> => normalizeNote(value, "vendor note", 1000);

export function orderDraftTotals(
  items: readonly OrderDraftItemState[],
): OrderDraftTotals {
  let suggestedCents = 0;
  let plannedCents = 0;
  let orderNeededCount = 0;
  let manualQuantityRequiredCount = 0;
  let includedCount = 0;

  for (const item of items) {
    if (item.suggestedQty === null) orderNeededCount += 1;
    else suggestedCents += toCents(item.suggestedQty);

    if (!item.included) continue;
    includedCount += 1;
    if (item.orderQty === null || item.orderQty === 0) {
      manualQuantityRequiredCount += 1;
    } else if (item.orderQty > 0) {
      plannedCents += toCents(item.orderQty);
    }
  }

  return {
    suggestedTotal: fromCents(suggestedCents),
    plannedTotal: fromCents(plannedCents),
    orderNeededCount,
    manualQuantityRequiredCount,
    includedCount,
    excludedCount: items.length - includedCount,
  };
}

function assertEditable(draft: OrderDraftState): void {
  if (!isOrderDraftEditable(draft.status)) {
    throw new Error("A sent order cannot be changed.");
  }
}

export function fillOrderDraft(
  draft: OrderDraftState,
  mode: OrderDraftFillMode,
): OrderDraftState {
  assertEditable(draft);
  return {
    ...draft,
    items: draft.items.map((item) => ({
      ...item,
      orderQty:
        mode === "replace_all" || item.orderQty === null
          ? item.suggestedQty
          : item.orderQty,
    })),
  };
}

export function clearOrderDraft(draft: OrderDraftState): OrderDraftState {
  assertEditable(draft);
  return {
    ...draft,
    vendorNote: null,
    items: draft.items.map((item) => ({
      ...item,
      orderQty: null,
      itemNote: null,
      included: true,
    })),
  };
}
