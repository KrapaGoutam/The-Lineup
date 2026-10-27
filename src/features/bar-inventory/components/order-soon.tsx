"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useMemo, useState } from "react";

import type { InventoryRow } from "../domain/inventory-rows";
import {
  groupByVendor,
  ORDER_SOON_COLUMNS,
  type VendorGroup,
} from "../domain/order-soon";
import { formatQuantity } from "./editable-cell";
import {
  ExportControl,
  useVisibleInfo,
  type RunExport,
} from "./export-control";
import {
  FilterableTable,
  type TableColumn,
} from "./table-kit/filterable-table";
import { StatusBadge } from "./table-kit/status-badge";

/** Few vendors: show everything open. Many: start collapsed. */
const OPEN_BY_DEFAULT_UP_TO = 5;

// The table kit needs a renderer per column for its filter metadata; the
// vendor-grouped body below is what is actually shown.
const COLUMNS: TableColumn<InventoryRow>[] = ORDER_SOON_COLUMNS.map(
  (column) => ({
    ...column,
    render: (row) => String(column.get(row) ?? "—"),
  }),
);

function Group({
  group,
  open,
  onToggle,
}: {
  group: VendorGroup;
  open: boolean;
  onToggle: () => void;
}) {
  const bodyId = useId();
  const Chevron = open ? ChevronDown : ChevronRight;
  const attention = group.critical + group.low;
  return (
    <section
      aria-label={`${group.vendor} order`}
      className="border-border bg-card overflow-hidden rounded-xl border"
      data-testid="order-group"
      data-vendor={group.vendor}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="hover:bg-muted/40 focus-visible:ring-ring flex min-h-12 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-left outline-none focus-visible:ring-2"
      >
        <span className="flex items-center gap-2 font-semibold">
          <Chevron aria-hidden="true" className="size-4 shrink-0" />
          {group.vendor}
        </span>
        <span className="text-muted-foreground text-xs">
          {attention} {attention === 1 ? "needs" : "need"} attention ·{" "}
          {group.critical} critical · {group.low} low
          {" · "}
          <span className="text-foreground font-medium">
            suggested total {formatQuantity(group.suggestedTotal)}
          </span>
          {group.orderNeeded > 0 ? ` + ${group.orderNeeded} order needed` : ""}
        </span>
      </button>
      {open ? (
        <ul id={bodyId} className="divide-border divide-y border-t">
          {group.items.map((item) => (
            <li
              key={item.productId}
              data-testid="order-item"
              data-name={item.name}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2"
            >
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-medium">
                  {item.name}
                  {item.size ? ` ${item.size}` : ""}
                </p>
                <p className="text-muted-foreground text-xs">
                  Total {formatQuantity(item.total)} · Cutoff{" "}
                  {formatQuantity(item.cutoff)} · Warning{" "}
                  {formatQuantity(item.effectiveWarning)} · Par{" "}
                  {formatQuantity(item.par)}
                </p>
              </div>
              <StatusBadge status={item.status} />
              <span className="min-w-24 text-right font-semibold tabular-nums">
                {item.orderNeeded || item.suggestedOrder === null
                  ? "Order needed"
                  : `Order ${formatQuantity(item.suggestedOrder)}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function VendorGroups({ rows }: { rows: InventoryRow[] }) {
  const groups = useMemo(() => groupByVendor(rows), [rows]);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  return (
    <div className="flex flex-col gap-2" data-testid="order-groups">
      {groups.map((group) => {
        const open =
          chosen[group.vendor] ?? groups.length <= OPEN_BY_DEFAULT_UP_TO;
        return (
          <Group
            key={group.vendor}
            group={group}
            open={open}
            onToggle={() =>
              setChosen((current) => ({ ...current, [group.vendor]: !open }))
            }
          />
        );
      })}
    </div>
  );
}

/**
 * Order soon, by vendor. The filters are the shared table kit's; the export
 * sends only the filter string, and whoever builds the file re-applies it to
 * the authorized rows (the client never supplies the rows to export).
 */
export function OrderSoon({
  rows,
  restaurantSlug,
  timeZone,
  runExport,
}: {
  /** Critical and Low items, most urgent first. */
  rows: InventoryRow[];
  restaurantSlug: string;
  timeZone: string;
  runExport: RunExport;
}) {
  const [info, onVisibleRows] = useVisibleInfo<InventoryRow>();
  return (
    <FilterableTable<InventoryRow>
      tableKey="dash"
      restaurantSlug={restaurantSlug}
      label="Order soon"
      rows={rows}
      columns={COLUMNS}
      getRowId={(row) => row.productId}
      timeZone={timeZone}
      emptyMessage="Nothing needs ordering right now."
      onVisibleRows={onVisibleRows}
      renderGroups={(visible) => <VendorGroups rows={visible} />}
      toolbarExtras={
        <ExportControl
          label="Export recommendations"
          info={info}
          build={(filters) => ({ kind: "recommendations", filters })}
          run={runExport}
          disabled={rows.length === 0}
        />
      }
    />
  );
}
