import { describe, expect, it } from "vitest";

import {
  clearOrderDraft,
  fillOrderDraft,
  isOrderDraftEditable,
  normalizeItemNote,
  normalizeVendorNote,
  orderDraftTotals,
  validateOrderQuantity,
  type OrderDraftItemState,
  type OrderDraftState,
} from "./order-draft";

const item = (
  suggestedQty: number | null,
  orderQty: number | null,
  included = true,
  itemNote: string | null = null,
): OrderDraftItemState => ({ suggestedQty, orderQty, included, itemNote });

const draft = (
  items: OrderDraftItemState[],
  status: "draft" | "sent" = "draft",
): OrderDraftState => ({ status, vendorNote: "Deliver Thursday", items });

describe("order draft lifecycle (VOD-030, VOD-032, VOD-075)", () => {
  it("makes only DRAFT editable", () => {
    expect(isOrderDraftEditable("draft")).toBe(true);
    expect(isOrderDraftEditable("sent")).toBe(false);
  });

  it("fills only blank quantities from numeric suggestions by default", () => {
    const source = draft([
      item(6, null),
      item(8, 12),
      item(4, 0),
      item(null, null),
      item(2, null, false),
    ]);
    const filled = fillOrderDraft(source, "empty_only");
    expect(filled.items.map((line) => line.orderQty)).toEqual([
      6,
      12,
      0,
      null,
      2,
    ]);
    expect(filled.items[4].included).toBe(false);
    expect(source.items.map((line) => line.orderQty)).toEqual([
      null,
      12,
      0,
      null,
      null,
    ]);
  });

  it("replace-all deliberately replaces manual values and clears no-Par values", () => {
    const source = draft([item(8, 12, true, "keep"), item(null, 5)]);
    const filled = fillOrderDraft(source, "replace_all");
    expect(filled.items.map((line) => line.orderQty)).toEqual([8, null]);
    expect(filled.items[0]).toMatchObject({ itemNote: "keep", included: true });
    expect(filled.vendorNote).toBe("Deliver Thursday");
  });

  it("clears editable values but preserves lines and suggestion snapshots", () => {
    const source = draft([item(8, 12, false, "Weekend"), item(null, 3)]);
    const cleared = clearOrderDraft(source);
    expect(cleared.vendorNote).toBeNull();
    expect(cleared.items).toEqual([
      item(8, null, true, null),
      item(null, null, true, null),
    ]);
    expect(source.items[0]).toEqual(item(8, 12, false, "Weekend"));
  });

  it("refuses every fill or clear mutation after Sent", () => {
    const sent = draft([item(8, 12)], "sent");
    expect(() => fillOrderDraft(sent, "empty_only")).toThrow(/sent order/i);
    expect(() => clearOrderDraft(sent)).toThrow(/sent order/i);
  });
});

describe("order draft totals (VOD-020)", () => {
  it("uses integer cents for suggested and planned totals", () => {
    expect(orderDraftTotals([item(0.1, 0.1), item(0.2, 0.2)])).toMatchObject({
      suggestedTotal: 0.3,
      plannedTotal: 0.3,
    });
  });

  it("keeps no-Par, manual-required, and planned counts separate", () => {
    expect(
      orderDraftTotals([
        item(4, 4),
        item(null, null),
        item(null, 7),
        item(3, 0),
      ]),
    ).toEqual({
      suggestedTotal: 7,
      plannedTotal: 11,
      orderNeededCount: 2,
      manualQuantityRequiredCount: 2,
      includedCount: 4,
      excludedCount: 0,
    });
  });

  it("keeps excluded values and suggestions but omits them from planned totals", () => {
    expect(orderDraftTotals([item(3, 9, false), item(2, 2)])).toEqual({
      suggestedTotal: 5,
      plannedTotal: 2,
      orderNeededCount: 0,
      manualQuantityRequiredCount: 0,
      includedCount: 1,
      excludedCount: 1,
    });
  });

  it("treats blank and zero as included lines still needing a quantity", () => {
    expect(orderDraftTotals([item(2, null), item(3, 0)])).toMatchObject({
      plannedTotal: 0,
      manualQuantityRequiredCount: 2,
    });
  });

  it("supports valid totals above one line's numeric bound and an empty draft", () => {
    expect(
      orderDraftTotals([
        item(9_999_999_999.99, 9_999_999_999.99),
        item(0.01, 0.01),
      ]),
    ).toMatchObject({
      suggestedTotal: 10_000_000_000,
      plannedTotal: 10_000_000_000,
    });
    expect(orderDraftTotals([])).toEqual({
      suggestedTotal: 0,
      plannedTotal: 0,
      orderNeededCount: 0,
      manualQuantityRequiredCount: 0,
      includedCount: 0,
      excludedCount: 0,
    });
  });
});

describe("order draft input validation (VOD-013, VOD-014)", () => {
  it("accepts blank, zero, and two decimals", () => {
    expect(validateOrderQuantity(null, "Titos")).toEqual({
      ok: true,
      value: null,
    });
    expect(validateOrderQuantity(0, "Titos")).toEqual({ ok: true, value: 0 });
    expect(validateOrderQuantity(12.25, "Titos")).toEqual({
      ok: true,
      value: 12.25,
    });
  });

  it.each([-1, 1.234, 99_999_999_999, "12", Number.NaN])(
    "rejects invalid quantity %s and names the item",
    (value) => {
      const result = validateOrderQuantity(value, "Titos");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("Titos");
    },
  );

  it("trims note edges, preserves internal newlines, and maps whitespace to null", () => {
    expect(
      normalizeVendorNote("  Deliver Thursday\nNo substitutions.  "),
    ).toEqual({
      ok: true,
      value: "Deliver Thursday\nNo substitutions.",
    });
    expect(normalizeItemNote("  \n ")).toEqual({ ok: true, value: null });
  });

  it("refuses notes over their separate limits without truncating", () => {
    expect(normalizeItemNote("x".repeat(201))).toMatchObject({ ok: false });
    expect(normalizeVendorNote("x".repeat(1001))).toMatchObject({ ok: false });
    expect(normalizeItemNote("🙂".repeat(200))).toMatchObject({ ok: true });
  });
});
