import { describe, expect, it } from "vitest";

import type { VendorView } from "./inventory-types";
import {
  diffDraftEdits,
  draftableVendors,
  draftTotals,
  fillableBlankCount,
  formatDraftTime,
  hasUnsavedEdits,
  needsManualQuantity,
  parseOrderQtyInput,
  replaceableQuantityCount,
  sortDraftLines,
  vendorDraftTargets,
  type DraftEdits,
  type OrderDraftLine,
  type OrderDraftView,
} from "./order-draft-view";

const line = (over: Partial<OrderDraftLine> = {}): OrderDraftLine => ({
  productId: "p1",
  name: "Tito's",
  size: "750 mL",
  unit: "Bottle",
  sku: null,
  suggestedQty: 8,
  totalAtSnapshot: 4,
  parAtSnapshot: 12,
  statusAtSnapshot: "critical",
  orderQty: null,
  included: true,
  itemNote: null,
  ...over,
});

const draft = (
  lines: OrderDraftLine[] = [line()],
  over: Partial<OrderDraftView> = {},
): OrderDraftView => ({
  id: "d1",
  vendorId: "v1",
  vendorName: "Faust",
  status: "draft",
  vendorNote: null,
  version: 3,
  updatedAt: "2026-10-27T15:10:00Z",
  updatedByName: "Mia",
  sentAt: null,
  sentByName: null,
  lines,
  ...over,
});

const edits = (
  lines: DraftEdits["lines"],
  vendorNote?: string,
): DraftEdits => ({
  lines,
  vendorNote,
});

describe("parseOrderQtyInput (AC-FIELD-4)", () => {
  it("treats blank as undecided and 0 as a real quantity", () => {
    expect(parseOrderQtyInput("", "X")).toEqual({ ok: true, value: null });
    expect(parseOrderQtyInput("   ", "X")).toEqual({ ok: true, value: null });
    expect(parseOrderQtyInput("0", "X")).toEqual({ ok: true, value: 0 });
    expect(parseOrderQtyInput("12.5", "X")).toEqual({ ok: true, value: 12.5 });
    expect(parseOrderQtyInput(" 7 ", "X")).toEqual({ ok: true, value: 7 });
  });

  it("rejects clearly, naming the item", () => {
    for (const bad of ["abc", "5.", ".5", "1e3", "1,000", "--2"]) {
      const result = parseOrderQtyInput(bad, "Tito's");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("Tito's");
    }
    const negative = parseOrderQtyInput("-3", "Tito's");
    expect(negative).toMatchObject({ ok: false });
    if (!negative.ok) expect(negative.error).toMatch(/negative/);
    const long = parseOrderQtyInput("1.234", "Tito's");
    expect(long.ok).toBe(false);
  });
});

describe("diffDraftEdits sends only what changed", () => {
  it("is a no-op with no edits", () => {
    expect(diffDraftEdits(draft(), { lines: {} })).toEqual({
      ok: true,
      payload: null,
    });
  });

  it("quantity-only: blank → 5 (the VOD-1.1 user flow)", () => {
    const result = diffDraftEdits(draft(), edits({ p1: { orderQty: "5" } }));
    expect(result).toEqual({
      ok: true,
      payload: {
        vendorNote: null,
        lines: [
          { productId: "p1", orderQty: 5, itemNote: null, included: true },
        ],
      },
    });
  });

  it("quantity-only: blank → 0 is a change, and 0 is kept as 0", () => {
    const result = diffDraftEdits(draft(), edits({ p1: { orderQty: "0" } }));
    expect(result).toMatchObject({
      ok: true,
      payload: { lines: [{ productId: "p1", orderQty: 0 }] },
    });
  });

  it("quantity-only: 5 → blank clears to null", () => {
    const result = diffDraftEdits(
      draft([line({ orderQty: 5 })]),
      edits({ p1: { orderQty: "" } }),
    );
    expect(result).toMatchObject({
      ok: true,
      payload: { lines: [{ productId: "p1", orderQty: null }] },
    });
  });

  it("same value is not a meaningful change (5 → 5, 5 → 5.0, blank → blank)", () => {
    const saved = draft([line({ orderQty: 5 })]);
    for (const typed of ["5", "5.0", " 5 ", "5.00"]) {
      expect(diffDraftEdits(saved, edits({ p1: { orderQty: typed } }))).toEqual(
        { ok: true, payload: null },
      );
    }
    expect(diffDraftEdits(draft(), edits({ p1: { orderQty: "" } }))).toEqual({
      ok: true,
      payload: null,
    });
  });

  it("includes only the changed lines and keeps the untouched fields", () => {
    const two = draft([
      line({ productId: "a", name: "A", orderQty: 2, itemNote: "keep" }),
      line({ productId: "b", name: "B" }),
    ]);
    const result = diffDraftEdits(
      two,
      edits({ a: { orderQty: "2" }, b: { included: false } }),
    );
    expect(result).toEqual({
      ok: true,
      payload: {
        vendorNote: null,
        lines: [
          { productId: "b", orderQty: null, itemNote: null, included: false },
        ],
      },
    });
  });

  it("preserves meaningful internal newlines and trims the edges", () => {
    const result = diffDraftEdits(
      draft(),
      edits(
        { p1: { itemNote: "  line one\nline two  " } },
        "  call first\n\nthen text ",
      ),
    );
    expect(result).toMatchObject({
      ok: true,
      payload: {
        vendorNote: "call first\n\nthen text",
        lines: [{ itemNote: "line one\nline two" }],
      },
    });
  });

  it("treats whitespace-only notes as blank (and as no change when already blank)", () => {
    expect(
      diffDraftEdits(draft(), edits({ p1: { itemNote: "   \n " } }, "  ")),
    ).toEqual({ ok: true, payload: null });
  });

  it("changing only the vendor note is a change with no lines", () => {
    expect(diffDraftEdits(draft(), edits({}, "Deliver Thursday"))).toEqual({
      ok: true,
      payload: { vendorNote: "Deliver Thursday", lines: [] },
    });
  });

  it("reports invalid fields and sends nothing", () => {
    const tooLong = "x".repeat(201);
    const result = diffDraftEdits(
      draft(),
      edits({ p1: { orderQty: "abc", itemNote: tooLong } }, "y".repeat(1001)),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.lines.p1?.orderQty).toMatch(/Tito's 750 mL/);
      expect(result.errors.lines.p1?.itemNote).toMatch(/200 characters/);
      expect(result.errors.vendorNote).toMatch(/1000 characters/);
    }
  });

  it("an unsaved-but-invalid box counts as unsaved", () => {
    expect(hasUnsavedEdits(draft(), edits({ p1: { orderQty: "abc" } }))).toBe(
      true,
    );
    expect(hasUnsavedEdits(draft(), { lines: {} })).toBe(false);
  });
});

describe("totals follow the edits without inventing quantities", () => {
  it("uses typed quantities and Include switches; ignores unparseable text", () => {
    const d = draft([
      line({ productId: "a", name: "A", suggestedQty: 8 }),
      line({ productId: "b", name: "B", suggestedQty: null }),
      line({ productId: "c", name: "C", suggestedQty: 2, orderQty: 4 }),
    ]);
    expect(draftTotals(d)).toMatchObject({
      suggestedTotal: 10,
      plannedTotal: 4,
      orderNeededCount: 1,
      manualQuantityRequiredCount: 2,
    });
    expect(
      draftTotals(
        d,
        edits({
          a: { orderQty: "6" },
          b: { orderQty: "abc" },
          c: { included: false },
        }),
      ),
    ).toMatchObject({
      plannedTotal: 6,
      manualQuantityRequiredCount: 1,
      excludedCount: 1,
    });
  });

  it("is cents-exact (0.1 + 0.2)", () => {
    const d = draft([
      line({ productId: "a", name: "A", orderQty: 0.1 }),
      line({ productId: "b", name: "B", orderQty: 0.2 }),
    ]);
    expect(draftTotals(d).plannedTotal).toBe(0.3);
  });
});

describe("fill helpers", () => {
  const d = draft([
    line({ productId: "a", name: "A", suggestedQty: 8, orderQty: null }),
    line({ productId: "b", name: "B", suggestedQty: 8, orderQty: 8 }),
    line({ productId: "c", name: "C", suggestedQty: 8, orderQty: 3 }),
    line({ productId: "d", name: "D", suggestedQty: null, orderQty: 5 }),
    line({ productId: "e", name: "E", suggestedQty: null, orderQty: null }),
  ]);
  it("counts what empty-only fills and what replace-all would overwrite", () => {
    expect(fillableBlankCount(d)).toBe(1);
    // C (3 ≠ 8) and D (5, no suggestion → would become blank) are replaced.
    expect(replaceableQuantityCount(d)).toBe(2);
  });
  it("flags included lines with no suggestion and no quantity", () => {
    expect(needsManualQuantity(d.lines[4]!)).toBe(true);
    expect(needsManualQuantity(d.lines[3]!)).toBe(false);
    expect(needsManualQuantity({ ...d.lines[4]!, included: false })).toBe(
      false,
    );
    expect(needsManualQuantity({ ...d.lines[4]!, orderQty: 0 })).toBe(true);
    expect(needsManualQuantity(d.lines[0]!)).toBe(false);
  });
});

describe("ordering and vendor eligibility", () => {
  it("sorts Critical, then Low, then by name", () => {
    const sorted = sortDraftLines([
      line({ productId: "1", name: "Zed", statusAtSnapshot: "low" }),
      line({ productId: "2", name: "Bee", statusAtSnapshot: "critical" }),
      line({ productId: "3", name: "Ant", statusAtSnapshot: "low" }),
    ]);
    expect(sorted.map((l) => l.name)).toEqual(["Bee", "Ant", "Zed"]);
  });

  const vendor = (over: Partial<VendorView>): VendorView => ({
    id: "v1",
    name: "Faust",
    isSystem: false,
    active: true,
    notes: null,
    version: 1,
    updatedAt: "2026-10-27T00:00:00Z",
    updatedByName: null,
    ...over,
  });
  const vendors = [
    vendor({ id: "u", name: "Unassigned", isSystem: true }),
    vendor({ id: "v1", name: "Faust" }),
    vendor({ id: "v2", name: "Del Papa" }),
    vendor({ id: "v3", name: "Retired", active: false }),
  ];

  it("never offers the system vendor, an inactive vendor, or one with a draft", () => {
    expect(draftableVendors(vendors, []).map((v) => v.name)).toEqual([
      "Del Papa",
      "Faust",
    ]);
    expect(draftableVendors(vendors, [draft()]).map((v) => v.name)).toEqual([
      "Del Papa",
    ]);
  });

  it("maps vendor names to their stable ids, flags and active draft", () => {
    const targets = vendorDraftTargets(vendors, [draft()]);
    expect(targets.get("Unassigned")).toMatchObject({
      isSystem: true,
      draftId: null,
    });
    expect(targets.get("Faust")).toMatchObject({
      vendorId: "v1",
      draftId: "d1",
    });
    expect(targets.get("Del Papa")?.draftId).toBeNull();
    expect(targets.get("Retired")?.active).toBe(false);
  });
});

describe("formatDraftTime", () => {
  it("renders in the location's time zone and tolerates bad input", () => {
    expect(formatDraftTime("2026-10-27T15:10:00Z", "America/New_York")).toMatch(
      /11:10/,
    );
    expect(formatDraftTime("nope", "America/New_York")).toBe("");
  });
});
