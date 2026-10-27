import { describe, expect, it } from "vitest";

import { mapHeaders } from "./import-columns";
import {
  buildImportPlan,
  editDistance,
  parseImportNumber,
  parseImportUnit,
  type ImportCatalog,
  type ImportOptions,
  type PlanRow,
} from "./import-plan";

const audit = {
  version: 1,
  updatedAt: "2026-10-01T00:00:00Z",
  updatedByName: null,
};

function catalog(): ImportCatalog {
  const product = (
    over: Partial<ImportCatalog["products"][number]> & { id: string },
  ): ImportCatalog["products"][number] => ({
    vendorId: "v1",
    name: "x",
    categoryId: null,
    subcategoryId: null,
    size: null,
    unitType: "bottle",
    unitLabel: null,
    sku: null,
    notes: null,
    active: true,
    ...audit,
    ...over,
  });
  const stock = (
    productId: string,
    over: Partial<ImportCatalog["stock"][number]> = {},
  ): ImportCatalog["stock"][number] => ({
    productId,
    onHand: 0,
    backup: 0,
    cutoff: null,
    warning: null,
    par: null,
    version: 1,
    updatedAt: null,
    updatedByName: null,
    lastAdjustedAt: null,
    ...over,
  });
  return {
    vendors: [
      {
        id: "v1",
        name: "Faust",
        isSystem: false,
        active: true,
        notes: null,
        ...audit,
      },
      {
        id: "v2",
        name: "Del Papa",
        isSystem: false,
        active: true,
        notes: null,
        ...audit,
      },
      {
        id: "v3",
        name: "Old Co",
        isSystem: false,
        active: false,
        notes: null,
        ...audit,
      },
    ],
    categories: [
      { id: "c1", name: "Spirits", active: true, ...audit },
      { id: "c2", name: "Beer", active: true, ...audit },
      { id: "c3", name: "Retired", active: false, ...audit },
    ],
    subcategories: [
      { id: "s1", categoryId: "c1", name: "Vodka", active: true, ...audit },
      { id: "s2", categoryId: "c1", name: "Tequila", active: true, ...audit },
    ],
    products: [
      product({
        id: "p1",
        name: "Tito's Handmade Vodka",
        size: "750 mL",
        sku: "TITOS-750",
        categoryId: "c1",
        subcategoryId: "s1",
      }),
      product({ id: "p2", name: "Tito's Handmade Vodka", size: "1.75 L" }),
      product({
        id: "p3",
        vendorId: "v2",
        name: "Modelo Especial",
        size: "12 oz",
        unitType: "can",
      }),
      product({ id: "p4", name: "Old Bottle", size: "750 mL", active: false }),
    ],
    stock: [
      stock("p1", {
        onHand: 2,
        backup: 1,
        cutoff: 4,
        warning: 6,
        par: 12,
        version: 3,
      }),
      stock("p2", { onHand: 1, cutoff: 2 }),
      stock("p3", { onHand: 3, cutoff: 2, par: 12, version: 5 }),
      stock("p4", { onHand: 1 }),
    ],
  };
}

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

/** A template row: pass only the columns you care about by name. */
function row(fields: Partial<Record<string, string>>): string[] {
  return TEMPLATE.map((title) => fields[title] ?? "");
}

function plan(
  rows: string[][],
  options: Partial<ImportOptions> = {},
  cat: ImportCatalog = catalog(),
) {
  return buildImportPlan(
    rows.map((cells, i) => ({ rowNumber: i + 2, cells })),
    mapHeaders(TEMPLATE),
    cat,
    { reason: "stock_count", ...options },
  );
}
const one = (
  fields: Partial<Record<string, string>>,
  options?: Partial<ImportOptions>,
) => plan([row(fields)], options).rows[0];
const change = (r: PlanRow, field: string) =>
  r.changes.find((c) => c.field === field);

describe("parseImportNumber", () => {
  it.each([
    ["", { kind: "blank" }],
    ["  ", { kind: "blank" }],
    ["0", { kind: "ok", value: 0 }],
    ["12", { kind: "ok", value: 12 }],
    ["3.5", { kind: "ok", value: 3.5 }],
    ["3.25", { kind: "ok", value: 3.25 }],
    [".5", { kind: "ok", value: 0.5 }],
  ])("reads %j", (text, expected) => {
    expect(parseImportNumber(text)).toEqual(expected);
  });

  it.each([
    ["-1", "negative"],
    ["1,200", "thousand"],
    ["1.200,5", "thousand"],
    ["1 200", "thousand"],
    ["2.555", "two decimal"],
    ["abc", "not a number"],
    ["5.", "not a number"],
    ["99999999999", "too large"],
  ])("refuses %j with a clear message", (text, fragment) => {
    const result = parseImportNumber(text);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message.toLowerCase()).toContain(fragment);
    }
  });

  it("blank is not zero", () => {
    expect(parseImportNumber("")).not.toEqual({ kind: "ok", value: 0 });
  });
});

describe("parseImportUnit", () => {
  it("blank assumes Bottle and says so", () => {
    expect(parseImportUnit("")).toEqual({
      ok: true,
      unitType: "bottle",
      unitLabel: null,
      assumed: true,
    });
  });
  it("knows the curated units, any case, singular or plural", () => {
    for (const [text, type] of [
      ["Bottle", "bottle"],
      ["CANS", "can"],
      ["case", "case"],
      ["Kegs", "keg"],
      ["packs", "pack"],
    ] as const) {
      expect(parseImportUnit(text)).toMatchObject({
        unitType: type,
        assumed: false,
      });
    }
  });
  it("anything else is Other with its own label, within the length limit", () => {
    expect(parseImportUnit("  Magnum  ")).toMatchObject({
      unitType: "other",
      unitLabel: "Magnum",
    });
    expect(parseImportUnit("x".repeat(41))).toMatchObject({ ok: false });
  });
});

describe("editDistance", () => {
  it("counts edits and gives up early", () => {
    expect(editDistance("faust", "fuast", 2)).toBe(2);
    expect(editDistance("faust", "faust", 2)).toBe(0);
    expect(editDistance("delpapa", "delpepa", 2)).toBe(1);
    expect(editDistance("faust", "completelydifferent", 2)).toBe(3);
  });
});

describe("matching: identity, never name alone (AC-IMP-4)", () => {
  it("Tito's 750 mL and Tito's 1.75 L are separate items", () => {
    const small = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "750 mL",
      "On Hand": "5",
    });
    const large = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "1.75 L",
      "On Hand": "5",
    });
    expect([small.productId, large.productId]).toEqual(["p1", "p2"]);
  });

  it("a size with no match is a new product, not a guess", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "375 mL",
      "On Hand": "5",
    });
    expect(r).toMatchObject({ action: "create", productId: null });
  });

  it("size spelling is normalised for matching only", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "750ml",
      "On Hand": "5",
    });
    expect(r.productId).toBe("p1");
    expect(r.matchedBy).toBe("identity");
  });

  it("the same name under a different vendor is a different item", () => {
    const r = one({
      Vendor: "Del Papa",
      Name: "Tito's Handmade Vodka",
      Size: "750 mL",
      "On Hand": "5",
    });
    expect(r.action).toBe("create");
  });

  it("the unit is part of the identity (a blank unit means Bottle, assumed)", () => {
    const can = one({
      Vendor: "Del Papa",
      Name: "Modelo Especial",
      Size: "12 oz",
      Unit: "Can",
      "On Hand": "9",
    });
    expect(can.productId).toBe("p3");
    const bottle = one({
      Vendor: "Del Papa",
      Name: "Modelo Especial",
      Size: "12 oz",
      "On Hand": "9",
    });
    expect(bottle).toMatchObject({ action: "create", unitAssumed: true });
  });
});

describe("vendors: matched or proposed, never silently created (AC-IMP-5)", () => {
  it.each(["Del Papa", "DelPapa", "del papa", "DEL  PAPA", " Del Papa "])(
    "%j matches the existing vendor",
    (spelling) => {
      const r = one({
        Vendor: spelling,
        Name: "Modelo Especial",
        Size: "12 oz",
        Unit: "can",
        "On Hand": "9",
      });
      expect(r.vendor).toEqual({ kind: "matched", id: "v2", name: "Del Papa" });
    },
  );

  it("an unknown vendor is proposed as new, once, with the first-seen spelling", () => {
    const p = plan([
      row({ Vendor: "New Dist", Name: "A", "On Hand": "1" }),
      row({ Vendor: "new   dist", Name: "B", "On Hand": "1" }),
    ]);
    expect(p.newVendors).toEqual([
      { key: "newdist", name: "New Dist", rows: [2, 3] },
    ]);
    expect(p.rows[0].vendor).toMatchObject({ kind: "new", needsChoice: false });
    expect(p.summary.newVendors).toBe(1);
  });

  it('"Fuast" is a near-miss of "Faust": it asks, and never creates on its own', () => {
    const p = plan([row({ Vendor: "Fuast", Name: "Gin", "On Hand": "1" })]);
    expect(p.rows[0].vendor).toMatchObject({
      kind: "new",
      needsChoice: true,
      similarTo: { id: "v1", name: "Faust" },
    });
    expect(p.nearMisses).toEqual([
      expect.objectContaining({ entity: "vendor", name: "Fuast", rows: [2] }),
    ]);
    expect(p.canCommit).toBe(false);
  });

  it("the manager's choice resolves it either way", () => {
    const rows = [row({ Vendor: "Fuast", Name: "Gin", "On Hand": "1" })];
    const mapped = plan(rows, { choices: { vendors: { fuast: "v1" } } });
    expect(mapped.rows[0].vendor).toEqual({
      kind: "matched",
      id: "v1",
      name: "Faust",
    });
    expect(mapped.nearMisses).toEqual([]);
    expect(mapped.canCommit).toBe(true);

    const created = plan(rows, { choices: { vendors: { fuast: "new" } } });
    expect(created.rows[0].vendor).toMatchObject({
      kind: "new",
      needsChoice: false,
    });
    expect(created.canCommit).toBe(true);
  });

  it("a deactivated vendor is an error, not an undeclared reactivation", () => {
    const r = one({ Vendor: "Old Co", Name: "Thing", "On Hand": "1" });
    expect(r.action).toBe("error");
    expect(r.reason).toContain("deactivated");
  });

  it("an errored row proposes nothing", () => {
    const p = plan([row({ Vendor: "Brand New", Name: "", "On Hand": "1" })]);
    expect(p.rows[0].action).toBe("error");
    expect(p.newVendors).toEqual([]);
  });
});

describe("categories and subcategories (AC-IMP-6)", () => {
  it("both are optional: a blank never fails a row", () => {
    expect(one({ Vendor: "Faust", Name: "Gin", "On Hand": "1" }).action).toBe(
      "create",
    );
  });

  it("matches existing ones and proposes new ones", () => {
    const p = plan([
      row({
        Vendor: "Faust",
        Name: "A",
        Category: "spirits",
        Subcategory: "vodka",
        "On Hand": "1",
      }),
      row({
        Vendor: "Faust",
        Name: "B",
        Category: "Spirits",
        Subcategory: "Mezcal",
        "On Hand": "1",
      }),
      row({
        Vendor: "Faust",
        Name: "C",
        Category: "Wine",
        Subcategory: "Red",
        "On Hand": "1",
      }),
    ]);
    expect(p.rows[0].category).toMatchObject({ kind: "matched", id: "c1" });
    expect(p.rows[0].subcategory).toMatchObject({ kind: "matched", id: "s1" });
    expect(p.newCategories.map((c) => c.name)).toEqual(["Wine"]);
    expect(p.newSubcategories.map((s) => [s.categoryName, s.name])).toEqual([
      ["Spirits", "Mezcal"],
      ["Wine", "Red"],
    ]);
  });

  it("a subcategory needs a category", () => {
    const r = one({
      Vendor: "Faust",
      Name: "A",
      Subcategory: "Vodka",
      "On Hand": "1",
    });
    expect(r).toMatchObject({
      action: "error",
      reason: "Subcategory needs a Category.",
    });
  });

  it("a deactivated category is an error", () => {
    const r = one({
      Vendor: "Faust",
      Name: "A",
      Category: "Retired",
      "On Hand": "1",
    });
    expect(r.action).toBe("error");
  });
});

describe("updates show Current → Imported → Delta (AC-IMP-3)", () => {
  const update = () =>
    one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "750 mL",
      "On Hand": "4",
      Backup: "8",
      "Cutoff Limit": "4",
    });

  it("lists each changed field with its delta, and the status move", () => {
    const r = update();
    expect(r).toMatchObject({
      action: "update",
      productId: "p1",
      matchedBy: "identity",
      statusBefore: "Critical",
      statusAfter: "Healthy",
      expectedStockVersion: 3,
    });
    expect(change(r, "onHand")).toMatchObject({
      current: 2,
      imported: 4,
      delta: 2,
    });
    expect(change(r, "backup")).toMatchObject({
      current: 1,
      imported: 8,
      delta: 7,
    });
  });

  it("a field that does not change is not listed", () => {
    expect(change(update(), "cutoff")).toBeUndefined();
  });

  it("blank cell = unchanged (D4): the other levels stay", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "750 mL",
      "On Hand": "9",
    });
    expect(r.changes.map((c) => c.field)).toEqual(["onHand"]);
    expect(r.values).toEqual({ onHand: 9 });
  });

  it("0 = zero (D4), not unchanged", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "750 mL",
      Backup: "0",
    });
    expect(change(r, "backup")).toMatchObject({
      current: 1,
      imported: 0,
      delta: -1,
    });
  });

  it("nothing different is a Skip, not an update", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "750 mL",
      "On Hand": "2",
      Backup: "1",
      "Cutoff Limit": "4",
    });
    expect(r).toMatchObject({ action: "skip", reason: "No changes." });
  });

  it("an all-blank row for an existing item is a Skip (it cannot clear anything)", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "750 mL",
    });
    expect(r.action).toBe("skip");
  });

  it("sets the SKU when the item has none, and notes when given", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "1.75 L",
      SKU: "T-175",
      Notes: "Top shelf",
    });
    expect(r.changes.map((c) => c.field).sort()).toEqual(["notes", "sku"]);
  });

  it("moves a category and shows both names", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "750 mL",
      Category: "Beer",
    });
    expect(change(r, "category")).toMatchObject({
      current: "Spirits",
      imported: "Beer",
    });
  });

  it("an archived item cannot be updated by import", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Old Bottle",
      Size: "750 mL",
      "On Hand": "3",
    });
    expect(r.action).toBe("error");
    expect(r.reason).toContain("archived");
  });
});

describe("a create (AC-IMP-3)", () => {
  it("defaults: counts 0, levels none, unit Bottle (assumed)", () => {
    const r = one({ Vendor: "Faust", Name: "House Gin", Size: "1 L" });
    expect(r).toMatchObject({
      action: "create",
      productId: null,
      expectedStockVersion: null,
      unitType: "bottle",
      unitAssumed: true,
      values: {},
    });
  });

  it("keeps what the file gives, including 0", () => {
    const r = one({
      Vendor: "Faust",
      Name: "House Gin",
      "On Hand": "0",
      Backup: "3",
      "Cutoff Limit": "2",
      "Par Level": "10",
    });
    expect(r.values).toEqual({ onHand: 0, backup: 3, cutoff: 2, par: 10 });
    expect(r.statusAfter).toBe("Low");
  });

  it("an 'Other' unit keeps its own label", () => {
    const r = one({ Vendor: "Faust", Name: "Magnum Red", Unit: "Magnum" });
    expect(r).toMatchObject({ unitType: "other", unitLabel: "Magnum" });
    expect(r.display.unit).toBe("Magnum");
  });
});

describe("SKU matching (AC-IMP-4)", () => {
  it("a SKU match with the same identity is a plain update", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "750 mL",
      SKU: "titos-750",
      "On Hand": "5",
    });
    expect(r).toMatchObject({
      action: "update",
      matchedBy: "sku",
      needsApproval: false,
    });
  });

  it("a SKU that matches a renamed item is flagged and needs a tick", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Vodka",
      Size: "750 mL",
      SKU: "TITOS-750",
      "On Hand": "5",
    });
    expect(r).toMatchObject({
      action: "update",
      matchedBy: "sku",
      needsApproval: true,
      productId: "p1",
    });
    expect(change(r, "name")).toMatchObject({
      current: "Tito's Handmade Vodka",
      imported: "Tito's Vodka",
    });
  });

  it("a blank Size and an unnamed Unit mean 'unchanged' on a SKU match (not 'clear the size')", () => {
    // Vendor, Name, SKU and counts only: no Size or Unit column at all.
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      SKU: "TITOS-750",
      "On Hand": "5",
    });
    expect(r).toMatchObject({
      action: "update",
      matchedBy: "sku",
      needsApproval: false,
    });
    expect(r.changes.map((c) => c.field)).toEqual(["onHand"]);
  });

  it("a SKU match that names a different Size is still held for approval, showing the change", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "1 L",
      SKU: "TITOS-750",
      "On Hand": "5",
    });
    expect(r).toMatchObject({ matchedBy: "sku", needsApproval: true });
    expect(change(r, "size")).toMatchObject({
      current: "750 mL",
      imported: "1 L",
    });
  });

  it("a SKU match that names a different Unit is still held for approval", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "750 mL",
      Unit: "Case",
      SKU: "TITOS-750",
      "On Hand": "5",
    });
    expect(r).toMatchObject({ matchedBy: "sku", needsApproval: true });
    expect(change(r, "unit")).toMatchObject({ imported: "Case" });
  });

  it("a SKU that matches nothing creates the item with that SKU", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Brand New",
      SKU: "NEW-1",
      "On Hand": "1",
    });
    expect(r).toMatchObject({ action: "create", sku: "NEW-1" });
  });

  it("a different SKU on an identity match is an error, not an overwrite", () => {
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "750 mL",
      SKU: "OTHER-1",
      "On Hand": "5",
    });
    expect(r.action).toBe("error");
    expect(r.reason).toContain("TITOS-750");
  });
});

describe("duplicates inside the file", () => {
  it("the same item twice: the later row is the error and names the first", () => {
    const p = plan([
      row({ Vendor: "Faust", Name: "Gin", Size: "1 L", "On Hand": "1" }),
      row({ Vendor: "FAUST", Name: "gin", Size: "1L", "On Hand": "2" }),
    ]);
    expect(p.rows[0].action).toBe("create");
    expect(p.rows[1]).toMatchObject({ action: "error" });
    expect(p.rows[1].reason).toContain("row 2");
  });

  it("one SKU on two different items errors BOTH rows", () => {
    const p = plan([
      row({ Vendor: "Faust", Name: "A", SKU: "X-1", "On Hand": "1" }),
      row({ Vendor: "Faust", Name: "B", SKU: "x-1", "On Hand": "1" }),
    ]);
    expect(p.rows.map((r) => r.action)).toEqual(["error", "error"]);
    expect(p.rows[0].reason).toContain("row 3");
    expect(p.rows[1].reason).toContain("row 2");
  });
});

describe("row validation (spec §6)", () => {
  it("needs a vendor and a name", () => {
    expect(one({ Name: "A", "On Hand": "1" })).toMatchObject({
      action: "error",
      reason: "Vendor is required.",
    });
    expect(one({ Vendor: "Faust", "On Hand": "1" })).toMatchObject({
      action: "error",
      reason: "Name is required.",
    });
  });

  it("reports every problem in the row, in plain words", () => {
    const r = one({
      Vendor: "Faust",
      Name: "A",
      "On Hand": "1,200",
      Backup: "-1",
      "Par Level": "abc",
    });
    expect(r.action).toBe("error");
    expect(r.reason).toContain("On Hand");
    expect(r.reason).toContain("Backup");
    expect(r.reason).toContain("Par Level");
  });

  it("warning must be at or above the cutoff", () => {
    expect(
      one({
        Vendor: "Faust",
        Name: "A",
        "Cutoff Limit": "5",
        "Warning Level": "3",
      }).reason,
    ).toBe("Warning level must be at or above the cutoff.");
    expect(
      one({
        Vendor: "Faust",
        Name: "A",
        "Cutoff Limit": "5",
        "Warning Level": "5",
      }).action,
    ).toBe("create");
  });

  it("it checks the result: a new cutoff against the level already on file", () => {
    // Tito's 750 mL has warning 6; a cutoff of 9 would sit above it.
    const r = one({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "750 mL",
      "Cutoff Limit": "9",
    });
    expect(r.action).toBe("error");
  });

  it("par below the cutoff is a warning, and the row still imports", () => {
    const r = one({
      Vendor: "Faust",
      Name: "A",
      "Cutoff Limit": "5",
      "Par Level": "3",
    });
    expect(r.action).toBe("create");
    expect(r.warnings).toEqual(["Par is below the cutoff."]);
  });

  it("caps text at 200 characters and notes at 500", () => {
    expect(one({ Vendor: "Faust", Name: "x".repeat(201) }).action).toBe(
      "error",
    );
    expect(
      one({ Vendor: "Faust", Name: "A", Notes: "n".repeat(500) }).action,
    ).toBe("create");
    expect(
      one({ Vendor: "Faust", Name: "A", Notes: "n".repeat(501) }).action,
    ).toBe("error");
  });
});

describe("the plan as a whole", () => {
  const p = plan([
    row({
      Vendor: "Faust",
      Name: "Tito's Handmade Vodka",
      Size: "750 mL",
      "On Hand": "4",
    }), // update
    row({ Vendor: "Faust", Name: "House Gin", "On Hand": "3" }), // create
    row({ Vendor: "Faust", Name: "Tito's Handmade Vodka", Size: "1.75 L" }), // skip
    row({ Vendor: "", Name: "Nameless" }), // error
    row({
      Vendor: "Brand New Co",
      Name: "Rum",
      Category: "Wine",
      Subcategory: "Red",
    }), // create
  ]);

  it("counts every class and every proposed entity", () => {
    expect(p.summary).toEqual({
      create: 2,
      update: 1,
      skip: 1,
      error: 1,
      newVendors: 1,
      newCategories: 1,
      newSubcategories: 1,
      needsApproval: 0,
    });
  });

  it("keeps the row numbers true to the file", () => {
    expect(p.rows.map((r) => r.rowNumber)).toEqual([2, 3, 4, 5, 6]);
  });

  it("can commit when something would be written and nothing waits on a choice", () => {
    expect(p.canCommit).toBe(true);
    expect(
      plan([
        row({ Vendor: "Faust", Name: "Tito's Handmade Vodka", Size: "1.75 L" }),
      ]).canCommit,
    ).toBe(false);
  });

  it("carries the batch reason through", () => {
    expect(plan([], { reason: "delivery_restock" }).reason).toBe(
      "delivery_restock",
    );
  });

  it("is empty-safe", () => {
    expect(plan([]).summary.create).toBe(0);
    expect(plan([]).canCommit).toBe(false);
  });
});

describe("headers drive which columns are read", () => {
  it("works with aliases and ignores columns it does not know", () => {
    const header = mapHeaders([
      "Supplier",
      "Item",
      "Qty",
      "Backup",
      "Min",
      "Mystery",
    ]);
    const result = buildImportPlan(
      [
        {
          rowNumber: 2,
          cells: ["Faust", "House Gin", "6", "1", "2", "ignored"],
        },
      ],
      header,
      catalog(),
      { reason: "stock_count" },
    );
    expect(result.rows[0]).toMatchObject({
      action: "create",
      values: { onHand: 6, backup: 1, cutoff: 2 },
    });
  });
});
