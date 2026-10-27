import {
  unitDisplay,
  type CatalogState,
  type ProductView,
  type StockView,
} from "./inventory-types";
import { evaluateStock, statusRank, type StockStatus } from "./stock-rules";
import type { ColumnSpec, SortKey } from "./table-filters";

/** One line of the Inventory table: a product joined with its stock. */
export type InventoryRow = {
  productId: string;
  vendor: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  size: string | null;
  unit: string;
  sku: string | null;
  notes: string | null;
  onHand: number;
  backup: number;
  total: number;
  cutoff: number | null;
  warning: number | null;
  par: number | null;
  effectiveWarning: number | null;
  status: StockStatus;
  suggestedOrder: number | null;
  orderNeeded: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Version of the stock row, for optimistic concurrency. */
  stockVersion: number;
};

const ZERO_STOCK = (productId: string): StockView => ({
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
});

export function buildInventoryRow(
  product: ProductView,
  stock: StockView,
  names: {
    vendor: string;
    category: string | null;
    subcategory: string | null;
  },
): InventoryRow {
  const evaluation = evaluateStock(stock, { archived: !product.active });
  return {
    productId: product.id,
    vendor: names.vendor,
    name: product.name,
    category: names.category,
    subcategory: names.subcategory,
    size: product.size,
    unit: unitDisplay(product.unitType, product.unitLabel),
    sku: product.sku,
    notes: product.notes,
    onHand: stock.onHand,
    backup: stock.backup,
    total: evaluation.total,
    cutoff: stock.cutoff,
    warning: stock.warning,
    par: stock.par,
    effectiveWarning: evaluation.effectiveWarning,
    status: evaluation.status,
    suggestedOrder: evaluation.suggestedOrder,
    orderNeeded: evaluation.orderNeeded,
    updatedAt: stock.updatedAt,
    updatedBy: stock.updatedByName,
    stockVersion: stock.version,
  };
}

export function buildInventoryRows(state: CatalogState): InventoryRow[] {
  const vendors = new Map(state.vendors.map((v) => [v.id, v.name]));
  const categories = new Map(state.categories.map((c) => [c.id, c.name]));
  const subcategories = new Map(state.subcategories.map((s) => [s.id, s.name]));
  const stock = new Map(state.stock.map((s) => [s.productId, s]));
  return state.products.map((product) =>
    buildInventoryRow(
      product,
      stock.get(product.id) ?? ZERO_STOCK(product.id),
      {
        vendor: vendors.get(product.vendorId) ?? "Unassigned",
        category: product.categoryId
          ? (categories.get(product.categoryId) ?? null)
          : null,
        subcategory: product.subcategoryId
          ? (subcategories.get(product.subcategoryId) ?? null)
          : null,
      },
    ),
  );
}

/** Sortable but not shown: severity order and distance to the cutoff. */
export const INVENTORY_SORT_ONLY_COLUMNS: ColumnSpec<InventoryRow>[] = [
  {
    id: "severity",
    label: "Severity",
    type: "number",
    get: (row) => statusRank(row.status),
  },
  {
    id: "toCutoff",
    label: "Distance to cutoff",
    type: "number",
    get: (row) =>
      row.cutoff === null
        ? null
        : Math.round((row.total - row.cutoff) * 100) / 100,
  },
];

export const INVENTORY_DEFAULT_SORT: SortKey[] = [
  { id: "severity", dir: "asc" },
  { id: "name", dir: "asc" },
];

export const INVENTORY_SORT_PRESETS = [
  { label: "Critical first", keys: INVENTORY_DEFAULT_SORT },
  { label: "Name A–Z", keys: [{ id: "name", dir: "asc" as const }] },
  {
    label: "Vendor, then name",
    keys: [
      { id: "vendor", dir: "asc" as const },
      { id: "name", dir: "asc" as const },
    ],
  },
  { label: "Lowest stock first", keys: [{ id: "total", dir: "asc" as const }] },
  {
    label: "Closest to cutoff",
    keys: [{ id: "toCutoff", dir: "asc" as const }],
  },
  {
    label: "Recently updated",
    keys: [{ id: "updated", dir: "desc" as const }],
  },
];
