"use client";

import {
  Boxes,
  CheckCircle2,
  CircleDashed,
  Clock,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { formatBusinessDateTime } from "@/lib/date-time";
import { cn } from "@/lib/utils";

import {
  buildKpis,
  needsOrdering,
  recentlyChangedRows,
  tileDrillDown,
  type DashboardTile,
} from "../domain/dashboard";
import {
  buildInventoryRows,
  type InventoryRow,
} from "../domain/inventory-rows";
import type { CatalogSnapshot } from "../domain/inventory-types";
import type { TableState } from "../domain/table-filters";
import { AnalyticsInsights } from "./analytics-insights";
import { formatQuantity } from "./editable-cell";
import type { LoadHistory } from "./history-view";
import type { RunExport } from "./export-control";
import { OrderSoon, type OrderDraftCta } from "./order-soon";
import {
  FilterableTable,
  type TableColumn,
} from "./table-kit/filterable-table";
import { STATUS_LABEL, StatusBadge } from "./table-kit/status-badge";
import { FreshnessDashboard } from "./freshness-dashboard";
import { businessDate } from "../domain/freshness";

type Tile = {
  id: DashboardTile;
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
  value: (kpis: ReturnType<typeof buildKpis>) => number;
};

const TILES: Tile[] = [
  {
    id: "active",
    label: "Active items",
    hint: "all products being counted",
    icon: Boxes,
    tone: "",
    value: (k) => k.active,
  },
  {
    id: "critical",
    label: "Critical",
    hint: "at or below cutoff",
    icon: OctagonAlert,
    tone: "border-destructive/40 text-destructive",
    value: (k) => k.critical,
  },
  {
    id: "low",
    label: "Low",
    hint: "approaching cutoff",
    icon: TriangleAlert,
    tone: "border-warn/40 text-warn",
    value: (k) => k.low,
  },
  {
    id: "healthy",
    label: "Healthy",
    hint: "above the warning level",
    icon: CheckCircle2,
    tone: "border-ok/40 text-ok",
    value: (k) => k.healthy,
  },
  {
    id: "noCutoff",
    label: "No cutoff",
    hint: "cutoff not set yet",
    icon: CircleDashed,
    tone: "",
    value: (k) => k.noCutoff,
  },
  {
    id: "recent",
    label: "Recently changed",
    hint: "last 7 days",
    icon: Clock,
    tone: "",
    value: (k) => k.recentlyChanged,
  },
];

function KpiTile({
  tile,
  count,
  onOpen,
}: {
  tile: Tile;
  count: number;
  onOpen: () => void;
}) {
  const Icon = tile.icon;
  return (
    <button
      type="button"
      data-testid={`kpi-${tile.id}`}
      aria-label={`${tile.label}: ${count}. Open these in Inventory`}
      onClick={onOpen}
      className={cn(
        "border-border bg-card hover:bg-muted/40 focus-visible:ring-ring flex min-h-20 min-w-0 flex-col items-start justify-between gap-1 rounded-xl border p-3 text-left outline-none focus-visible:ring-2",
        tile.tone,
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {tile.label}
      </span>
      <span className="text-foreground text-2xl leading-none font-bold tabular-nums">
        {count}
      </span>
      <span className="text-muted-foreground text-xs">{tile.hint}</span>
    </button>
  );
}

function ItemCard({ row, detail }: { row: InventoryRow; detail: string }) {
  return (
    <article
      aria-label={row.name}
      className="border-border bg-card flex flex-col gap-1.5 rounded-xl border p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            {row.name}
            {row.size ? ` ${row.size}` : ""}
          </h3>
          <p className="text-muted-foreground text-xs">{row.vendor}</p>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <p className="text-sm">{detail}</p>
    </article>
  );
}

/**
 * Dashboard: the six tiles, what needs ordering, what changed recently.
 * The movement insights come from the ledger-based analytics and say so when
 * the data cannot yet support a ranking.
 */
export function DashboardView({
  snapshot,
  restaurantSlug,
  timeZone,
  onOpenInventory,
  runExport,
  onOpenHistory,
  onOpenAnalytics,
  loadHistory,
  draftCta = null,
}: {
  snapshot: CatalogSnapshot;
  restaurantSlug: string;
  timeZone: string;
  onOpenInventory: (state: TableState) => void;
  runExport: RunExport;
  onOpenHistory: () => void;
  onOpenAnalytics: () => void;
  loadHistory: LoadHistory;
  /** Create / Open Order Draft on each vendor of Order soon. */
  draftCta?: OrderDraftCta | null;
}) {
  const today = businessDate(new Date(), timeZone);
  const rows = useMemo(
    () => buildInventoryRows(snapshot, today),
    [snapshot, today],
  );
  // Re-read the clock whenever the data refreshes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => ({ timeZone, now: new Date() }), [timeZone, rows]);
  const kpis = useMemo(() => buildKpis(rows, ctx), [rows, ctx]);
  const orderSoon = useMemo(() => needsOrdering(rows), [rows]);
  const recent = useMemo(() => recentlyChangedRows(rows, ctx), [rows, ctx]);
  const recentColumns = useMemo<TableColumn<InventoryRow>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        type: "text",
        sortable: true,
        searchable: true,
        get: (r) => r.name,
        render: (r) => <span className="font-medium">{r.name}</span>,
      },
      {
        id: "vendor",
        label: "Vendor",
        type: "select",
        sortable: true,
        searchable: true,
        get: (r) => r.vendor,
        render: (r) => r.vendor,
      },
      {
        id: "category",
        label: "Category",
        type: "select",
        sortable: true,
        tabletHidden: true,
        get: (r) => r.category,
        render: (r) => r.category ?? "—",
      },
      {
        id: "total",
        label: "Total",
        type: "number",
        sortable: true,
        align: "right",
        get: (r) => r.total,
        render: (r) => formatQuantity(r.total),
      },
      {
        id: "status",
        label: "Status",
        type: "select",
        sortable: false,
        get: (r) => STATUS_LABEL[r.status],
        render: (r) => <StatusBadge status={r.status} />,
      },
      {
        id: "updated",
        label: "Last updated",
        type: "date",
        sortable: true,
        get: (r) => r.updatedAt,
        render: (r) =>
          r.updatedAt ? formatBusinessDateTime(r.updatedAt, timeZone) : "—",
      },
      {
        id: "updatedBy",
        label: "Updated by",
        type: "select",
        sortable: true,
        tabletHidden: true,
        get: (r) => r.updatedBy,
        render: (r) => r.updatedBy ?? "—",
      },
    ],
    [timeZone],
  );

  return (
    <div
      className="flex w-full max-w-full min-w-0 flex-col gap-5"
      data-testid="bar-inventory-dashboard"
    >
      <section aria-label="Stock summary">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {TILES.map((tile) => (
            <KpiTile
              key={tile.id}
              tile={tile}
              count={tile.value(kpis)}
              onOpen={() => onOpenInventory(tileDrillDown(tile.id))}
            />
          ))}
        </div>
      </section>

      <FreshnessDashboard rows={rows} onOpenInventory={onOpenInventory} />
      <section aria-labelledby="bi-order-soon" className="flex flex-col gap-2">
        <h2 id="bi-order-soon" className="text-lg font-semibold">
          Order soon
        </h2>
        <p className="text-muted-foreground text-sm">
          Grouped by vendor, most urgent first. Suggested order is Par minus
          Total; with no Par it says “Order needed” instead of guessing a
          quantity.
        </p>
        <OrderSoon
          rows={orderSoon}
          restaurantSlug={restaurantSlug}
          timeZone={timeZone}
          runExport={runExport}
          draftCta={draftCta}
        />
      </section>

      <section
        aria-labelledby="bi-recent"
        className="flex flex-col gap-2"
        data-testid="bi-recent-section"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="bi-recent" className="text-lg font-semibold">
            Recently changed
          </h2>
          <Button variant="ghost" onClick={onOpenHistory}>
            Full history
          </Button>
        </div>
        <FilterableTable<InventoryRow>
          tableKey="recent"
          restaurantSlug={restaurantSlug}
          label="Recently changed"
          rows={recent}
          columns={recentColumns}
          getRowId={(row) => row.productId}
          timeZone={timeZone}
          emptyMessage="Nothing has changed in the last 7 days."
          renderCard={(row) => (
            <ItemCard
              row={row}
              detail={`Total ${formatQuantity(row.total)} · ${
                row.updatedAt
                  ? formatBusinessDateTime(row.updatedAt, timeZone)
                  : "—"
              }${row.updatedBy ? ` · ${row.updatedBy}` : ""}`}
            />
          )}
        />
      </section>

      <AnalyticsInsights
        snapshot={snapshot}
        timeZone={timeZone}
        load={loadHistory}
        onOpenAnalytics={onOpenAnalytics}
      />
    </div>
  );
}
