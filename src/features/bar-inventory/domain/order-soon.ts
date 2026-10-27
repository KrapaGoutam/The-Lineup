import { needsOrdering } from "./dashboard";
import type { InventoryRow } from "./inventory-rows";
import { fromCents, STATUS_LABEL, toCents } from "./stock-rules";
import type { ColumnSpec } from "./table-filters";

/**
 * The filterable columns of Order soon. Pure (no rendering) so the browser
 * and the export handler parse and apply the same filters.
 */
export const ORDER_SOON_COLUMNS: ColumnSpec<InventoryRow>[] = [
  {
    id: "vendor",
    label: "Vendor",
    type: "select",
    searchable: true,
    get: (r) => r.vendor,
  },
  {
    id: "name",
    label: "Name",
    type: "text",
    searchable: true,
    get: (r) => r.name,
  },
  { id: "size", label: "Size", type: "select", get: (r) => r.size },
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
  { id: "total", label: "Total", type: "number", get: (r) => r.total },
  { id: "cutoff", label: "Cutoff", type: "number", get: (r) => r.cutoff },
  {
    id: "warning",
    label: "Warning",
    type: "number",
    get: (r) => r.effectiveWarning,
  },
  { id: "par", label: "Par", type: "number", get: (r) => r.par },
  {
    id: "suggested",
    label: "Suggested order",
    type: "number",
    get: (r) => r.suggestedOrder,
  },
  {
    id: "status",
    label: "Status",
    type: "select",
    get: (r) => STATUS_LABEL[r.status],
  },
];

export type VendorGroup = {
  vendor: string;
  /** Critical, then Low, then closest to cutoff. */
  items: InventoryRow[];
  critical: number;
  low: number;
  /** Sum of the computed quantities (Par − Total). */
  suggestedTotal: number;
  /** Items with no Par: they say "Order needed", never an invented number. */
  orderNeeded: number;
};

/**
 * Critical and Low items grouped by vendor. Vendors with the most Critical
 * items come first, then the most Low, then by name.
 */
export function groupByVendor(rows: readonly InventoryRow[]): VendorGroup[] {
  const byVendor = new Map<string, InventoryRow[]>();
  for (const row of needsOrdering(rows)) {
    const list = byVendor.get(row.vendor);
    if (list) list.push(row);
    else byVendor.set(row.vendor, [row]);
  }
  return [...byVendor.entries()]
    .map(([vendor, items]): VendorGroup => {
      const cents = items.reduce(
        (sum, item) =>
          item.orderNeeded || item.suggestedOrder === null
            ? sum
            : sum + toCents(item.suggestedOrder),
        0,
      );
      return {
        vendor,
        items,
        critical: items.filter((i) => i.status === "critical").length,
        low: items.filter((i) => i.status === "low").length,
        suggestedTotal: fromCents(cents),
        orderNeeded: items.filter((i) => i.orderNeeded).length,
      };
    })
    .sort(
      (a, b) =>
        b.critical - a.critical ||
        b.low - a.low ||
        a.vendor.localeCompare(b.vendor),
    );
}
