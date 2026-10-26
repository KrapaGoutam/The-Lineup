import { describe, expect, it } from "vitest";

import keys from "../../../../tests/fixtures/bar-inventory/keys-vectors.json";
import { UNIT_TYPES } from "./inventory-types";
import {
  cleanText,
  nameKey,
  productIdentityKey,
  sizeKey,
  skuKey,
  unitKey,
} from "./keys";

describe("keys mirror the shared golden vectors", () => {
  it.each(keys.nameKey)(
    "nameKey($input) -> $expected",
    ({ input, expected }) => {
      expect(nameKey(input)).toBe(expected);
    },
  );

  it.each(keys.sameVendor)("one vendor key for: %j", (...group) => {
    expect(new Set(group.map(nameKey)).size).toBe(1);
  });

  it.each(keys.sizeKey)(
    "sizeKey($input) -> $expected",
    ({ input, expected }) => {
      expect(sizeKey(input)).toBe(expected);
    },
  );

  it.each(keys.skuKey)("skuKey($input) -> $expected", ({ input, expected }) => {
    expect(skuKey(input)).toBe(expected);
  });

  it.each(keys.unitKey)(
    "unitKey($type, $label) -> $expected",
    ({ type, label, expected }) => {
      expect(unitKey(type, label)).toBe(expected);
    },
  );

  it("the curated unit list is the D8 list plus other", () => {
    expect([...UNIT_TYPES]).toEqual([...keys.units.curated, "other"]);
  });

  const identity = (p: {
    vendor: string;
    name: string;
    size: string;
    unit: string;
  }) =>
    productIdentityKey({
      vendorId: nameKey(p.vendor) ?? "",
      name: p.name,
      size: p.size,
      unitType: p.unit,
      unitLabel: null,
    });

  it("formatting variants share one identity", () => {
    for (const [a, b] of keys.identity.same) {
      expect(identity(a)).toBe(identity(b));
    }
  });

  it("different size, vendor or unit never share an identity", () => {
    for (const [a, b] of keys.identity.different) {
      expect(identity(a)).not.toBe(identity(b));
    }
  });
});

describe("cleanText", () => {
  it("trims and collapses inner whitespace", () => {
    expect(cleanText("  Del   Papa \n")).toBe("Del Papa");
    expect(cleanText(null)).toBe("");
  });
});
