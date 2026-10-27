import { cleanText, nameKey } from "./keys";

/** The columns an import understands (the approved template). */
export const IMPORT_FIELDS = [
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
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  vendor: "Vendor",
  name: "Name",
  category: "Category",
  subcategory: "Subcategory",
  size: "Size",
  unit: "Unit",
  sku: "SKU",
  onHand: "On Hand",
  backup: "Backup",
  cutoff: "Cutoff Limit",
  warning: "Warning Level",
  par: "Par Level",
  notes: "Notes",
};

/**
 * The template minimum (PRD, confirmed): these columns must be in the file.
 * A blank cell is still fine on any of them except Vendor and Name: blank
 * counts mean "unchanged" on an existing item (D4) and a default on a new one.
 */
export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = [
  "vendor",
  "name",
  "onHand",
  "backup",
  "cutoff",
];

/** Header spellings people really use, compared as letters and digits only. */
const ALIASES: Record<ImportField, readonly string[]> = {
  vendor: ["Vendor", "Supplier", "Distributor"],
  name: ["Name", "Item", "Product", "Item Name", "Product Name", "Description"],
  category: ["Category", "Cat"],
  subcategory: ["Subcategory", "Sub Category", "Sub-category", "Subcat"],
  size: ["Size", "Volume", "Pack Size"],
  unit: ["Unit", "Unit Type", "UOM", "Unit of Measure"],
  sku: ["SKU", "Item Code", "Product Code", "UPC", "Item Number"],
  onHand: ["On Hand", "OnHand", "Qty", "Quantity", "Count", "Current", "Stock"],
  backup: ["Backup", "Back Up", "Back Stock", "Reserve", "Storage"],
  cutoff: [
    "Cutoff Limit",
    "Cutoff",
    "Cut off",
    "Cut-off",
    "Min",
    "Minimum",
    "Reorder Point",
    "Reorder Level",
  ],
  warning: ["Warning Level", "Warning", "Warn", "Low Level", "Low Stock"],
  par: ["Par Level", "Par", "Target", "Max", "Order Up To"],
  notes: ["Notes", "Note", "Comments", "Comment", "Remarks"],
};

const FIELD_BY_ALIAS = new Map<string, ImportField>(
  IMPORT_FIELDS.flatMap((field) =>
    ALIASES[field].map((alias) => [nameKey(alias)!, field] as const),
  ),
);

export type HeaderMapping = {
  /** For each file column, the field it feeds (null = ignored). */
  mapping: (ImportField | null)[];
  /** The header text, cleaned, for showing the mapping. */
  labels: string[];
  /** Required fields no column feeds. */
  missing: ImportField[];
  /** File columns whose header matched nothing (and had text). */
  unmapped: string[];
  /** A field that more than one column matched: the first is used. */
  duplicates: { field: ImportField; columns: string[] }[];
};

/**
 * Matches the file's headers to the template (case, spacing and punctuation
 * ignored, with the aliases above). `overrides` is the manager's own choice
 * per column index (a field, or null to ignore the column) from the
 * column-mapping step; it wins over the automatic match.
 */
export function mapHeaders(
  header: readonly string[],
  overrides: Readonly<Record<number, ImportField | null>> = {},
): HeaderMapping {
  const labels = header.map((cell) => cleanText(cell));
  const auto = labels.map(
    (label) => FIELD_BY_ALIAS.get(nameKey(label) ?? "") ?? null,
  );
  const mapping = labels.map((_, index): ImportField | null =>
    index in overrides ? overrides[index] : auto[index],
  );

  const used = new Map<ImportField, number[]>();
  mapping.forEach((field, index) => {
    if (field) used.set(field, [...(used.get(field) ?? []), index]);
  });

  const duplicates: HeaderMapping["duplicates"] = [];
  for (const [field, columns] of used) {
    if (columns.length < 2) continue;
    duplicates.push({ field, columns: columns.map((i) => labels[i]) });
    // The first column keeps the field; the rest are ignored.
    columns.slice(1).forEach((i) => (mapping[i] = null));
  }

  return {
    mapping,
    labels,
    missing: REQUIRED_IMPORT_FIELDS.filter((field) => !used.has(field)),
    // Headers with text that matched nothing and that the manager did not map.
    unmapped: labels.filter(
      (label, i) => label !== "" && auto[i] === null && !(i in overrides),
    ),
    duplicates,
  };
}
