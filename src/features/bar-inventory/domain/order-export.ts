import {
  exportFilename,
  sheetToCsv,
  type ExportCell,
  type ExportDocument,
  type ExportSheet,
} from "@/lib/export/document";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

import { needsOrdering } from "./dashboard";
import type { InventoryRow } from "./inventory-rows";
import {
  groupByVendor,
  ORDER_SOON_COLUMNS,
  type VendorGroup,
} from "./order-soon";
import { STATUS_LABEL } from "./stock-rules";
import {
  activeFilterCount,
  applyFilters,
  parseTableState,
} from "./table-filters";

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

const SUMMARY_HEADER = [
  "Vendor",
  "Items needing attention",
  "Critical",
  "Low",
  "Suggested total",
  "Items with no Par (order needed)",
];

function itemRow(item: InventoryRow): ExportCell[] {
  return [
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
  ];
}

function summaryRow(group: VendorGroup): ExportCell[] {
  return [
    group.vendor,
    group.critical + group.low,
    group.critical,
    group.low,
    group.suggestedTotal,
    group.orderNeeded,
  ];
}

/**
 * Vendor order recommendations for exactly the items the on-screen filters
 * leave. `filters` is the table's serialized state (the same string the URL
 * carries); it is parsed and applied here from the authorized rows, so the
 * caller never supplies the rows and a hidden row cannot be smuggled in.
 *
 * CSV is one flat table with a Vendor column; XLSX is a Summary sheet plus one
 * sheet per vendor.
 */
export function recommendationsDocument(input: {
  rows: readonly InventoryRow[];
  filters: string;
  timeZone: string;
  now: Date;
}): { document: ExportDocument; rowCount: number; filtered: boolean } {
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
  const groups = groupByVendor(visible);

  const flat: ExportSheet = {
    name: "Order recommendations",
    header: HEADER,
    rows: groups.flatMap((group) => group.items.map(itemRow)),
  };
  const summary: ExportSheet = {
    name: "Summary",
    header: SUMMARY_HEADER,
    rows: groups.map(summaryRow),
  };
  const perVendor: ExportSheet[] = groups.map((group) => ({
    name: group.vendor,
    header: HEADER,
    rows: group.items.map(itemRow),
  }));

  return {
    document: { csv: flat, sheets: [summary, ...perVendor] },
    rowCount: flat.rows.length,
    filtered: activeFilterCount(state) > 0,
  };
}

/** The CSV file for the same request (kept as its own function for callers that only want CSV). */
export function buildRecommendationsExport(input: {
  rows: readonly InventoryRow[];
  filters: string;
  timeZone: string;
  now: Date;
  slug: string;
}): RecommendationsExport {
  const { document, rowCount } = recommendationsDocument(input);
  return {
    filename: exportFilename({
      slug: input.slug,
      what: "order-recommendations",
      date: zonedWallTimeFromInstant(input.now, input.timeZone).date,
      format: "csv",
    }),
    csv: sheetToCsv(document.csv),
    rowCount,
  };
}
