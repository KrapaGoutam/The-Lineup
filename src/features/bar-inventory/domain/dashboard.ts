import type { InventoryRow } from "./inventory-rows";
import { statusRank, type StockStatus } from "./stock-rules";
import {
  applyFilters,
  type ColumnSpec,
  type FilterContext,
  type FilterValue,
  type TableState,
} from "./table-filters";

/** The six Dashboard tiles. Counts come from the same rows the tables show. */
export type DashboardKpis = {
  active: number;
  critical: number;
  low: number;
  healthy: number;
  noCutoff: number;
  /** Active items whose stock row changed in the last 7 days (location time). */
  recentlyChanged: number;
};

export const RECENT_FILTER: FilterValue = { type: "date", preset: "7d" };

/** Matches the Inventory table's "Last updated" column, so the tile and its drill-down agree. */
const UPDATED_COLUMN: ColumnSpec<InventoryRow> = {
  id: "updated",
  label: "Last updated",
  type: "date",
  get: (row) => row.updatedAt,
};

export function isActiveRow(row: InventoryRow): boolean {
  return row.status !== "archived";
}

export function recentlyChangedRows(
  rows: readonly InventoryRow[],
  ctx: FilterContext,
): InventoryRow[] {
  return applyFilters(
    rows.filter(isActiveRow),
    [UPDATED_COLUMN],
    { filters: { updated: RECENT_FILTER }, search: "" },
    ctx,
  ).sort(
    (a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") ||
      a.name.localeCompare(b.name),
  );
}

export function buildKpis(
  rows: readonly InventoryRow[],
  ctx: FilterContext,
): DashboardKpis {
  const active = rows.filter(isActiveRow);
  const count = (status: StockStatus) =>
    active.filter((row) => row.status === status).length;
  return {
    active: active.length,
    critical: count("critical"),
    low: count("low"),
    healthy: count("healthy"),
    noCutoff: count("no_cutoff"),
    recentlyChanged: recentlyChangedRows(rows, ctx).length,
  };
}

/**
 * Critical and Low items, most urgent first: Critical, then Low, then the
 * item closest to (or furthest below) its cutoff, then vendor and name.
 */
export function needsOrdering(rows: readonly InventoryRow[]): InventoryRow[] {
  // Critical and Low both have a cutoff; the fallback only keeps the type total.
  const toCutoff = (row: InventoryRow) =>
    Math.round((row.total - (row.cutoff ?? row.total)) * 100);
  return rows
    .filter((row) => row.status === "critical" || row.status === "low")
    .sort(
      (a, b) =>
        statusRank(a.status) - statusRank(b.status) ||
        toCutoff(a) - toCutoff(b) ||
        a.vendor.localeCompare(b.vendor) ||
        a.name.localeCompare(b.name),
    );
}

export type DashboardTile =
  | "active"
  | "critical"
  | "low"
  | "healthy"
  | "noCutoff"
  | "recent";

const STATUS_FOR_TILE: Partial<Record<DashboardTile, string>> = {
  critical: "Critical",
  low: "Low",
  healthy: "Healthy",
  noCutoff: "No cutoff",
};

/**
 * The Inventory table state a tile opens: the same status or date filter that
 * produced the tile's number, so the drill-down count equals the tile.
 */
export function tileDrillDown(tile: DashboardTile): TableState {
  const status = STATUS_FOR_TILE[tile];
  if (status) {
    return {
      filters: { status: { type: "select", values: [status] } },
      sort: [],
      search: "",
    };
  }
  if (tile === "recent") {
    return {
      filters: { updated: RECENT_FILTER },
      sort: [{ id: "updated", dir: "desc" }],
      search: "",
    };
  }
  return { filters: {}, sort: [], search: "" };
}
