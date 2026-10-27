"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { formatBusinessDateTime } from "@/lib/date-time";
import { cn } from "@/lib/utils";

import {
  buildHistoryRows,
  changeSummary,
  HISTORY_COLUMNS,
  HISTORY_DEFAULT_SORT,
  HISTORY_SORT_PRESETS,
  signedQuantity,
  type HistoryRow,
} from "../domain/history";
import type { CatalogSnapshot, HistoryEntry } from "../domain/inventory-types";
import { formatQuantity } from "./editable-cell";
import {
  FilterableTable,
  type TableColumn,
} from "./table-kit/filterable-table";
import { TableSkeleton } from "./table-kit/empty-state";

export type HistoryLoad =
  | { ok: true; entries: HistoryEntry[]; truncated: boolean }
  | { ok: false; error: string };

/** `days` 0 means everything the read allows. */
export type LoadHistory = (
  days: number,
  productId: string | null,
) => Promise<HistoryLoad>;

const RANGES = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last year" },
  { days: 0, label: "Everything" },
];

/** Direction by sign and an explicit "+" / "−", never by colour alone. */
function Delta({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        value < 0 && "text-destructive",
        value > 0 && "text-ok",
      )}
    >
      {signedQuantity(value)}
    </span>
  );
}

function ItemName({ row }: { row: HistoryRow }) {
  return (
    <span className="font-medium">
      {row.item}
      {row.archived ? (
        <Badge tone="neutral" className="ml-2">
          Archived
        </Badge>
      ) : null}
    </span>
  );
}

/**
 * Inventory History: every change to an item's on-hand / backup count, from
 * the immutable ledger, newest first. The same shared table kit as the other
 * views, so every column filters.
 */
export function HistoryView({
  snapshot,
  restaurantSlug,
  timeZone,
  load,
  onBack,
}: {
  snapshot: CatalogSnapshot;
  restaurantSlug: string;
  timeZone: string;
  load: LoadHistory;
  onBack: () => void;
}) {
  const [days, setDays] = useState(30);
  const [loaded, setLoaded] = useState<{
    days: number;
    outcome: HistoryLoad;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void load(days, null)
      .catch(
        (): HistoryLoad => ({
          ok: false,
          error: "History could not be loaded.",
        }),
      )
      .then((outcome) => {
        if (!cancelled) setLoaded({ days, outcome });
      });
    return () => {
      cancelled = true;
    };
  }, [days, load]);

  const loading = loaded?.days !== days;
  const outcome = loading ? null : loaded.outcome;
  const rows = useMemo(
    () => (outcome?.ok ? buildHistoryRows(outcome.entries, snapshot) : []),
    [outcome, snapshot],
  );

  const columns = useMemo<TableColumn<HistoryRow>[]>(() => {
    const spec = new Map(HISTORY_COLUMNS.map((column) => [column.id, column]));
    const col = (
      id: string,
      extra: Pick<TableColumn<HistoryRow>, "render"> &
        Partial<
          Pick<
            TableColumn<HistoryRow>,
            "sortable" | "align" | "tabletHidden" | "noFilter"
          >
        >,
    ): TableColumn<HistoryRow> => ({ ...spec.get(id)!, ...extra });
    const text = (value: string | null) => value ?? "—";
    return [
      col("at", {
        sortable: true,
        render: (r) => formatBusinessDateTime(r.at, timeZone),
      }),
      col("vendor", { sortable: true, render: (r) => r.vendor }),
      col("item", { sortable: true, render: (r) => <ItemName row={r} /> }),
      col("category", {
        sortable: true,
        tabletHidden: true,
        render: (r) => text(r.category),
      }),
      col("subcategory", {
        sortable: true,
        tabletHidden: true,
        render: (r) => text(r.subcategory),
      }),
      col("size", {
        sortable: true,
        tabletHidden: true,
        render: (r) => text(r.size),
      }),
      col("unit", {
        sortable: true,
        tabletHidden: true,
        render: (r) => r.unit,
      }),
      col("reason", { sortable: true, render: (r) => r.reason }),
      col("source", {
        sortable: true,
        tabletHidden: true,
        render: (r) => r.source,
      }),
      col("prevOnHand", {
        sortable: true,
        align: "right",
        render: (r) => formatQuantity(r.prevOnHand),
      }),
      col("newOnHand", {
        sortable: true,
        align: "right",
        render: (r) => formatQuantity(r.newOnHand),
      }),
      col("deltaOnHand", {
        sortable: true,
        align: "right",
        render: (r) => <Delta value={r.deltaOnHand} />,
      }),
      col("prevBackup", {
        sortable: true,
        align: "right",
        tabletHidden: true,
        render: (r) => formatQuantity(r.prevBackup),
      }),
      col("newBackup", {
        sortable: true,
        align: "right",
        tabletHidden: true,
        render: (r) => formatQuantity(r.newBackup),
      }),
      col("deltaBackup", {
        sortable: true,
        align: "right",
        render: (r) => <Delta value={r.deltaBackup} />,
      }),
      col("actor", { sortable: true, render: (r) => text(r.actor) }),
      col("note", { tabletHidden: true, render: (r) => text(r.note) }),
      col("importBatch", {
        tabletHidden: true,
        render: (r) => text(r.importBatch),
      }),
    ];
  }, [timeZone]);

  return (
    <div
      className="flex w-full max-w-full min-w-0 flex-col gap-3"
      data-testid="bar-inventory-history"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Inventory history</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="History range"
            className="w-auto"
            value={String(days)}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {RANGES.map((range) => (
              <option key={range.days} value={range.days}>
                {range.label}
              </option>
            ))}
          </Select>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Every count change, newest first. Names are the item’s current ones, so
        a renamed or archived item keeps its history.
      </p>

      {loading ? (
        <div>
          <p className="sr-only" role="status">
            Loading history…
          </p>
          <TableSkeleton />
        </div>
      ) : outcome && !outcome.ok ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <p role="alert" className="text-destructive text-sm">
              {outcome.error}
            </p>
            <Button variant="secondary" onClick={() => setDays((d) => d)}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {outcome?.ok && outcome.truncated ? (
            <p
              role="status"
              className="border-warn/30 bg-warn/15 text-warn rounded-lg border px-3 py-2 text-sm"
            >
              Showing the {rows.length.toLocaleString()} most recent changes.
              Choose a shorter range to see everything in it.
            </p>
          ) : null}
          <FilterableTable<HistoryRow>
            tableKey="hist"
            restaurantSlug={restaurantSlug}
            label="History"
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            timeZone={timeZone}
            defaultSort={HISTORY_DEFAULT_SORT}
            sortPresets={HISTORY_SORT_PRESETS}
            emptyMessage="No count changes in this range yet."
            renderCard={(row) => (
              <article
                aria-label={`${row.item}, ${formatBusinessDateTime(row.at, timeZone)}`}
                className="border-border bg-card flex flex-col gap-1.5 rounded-xl border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">
                      {row.item}
                      {row.size ? ` ${row.size}` : ""}
                      {row.archived ? " (archived)" : ""}
                    </h3>
                    <p className="text-muted-foreground text-xs">
                      {row.vendor}
                    </p>
                  </div>
                  <Badge tone="neutral">{row.reason}</Badge>
                </div>
                <p className="text-sm">{changeSummary(row)}</p>
                <p className="text-muted-foreground text-xs">
                  {formatBusinessDateTime(row.at, timeZone)} · {row.source}
                  {row.actor ? ` · ${row.actor}` : ""}
                </p>
                {row.note ? <p className="text-sm">{row.note}</p> : null}
              </article>
            )}
          />
        </>
      )}
    </div>
  );
}
