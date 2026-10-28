"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

import type { InventoryRow } from "../domain/inventory-rows";
import type { VendorDraftTarget } from "../domain/order-draft-view";
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

/**
 * Order soon only decides WHAT needs ordering; the draft itself is prepared in
 * Order Drafts. `open` resolves to an error message, or null once it has
 * switched to the draft.
 */
export type OrderDraftCta = {
  targets: ReadonlyMap<string, VendorDraftTarget>;
  open: (target: VendorDraftTarget) => Promise<string | null>;
};

function DraftAction({ vendor, cta }: { vendor: string; cta: OrderDraftCta }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = cta.targets.get(vendor);
  // The stable system "Unassigned" vendor can never have a draft; a vendor the
  // catalog no longer knows is treated the same way.
  if (!target || target.isSystem) {
    return (
      <p className="text-muted-foreground px-3 pb-2 text-xs">
        Assign a vendor in Manage to draft an order.
      </p>
    );
  }
  if (!target.draftId && !target.active) {
    return (
      <p className="text-muted-foreground px-3 pb-2 text-xs">
        This vendor is inactive. Reactivate it in Manage to draft an order.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1 px-3 pb-2">
      <Button
        size="sm"
        variant={target.draftId ? "secondary" : "default"}
        aria-disabled={pending}
        className={pending ? "opacity-60" : undefined}
        onClick={async () => {
          if (pending) return;
          setPending(true);
          setError(null);
          const failure = await cta.open(target);
          setPending(false);
          if (failure) setError(failure);
        }}
      >
        {pending
          ? "Opening…"
          : target.draftId
            ? "Open Order Draft"
            : "Create Order Draft"}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Group({
  group,
  open,
  onToggle,
  cta,
}: {
  group: VendorGroup;
  open: boolean;
  onToggle: () => void;
  cta: OrderDraftCta | null;
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
      {cta ? <DraftAction vendor={group.vendor} cta={cta} /> : null}
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

function VendorGroups({
  rows,
  cta,
}: {
  rows: InventoryRow[];
  cta: OrderDraftCta | null;
}) {
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
            cta={cta}
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
  draftCta = null,
}: {
  /** Critical and Low items, most urgent first. */
  rows: InventoryRow[];
  restaurantSlug: string;
  timeZone: string;
  runExport: RunExport;
  /** Null until the drafts have loaded: no Create/Open button is shown. */
  draftCta?: OrderDraftCta | null;
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
      renderGroups={(visible) => <VendorGroups rows={visible} cta={draftCta} />}
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
