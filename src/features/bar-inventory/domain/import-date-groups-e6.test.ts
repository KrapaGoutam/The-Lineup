import { describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/csv/read";
import { sheetToCsv } from "@/lib/export/document";

import { buildDemoCatalog } from "./demo-catalog";
import { prepareExport, type ExportData } from "./exports";
import type { DateLot } from "./freshness";
import {
  buildDateGroupImportPlan,
  fingerprintDateGroupPlan,
  mapDateGroupHeaders,
  type DateGroupPlan,
} from "./import-date-groups";

function catalogWithLots() {
  const demo = buildDemoCatalog();
  const [a, b, c] = demo.products.filter((p) => p.active);
  const lot = (over: Partial<DateLot> & { id: string; productId: string }) =>
    ({
      quantity: null,
      manufacture: null,
      expiration: null,
      notes: null,
      active: true,
      version: 1,
      updatedAt: "2026-10-01T00:00:00Z",
      updatedByName: null,
      ...over,
    }) satisfies DateLot;
  const dateLots: DateLot[] = [
    // day precision both ends, quantity, a note with a comma, quotes and a newline
    lot({
      id: "11111111-1111-4111-8111-111111111111",
      productId: a.id,
      quantity: 2.25,
      manufacture: { date: "2026-01-15", precision: "day" },
      expiration: { date: "2026-09-30", precision: "day" },
      notes: 'Case, "A"\nsecond line',
    }),
    // month precision both ends, no quantity (null) and no note
    lot({
      id: "22222222-2222-4222-8222-222222222222",
      productId: b.id,
      manufacture: { date: "2026-02-01", precision: "month" },
      expiration: { date: "2026-08-31", precision: "month" },
      version: 4,
    }),
    // expiration only, zero quantity (explicit zero is not blank)
    lot({
      id: "33333333-3333-4333-8333-333333333333",
      productId: c.id,
      quantity: 0,
      expiration: { date: "2027-03-31", precision: "month" },
    }),
    // ARCHIVED: never exported, never silently revived
    lot({
      id: "44444444-4444-4444-8444-444444444444",
      productId: a.id,
      quantity: 1,
      manufacture: { date: "2025-01-01", precision: "day" },
      active: false,
      version: 7,
    }),
  ];
  return { demo: { ...demo, dateLots }, dateLots };
}

function exportedCsv() {
  const { demo, dateLots } = catalogWithLots();
  const data: ExportData = {
    catalog: {
      vendors: demo.vendors,
      categories: demo.categories,
      subcategories: demo.subcategories,
      products: demo.products,
      stock: demo.stock,
      dateLots,
      freshnessRules: demo.freshnessRules ?? [],
    },
    entries: [],
  };
  const prepared = prepareExport(
    { kind: "date_groups", filters: "" },
    data,
    {
      timeZone: "America/Chicago",
      now: new Date("2026-11-09T15:00:00Z"),
      slug: "demo",
    },
    "csv",
  );
  return { csv: sheetToCsv(prepared.document.csv), demo, dateLots };
}

function planFromCsv(
  csv: string,
  catalog = catalogWithLots().demo,
): DateGroupPlan {
  const parsed = parseCsv(csv);
  if (!parsed.ok) throw new Error(parsed.error);
  const header = mapDateGroupHeaders(parsed.header.cells);
  expect(header.missing).toEqual([]);
  return buildDateGroupImportPlan(parsed.rows, header, catalog);
}

describe("Date Group export -> import round trip (real exporter, no header rewriting)", () => {
  it("an exported file re-imports as ALL unchanged, with its headers mapped as exported", () => {
    const { csv, demo } = exportedCsv();
    const plan = planFromCsv(csv, demo);
    // 3 active groups were exported; the archived one is not in the file.
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows.map((r) => r.action)).toEqual([
      "unchanged",
      "unchanged",
      "unchanged",
    ]);
    expect(plan.summary).toMatchObject({ create: 0, update: 0, error: 0 });
    expect(plan.canCommit).toBe(false);
  });

  it("keeps date precision and never invents dates from the status columns", () => {
    const { csv, demo } = exportedCsv();
    const plan = planFromCsv(csv, demo);
    const byId = new Map(plan.rows.map((r) => [r.dateGroupId, r]));
    const day = byId.get("11111111-1111-4111-8111-111111111111")!;
    expect(day.manufacture).toEqual({ date: "2026-01-15", precision: "day" });
    expect(day.expiration).toEqual({ date: "2026-09-30", precision: "day" });
    expect(day.notes).toBe('Case, "A"\nsecond line');
    expect(day.quantity).toBe(2.25);
    const month = byId.get("22222222-2222-4222-8222-222222222222")!;
    expect(month.manufacture).toEqual({
      date: "2026-02-01",
      precision: "month",
    });
    expect(month.expiration).toEqual({
      date: "2026-08-31",
      precision: "month",
    });
    expect(month.quantity).toBeNull();
    const zero = byId.get("33333333-3333-4333-8333-333333333333")!;
    expect(zero.quantity).toBe(0);
    expect(zero.manufacture).toBeNull();
  });

  it("editing ONE exported cell plans exactly one update against the version it saw", () => {
    const { csv, demo } = exportedCsv();
    const parsed = parseCsv(csv);
    if (!parsed.ok) throw new Error(parsed.error);
    const header = mapDateGroupHeaders(parsed.header.cells);
    // Change the month-precision lot's quantity (null -> 6) in the exported rows.
    const qtyCol = Number(
      Object.entries(header.byColumnIndex).find(
        ([, f]) => f === "datedQuantity",
      )![0],
    );
    const idCol = Number(
      Object.entries(header.byColumnIndex).find(
        ([, f]) => f === "dateGroupId",
      )![0],
    );
    const edited = parsed.rows.map((r) =>
      r.cells[idCol] === "22222222-2222-4222-8222-222222222222"
        ? { ...r, cells: r.cells.map((c, i) => (i === qtyCol ? "1 1/2" : c)) }
        : r,
    );
    const plan = buildDateGroupImportPlan(edited, header, demo);
    expect(plan.summary).toMatchObject({ update: 1, unchanged: 2, error: 0 });
    const update = plan.rows.find((r) => r.action === "update")!;
    expect(update.quantity).toBe(1.5);
    expect(update.expectedVersion).toBe(4);
    // Precision survived the round trip.
    expect(update.manufacture?.precision).toBe("month");
    expect(update.expiration?.precision).toBe("month");
  });
});

describe("Date Group plan safety rules", () => {
  const header = mapDateGroupHeaders([
    "Vendor",
    "Name",
    "Date group ID",
    "Dated quantity",
    "Manufactured",
    "Expires",
    "Notes",
  ]);
  const row = (n: number, cells: string[]) => ({ rowNumber: n, cells });

  it("never reactivates an ARCHIVED date group", () => {
    const { demo } = catalogWithLots();
    const product = demo.products.find(
      (p) => p.id === demo.dateLots![3].productId,
    )!;
    const vendor = demo.vendors.find((v) => v.id === product.vendorId)!;
    const plan = buildDateGroupImportPlan(
      [
        row(2, [
          vendor.name,
          product.name,
          "44444444-4444-4444-8444-444444444444",
          "9",
          "01/01/25",
          "",
          "",
        ]),
      ],
      header,
      demo,
    );
    expect(plan.rows[0].action).toBe("error");
    expect(plan.rows[0].reason).toMatch(/archived/i);
    expect(plan.canCommit).toBe(false);
  });

  it("flags the same Date group ID twice in one file instead of double-writing it", () => {
    const { demo } = catalogWithLots();
    const product = demo.products.find(
      (p) => p.id === demo.dateLots![0].productId,
    )!;
    const vendor = demo.vendors.find((v) => v.id === product.vendorId)!;
    const id = "11111111-1111-4111-8111-111111111111";
    const plan = buildDateGroupImportPlan(
      [
        row(2, [
          vendor.name,
          product.name,
          id,
          "3",
          "01/15/26",
          "09/30/26",
          "",
        ]),
        row(3, [
          vendor.name,
          product.name,
          id,
          "4",
          "01/15/26",
          "09/30/26",
          "",
        ]),
      ],
      header,
      demo,
    );
    expect(plan.rows[0].action).toBe("update");
    expect(plan.rows[1].action).toBe("error");
    expect(plan.rows[1].reason).toMatch(/more than once/i);
  });

  it("rejects an id of a group that is not in THIS branch (cross-location id)", () => {
    const { demo } = catalogWithLots();
    const product = demo.products[0];
    const vendor = demo.vendors.find((v) => v.id === product.vendorId)!;
    const plan = buildDateGroupImportPlan(
      [
        row(2, [
          vendor.name,
          product.name,
          "99999999-9999-4999-8999-999999999999",
          "3",
          "01/15/26",
          "",
          "",
        ]),
      ],
      header,
      demo,
    );
    expect(plan.rows[0].action).toBe("error");
    expect(plan.rows[0].reason).toMatch(/not found in this branch/i);
  });

  it("refuses notes longer than 500 characters before they reach the database", () => {
    const { demo } = catalogWithLots();
    const product = demo.products[0];
    const vendor = demo.vendors.find((v) => v.id === product.vendorId)!;
    const plan = buildDateGroupImportPlan(
      [
        row(2, [
          vendor.name,
          product.name,
          "",
          "1",
          "01/15/26",
          "",
          "x".repeat(501),
        ]),
      ],
      header,
      demo,
    );
    expect(plan.rows[0].action).toBe("error");
    expect(plan.rows[0].reason).toMatch(/500/);
  });

  it("treats unsupported fractions and negatives in the dated quantity as row errors", () => {
    const { demo } = catalogWithLots();
    const product = demo.products[0];
    const vendor = demo.vendors.find((v) => v.id === product.vendorId)!;
    const plan = buildDateGroupImportPlan(
      ["1/3", "1/8", "1/0", "-1", "abc"].map((q, i) =>
        row(i + 2, [vendor.name, product.name, "", q, "01/15/26", "", ""]),
      ),
      header,
      demo,
    );
    expect(plan.rows.map((r) => r.action)).toEqual([
      "error",
      "error",
      "error",
      "error",
      "error",
    ]);
  });

  it("the fingerprint changes when a group's VERSION or precision changes (stale-preview guard)", () => {
    const { csv, demo } = exportedCsv();
    const base = fingerprintDateGroupPlan(planFromCsv(csv, demo));
    expect(fingerprintDateGroupPlan(planFromCsv(csv, demo))).toBe(base);

    const bumped = {
      ...demo,
      dateLots: demo.dateLots!.map((l) =>
        l.id === "22222222-2222-4222-8222-222222222222"
          ? { ...l, version: l.version + 1 }
          : l,
      ),
    };
    expect(fingerprintDateGroupPlan(planFromCsv(csv, bumped))).not.toBe(base);

    const reprecised = {
      ...demo,
      dateLots: demo.dateLots!.map((l) =>
        l.id === "11111111-1111-4111-8111-111111111111"
          ? {
              ...l,
              expiration: { date: "2026-09-30", precision: "month" as const },
            }
          : l,
      ),
    };
    expect(fingerprintDateGroupPlan(planFromCsv(csv, reprecised))).not.toBe(
      base,
    );
    expect(base).toMatch(/^dg_[0-9a-f]{1,14}$/);
  });
});
