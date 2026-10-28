// @vitest-environment node
import readXlsxFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";

import { sheetToCsv, workbookSheets } from "@/lib/export/document";
import { workbookToBuffer } from "@/lib/xlsx/write-node";

import { buildDemoCatalog } from "./demo-catalog";
import { prepareExport, type ExportData } from "./exports";
import {
  copyOrderText,
  hasPurchaseLines,
  orderDraftDocument,
  orderDraftExportRequestSchema,
  purchaseLines,
  vendorFileSlug,
  withLiveLabels,
} from "./order-draft-share";
import type { OrderDraftLine, OrderDraftView } from "./order-draft-view";

const TZ = "America/New_York";

const line = (over: Partial<OrderDraftLine> = {}): OrderDraftLine => ({
  productId: "p1",
  name: "Bacardi",
  size: "750ml",
  unit: "Bottle",
  sku: "BAC-750",
  suggestedQty: 8,
  totalAtSnapshot: 4,
  parAtSnapshot: 12,
  statusAtSnapshot: "critical",
  orderQty: 6,
  included: true,
  itemNote: null,
  ...over,
});

const draft = (
  lines: OrderDraftLine[],
  over: Partial<OrderDraftView> = {},
): OrderDraftView => ({
  id: "11111111-1111-4111-8111-111111111111",
  vendorId: "v1",
  vendorName: "Republic National",
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

describe("purchase lines (VOD-051): Included AND Order Qty > 0", () => {
  it("leaves out excluded, blank and zero lines, and sorts by name then size", () => {
    const lines = [
      line({ productId: "a", name: "Tito's", size: "1L", orderQty: 12 }),
      line({ productId: "b", name: "Bacardi", size: "750ml", orderQty: 6 }),
      line({ productId: "c", name: "Bacardi", size: "1L", orderQty: 2 }),
      line({ productId: "d", name: "Excluded", included: false, orderQty: 5 }),
      line({ productId: "e", name: "Blank", orderQty: null }),
      line({ productId: "f", name: "Zero", orderQty: 0 }),
    ];
    expect(purchaseLines(lines).map((l) => `${l.name} ${l.size}`)).toEqual([
      "Bacardi 1L",
      "Bacardi 750ml",
      "Tito's 1L",
    ]);
    expect(hasPurchaseLines(lines)).toBe(true);
    expect(hasPurchaseLines([line({ orderQty: 0 })])).toBe(false);
    expect(hasPurchaseLines([line({ included: false })])).toBe(false);
    expect(hasPurchaseLines([])).toBe(false);
  });
});

describe("Copy Order text (VOD-050/051/052)", () => {
  it("matches the golden vendor-facing format, without Suggested", () => {
    const text = copyOrderText(
      draft(
        [
          line({ productId: "a", name: "Tito's", size: "1L", orderQty: 12 }),
          line({
            productId: "b",
            name: "Modelo",
            size: "Case",
            orderQty: 3,
            itemNote: "Promo next week",
          }),
          line({ productId: "c", name: "Bacardi", size: "750ml", orderQty: 6 }),
          line({ productId: "d", name: "Off", included: false, orderQty: 9 }),
          line({ productId: "e", name: "Blank", orderQty: null }),
          line({ productId: "f", name: "Zero", orderQty: 0 }),
        ],
        { vendorNote: "Deliver Thursday morning." },
      ),
    );
    expect(text).toBe(
      [
        "Republic National — Order Request",
        "",
        "Bacardi 750ml — 6",
        "Modelo Case — 3 (Promo next week)",
        "Tito's 1L — 12",
        "",
        "Notes:",
        "Deliver Thursday morning.",
      ].join("\n"),
    );
    // The system's suggestion (8) is internal and never leaves the building.
    expect(text).not.toMatch(/suggest/i);
    expect(text).not.toContain("Order needed");
    expect(text).not.toContain("Blank");
    expect(text).not.toContain("Zero");
    expect(text).not.toContain("Off");
  });

  it("omits the Notes block when the vendor note is empty, keeps multi-line notes, and collapses item notes", () => {
    const none = copyOrderText(
      draft([line({ itemNote: "  line one\nline two  " })], {
        vendorNote: "   ",
      }),
    );
    expect(none).not.toContain("Notes:");
    expect(none).toContain("Bacardi 750ml — 6 (line one line two)");

    const multi = copyOrderText(
      draft([line()], { vendorNote: "Deliver Thursday.\nCall on arrival." }),
    );
    expect(multi.endsWith("Notes:\nDeliver Thursday.\nCall on arrival.")).toBe(
      true,
    );
  });

  it("formats fractional quantities like the rest of Bar Inventory, and handles an item without a size", () => {
    const text = copyOrderText(
      draft([line({ name: "Lime juice", size: null, orderQty: 2.5 })]),
    );
    expect(text).toContain("Lime juice — 2.5");
    expect(text).not.toContain("null");
  });

  it("uses live labels while DRAFT and the frozen labels once SENT", () => {
    const catalog = {
      products: [
        { id: "p1", name: "Bacardi Superior", size: "1L", sku: "NEW-SKU" },
      ],
      vendors: [{ id: "v1", name: "Republic Beverage" }],
    };
    const live = withLiveLabels(draft([line()]), catalog);
    expect(copyOrderText(live)).toContain("Republic Beverage — Order Request");
    expect(copyOrderText(live)).toContain("Bacardi Superior 1L — 6");

    const sent = draft([line()], {
      status: "sent",
      sentAt: "2026-10-27T20:00:00Z",
      sentByName: "Mia",
    });
    // Whatever the catalog says now, a Sent order keeps what it was sent as.
    expect(withLiveLabels(sent, catalog)).toBe(sent);
    expect(copyOrderText(withLiveLabels(sent, catalog))).toContain(
      "Republic National — Order Request",
    );
    expect(copyOrderText(withLiveLabels(sent, catalog))).toContain(
      "Bacardi 750ml — 6",
    );
  });
});

describe("order export document (VOD-060/061/062)", () => {
  const lines = [
    line({
      productId: "a",
      name: "Tito's",
      size: "1L",
      orderQty: 12,
      suggestedQty: 9,
      itemNote: 'weekend, "big" stock',
    }),
    line({
      productId: "b",
      name: "Bacardi",
      size: "750ml",
      orderQty: 6,
      suggestedQty: null,
      statusAtSnapshot: "low",
    }),
    line({ productId: "c", name: "Off", included: false, orderQty: 4 }),
    line({ productId: "d", name: "Blank", orderQty: null }),
    line({ productId: "e", name: "Zero", orderQty: 0 }),
  ];

  it("writes the locked CSV columns: Included, Order Qty > 0 only, Suggested number or 'Order needed'", () => {
    const { document, rowCount } = orderDraftDocument(draft(lines), {
      timeZone: TZ,
    });
    expect(rowCount).toBe(2);
    expect(document.csv.header).toEqual([
      "Vendor",
      "Item",
      "Size",
      "Unit",
      "SKU",
      "Suggested",
      "Order Qty",
      "Item Note",
    ]);
    expect(document.csv.rows).toEqual([
      [
        "Republic National",
        "Bacardi",
        "750ml",
        "Bottle",
        "BAC-750",
        "Order needed",
        6,
        null,
      ],
      [
        "Republic National",
        "Tito's",
        "1L",
        "Bottle",
        "BAC-750",
        9,
        12,
        'weekend, "big" stock',
      ],
    ]);
    const csv = sheetToCsv(document.csv);
    expect(csv).toContain('"weekend, ""big"" stock"');
    expect(csv).not.toContain("Blank");
    expect(csv).not.toContain("Zero");
    expect(csv).not.toContain("Off");
  });

  it("adds an Order sheet and a Summary sheet for XLSX, with sent facts and quantity totals", () => {
    const sent = draft(lines, {
      status: "sent",
      sentAt: "2026-10-28T01:30:00Z",
      sentByName: "Mia",
      vendorNote: "Deliver Thursday.",
    });
    const { document } = orderDraftDocument(sent, { timeZone: TZ });
    expect(document.sheets.map((s) => s.name)).toEqual(["Order", "Summary"]);
    const summary = new Map(
      document.sheets[1]!.rows.map((r) => [r[0] as string, r[1]]),
    );
    expect(summary.get("Vendor")).toBe("Republic National");
    expect(summary.get("Status")).toBe("Sent");
    expect(summary.get("Sent By")).toBe("Mia");
    // 8:30 PM the evening before, in the location's time zone (not raw UTC).
    expect(summary.get("Sent At")).toBe("Oct 27, 2026, 9:30 PM");
    expect(summary.get("Vendor Note")).toBe("Deliver Thursday.");
    // Suggested total: every numeric snapshot (9 + 8 + 8 + 8); Bacardi has none.
    expect(summary.get("Suggested Total")).toBe(33);
    expect(summary.get("Items With No Suggestion (Order Needed)")).toBe(1);
    // Planned total: Included lines with a quantity only (12 + 6).
    expect(summary.get("Planned Total")).toBe(18);
    expect(summary.get("Order Lines")).toBe(2);
  });

  it("a Draft's summary has no sent facts", () => {
    const { document } = orderDraftDocument(draft(lines), { timeZone: TZ });
    const summary = new Map(
      document.sheets[1]!.rows.map((r) => [r[0] as string, r[1]]),
    );
    expect(summary.get("Status")).toBe("Draft");
    expect(summary.get("Sent By")).toBeNull();
    expect(summary.get("Sent At")).toBeNull();
  });

  it("neutralises formula-leading text in every text cell of CSV and XLSX; numbers stay numbers (VOD-061)", async () => {
    const hostile = draft(
      [
        line({
          name: '=HYPERLINK("http://x")',
          size: "+1L",
          sku: "@SUM(A1)",
          itemNote: "-2+3",
          orderQty: 5,
        }),
        line({
          productId: "t",
          name: "\tTabbed",
          size: null,
          sku: "\rCarriage",
          itemNote: null,
          orderQty: 1,
        }),
      ],
      { vendorName: "=cmd|' /C calc'!A0", vendorNote: "@evil" },
    );
    const { document } = orderDraftDocument(hostile, { timeZone: TZ });

    const csv = sheetToCsv(document.csv);
    for (const raw of [
      "=cmd",
      "=HYPERLINK",
      "+1L",
      "@SUM",
      "-2+3",
      "\tTabbed",
      "\rCarriage",
    ]) {
      expect(csv).not.toContain(`,${raw}`);
      expect(csv).not.toContain(`\r\n${raw}`);
    }
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+1L");

    const book = workbookSheets(document.sheets);
    const flat = book.flatMap((s) => s.data.flat());
    for (const cell of flat) {
      const value = typeof cell === "object" && cell ? cell.value : cell;
      if (typeof value === "string") expect(value).not.toMatch(/^[=+\-@\t\r]/);
    }
    // The real quantities are numbers, not text (rows sort by name: tab first).
    expect(book[0]!.data.slice(1).map((row) => row[6])).toEqual([1, 5]);

    const read = await readXlsxFile(await workbookToBuffer(document.sheets));
    expect(read.map((s) => s.sheet)).toEqual(["Order", "Summary"]);
    expect(read[0]!.data.slice(1).map((row) => row[6])).toEqual([1, 5]);
    expect(String(read[0]!.data[2]![1])).toBe('\'=HYPERLINK("http://x")');
  });
});

describe("prepareExport order_draft (VOD-062/063/064)", () => {
  const state = buildDemoCatalog();
  const base = draft([line({ productId: state.products[0]!.id })]);
  const data = (orderDraft: OrderDraftView | null): ExportData => ({
    catalog: state,
    entries: [],
    orderDraft,
  });
  const ctx = {
    timeZone: TZ,
    now: new Date("2026-10-27T16:00:00Z"),
    slug: "the-monks",
  };

  it("builds from the draft the server loaded and names the file after vendor and date", () => {
    const out = prepareExport(
      { kind: "order_draft", draftId: base.id },
      data(base),
      ctx,
      "csv",
    );
    expect(out.rowCount).toBe(1);
    expect(out.filename).toBe(
      "bar-inventory_the-monks_order-republic-national_2026-10-27.csv",
    );
    expect(
      prepareExport(
        { kind: "order_draft", draftId: base.id },
        data(base),
        ctx,
        "xlsx",
      ).filename,
    ).toMatch(/\.xlsx$/);
  });

  it("refuses a draft that is not the one requested, or none at all", () => {
    expect(() =>
      prepareExport(
        {
          kind: "order_draft",
          draftId: "22222222-2222-4222-8222-222222222222",
        },
        data(base),
        ctx,
        "csv",
      ),
    ).toThrow(/not available/);
    expect(() =>
      prepareExport(
        { kind: "order_draft", draftId: base.id },
        data(null),
        ctx,
        "csv",
      ),
    ).toThrow(/not available/);
  });

  it("the request carries only a draft id: a uuid is required and client rows are stripped (VOD-063)", () => {
    const good = orderDraftExportRequestSchema.safeParse({
      kind: "order_draft",
      draftId: base.id,
      rows: [["Evil", "row"]],
      lines: [{ orderQty: 999 }],
    });
    expect(good.success).toBe(true);
    // Zod drops every key the contract does not name, so rows cannot ride along.
    expect(good.success && Object.keys(good.data).sort()).toEqual([
      "draftId",
      "kind",
    ]);
    expect(
      orderDraftExportRequestSchema.safeParse({
        kind: "order_draft",
        draftId: "not-a-uuid",
      }).success,
    ).toBe(false);
    expect(
      orderDraftExportRequestSchema.safeParse({ kind: "order_draft" }).success,
    ).toBe(false);
  });
});

describe("vendorFileSlug", () => {
  it("makes a short, safe filename fragment", () => {
    expect(vendorFileSlug("Republic National")).toBe("republic-national");
    expect(vendorFileSlug("  Café   Del Papa & Sons!! ")).toBe(
      "cafe-del-papa-sons",
    );
    expect(vendorFileSlug("../../etc/passwd")).toBe("etc-passwd");
    expect(vendorFileSlug("!!!")).toBe("vendor");
    expect(vendorFileSlug("")).toBe("vendor");
    expect(vendorFileSlug("x".repeat(100)).length).toBeLessThanOrEqual(40);
  });
});
