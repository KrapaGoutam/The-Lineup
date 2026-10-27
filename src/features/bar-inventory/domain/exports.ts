import {
  exportFilename,
  type ExportCell,
  type ExportDocument,
  type ExportFormat,
  type ExportSheet,
} from "@/lib/export/document";
import { formatBusinessDateTime } from "@/lib/date-time";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

import {
  ANALYTICS_ITEM_COLUMNS,
  ANALYTICS_SORT_PRESETS,
  buildItemAnalytics,
  type DateWindow,
} from "./analytics";
import {
  buildHistoryRows,
  HISTORY_COLUMNS,
  HISTORY_DEFAULT_SORT,
} from "./history";
import {
  buildInventoryRows,
  INVENTORY_COLUMNS,
  INVENTORY_DEFAULT_SORT,
  INVENTORY_SORT_ONLY_COLUMNS,
} from "./inventory-rows";
import type { CatalogState, HistoryEntry } from "./inventory-types";
import { recommendationsDocument } from "./order-export";
import { STATUS_LABEL } from "./stock-rules";
import {
  activeFilterCount,
  applyFilters,
  parseTableState,
  sortRows,
  type ColumnSpec,
  type TableState,
} from "./table-filters";

/** What to export. `filters` is the table's serialized state, never rows. */
export type ExportRequest =
  | { kind: "inventory"; filters: string }
  | { kind: "history"; filters: string; days: number }
  | { kind: "recommendations"; filters: string }
  | {
      kind: "analytics";
      filters: string;
      window: DateWindow;
      includeObserved: boolean;
      includeShrink: boolean;
    };

export type ExportKind = ExportRequest["kind"];

export type ExportData = {
  catalog: Pick<
    CatalogState,
    "vendors" | "categories" | "subcategories" | "products" | "stock"
  >;
  /** Needed for history and analytics only. */
  entries: readonly HistoryEntry[];
};

export type ExportContext = { timeZone: string; now: Date; slug: string };

export type PreparedExport = {
  filename: string;
  document: ExportDocument;
  rowCount: number;
};

const MS_PER_DAY = 86_400_000;

export const exportNeedsLedger = (kind: ExportKind): boolean =>
  kind === "history" || kind === "analytics";

function single(sheet: ExportSheet): ExportDocument {
  return { csv: sheet, sheets: [sheet] };
}

function stateFor<Row>(
  filters: string,
  columns: readonly ColumnSpec<Row>[],
): TableState {
  return parseTableState(new URLSearchParams(filters), columns);
}

/** Filters, then the table's own sort (or its default), exactly as the screen does. */
function select<Row>(
  rows: readonly Row[],
  columns: readonly ColumnSpec<Row>[],
  state: TableState,
  defaultSort: TableState["sort"],
  ctx: ExportContext,
): Row[] {
  return sortRows(
    applyFilters(rows, columns, state, {
      timeZone: ctx.timeZone,
      now: ctx.now,
    }),
    columns,
    state.sort.length > 0 ? state.sort : defaultSort,
  );
}

const local = (iso: string, ctx: ExportContext) =>
  formatBusinessDateTime(iso, ctx.timeZone);

function inventoryDocument(
  data: ExportData,
  filters: string,
  ctx: ExportContext,
) {
  const columns = [...INVENTORY_COLUMNS, ...INVENTORY_SORT_ONLY_COLUMNS];
  const state = stateFor(filters, columns);
  const rows = select(
    buildInventoryRows(data.catalog).filter((r) => r.status !== "archived"),
    columns,
    state,
    INVENTORY_DEFAULT_SORT,
    ctx,
  );
  const notes = new Map(data.catalog.products.map((p) => [p.id, p.notes]));
  const sheet: ExportSheet = {
    name: "Inventory",
    header: [
      "Vendor",
      "Name",
      "Category",
      "Subcategory",
      "Size",
      "Unit",
      "SKU",
      "On hand",
      "Backup",
      "Total",
      "Cutoff",
      "Warning",
      "Par",
      "Status",
      "Suggested order",
      "Last updated (ISO)",
      "Last updated (local)",
      "Updated by",
      "Notes",
    ],
    rows: rows.map((r): ExportCell[] => [
      r.vendor,
      r.name,
      r.category,
      r.subcategory,
      r.size,
      r.unit,
      r.sku,
      r.onHand,
      r.backup,
      r.total,
      r.cutoff,
      r.warning,
      r.par,
      STATUS_LABEL[r.status],
      r.orderNeeded ? "Order needed" : r.suggestedOrder,
      r.updatedAt,
      r.updatedAt ? local(r.updatedAt, ctx) : null,
      r.updatedBy,
      notes.get(r.productId) ?? null,
    ]),
  };
  return {
    document: single(sheet),
    rowCount: rows.length,
    filtered: activeFilterCount(state) > 0,
  };
}

function historyDocument(
  data: ExportData,
  filters: string,
  days: number,
  ctx: ExportContext,
) {
  const state = stateFor(filters, HISTORY_COLUMNS);
  const since = days === 0 ? 0 : ctx.now.getTime() - days * MS_PER_DAY;
  const rows = select(
    buildHistoryRows(
      data.entries.filter((e) => Date.parse(e.at) >= since),
      data.catalog,
    ),
    HISTORY_COLUMNS,
    state,
    HISTORY_DEFAULT_SORT,
    ctx,
  );
  const sheet: ExportSheet = {
    name: "Inventory history",
    header: [
      "Date (ISO)",
      "Date (local)",
      "Vendor",
      "Item",
      "Size",
      "Unit",
      "Category",
      "Subcategory",
      "Reason",
      "Source",
      "Previous on hand",
      "New on hand",
      "Change on hand",
      "Previous backup",
      "New backup",
      "Change backup",
      "Status after",
      "Actor",
      "Note",
      "Import batch",
    ],
    rows: rows.map((r): ExportCell[] => [
      r.at,
      local(r.at, ctx),
      r.vendor,
      r.item,
      r.size,
      r.unit,
      r.category,
      r.subcategory,
      r.reason,
      r.source,
      r.prevOnHand,
      r.newOnHand,
      r.deltaOnHand,
      r.prevBackup,
      r.newBackup,
      r.deltaBackup,
      r.statusAfter,
      r.actor,
      r.note,
      r.importBatch,
    ]),
  };
  return {
    document: single(sheet),
    rowCount: rows.length,
    filtered: activeFilterCount(state) > 0,
  };
}

function analyticsDocument(
  data: ExportData,
  request: Extract<ExportRequest, { kind: "analytics" }>,
  ctx: ExportContext,
) {
  const state = stateFor(request.filters, ANALYTICS_ITEM_COLUMNS);
  const items = select(
    buildItemAnalytics(data.entries, buildInventoryRows(data.catalog), {
      window: request.window,
      includeObserved: request.includeObserved,
      includeShrink: request.includeShrink,
      timeZone: ctx.timeZone,
      now: ctx.now,
    }),
    ANALYTICS_ITEM_COLUMNS,
    state,
    ANALYTICS_SORT_PRESETS[0].keys,
    ctx,
  );
  const sheet: ExportSheet = {
    name: "Analytics",
    header: [
      "Vendor",
      "Item",
      "Size",
      "Unit",
      "Category",
      "Subcategory",
      "Current stock",
      "Confirmed usage",
      "Observed depletion",
      "Breakage and comps",
      "Depletion counted",
      "Depletion events",
      "Average per day",
      "Average per week",
      "Par turns per week",
      "Restocked quantity",
      "Restock count",
      "Cutoff hits",
      "Days to cutoff",
      "Data",
      "Status",
      "Period from",
      "Period to",
    ],
    rows: items.map((i): ExportCell[] => [
      i.vendor,
      i.item,
      i.size,
      i.unit,
      i.category,
      i.subcategory,
      i.currentTotal,
      i.confirmedUsage,
      i.observedDepletion,
      i.shrink,
      i.depletion,
      i.depletionEvents,
      i.perDay,
      i.perWeek,
      i.parTurnsPerWeek,
      i.restockQuantity,
      i.restockCount,
      i.cutoffHits,
      i.daysToCutoffText,
      i.evidence,
      i.status,
      request.window.from,
      request.window.to,
    ]),
  };
  return {
    document: single(sheet),
    rowCount: items.length,
    filtered: activeFilterCount(state) > 0,
  };
}

/**
 * Builds the file for one export request, in one place for the browser (demo)
 * and the server action: the filters are re-applied here to rows the caller
 * is authorized to read, so a file always equals what the screen shows.
 */
export function prepareExport(
  request: ExportRequest,
  data: ExportData,
  ctx: ExportContext,
  format: ExportFormat,
): PreparedExport {
  const built =
    request.kind === "inventory"
      ? inventoryDocument(data, request.filters, ctx)
      : request.kind === "history"
        ? historyDocument(data, request.filters, request.days, ctx)
        : request.kind === "analytics"
          ? analyticsDocument(data, request, ctx)
          : recommendationsDocument({
              rows: buildInventoryRows(data.catalog),
              filters: request.filters,
              timeZone: ctx.timeZone,
              now: ctx.now,
            });
  const what =
    request.kind === "recommendations" ? "order-recommendations" : request.kind;
  return {
    filename: exportFilename({
      slug: ctx.slug,
      what: built.filtered ? `${what}-filtered` : what,
      date: zonedWallTimeFromInstant(ctx.now, ctx.timeZone).date,
      format,
    }),
    document: built.document,
    rowCount: built.rowCount,
  };
}
