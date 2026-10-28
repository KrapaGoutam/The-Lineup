import { UNIT_TYPES, type UnitType } from "./inventory-types";

/**
 * TypeScript mirror of the database key functions (migration
 * 20261026170000_bar_inventory_catalog.sql). Both are proven against
 * tests/fixtures/bar-inventory/keys-vectors.json. The database computes the
 * authoritative keys; this mirror only powers client-side duplicate hints,
 * the demo engine and (BI-8) import matching.
 */

/** Trimmed, inner whitespace collapsed to single spaces. */
export function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Letters and digits only, lowercase, accents and compatibility forms
 * folded ("Del Papa" / "DelPapa" -> delpapa; "Tito's" -> titos). Null when
 * nothing is left.
 */
export function nameKey(value: string | null | undefined): string | null {
  const key = (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
  return key === "" ? null : key;
}

/**
 * Lowercase, no whitespace, leading number without trailing zeros
 * ("750 mL" -> 750ml, "1.750 L" -> 1.75l). No unit conversion.
 */
export function sizeKey(value: string | null | undefined): string {
  const compact = (value ?? "").toLowerCase().replace(/\s+/g, "");
  const match = /^(\d+)(?:\.(\d+))?(.*)$/.exec(compact);
  if (!match) return compact;
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return `${match[1]}${fraction ? `.${fraction}` : ""}${match[3]}`;
}

/** Whitespace removed, uppercase, punctuation kept. Null when blank. */
export function skuKey(value: string | null | undefined): string | null {
  const key = (value ?? "").replace(/\s+/g, "").toUpperCase();
  return key === "" ? null : key;
}

export function isUnitType(value: string): value is UnitType {
  return (UNIT_TYPES as readonly string[]).includes(value);
}

/** Curated types are their own key; "other" is "other:<nameKey(label)>". */
export function unitKey(
  type: string,
  label: string | null | undefined,
): string | null {
  if (type === "other") {
    const labelKey = nameKey(label);
    return labelKey === null ? null : `other:${labelKey}`;
  }
  return isUnitType(type) ? type : null;
}

/** Catalog identity: vendor + name + size + unit (SKU is a stronger key). */
export function productIdentityKey(input: {
  vendorId: string;
  name: string;
  size: string | null;
  unitType: string;
  unitLabel: string | null;
}): string | null {
  const name = nameKey(input.name);
  const unit = unitKey(input.unitType, input.unitLabel);
  if (name === null || unit === null) return null;
  return [input.vendorId, name, sizeKey(input.size), unit].join("|");
}
