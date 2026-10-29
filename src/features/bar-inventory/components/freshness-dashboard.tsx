"use client";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { displayInventoryDate } from "../domain/freshness";
import type { InventoryRow } from "../domain/inventory-rows";
import type { FilterState, TableState } from "../domain/table-filters";
import { DateAlert } from "./date-tracking";
import { formatQuantity } from "./editable-cell";
const TILES: {
  id: string;
  label: string;
  matches: (row: InventoryRow) => boolean;
  filters: FilterState;
}[] = [
  {
    id: "expiring",
    label: "Expiring ≤30 days",
    matches: (r) =>
      r.dateInfo?.expiration.days !== null &&
      r.dateInfo?.expiration.days !== undefined &&
      r.dateInfo.expiration.days >= 0 &&
      r.dateInfo.expiration.days <= 30,
    filters: {
      expirationDays: { type: "number", op: "between", value: 0, to: 30 },
    },
  },
  {
    id: "urgent",
    label: "Urgent ≤7 days",
    matches: (r) =>
      r.dateInfo?.expiration.days !== null &&
      r.dateInfo?.expiration.days !== undefined &&
      r.dateInfo.expiration.days >= 0 &&
      r.dateInfo.expiration.days <= 7,
    filters: {
      expirationDays: { type: "number", op: "between", value: 0, to: 7 },
    },
  },
  {
    id: "expired",
    label: "Expired",
    matches: (r) => r.dateInfo?.expiration.status === "expired",
    filters: { expirationDays: { type: "number", op: "lt", value: 0 } },
  },
  {
    id: "aging",
    label: "Aging Soon",
    matches: (r) => r.dateInfo?.manufacture === "aging",
    filters: { freshness: { type: "select", values: ["Aging Soon"] } },
  },
  {
    id: "limit",
    label: "Freshness Limit",
    matches: (r) => r.dateInfo?.manufacture === "limit",
    filters: { freshness: { type: "select", values: ["Freshness Limit"] } },
  },
];
export function FreshnessDashboard({
  rows,
  onOpenInventory,
}: {
  rows: InventoryRow[];
  onOpenInventory: (state: TableState) => void;
}) {
  const active = rows.filter((r) => r.status !== "archived");
  const alerts = active
    .filter((r) => (r.dateInfo?.rank ?? 6) < 5)
    .toSorted(
      (a, b) =>
        a.dateInfo!.rank - b.dateInfo!.rank ||
        (a.dateInfo?.nearest?.expiration?.date ?? "9999").localeCompare(
          b.dateInfo?.nearest?.expiration?.date ?? "9999",
        ) ||
        a.name.localeCompare(b.name),
    );
  return (
    <section aria-labelledby="bi-freshness" className="space-y-3">
      <h2 id="bi-freshness" className="text-lg font-semibold">
        Freshness &amp; Expiration
      </h2>
      <p className="text-muted-foreground text-sm">
        Each card counts products. The 7-day window is included in the 30-day
        window; manufacture freshness is independent. Counts should not be added
        together.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {TILES.map((tile) => (
          <button
            key={tile.id}
            type="button"
            data-testid={`date-kpi-${tile.id}`}
            aria-label={`${tile.label}: ${active.filter(tile.matches).length} products. Open in Inventory`}
            className="border-border bg-card hover:bg-muted/40 focus-visible:ring-ring flex min-h-24 min-w-0 flex-col items-start gap-2 rounded-xl border p-3 text-left focus-visible:ring-2"
            onClick={() =>
              onOpenInventory({
                search: "",
                filters: tile.filters,
                sort: [
                  { id: "dateUrgency", dir: "asc" },
                  { id: "expiration", dir: "asc" },
                ],
              })
            }
          >
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
              {tile.label}
            </span>
            <span className="text-xl font-bold tabular-nums">
              {active.filter(tile.matches).length}{" "}
              <span className="text-muted-foreground text-xs font-normal">
                products
              </span>
            </span>
          </button>
        ))}
      </div>
      {!alerts.length ? (
        <p className="text-muted-foreground text-sm">
          No freshness or expiration alerts. Add date entries in Inventory to
          track dates.
        </p>
      ) : (
        <ul aria-label="Freshness and expiration alerts" className="space-y-2">
          {alerts.map((row) => {
            const info = row.dateInfo!;
            const lot =
              info.rank === 2.5 || info.rank === 4.5
                ? info.oldest
                : info.nearest;
            return (
              <li
                key={row.productId}
                className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <h3 className="font-medium break-words">{row.name}</h3>
                  <DateAlert row={row} />
                  <p className="text-muted-foreground text-xs">
                    {lot?.quantity === null || lot?.quantity === undefined
                      ? "Quantity not entered"
                      : `${formatQuantity(lot.quantity)} units`}{" "}
                    ·{" "}
                    {lot?.expiration && info.rank !== 2.5 && info.rank !== 4.5
                      ? `Expires ${displayInventoryDate(lot.expiration)}`
                      : `Manufactured ${displayInventoryDate(lot?.manufacture ?? null)}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  aria-label={`Open ${row.name} date alerts in Inventory`}
                  onClick={() =>
                    onOpenInventory({
                      search: "",
                      filters: {
                        name: { type: "text", op: "equals", value: row.name },
                        vendor: { type: "select", values: [row.vendor] },
                      },
                      sort: [{ id: "dateUrgency", dir: "asc" }],
                    })
                  }
                >
                  View in Inventory
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
