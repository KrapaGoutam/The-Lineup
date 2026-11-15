"use client";

import { History, Minus, Plus } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";

import { Button } from "@/components/ui/button";
import { formatBusinessDateTime } from "@/lib/date-time";

function HeaderCheckbox({
  allSelected,
  someSelected,
  onChange,
  disabled,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  return (
    <label className="flex min-h-11 min-w-11 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        aria-label="Select all visible products"
        className="size-4"
        disabled={disabled}
        checked={allSelected}
        onChange={onChange}
      />
    </label>
  );
}

import {
  buildInventoryRows,
  INVENTORY_COLUMNS,
  INVENTORY_DEFAULT_SORT,
  INVENTORY_SORT_ONLY_COLUMNS,
  INVENTORY_SORT_PRESETS,
  suggestedOrderText,
  type InventoryRow,
} from "../domain/inventory-rows";
import type { CatalogSnapshot } from "../domain/inventory-types";
import {
  ADJUSTMENT_REASON_LABELS,
  type AdjustmentReason,
} from "../domain/stock-rules";
import { EditableCell, formatQuantity, type CellSave } from "./editable-cell";
import {
  ExportControl,
  useVisibleInfo,
  type RunExport,
} from "./export-control";
import type { LoadHistory } from "./history-view";
import {
  ItemSheet,
  type ItemSheetActions,
  type ItemSheetTab,
} from "./item-sheet";
import type { RunCatalogCommand } from "./catalog-dialogs";
import {
  FilterableTable,
  type TableColumn,
} from "./table-kit/filterable-table";
import { StatusBadge } from "./table-kit/status-badge";
import { BulkCount } from "./bulk-count";
import { DateAlert } from "./date-tracking";
import { DateFilters } from "./date-filters";
import { businessDate } from "../domain/freshness";
import { dateCellText } from "../domain/inventory-rows";
import {
  hasExplicitInventoryState,
  readViewPayload,
} from "../domain/saved-views";
import { CoolerLayoutView } from "./cooler-layout/cooler-layout-view";

export function InventoryView({
  snapshot,
  locationId = null,
  locationName = null,
  loadBranchOverview,
  run,
  restaurantSlug,
  timeZone,
  loadHistory,
  onOpenHistory,
  runExport,
  profileId,
}: {
  snapshot: CatalogSnapshot;
  locationId?: string | null;
  locationName?: string | null;
  loadBranchOverview?: ComponentProps<
    typeof CoolerLayoutView
  >["loadBranchOverview"];
  run: RunCatalogCommand;
  restaurantSlug: string;
  timeZone: string;
  loadHistory: LoadHistory;
  onOpenHistory: () => void;
  runExport: RunExport;
  profileId: string;
}) {
  const [exportInfo, onVisibleRows] = useVisibleInfo<InventoryRow>();
  const [showArchived, setShowArchived] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get("inv.archived") === "1") return true;
    if (hasExplicitInventoryState(window.location.search)) return false;
    const saved = readViewPayload(
      snapshot.savedViews?.find((v) => v.profileId === profileId && v.isDefault)
        ?.payload,
      [...INVENTORY_COLUMNS, ...INVENTORY_SORT_ONLY_COLUMNS],
    );
    return !!(saved?.owns.includes("showArchived") && saved.state.showArchived);
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (showArchived) {
      params.set("inv.archived", "1");
      params.set("bi.org", restaurantSlug);
    } else params.delete("inv.archived");
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, [showArchived, restaurantSlug]);
  const [lastReason, setLastReason] = useState<AdjustmentReason>("stock_count");
  const [sheetFor, setSheetFor] = useState<{
    productId: string;
    tab: ItemSheetTab;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [prevLocationId, setPrevLocationId] = useState(locationId);
  if (prevLocationId !== locationId) {
    setPrevLocationId(locationId);
    setSelected([]);
  }
  const [filtered, setFiltered] = useState<InventoryRow[] | null>(null);
  const [bulkRows, setBulkRows] = useState<InventoryRow[] | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "cooler">("table");

  const today = businessDate(new Date(), timeZone);
  const allRows = useMemo(
    () => buildInventoryRows(snapshot, today),
    [snapshot, today],
  );
  const rows = useMemo(
    () => allRows.filter((row) => showArchived || row.status !== "archived"),
    [allRows, showArchived],
  );
  const activeVisibleRows = filtered ?? rows;
  const eligibleFiltered = useMemo(
    () => activeVisibleRows.filter((r) => r.status !== "archived"),
    [activeVisibleRows],
  );
  const eligibleAll = useMemo(
    () => allRows.filter((r) => r.status !== "archived"),
    [allRows],
  );

  const isAllVisibleSelected =
    eligibleFiltered.length > 0 &&
    eligibleFiltered.every((r) => selected.includes(r.productId));
  const isSomeVisibleSelected = eligibleFiltered.some((r) =>
    selected.includes(r.productId),
  );

  const sheetRow = sheetFor
    ? (allRows.find((row) => row.productId === sheetFor.productId) ?? null)
    : null;

  const saveQuantity =
    (row: InventoryRow, field: "onHand" | "backup"): CellSave =>
    async (value, extra, expectedVersion) => {
      const reason = extra?.reason ?? lastReason;
      const result = await run({
        type: "stockAdjust",
        productId: row.productId,
        mode: "set",
        onHand: field === "onHand" ? value : null,
        backup: field === "backup" ? value : null,
        reason,
        note: extra?.note ?? null,
        expectedVersion,
      });
      if (result.ok) {
        setLastReason(reason);
        return { ok: true };
      }
      return result;
    };

  const saveLevel =
    (row: InventoryRow, field: "cutoff" | "warning" | "par"): CellSave =>
    async (value, _extra, expectedVersion) => {
      const result = await run({
        type: "stockSetLevels",
        productId: row.productId,
        cutoff: field === "cutoff" ? value : row.cutoff,
        warning: field === "warning" ? value : row.warning,
        par: field === "par" ? value : row.par,
        expectedVersion,
      });
      return result.ok ? { ok: true } : result;
    };

  const sheetActions: ItemSheetActions = {
    saveCounts: async (row, counts, extra, expectedVersion) => {
      const result = await run({
        type: "stockAdjust",
        productId: row.productId,
        mode: "set",
        onHand: counts.onHand,
        backup: counts.backup,
        reason: extra.reason,
        note: extra.note,
        expectedVersion,
      });
      if (result.ok) setLastReason(extra.reason);
      return result.ok ? { ok: true } : result;
    },
    saveLevels: async (row, levels, expectedVersion) => {
      const result = await run({
        type: "stockSetLevels",
        productId: row.productId,
        cutoff: levels.cutoff,
        warning: levels.warning,
        par: levels.par,
        expectedVersion,
      });
      return result.ok ? { ok: true } : result;
    },
  };

  async function quickAdjust(row: InventoryRow, direction: 1 | -1) {
    setNotice(null);
    const reason: AdjustmentReason =
      direction === 1 ? "delivery_restock" : "usage";
    const result = await run({
      type: "stockAdjust",
      productId: row.productId,
      mode: "delta",
      onHand: direction,
      backup: null,
      reason,
      note: null,
      expectedVersion: null,
    });
    if (!result.ok) setNotice(`${row.name}: ${result.error}`);
  }

  const columns = useMemo<TableColumn<InventoryRow>[]>(() => {
    // Labels, types and `get` come from the shared spec the export also uses.
    const spec = new Map(
      INVENTORY_COLUMNS.map((column) => [column.id, column]),
    );
    const col = (
      id: string,
      extra: Pick<TableColumn<InventoryRow>, "render"> &
        Partial<
          Pick<TableColumn<InventoryRow>, "sortable" | "align" | "tabletHidden">
        >,
    ): TableColumn<InventoryRow> => ({ ...spec.get(id)!, ...extra });
    const editable = (
      id: "onHand" | "backup" | "cutoff" | "warning" | "par",
      mode: "quantity" | "level",
    ): TableColumn<InventoryRow> => {
      const { label } = spec.get(id)!;
      return col(id, {
        sortable: true,
        align: "right",
        tabletHidden: false,
        render: (row) => (
          <EditableCell
            label={label}
            itemName={row.name}
            value={row[id]}
            mode={mode}
            defaultReason={lastReason}
            expectedVersion={row.stockVersion}
            onSave={
              mode === "quantity"
                ? saveQuantity(row, id as "onHand" | "backup")
                : saveLevel(row, id as "cutoff" | "warning" | "par")
            }
          />
        ),
      });
    };
    return [
      col("vendor", { sortable: true, render: (r) => r.vendor }),
      col("name", {
        sortable: true,
        render: (r) => <span className="font-medium">{r.name}</span>,
      }),
      {
        id: "selection",
        label: "Select",
        type: "text",
        get: () => null,
        noFilter: true,
        headerRender: () => (
          <HeaderCheckbox
            allSelected={isAllVisibleSelected}
            someSelected={isSomeVisibleSelected}
            disabled={eligibleFiltered.length === 0}
            onChange={() => {
              if (isAllVisibleSelected) {
                const visibleIds = new Set(
                  eligibleFiltered.map((r) => r.productId),
                );
                setSelected((current) =>
                  current.filter((id) => !visibleIds.has(id)),
                );
              } else {
                const visibleIds = eligibleFiltered.map((r) => r.productId);
                setSelected((current) =>
                  Array.from(new Set([...current, ...visibleIds])),
                );
              }
            }}
          />
        ),
        render: (row) => (
          <label className="flex min-h-11 min-w-11 items-center justify-center">
            <input
              type="checkbox"
              aria-label={`Select ${row.name}`}
              className="size-4"
              disabled={row.status === "archived"}
              checked={
                selected.includes(row.productId) && row.status !== "archived"
              }
              onChange={() =>
                setSelected((current) =>
                  current.includes(row.productId)
                    ? current.filter((id) => id !== row.productId)
                    : [...current, row.productId],
                )
              }
            />
          </label>
        ),
      },
      col("category", {
        sortable: true,
        tabletHidden: true,
        render: (r) => r.category ?? "—",
      }),
      col("subcategory", {
        sortable: true,
        tabletHidden: true,
        render: (r) => r.subcategory ?? "—",
      }),
      col("size", { sortable: true, render: (r) => r.size ?? "—" }),
      col("unit", { sortable: true, render: (r) => r.unit }),
      col("sku", {
        sortable: true,
        tabletHidden: true,
        render: (r) => r.sku ?? "—",
      }),
      editable("onHand", "quantity"),
      editable("backup", "quantity"),
      col("total", {
        sortable: true,
        align: "right",
        render: (r) => (
          <span className="font-semibold">{formatQuantity(r.total)}</span>
        ),
      }),
      editable("cutoff", "level"),
      editable("warning", "level"),
      editable("par", "level"),
      col("status", {
        sortable: false,
        render: (r) => <StatusBadge status={r.status} />,
      }),
      col("suggested", {
        sortable: true,
        align: "right",
        tabletHidden: true,
        render: suggestedOrderText,
      }),
      col("updated", {
        sortable: true,
        render: (r) =>
          r.updatedAt ? formatBusinessDateTime(r.updatedAt, timeZone) : "—",
      }),
      col("updatedBy", {
        sortable: true,
        tabletHidden: true,
        render: (r) => r.updatedBy ?? "—",
      }),
      col("manufacture", {
        sortable: true,
        render: (r) => (
          <Button
            variant="ghost"
            onClick={() =>
              setSheetFor({ productId: r.productId, tab: "dates" })
            }
            aria-label={`Manufacture dates for ${r.name}`}
          >
            {dateCellText(r, "manufacture")}
          </Button>
        ),
      }),
      col("expiration", {
        sortable: true,
        render: (r) => (
          <Button
            variant="ghost"
            onClick={() =>
              setSheetFor({ productId: r.productId, tab: "dates" })
            }
            aria-label={`Expiration dates for ${r.name}`}
          >
            {dateCellText(r, "expiration")}
          </Button>
        ),
      }),
      col("dateAlert", { render: (r) => <DateAlert row={r} /> }),
      col("freshness", { render: (r) => spec.get("freshness")!.get(r) }),
      col("expirationDays", {
        sortable: true,
        align: "right",
        render: (r) => r.dateInfo?.expiration.days ?? "—",
      }),
      col("dateTracking", { render: (r) => spec.get("dateTracking")!.get(r) }),
    ];
    // The save callbacks close over `run` and `lastReason` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    timeZone,
    lastReason,
    run,
    selected,
    eligibleFiltered,
    isAllVisibleSelected,
    isSomeVisibleSelected,
  ]);

  const selection = allRows.filter(
    (r) => selected.includes(r.productId) && r.status !== "archived",
  );

  return (
    <div className="flex w-full max-w-full min-w-0 flex-col gap-3">
      {/* The phone cards title each item with an h3; this keeps the outline h1 > h2 > h3. */}
      <h2 className="sr-only">Inventory</h2>
      {notice ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="bg-muted/40 inline-flex rounded-lg border p-1">
          <Button
            type="button"
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("table")}
            className="h-8 px-3 text-xs font-medium"
          >
            Inventory Table
          </Button>
          <Button
            type="button"
            variant={viewMode === "cooler" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("cooler")}
            className="h-8 px-3 text-xs font-medium"
          >
            Cooler Layout
          </Button>
        </div>
      </div>

      {viewMode === "cooler" ? (
        <CoolerLayoutView
          snapshot={snapshot}
          locationId={locationId}
          locationName={locationName}
          loadBranchOverview={loadBranchOverview}
          run={run}
          timeZone={timeZone}
          onSelectProduct={(productId) =>
            setSheetFor({ productId, tab: "counts" })
          }
        />
      ) : (
        <FilterableTable<InventoryRow>
          tableKey="inv"
          toolbarState={(state, onChange) => (
            <DateFilters state={state} onChange={onChange} />
          )}
          savedViews={{
            views: (snapshot.savedViews ?? []).filter(
              (v) => v.profileId === profileId,
            ),
            run,
            showArchived,
            setShowArchived,
          }}
          restaurantSlug={restaurantSlug}
          label="Inventory"
          rows={rows}
          columns={columns}
          sortOnlyColumns={INVENTORY_SORT_ONLY_COLUMNS}
          getRowId={(row) => row.productId}
          timeZone={timeZone}
          defaultSort={INVENTORY_DEFAULT_SORT}
          sortPresets={INVENTORY_SORT_PRESETS}
          onVisibleRows={(visible, state) => {
            onVisibleRows(visible, state);
            setFiltered((current) =>
              current &&
              current.length === visible.length &&
              current.every((r, i) => r === visible[i])
                ? current
                : visible,
            );
          }}
          emptyMessage="No products yet. Add products under Manage to start counting."
          toolbarExtras={
            <>
              <span role="status" className="text-sm">
                {selection.length} selected
              </span>
              <Button
                variant="outline"
                onClick={() =>
                  setSelected(eligibleFiltered.map((r) => r.productId))
                }
              >
                Select filtered results
              </Button>
              {eligibleAll.length > eligibleFiltered.length ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    setSelected(eligibleAll.map((r) => r.productId))
                  }
                >
                  Select all eligible ({eligibleAll.length})
                </Button>
              ) : null}
              <Button
                disabled={!selection.length}
                onClick={() => setBulkRows(selection)}
              >
                Bulk Edit
              </Button>
              {selected.length ? (
                <Button variant="ghost" onClick={() => setSelected([])}>
                  Clear selection
                </Button>
              ) : null}
              <label className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
                Show archived
              </label>
              <Button variant="ghost" onClick={onOpenHistory}>
                <History aria-hidden="true" /> History
              </Button>
              <ExportControl
                label="Export inventory"
                info={exportInfo}
                build={(filters) => ({ kind: "inventory", filters })}
                run={runExport}
              />
              <ExportControl
                label="Export date groups"
                info={exportInfo}
                build={(filters) => ({ kind: "date_groups", filters })}
                run={runExport}
              />
            </>
          }
          rowActions={(row) => (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Adjust ${row.name}`}
                onClick={() =>
                  setSheetFor({ productId: row.productId, tab: "counts" })
                }
              >
                Adjust
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Date tracking for ${row.name}`}
                onClick={() =>
                  setSheetFor({ productId: row.productId, tab: "dates" })
                }
              >
                Dates
              </Button>
            </div>
          )}
          renderCard={(row) => (
            <article
              aria-label={row.name}
              className="border-border bg-card flex flex-col gap-2 rounded-xl border p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">
                    {row.name}
                    {row.size ? ` ${row.size}` : ""}
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    {row.vendor}
                    {row.category
                      ? ` · ${row.category}${row.subcategory ? ` › ${row.subcategory}` : ""}`
                      : ""}
                  </p>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <DateAlert row={row} />
              <p className="text-sm">
                <span className="font-semibold">
                  Total {formatQuantity(row.total)}
                </span>{" "}
                <span className="text-muted-foreground">
                  (On hand {formatQuantity(row.onHand)} + Backup{" "}
                  {formatQuantity(row.backup)})
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                Cutoff {formatQuantity(row.cutoff)} · Warn{" "}
                {formatQuantity(row.effectiveWarning)} · Par{" "}
                {formatQuantity(row.par)}
                {row.status === "critical" || row.status === "low"
                  ? ` · Order ${suggestedOrderText(row)}`
                  : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  aria-label={`Date tracking for ${row.name}`}
                  onClick={() =>
                    setSheetFor({ productId: row.productId, tab: "dates" })
                  }
                >
                  Dates
                </Button>
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.name}`}
                    className="size-4"
                    disabled={row.status === "archived"}
                    checked={
                      selected.includes(row.productId) &&
                      row.status !== "archived"
                    }
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(row.productId)
                          ? current.filter((id) => id !== row.productId)
                          : [...current, row.productId],
                      )
                    }
                  />
                  Select
                </label>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={`One used: ${row.name} (${ADJUSTMENT_REASON_LABELS.usage})`}
                  disabled={row.status === "archived"}
                  onClick={() => void quickAdjust(row, -1)}
                >
                  <Minus aria-hidden="true" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={`One received: ${row.name} (${ADJUSTMENT_REASON_LABELS.delivery_restock})`}
                  disabled={row.status === "archived"}
                  onClick={() => void quickAdjust(row, 1)}
                >
                  <Plus aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  aria-label={`Adjust ${row.name}`}
                  onClick={() =>
                    setSheetFor({ productId: row.productId, tab: "counts" })
                  }
                >
                  Adjust…
                </Button>
              </div>
            </article>
          )}
        />
      )}
      <ItemSheet
        row={sheetRow}
        defaultReason={lastReason}
        actions={sheetActions}
        dates={{ snapshot, run, timeZone }}
        history={{ timeZone, load: loadHistory }}
        initialTab={sheetFor?.tab}
        onClose={() => setSheetFor(null)}
      />
      {bulkRows ? (
        <BulkCount
          rows={bulkRows}
          latestRows={allRows}
          run={run}
          timeZone={timeZone}
          onClose={() => {
            setBulkRows(null);
            setSelected([]);
          }}
        />
      ) : null}
    </div>
  );
}
