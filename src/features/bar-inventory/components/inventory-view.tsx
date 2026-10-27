"use client";

import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatBusinessDateTime } from "@/lib/date-time";

import {
  buildInventoryRows,
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
import { ItemSheet, type ItemSheetActions } from "./item-sheet";
import type { RunCatalogCommand } from "./catalog-dialogs";
import {
  FilterableTable,
  type TableColumn,
} from "./table-kit/filterable-table";
import { STATUS_LABEL, StatusBadge } from "./table-kit/status-badge";

export function InventoryView({
  snapshot,
  run,
  restaurantSlug,
  timeZone,
}: {
  snapshot: CatalogSnapshot;
  run: RunCatalogCommand;
  restaurantSlug: string;
  timeZone: string;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [lastReason, setLastReason] = useState<AdjustmentReason>("stock_count");
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allRows = useMemo(() => buildInventoryRows(snapshot), [snapshot]);
  const rows = useMemo(
    () => allRows.filter((row) => showArchived || row.status !== "archived"),
    [allRows, showArchived],
  );
  const sheetRow = sheetFor
    ? (allRows.find((row) => row.productId === sheetFor) ?? null)
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
    const editable = (
      id: "onHand" | "backup" | "cutoff" | "warning" | "par",
      label: string,
      mode: "quantity" | "level",
    ): TableColumn<InventoryRow> => ({
      id,
      label,
      type: "number",
      sortable: true,
      align: "right",
      tabletHidden: false,
      get: (row) => row[id],
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
    return [
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
        id: "name",
        label: "Name",
        type: "text",
        sortable: true,
        searchable: true,
        get: (r) => r.name,
        render: (r) => <span className="font-medium">{r.name}</span>,
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
        id: "subcategory",
        label: "Subcategory",
        type: "select",
        sortable: true,
        tabletHidden: true,
        get: (r) => r.subcategory,
        render: (r) => r.subcategory ?? "—",
      },
      {
        id: "size",
        label: "Size",
        type: "select",
        sortable: true,
        get: (r) => r.size,
        render: (r) => r.size ?? "—",
      },
      {
        id: "unit",
        label: "Unit",
        type: "select",
        sortable: true,
        get: (r) => r.unit,
        render: (r) => r.unit,
      },
      {
        id: "sku",
        label: "SKU",
        type: "text",
        sortable: true,
        tabletHidden: true,
        searchable: true,
        get: (r) => r.sku,
        render: (r) => r.sku ?? "—",
      },
      editable("onHand", "On hand", "quantity"),
      editable("backup", "Backup", "quantity"),
      {
        id: "total",
        label: "Total",
        type: "number",
        sortable: true,
        align: "right",
        get: (r) => r.total,
        render: (r) => (
          <span className="font-semibold">{formatQuantity(r.total)}</span>
        ),
      },
      editable("cutoff", "Cutoff", "level"),
      editable("warning", "Warning", "level"),
      editable("par", "Par", "level"),
      {
        id: "status",
        label: "Status",
        type: "select",
        sortable: false,
        get: (r) => STATUS_LABEL[r.status],
        render: (r) => <StatusBadge status={r.status} />,
      },
      {
        id: "suggested",
        label: "Suggested order",
        type: "number",
        sortable: true,
        align: "right",
        tabletHidden: true,
        get: (r) => r.suggestedOrder,
        render: suggestedOrderText,
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
    ];
    // The save callbacks close over `run` and `lastReason` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZone, lastReason, run]);

  return (
    <div className="flex w-full max-w-full min-w-0 flex-col gap-3">
      {notice ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {notice}
        </p>
      ) : null}
      <FilterableTable<InventoryRow>
        tableKey="inv"
        restaurantSlug={restaurantSlug}
        label="Inventory"
        rows={rows}
        columns={columns}
        sortOnlyColumns={INVENTORY_SORT_ONLY_COLUMNS}
        getRowId={(row) => row.productId}
        timeZone={timeZone}
        defaultSort={INVENTORY_DEFAULT_SORT}
        sortPresets={INVENTORY_SORT_PRESETS}
        emptyMessage="No products yet. Add products under Manage to start counting."
        toolbarExtras={
          <label className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show archived
          </label>
        }
        rowActions={(row) => (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Adjust ${row.name}`}
            onClick={() => setSheetFor(row.productId)}
          >
            Adjust
          </Button>
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
                onClick={() => setSheetFor(row.productId)}
              >
                Adjust…
              </Button>
            </div>
          </article>
        )}
      />
      <ItemSheet
        row={sheetRow}
        defaultReason={lastReason}
        actions={sheetActions}
        onClose={() => setSheetFor(null)}
      />
    </div>
  );
}
