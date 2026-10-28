import { describe, expect, it } from "vitest";

import { mapHeaders } from "./import-columns";

const TEMPLATE = [
  "Vendor",
  "Name",
  "Category",
  "Subcategory",
  "Size",
  "Unit",
  "SKU",
  "On Hand",
  "Backup",
  "Cutoff Limit",
  "Warning Level",
  "Par Level",
  "Notes",
];

describe("mapHeaders", () => {
  it("maps the approved template exactly, with nothing missing", () => {
    const m = mapHeaders(TEMPLATE);
    expect(m.mapping).toEqual([
      "vendor",
      "name",
      "category",
      "subcategory",
      "size",
      "unit",
      "sku",
      "onHand",
      "backup",
      "cutoff",
      "warning",
      "par",
      "notes",
    ]);
    expect(m.missing).toEqual([]);
    expect(m.unmapped).toEqual([]);
    expect(m.duplicates).toEqual([]);
  });

  it("ignores case, spacing and punctuation", () => {
    const m = mapHeaders([
      "  VENDOR ",
      "name",
      "on   hand",
      "BACK-UP",
      "cut-off",
    ]);
    expect(m.mapping).toEqual(["vendor", "name", "onHand", "backup", "cutoff"]);
  });

  it.each([
    ["Qty", "onHand"],
    ["Quantity", "onHand"],
    ["Cut off", "cutoff"],
    ["Min", "cutoff"],
    ["Warn", "warning"],
    ["Par", "par"],
    ["Target", "par"],
    ["Item", "name"],
    ["Product", "name"],
    ["Item Code", "sku"],
    ["UPC", "sku"],
    ["Supplier", "vendor"],
    ["UOM", "unit"],
  ] as const)("understands the alias %s", (header, field) => {
    expect(mapHeaders([header]).mapping).toEqual([field]);
  });

  it('keeps "Item" (the name) apart from "Item Code" (the SKU)', () => {
    expect(mapHeaders(["Item", "Item Code"]).mapping).toEqual(["name", "sku"]);
  });

  it("names the required columns a file lacks (template minimum, PRD)", () => {
    const m = mapHeaders(["Vendor", "Name", "On Hand"]);
    expect(m.missing).toEqual(["backup", "cutoff"]);
  });

  it("does not require the optional columns", () => {
    const m = mapHeaders([
      "Vendor",
      "Name",
      "On Hand",
      "Backup",
      "Cutoff Limit",
    ]);
    expect(m.missing).toEqual([]);
  });

  it("lists headers it could not place instead of dropping them silently", () => {
    const m = mapHeaders(["Vendor", "Name", "Favourite colour", ""]);
    expect(m.unmapped).toEqual(["Favourite colour"]);
    expect(m.mapping).toEqual(["vendor", "name", null, null]);
  });

  it("when two columns mean the same field, the first wins and the clash is reported", () => {
    const m = mapHeaders(["Name", "Item", "Vendor"]);
    expect(m.mapping).toEqual(["name", null, "vendor"]);
    expect(m.duplicates).toEqual([
      { field: "name", columns: ["Name", "Item"] },
    ]);
    expect(m.unmapped).toEqual([]);
  });

  it("the manager's own mapping wins over the automatic one", () => {
    // "Volume" would be Size; the manager says it is Notes. "Qty" is ignored.
    const m = mapHeaders(["Vendor", "Volume", "Qty"], { 1: "notes", 2: null });
    expect(m.mapping).toEqual(["vendor", "notes", null]);
    expect(m.unmapped).toEqual([]);
  });

  it("an override can supply a column the automatic match missed", () => {
    const m = mapHeaders(
      ["Vendor", "Name", "How many", "Backup", "Cutoff Limit"],
      {
        2: "onHand",
      },
    );
    expect(m.missing).toEqual([]);
    expect(m.mapping[2]).toBe("onHand");
  });
});
