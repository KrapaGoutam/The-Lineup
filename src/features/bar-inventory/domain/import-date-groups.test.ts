import { describe, expect, it } from "vitest";

import { parseCsv } from "@/lib/csv/read";

import {
  buildDateGroupImportPlan,
  fingerprintDateGroupPlan,
  mapDateGroupHeaders,
  parseDateGroupDate,
  type DateGroupImportCatalog,
} from "./import-date-groups";

const testCatalog: DateGroupImportCatalog = {
  vendors: [
    {
      id: "v1",
      name: "Faust Distributing",
      isSystem: false,
      active: true,
      notes: null,
      version: 1,
      updatedAt: "2026-10-01T00:00:00Z",
      updatedByName: null,
    },
    {
      id: "v2",
      name: "Del Papa",
      isSystem: false,
      active: true,
      notes: null,
      version: 1,
      updatedAt: "2026-10-01T00:00:00Z",
      updatedByName: null,
    },
  ],
  products: [
    {
      id: "p1",
      vendorId: "v1",
      name: "Tito's Handmade Vodka",
      categoryId: null,
      subcategoryId: null,
      size: "750 mL",
      unitType: "bottle",
      unitLabel: null,
      sku: "TITOS-750",
      notes: null,
      active: true,
      version: 1,
      updatedAt: "2026-10-01T00:00:00Z",
      updatedByName: null,
    },
    {
      id: "p2",
      vendorId: "v1",
      name: "Tito's Handmade Vodka",
      categoryId: null,
      subcategoryId: null,
      size: "1.75 L",
      unitType: "bottle",
      unitLabel: null,
      sku: "TITOS-175",
      notes: null,
      active: true,
      version: 1,
      updatedAt: "2026-10-01T00:00:00Z",
      updatedByName: null,
    },
    {
      id: "p3",
      vendorId: "v2",
      name: "Modelo Especial",
      categoryId: null,
      subcategoryId: null,
      size: "12 oz",
      unitType: "can",
      unitLabel: null,
      sku: null,
      notes: null,
      active: true,
      version: 1,
      updatedAt: "2026-10-01T00:00:00Z",
      updatedByName: null,
    },
    {
      id: "p4",
      vendorId: "v1",
      name: "Archived Bourbon",
      categoryId: null,
      subcategoryId: null,
      size: "750 mL",
      unitType: "bottle",
      unitLabel: null,
      sku: null,
      notes: null,
      active: false,
      version: 1,
      updatedAt: "2026-10-01T00:00:00Z",
      updatedByName: null,
    },
  ],
  dateLots: [
    {
      id: "lot-1",
      productId: "p1",
      quantity: 5,
      manufacture: { date: "2026-01-01", precision: "day" },
      expiration: { date: "2027-01-01", precision: "day" },
      notes: "Original lot",
      active: true,
      version: 1,
      updatedAt: "2026-10-01T00:00:00Z",
      updatedByName: null,
    },
  ],
};

describe("mapDateGroupHeaders", () => {
  it("maps exact export columns", () => {
    const headers = [
      "Vendor",
      "Name",
      "Size",
      "Unit",
      "Date group ID",
      "Dated quantity",
      "Manufactured",
      "Manufacture precision",
      "Expires",
      "Expiration precision",
      "Expiration status",
      "Manufacture freshness",
      "Notes",
    ];
    const mapping = mapDateGroupHeaders(headers);
    expect(mapping.missing).toEqual([]);
    expect(mapping.byColumnIndex[0]).toBe("vendor");
    expect(mapping.byColumnIndex[1]).toBe("name");
    expect(mapping.byColumnIndex[4]).toBe("dateGroupId");
    expect(mapping.byColumnIndex[5]).toBe("datedQuantity");
    expect(mapping.byColumnIndex[6]).toBe("manufactured");
    expect(mapping.byColumnIndex[8]).toBe("expires");
  });

  it("identifies missing required columns", () => {
    const mapping = mapDateGroupHeaders(["Size", "Unit", "Expires"]);
    expect(mapping.missing).toEqual(["vendor", "name"]);
  });
});

describe("parseDateGroupDate", () => {
  it("parses ISO date format", () => {
    expect(parseDateGroupDate("2026-05-15", "expiration")).toEqual({
      ok: true,
      date: { date: "2026-05-15", precision: "day" },
    });
    expect(parseDateGroupDate("2026-05", "manufacture")).toEqual({
      ok: true,
      date: { date: "2026-05-01", precision: "month" },
    });
    expect(parseDateGroupDate("2026-05", "expiration")).toEqual({
      ok: true,
      date: { date: "2026-05-31", precision: "month" },
    });
  });

  it("parses US slash date formats", () => {
    expect(parseDateGroupDate("05/15/2026", "expiration")).toEqual({
      ok: true,
      date: { date: "2026-05-15", precision: "day" },
    });
    expect(parseDateGroupDate("5/26", "manufacture")).toEqual({
      ok: true,
      date: { date: "2026-05-01", precision: "month" },
    });
    expect(parseDateGroupDate("5/26", "expiration")).toEqual({
      ok: true,
      date: { date: "2026-05-31", precision: "month" },
    });
  });

  it("handles blank / empty values safely", () => {
    expect(parseDateGroupDate("", "expiration")).toEqual({
      ok: true,
      date: null,
    });
    expect(parseDateGroupDate("—", "manufacture")).toEqual({
      ok: true,
      date: null,
    });
  });

  it("rejects invalid dates", () => {
    expect(parseDateGroupDate("99/99/9999", "expiration").ok).toBe(false);
  });
});

describe("buildDateGroupImportPlan", () => {
  function planFromCsv(csvText: string) {
    const parsed = parseCsv(csvText);
    if (!parsed.ok) throw new Error(parsed.error);
    const header = mapDateGroupHeaders(parsed.header.cells);
    return buildDateGroupImportPlan(parsed.rows, header, testCatalog);
  }

  it("creates a new lot with fraction quantity and dates", () => {
    const csv = `Vendor,Name,Size,Unit,Dated quantity,Expires\nFaust Distributing,Tito's Handmade Vodka,750 mL,bottle,1 1/2,2027-06-30`;
    const plan = planFromCsv(csv);
    expect(plan.summary.create).toBe(1);
    expect(plan.rows[0]).toMatchObject({
      action: "create",
      productId: "p1",
      quantity: 1.5,
      expiration: { date: "2027-06-30", precision: "day" },
    });
    expect(plan.canCommit).toBe(true);
  });

  it("updates an existing lot when ID matches and values differ", () => {
    const csv = `Vendor,Name,Size,Unit,Date group ID,Dated quantity,Expires\nFaust Distributing,Tito's Handmade Vodka,750 mL,bottle,lot-1,3/4,2027-12-31`;
    const plan = planFromCsv(csv);
    expect(plan.summary.update).toBe(1);
    expect(plan.rows[0]).toMatchObject({
      action: "update",
      dateGroupId: "lot-1",
      quantity: 0.75,
      expiration: { date: "2027-12-31", precision: "day" },
    });
    expect(plan.canCommit).toBe(true);
  });

  it("marks as unchanged when values match existing lot", () => {
    const csv = `Vendor,Name,Size,Unit,Date group ID,Dated quantity,Manufactured,Expires,Notes\nFaust Distributing,Tito's Handmade Vodka,750 mL,bottle,lot-1,5,2026-01-01,2027-01-01,Original lot`;
    const plan = planFromCsv(csv);
    expect(plan.summary.unchanged).toBe(1);
    expect(plan.rows[0].action).toBe("unchanged");
  });

  it("errors on unknown product or vendor", () => {
    const csv = `Vendor,Name,Expires\nUnknown Vendor,Some Drink,2027-01-01`;
    const plan = planFromCsv(csv);
    expect(plan.summary.error).toBe(1);
    expect(plan.rows[0].action).toBe("error");
    expect(plan.canCommit).toBe(false);
  });

  it("errors when expiration date is before manufacture date", () => {
    const csv = `Vendor,Name,Size,Manufactured,Expires\nFaust Distributing,Tito's Handmade Vodka,750 mL,2027-01-01,2026-01-01`;
    const plan = planFromCsv(csv);
    expect(plan.summary.error).toBe(1);
    expect(plan.rows[0].reason).toContain("cannot be before");
  });

  it("errors on invalid fraction like 1/8", () => {
    const csv = `Vendor,Name,Size,Dated quantity,Expires\nFaust Distributing,Tito's Handmade Vodka,750 mL,1/8,2027-01-01`;
    const plan = planFromCsv(csv);
    expect(plan.summary.error).toBe(1);
    expect(plan.rows[0].reason).toContain("Fraction cannot be represented");
  });

  it("skips empty rows or rows without dates", () => {
    const csv = `Vendor,Name,Size,Dated quantity\nFaust Distributing,Tito's Handmade Vodka,750 mL,2\nFaust Distributing,Tito's Handmade Vodka,750 mL,`;
    const plan = planFromCsv(csv);
    expect(plan.summary.skip).toBe(2);
  });

  it("generates deterministic fingerprint", () => {
    const csv = `Vendor,Name,Size,Unit,Dated quantity,Expires\nFaust Distributing,Tito's Handmade Vodka,750 mL,bottle,2,2027-06-30`;
    const plan1 = planFromCsv(csv);
    const plan2 = planFromCsv(csv);
    expect(fingerprintDateGroupPlan(plan1)).toBe(
      fingerprintDateGroupPlan(plan2),
    );
  });
});
