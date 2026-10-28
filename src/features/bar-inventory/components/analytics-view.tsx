"use client";

import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ANALYTICS_ITEM_COLUMNS,
  ANALYTICS_SORT_PRESETS,
  ANALYTICS_VENDOR_COLUMNS,
  buildItemAnalytics,
  formatRate,
  presetWindow,
  summarize,
  todayIn,
  vendorDemand,
  WINDOW_PRESET_DAYS,
  type DateWindow,
  type ItemAnalytics,
  type VendorDemand,
} from "../domain/analytics";
import { buildInventoryRows } from "../domain/inventory-rows";
import type { CatalogSnapshot } from "../domain/inventory-types";
import type { TableState } from "../domain/table-filters";
import { formatQuantity } from "./editable-cell";
import {
  ExportControl,
  useVisibleInfo,
  type RunExport,
} from "./export-control";
import type { LoadHistory } from "./history-view";
import {
  FilterableTable,
  type TableColumn,
} from "./table-kit/filterable-table";
import { TableSkeleton } from "./table-kit/empty-state";
import { useLedger } from "./use-ledger";

const CUSTOM = "custom";
const DASH = "—";

const fixed = formatRate;

function Stat({
  id,
  label,
  value,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      data-testid={`an-stat-${id}`}
      className="border-border bg-card flex min-w-0 flex-col gap-0.5 rounded-xl border p-3"
    >
      <span className="text-muted-foreground text-xs font-semibold">
        {label}
      </span>
      <span className="text-xl leading-tight font-bold tabular-nums">
        {value}
      </span>
      {hint ? (
        <span className="text-muted-foreground text-xs">{hint}</span>
      ) : null}
    </div>
  );
}

/**
 * Analytics from the immutable adjustment ledger. Negative Stock Counts are
 * Observed Depletion, explicit Usage is Confirmed Usage, and corrections,
 * transfers, deliveries and restocks are never consumption. Rates and days to
 * cutoff appear only with enough history.
 */
export function AnalyticsView({
  snapshot,
  restaurantSlug,
  timeZone,
  load,
  onBack,
  runExport,
}: {
  snapshot: CatalogSnapshot;
  restaurantSlug: string;
  timeZone: string;
  load: LoadHistory;
  onBack: () => void;
  runExport: RunExport;
}) {
  const ledger = useLedger(load, snapshot);
  const [preset, setPreset] = useState<string>("30");
  const [custom, setCustom] = useState<DateWindow>(() => {
    const today = todayIn(timeZone, new Date());
    return presetWindow(30, timeZone, new Date(`${today}T12:00:00Z`));
  });
  const [includeObserved, setIncludeObserved] = useState(true);
  const [includeShrink, setIncludeShrink] = useState(false);
  const [visible, setVisible] = useState<ItemAnalytics[]>([]);
  const [exportInfo, trackExport] = useVisibleInfo<ItemAnalytics>();
  const remember = useCallback(
    (rows: ItemAnalytics[], state: TableState) => {
      setVisible(rows);
      trackExport(rows, state);
    },
    [trackExport],
  );

  const ready = ledger.status === "ready" ? ledger : null;
  const now = useMemo(() => new Date(), [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const window = useMemo<DateWindow>(
    () =>
      preset === CUSTOM ? custom : presetWindow(Number(preset), timeZone, now),
    [preset, custom, timeZone, now],
  );
  const customValid = custom.from <= custom.to && custom.from !== "";

  const items = useMemo(
    () =>
      ready
        ? buildItemAnalytics(ready.entries, buildInventoryRows(snapshot), {
            window,
            includeObserved,
            includeShrink,
            timeZone,
            now,
          })
        : [],
    [ready, snapshot, window, includeObserved, includeShrink, timeZone, now],
  );
  const vendors = useMemo(() => vendorDemand(items), [items]);
  const summary = useMemo(() => summarize(visible, window), [visible, window]);

  const itemColumns = useMemo<TableColumn<ItemAnalytics>[]>(() => {
    const spec = new Map(ANALYTICS_ITEM_COLUMNS.map((c) => [c.id, c]));
    const col = (
      id: string,
      extra: Pick<TableColumn<ItemAnalytics>, "render"> &
        Partial<
          Pick<
            TableColumn<ItemAnalytics>,
            "sortable" | "align" | "tabletHidden"
          >
        >,
    ): TableColumn<ItemAnalytics> => ({ ...spec.get(id)!, ...extra });
    const num = (pick: (i: ItemAnalytics) => number | null, digits = 2) =>
      ({
        sortable: true,
        align: "right" as const,
        render: (i: ItemAnalytics) => fixed(pick(i), digits),
      }) as const;
    return [
      col("vendor", { sortable: true, render: (i) => i.vendor }),
      col("item", {
        sortable: true,
        render: (i) => (
          <span className="font-medium">
            {i.item}
            {i.size ? ` ${i.size}` : ""}
          </span>
        ),
      }),
      col("category", {
        sortable: true,
        tabletHidden: true,
        render: (i) => i.category ?? DASH,
      }),
      col("subcategory", {
        sortable: true,
        tabletHidden: true,
        render: (i) => i.subcategory ?? DASH,
      }),
      col("unit", {
        sortable: true,
        tabletHidden: true,
        render: (i) => i.unit,
      }),
      col(
        "currentTotal",
        num((i) => i.currentTotal),
      ),
      col(
        "confirmedUsage",
        num((i) => i.confirmedUsage),
      ),
      col("observedDepletion", {
        ...num((i) => i.observedDepletion),
        tabletHidden: true,
      }),
      col(
        "perDay",
        num((i) => i.perDay),
      ),
      col(
        "perWeek",
        num((i) => i.perWeek),
      ),
      col("parTurns", { ...num((i) => i.parTurnsPerWeek), tabletHidden: true }),
      col("restockQuantity", {
        ...num((i) => i.restockQuantity),
        tabletHidden: true,
      }),
      col("restockCount", {
        ...num((i) => i.restockCount, 0),
        tabletHidden: true,
      }),
      col(
        "cutoffHits",
        num((i) => i.cutoffHits, 0),
      ),
      col("daysToCutoff", {
        sortable: true,
        render: (i) => i.daysToCutoffText,
      }),
      col("evidence", { sortable: true, render: (i) => i.evidence }),
      col("status", {
        sortable: true,
        tabletHidden: true,
        render: (i) => i.status,
      }),
    ];
  }, []);

  const vendorColumns = useMemo<TableColumn<VendorDemand>[]>(() => {
    const spec = new Map(ANALYTICS_VENDOR_COLUMNS.map((c) => [c.id, c]));
    const num = (id: string, pick: (v: VendorDemand) => number) =>
      ({
        ...spec.get(id)!,
        sortable: true,
        align: "right" as const,
        render: (v: VendorDemand) => formatQuantity(pick(v)),
      }) as TableColumn<VendorDemand>;
    return [
      {
        ...spec.get("vendor")!,
        sortable: true,
        render: (v) => <span className="font-medium">{v.vendor}</span>,
      },
      num("items", (v) => v.items),
      num("depletion", (v) => v.depletion),
      num("critical", (v) => v.critical),
      num("low", (v) => v.low),
      {
        ...spec.get("suggestedOrderNow")!,
        sortable: true,
        align: "right",
        render: (v) =>
          v.orderNeeded > 0
            ? `${formatQuantity(v.suggestedOrderNow)} + ${v.orderNeeded} order needed`
            : formatQuantity(v.suggestedOrderNow),
      },
      num("restockCount", (v) => v.restockCount),
      num("restockQuantity", (v) => v.restockQuantity),
    ];
  }, []);

  return (
    <div
      className="flex w-full max-w-full min-w-0 flex-col gap-4"
      data-testid="bar-inventory-analytics"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ExportControl
            label="Export analytics"
            info={exportInfo}
            build={(filters) => ({
              kind: "analytics",
              filters,
              window,
              includeObserved,
              includeShrink,
            })}
            run={runExport}
            disabled={
              ledger.status !== "ready" || (preset === CUSTOM && !customValid)
            }
          />
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Period
          <Select
            aria-label="Analytics period"
            className="w-auto"
            value={preset}
            onChange={(event) => setPreset(event.target.value)}
          >
            {WINDOW_PRESET_DAYS.map((days) => (
              <option key={days} value={days}>
                Last {days} days
              </option>
            ))}
            <option value={CUSTOM}>Custom range</option>
          </Select>
        </label>
        {preset === CUSTOM ? (
          <>
            <label className="flex flex-col gap-1 text-sm font-medium">
              From
              <Input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              To
              <Input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              />
            </label>
          </>
        ) : null}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={includeObserved}
            onChange={(e) => setIncludeObserved(e.target.checked)}
          />
          Include observed depletion
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={includeShrink}
            onChange={(e) => setIncludeShrink(e.target.checked)}
          />
          Include breakage and comps
        </label>
      </div>
      {preset === CUSTOM && !customValid ? (
        <p role="alert" className="text-destructive text-sm">
          Choose a start date on or before the end date.
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">
        <strong>Confirmed usage</strong> is stock logged as Usage.{" "}
        <strong>Observed depletion</strong> is a lower Stock Count than before:
        it shows how much went missing, not what was sold. Corrections,
        transfers, deliveries and restocks are never counted as consumption.
        Rates and days to cutoff need at least 3 depletion events and 2 weeks of
        history.
      </p>

      {ledger.status === "loading" ? (
        <div>
          <p className="sr-only" role="status">
            Loading analytics…
          </p>
          <TableSkeleton />
        </div>
      ) : ledger.status === "error" ? (
        <Card>
          <CardContent className="py-6">
            <p role="alert" className="text-destructive text-sm">
              {ledger.error}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {ledger.truncated ? (
            <p
              role="status"
              className="border-warn/30 bg-warn/15 text-warn rounded-lg border px-3 py-2 text-sm"
            >
              Figures use the {ledger.entries.length.toLocaleString()} most
              recent changes; older ones are not included.
            </p>
          ) : null}

          <section aria-label="Summary" className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
              <Stat
                id="depletion"
                label="Total depletion"
                value={formatQuantity(summary.depletion)}
                hint={`Confirmed ${formatQuantity(summary.confirmedUsage)} · Observed ${formatQuantity(summary.observedDepletion)}`}
              />
              <Stat
                id="perDay"
                label="Average / day"
                value={fixed(summary.perDay)}
              />
              <Stat
                id="perWeek"
                label="Average / week"
                value={fixed(summary.perWeek)}
              />
              <Stat
                id="restocked"
                label="Restocked"
                value={formatQuantity(summary.restockQuantity)}
              />
              <Stat
                id="restocks"
                label="Restock count"
                value={String(summary.restockCount)}
              />
              <Stat
                id="hits"
                label="Cutoff hits"
                value={String(summary.cutoffHits)}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Totals follow the item table’s filters.
            </p>
          </section>

          <section aria-labelledby="an-items" className="flex flex-col gap-2">
            <h3 id="an-items" className="text-base font-semibold">
              Item movement
            </h3>
            <FilterableTable<ItemAnalytics>
              tableKey="ana"
              restaurantSlug={restaurantSlug}
              label="Item movement"
              rows={items}
              columns={itemColumns}
              getRowId={(row) => row.productId}
              timeZone={timeZone}
              defaultSort={ANALYTICS_SORT_PRESETS[0].keys}
              sortPresets={ANALYTICS_SORT_PRESETS}
              onVisibleRows={remember}
              emptyMessage="No items yet."
              renderCard={(i) => (
                <article
                  aria-label={i.item}
                  className="border-border bg-card flex flex-col gap-1 rounded-xl border p-3"
                >
                  <h3 className="truncate font-semibold">
                    {i.item}
                    {i.size ? ` ${i.size}` : ""}
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    {i.vendor} · {i.status} · {i.evidence}
                  </p>
                  <p className="text-sm">
                    Avg {fixed(i.perDay)}/day · {fixed(i.perWeek)}/week · stock{" "}
                    {formatQuantity(i.currentTotal)}
                  </p>
                  <p className="text-sm">
                    Used {formatQuantity(i.confirmedUsage)} · Observed{" "}
                    {formatQuantity(i.observedDepletion)} · Restocked{" "}
                    {formatQuantity(i.restockQuantity)} ({i.restockCount}×) ·
                    Cutoff hits {i.cutoffHits}
                  </p>
                  <p className="text-sm font-medium">
                    Days to cutoff: {i.daysToCutoffText}
                  </p>
                </article>
              )}
            />
          </section>

          <section aria-labelledby="an-vendors" className="flex flex-col gap-2">
            <h3 id="an-vendors" className="text-base font-semibold">
              Vendor demand
            </h3>
            <FilterableTable<VendorDemand>
              tableKey="anav"
              restaurantSlug={restaurantSlug}
              label="Vendor demand"
              rows={vendors}
              columns={vendorColumns}
              getRowId={(row) => row.vendor}
              timeZone={timeZone}
              emptyMessage="No vendors yet."
              renderCard={(v) => (
                <article
                  aria-label={v.vendor}
                  className="border-border bg-card flex flex-col gap-1 rounded-xl border p-3"
                >
                  <h3 className="font-semibold">{v.vendor}</h3>
                  <p className="text-sm">
                    Depletion {formatQuantity(v.depletion)} · {v.critical}{" "}
                    critical · {v.low} low
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Order now {formatQuantity(v.suggestedOrderNow)}
                    {v.orderNeeded > 0
                      ? ` + ${v.orderNeeded} order needed`
                      : ""}{" "}
                    · restocked {formatQuantity(v.restockQuantity)} (
                    {v.restockCount}×)
                  </p>
                </article>
              )}
            />
          </section>
        </>
      )}
    </div>
  );
}
