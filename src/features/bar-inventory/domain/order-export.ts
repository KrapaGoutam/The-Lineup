import { toCsv, type CsvCell } from "@/lib/csv/write";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

import { needsOrdering } from "./dashboard";
import type { InventoryRow } from "./inventory-rows";
import { groupByVendor, ORDER_SOON_COLUMNS } from "./order-soon";
import { STATUS_LABEL } from "./stock-rules";
import { applyFilters, parseTableState } from "./table-filters";

export type RecommendationsExport = {
  filename: string;
  csv: string;
  /** Item rows written (the header is not counted). */
  rowCount: number;
};

const HEADER = [
  "Vendor",
  "Item",
  "Size",
  "Unit",
  "SKU",
  "Category",
  "Subcategory",
  "Status",
  "Total",
  "Cutoff",
  "Warning",
  "Par",
  "Suggested order",
];

/**
 * Vendor order recommendations as CSV, for exactly the items the on-screen
 * filters leave. `filters` is the table's serialized state (the same string
 * the URL carries); it is parsed and applied here from the authorized rows, so
 * the caller never supplies the rows and a hidden row cannot be smuggled in.
 */
export function buildRecommendationsExport(input: {
  rows: readonly InventoryRow[];
  /** Serialized table state, e.g. `f.status=s:Critical&q=tito`. */
  filters: string;
  timeZone: string;
  now: Date;
  slug: string;
}): RecommendationsExport {
  const state = parseTableState(
    new URLSearchParams(input.filters),
    ORDER_SOON_COLUMNS,
  );
  const visible = applyFilters(
    needsOrdering(input.rows),
    ORDER_SOON_COLUMNS,
    state,
    { timeZone: input.timeZone, now: input.now },
  );

  const body: CsvCell[][] = [];
  for (const group of groupByVendor(visible)) {
    for (const item of group.items) {
      body.push([
        item.vendor,
        item.name,
        item.size,
        item.unit,
        item.sku,
        item.category,
        item.subcategory,
        STATUS_LABEL[item.status],
        item.total,
        item.cutoff,
        item.effectiveWarning,
        item.par,
        // A number only when Par makes it computable; never an invented one.
        item.orderNeeded ? "Order needed" : item.suggestedOrder,
      ]);
    }
  }

  const date = zonedWallTimeFromInstant(input.now, input.timeZone).date;
  return {
    filename: `bar-inventory_${input.slug}_order-recommendations_${date}.csv`,
    csv: toCsv([HEADER, ...body]),
    rowCount: body.length,
  };
}
