import type {
  CatalogState,
  HistoryEntry,
  HistorySource,
} from "./inventory-types";
import { unitDisplay } from "./inventory-types";
import {
  ADJUSTMENT_REASON_LABELS,
  fromCents,
  STATUS_LABEL,
  toCents,
} from "./stock-rules";
import type { ColumnSpec, SortKey } from "./table-filters";

export const SOURCE_LABELS: Record<HistorySource, string> = {
  manual_edit: "Manual edit",
  bulk_import: "Bulk import",
  delivery: "Delivery",
  count: "Stock count",
  receiving: "Receiving",
  system: "System",
};

/** One line of the History table: a ledger entry plus the item's labels. */
export type HistoryRow = {
  id: string;
  at: string;
  productId: string;
  vendor: string;
  item: string;
  size: string | null;
  unit: string;
  category: string | null;
  subcategory: string | null;
  /** The product has since been archived (its history stays). */
  archived: boolean;
  reason: string;
  source: string;
  prevOnHand: number;
  newOnHand: number;
  deltaOnHand: number;
  prevBackup: number;
  newBackup: number;
  deltaBackup: number;
  actor: string | null;
  note: string | null;
  importBatch: string | null;
  statusAfter: string;
};

const delta = (next: number, prev: number) =>
  fromCents(toCents(next) - toCents(prev));

/**
 * Joins ledger entries to the current catalog by the product's stable id and
 * returns them newest first. Entries stay readable after a product is
 * renamed, moved, or archived: the product row is never deleted, so the join
 * always resolves. (Labels are the item's current ones; the ledger does not
 * snapshot them.)
 */
export function buildHistoryRows(
  entries: readonly HistoryEntry[],
  catalog: Pick<
    CatalogState,
    "vendors" | "categories" | "subcategories" | "products"
  >,
): HistoryRow[] {
  const vendors = new Map(catalog.vendors.map((v) => [v.id, v.name]));
  const categories = new Map(catalog.categories.map((c) => [c.id, c.name]));
  const subcategories = new Map(
    catalog.subcategories.map((s) => [s.id, s.name]),
  );
  const products = new Map(catalog.products.map((p) => [p.id, p]));

  return entries
    .map((entry): HistoryRow => {
      const product = products.get(entry.productId);
      return {
        id: entry.id,
        at: entry.at,
        productId: entry.productId,
        vendor: product
          ? (vendors.get(product.vendorId) ?? "Unassigned")
          : "Unknown",
        item: product?.name ?? "Unknown item",
        size: product?.size ?? null,
        unit: product ? unitDisplay(product.unitType, product.unitLabel) : "—",
        category: product?.categoryId
          ? (categories.get(product.categoryId) ?? null)
          : null,
        subcategory: product?.subcategoryId
          ? (subcategories.get(product.subcategoryId) ?? null)
          : null,
        archived: product ? !product.active : false,
        reason: ADJUSTMENT_REASON_LABELS[entry.reason],
        source: SOURCE_LABELS[entry.source],
        prevOnHand: entry.prevOnHand,
        newOnHand: entry.newOnHand,
        deltaOnHand: delta(entry.newOnHand, entry.prevOnHand),
        prevBackup: entry.prevBackup,
        newBackup: entry.newBackup,
        deltaBackup: delta(entry.newBackup, entry.prevBackup),
        actor: entry.actorName,
        note: entry.note,
        importBatch: entry.importBatchId,
        statusAfter: STATUS_LABEL[entry.statusAfter],
      };
    })
    .sort(compareNewestFirst);
}

/** Newest first; the ledger id (a sequence) breaks ties so equal timestamps stay stable. */
function compareNewestFirst(a: HistoryRow, b: HistoryRow): number {
  return b.at.localeCompare(a.at) || Number(b.id) - Number(a.id);
}

/** "+4", "−2", "0": a sign is always shown so direction reads at a glance. */
export function signedQuantity(value: number): string {
  if (value === 0) return "0";
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/**
 * The filterable columns of History. Pure (no rendering) so the browser and a
 * later server export parse and apply the same filters.
 */
export const HISTORY_COLUMNS: ColumnSpec<HistoryRow>[] = [
  { id: "at", label: "Date / time", type: "date", get: (r) => r.at },
  {
    id: "vendor",
    label: "Vendor",
    type: "select",
    searchable: true,
    get: (r) => r.vendor,
  },
  {
    id: "item",
    label: "Item",
    type: "text",
    searchable: true,
    get: (r) => r.item,
  },
  {
    id: "category",
    label: "Category",
    type: "select",
    get: (r) => r.category,
  },
  {
    id: "subcategory",
    label: "Subcategory",
    type: "select",
    get: (r) => r.subcategory,
  },
  { id: "size", label: "Size", type: "select", get: (r) => r.size },
  { id: "unit", label: "Unit", type: "select", get: (r) => r.unit },
  { id: "reason", label: "Reason", type: "select", get: (r) => r.reason },
  { id: "source", label: "Source", type: "select", get: (r) => r.source },
  {
    id: "prevOnHand",
    label: "Previous on hand",
    type: "number",
    get: (r) => r.prevOnHand,
  },
  {
    id: "newOnHand",
    label: "New on hand",
    type: "number",
    get: (r) => r.newOnHand,
  },
  {
    id: "deltaOnHand",
    label: "Δ On hand",
    type: "number",
    get: (r) => r.deltaOnHand,
  },
  {
    id: "prevBackup",
    label: "Previous backup",
    type: "number",
    get: (r) => r.prevBackup,
  },
  {
    id: "newBackup",
    label: "New backup",
    type: "number",
    get: (r) => r.newBackup,
  },
  {
    id: "deltaBackup",
    label: "Δ Backup",
    type: "number",
    get: (r) => r.deltaBackup,
  },
  { id: "actor", label: "Actor", type: "select", get: (r) => r.actor },
  {
    id: "note",
    label: "Note",
    type: "text",
    searchable: true,
    get: (r) => r.note,
  },
  {
    id: "importBatch",
    label: "Import batch",
    type: "text",
    get: (r) => r.importBatch,
  },
];

export const HISTORY_DEFAULT_SORT: SortKey[] = [{ id: "at", dir: "desc" }];

export const HISTORY_SORT_PRESETS = [
  { label: "Newest first", keys: HISTORY_DEFAULT_SORT },
  { label: "Oldest first", keys: [{ id: "at", dir: "asc" as const }] },
  {
    label: "Item, then newest",
    keys: [
      { id: "item", dir: "asc" as const },
      { id: "at", dir: "desc" as const },
    ],
  },
  {
    label: "Vendor, then newest",
    keys: [
      { id: "vendor", dir: "asc" as const },
      { id: "at", dir: "desc" as const },
    ],
  },
  {
    label: "Biggest decrease first",
    keys: [{ id: "deltaOnHand", dir: "asc" as const }],
  },
  {
    label: "Biggest increase first",
    keys: [{ id: "deltaOnHand", dir: "desc" as const }],
  },
];

type CountChange = Pick<
  HistoryRow,
  "prevOnHand" | "newOnHand" | "prevBackup" | "newBackup"
>;

/** "On hand 6 → 4 (−2)", plus the backup change when there was one. */
export function changeSummary(change: CountChange): string {
  const parts: string[] = [];
  if (change.prevOnHand !== change.newOnHand) {
    parts.push(
      `On hand ${change.prevOnHand} → ${change.newOnHand} (${signedQuantity(
        delta(change.newOnHand, change.prevOnHand),
      )})`,
    );
  }
  if (change.prevBackup !== change.newBackup) {
    parts.push(
      `Backup ${change.prevBackup} → ${change.newBackup} (${signedQuantity(
        delta(change.newBackup, change.prevBackup),
      )})`,
    );
  }
  return parts.join(" · ");
}
