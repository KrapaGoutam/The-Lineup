"use client";
import { CalendarClock, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { countValue } from "../domain/bulk-count";
import {
  businessDate,
  dateSummary,
  displayInventoryDate,
  expirationStatus,
  manufactureStatus,
  MANUFACTURE_LABELS,
  parseInventoryDate,
  type DateLot,
} from "../domain/freshness";
import { dateAlertText, type InventoryRow } from "../domain/inventory-rows";
import type { CatalogSnapshot } from "../domain/inventory-types";
import { Sheet } from "./table-kit/sheet";
import type { RunCatalogCommand } from "./catalog-dialogs";
import { formatQuantity } from "./editable-cell";

export function DateAlert({ row }: { row: InventoryRow }) {
  const urgent = (row.dateInfo?.rank ?? 6) < 3;
  const Icon = urgent ? TriangleAlert : CalendarClock;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        urgent
          ? "text-destructive"
          : (row.dateInfo?.rank ?? 6) < 5
            ? "text-warn"
            : "text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {dateAlertText(row)}
    </span>
  );
}
export function DateTracking({
  row,
  snapshot,
  run,
  timeZone,
  onClose,
}: {
  row: InventoryRow;
  snapshot: CatalogSnapshot;
  run: RunCatalogCommand;
  timeZone: string;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<DateLot | "new" | null>(null);
  const [manufacture, setManufacture] = useState("");
  const [expiration, setExpiration] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const product = snapshot.products.find((p) => p.id === row.productId)!;
  const rule =
    snapshot.freshnessRules?.find(
      (r) => r.subcategoryId === product.subcategoryId,
    ) ?? null;
  const today = businessDate(new Date(), timeZone);
  const summary = dateSummary(
    (snapshot.dateLots ?? []).filter((l) => l.productId === row.productId),
    rule,
    today,
    row.total,
    row.status === "archived",
  );
  function edit(lot: DateLot | "new") {
    setEditing(lot);
    setManufacture(
      lot === "new"
        ? ""
        : lot.manufacture
          ? displayInventoryDate(lot.manufacture)
          : "",
    );
    setExpiration(
      lot === "new"
        ? ""
        : lot.expiration
          ? displayInventoryDate(lot.expiration)
          : "",
    );
    setQuantity(
      lot === "new" || lot.quantity === null ? "" : String(lot.quantity),
    );
    setNotes(lot === "new" ? "" : (lot.notes ?? ""));
    setError(null);
  }
  async function save() {
    if (!editing || busy) return;
    setError(null);
    try {
      const mfg = parseInventoryDate(manufacture, "manufacture"),
        exp = parseInventoryDate(expiration, "expiration");
      const qty = countValue(quantity);
      if (!mfg && !exp)
        throw new Error("Enter a manufacture or expiration date.");
      if (mfg && exp && mfg.date > exp.date)
        throw new Error("Expiration must not precede manufacture.");
      setBusy(true);
      const result = await run({
        type: "dateLotSave",
        id: editing === "new" ? null : editing.id,
        productId: row.productId,
        quantity: qty,
        manufacture: mfg,
        expiration: exp,
        notes: notes.trim() || null,
        active: true,
        expectedVersion: editing === "new" ? null : editing.version,
      });
      if (result.ok) setEditing(null);
      else setError(result.error);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save the date entry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function archive(lot: DateLot) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await run({
        type: "dateLotSave",
        ...lot,
        manufacture: lot.manufacture,
        expiration: lot.expiration,
        active: false,
        expectedVersion: lot.version,
      });
      if (!result.ok) setError(result.error);
      else setEditing(null);
    } catch {
      setError("Could not archive the date entry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`${row.name} — Date Tracking`}
      description={`${summary.lots.length} date groups · ${formatQuantity(summary.datedQuantity)} units with recorded quantities`}
      className="sm:w-[min(94vw,52rem)] sm:max-w-[52rem]"
    >
      <div className="bg-muted/30 space-y-1 rounded-lg p-3 text-sm">
        <p>Inventory total: {formatQuantity(row.total)}</p>
        <p>Dated quantity: {formatQuantity(summary.datedQuantity)}</p>
        <p>Without date: {formatQuantity(summary.withoutDate)}</p>
        {summary.excess > 0 ? (
          <p>
            Dated quantity exceeds inventory by {formatQuantity(summary.excess)}
            .
          </p>
        ) : null}
        {summary.unknownQuantity ? (
          <p>
            {summary.unknownQuantity} date groups have no quantity entered;
            coverage is incomplete.
          </p>
        ) : null}
        <p className="text-muted-foreground">
          Date quantities are informational. Counts do not automatically consume
          date groups.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {!summary.lots.length ? (
        <p className="text-muted-foreground text-sm">No date entries yet.</p>
      ) : (
        <ul className="space-y-2">
          {summary.lots
            .toSorted((a, b) =>
              (a.expiration?.date ?? "9999").localeCompare(
                b.expiration?.date ?? "9999",
              ),
            )
            .map((lot) => (
              <li
                key={lot.id}
                className="border-border space-y-2 rounded-lg border p-3 text-sm"
              >
                <p>
                  Manufactured: {displayInventoryDate(lot.manufacture)} ·
                  Expires: {displayInventoryDate(lot.expiration)} · Qty:{" "}
                  {lot.quantity === null
                    ? "Not entered"
                    : formatQuantity(lot.quantity)}
                </p>
                <p className="flex items-center gap-1">
                  <CalendarClock aria-hidden="true" className="size-4" />
                  {expirationStatus(lot.expiration, today).text}
                </p>
                <p>
                  {
                    MANUFACTURE_LABELS[
                      manufactureStatus(lot.manufacture, rule, today)
                    ]
                  }
                </p>
                {lot.notes ? (
                  <p className="whitespace-pre-wrap">{lot.notes}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy || row.status === "archived"}
                    onClick={() => edit(lot)}
                  >
                    Edit date entry
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy || row.status === "archived"}
                    onClick={() => void archive(lot)}
                  >
                    Archive date entry
                  </Button>
                </div>
              </li>
            ))}
        </ul>
      )}
      {editing ? (
        <form
          className="border-border grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className="text-muted-foreground text-sm sm:col-span-2">
            Use MM/DD/YY, MM/DD/YYYY, MM/YY or MM/YYYY. Month-only expiration is
            valid through month end.
          </p>
          <label className="text-sm">
            Manufactured
            <Input
              value={manufacture}
              placeholder="MM/YY or MM/DD/YY"
              onChange={(e) => setManufacture(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Expires
            <Input
              value={expiration}
              placeholder="MM/YY or MM/DD/YY"
              onChange={(e) => setExpiration(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Quantity (optional)
            <Input
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Notes (optional)
            <Input
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save date entry"}
            </Button>
            <Button
              variant="ghost"
              type="button"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancel date edit
            </Button>
            {editing !== "new" ? (
              <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => {
                  const current = snapshot.dateLots?.find(
                    (l) => l.id === editing.id,
                  );
                  if (current) edit(current);
                }}
              >
                Reload latest entry
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <Button
          disabled={busy || row.status === "archived"}
          onClick={() => edit("new")}
        >
          Add Date Entry
        </Button>
      )}
    </Sheet>
  );
}
