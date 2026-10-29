"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatBusinessDateTime } from "@/lib/date-time";
import {
  reviewCounts,
  type CountInput,
  type CountChange,
} from "../domain/bulk-count";
import type { InventoryRow } from "../domain/inventory-rows";
import type { CatalogConflict } from "../domain/inventory-types";
import {
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REASON_LABELS,
  type AdjustmentReason,
} from "../domain/stock-rules";
import type { RunCatalogCommand } from "./catalog-dialogs";
import { Sheet } from "./table-kit/sheet";
import { formatQuantity } from "./editable-cell";
import { DateAlert } from "./date-tracking";

export function BulkCount({
  rows,
  latestRows,
  run,
  onClose,
  timeZone,
}: {
  rows: InventoryRow[];
  latestRows: InventoryRow[];
  run: RunCatalogCommand;
  onClose: () => void;
  timeZone: string;
}) {
  const [inputs, setInputs] = useState<Record<string, CountInput>>({});
  const [reason, setReason] = useState<AdjustmentReason>("stock_count");
  const [note, setNote] = useState("");
  const [review, setReview] = useState<CountChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Extract<
    CatalogConflict,
    { kind: "stale" }
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [baseline, setBaseline] = useState(rows);
  function prepare() {
    try {
      const changes = reviewCounts(baseline, inputs);
      if (!changes.length)
        throw new Error(
          "No counts changed. Blank cells leave counts unchanged.",
        );
      setReview(changes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the counts.");
    }
  }
  async function confirm() {
    if (!review || busy || conflict) return;
    setBusy(true);
    setError(null);
    try {
      const result = await run({
        type: "bulkCount",
        rows: review.map((c) => c.request),
        reason,
        note: note.trim() || null,
      });
      if (result.ok) onClose();
      else {
        setError(result.error);
        if (result.conflict?.kind === "stale") setConflict(result.conflict);
      }
    } catch {
      setError(
        "Could not confirm the save. Refresh and review before trying again.",
      );
      setReview(null);
    } finally {
      setBusy(false);
    }
  }
  const conflictRow = conflict
    ? baseline.find((r) => r.productId === conflict.id)
    : null;
  return (
    <Sheet
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Bulk Count"
      description={`${baseline.length} selected · Blank = unchanged. Enter 0 to set zero.`}
      className="sm:w-[min(94vw,72rem)] sm:max-w-[72rem]"
    >
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      {conflict ? (
        <div
          role="alert"
          className="border-border rounded-lg border p-3 text-sm"
        >
          <p>
            {conflictRow?.name ?? "A product"} changed after this count was
            opened. Nothing was saved.
          </p>
          <p>
            Reviewed: On hand {formatQuantity(conflictRow?.onHand ?? null)} ·
            Backup {formatQuantity(conflictRow?.backup ?? null)}
          </p>
          <p>
            Latest: On hand {formatQuantity(conflict.current?.onHand ?? null)} ·
            Backup {formatQuantity(conflict.current?.backup ?? null)}
          </p>
          {conflict.updatedBy ? <p>Changed by {conflict.updatedBy}</p> : null}
          {conflict.updatedAt ? (
            <p>{formatBusinessDateTime(conflict.updatedAt, timeZone)}</p>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              setBaseline(
                latestRows.filter(
                  (r) =>
                    baseline.some((b) => b.productId === r.productId) &&
                    r.status !== "archived",
                ),
              );
              setConflict(null);
              setReview(null);
              setError(null);
            }}
          >
            Refresh counts and re-review
          </Button>
        </div>
      ) : null}
      {review ? (
        <>
          <h3 className="font-semibold">
            Review Changes · {review.length} changed of {baseline.length}{" "}
            selected
          </h3>
          <ul className="space-y-3">
            {review.map((c) => (
              <li
                key={c.row.productId}
                className="border-border rounded-lg border p-3 text-sm"
              >
                <strong>{c.row.name}</strong>
                <p>
                  On hand: {formatQuantity(c.row.onHand)} →{" "}
                  {formatQuantity(c.onHand)} (
                  {c.onHand - c.row.onHand >= 0 ? "+" : ""}
                  {formatQuantity(c.onHand - c.row.onHand)})
                </p>
                <p>
                  Backup: {formatQuantity(c.row.backup)} →{" "}
                  {formatQuantity(c.backup)} (
                  {c.backup - c.row.backup >= 0 ? "+" : ""}
                  {formatQuantity(c.backup - c.row.backup)})
                </p>
              </li>
            ))}
          </ul>
          <p className="text-sm">
            Reason: {ADJUSTMENT_REASON_LABELS[reason]}
            {note ? ` · ${note}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              Back to counts
            </Button>
            <Button
              disabled={busy || !!conflict}
              onClick={() => void confirm()}
            >
              {busy ? "Saving…" : `Confirm ${review.length} Changes`}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm">
              Adjustment reason
              <Select
                value={reason}
                onChange={(e) => setReason(e.target.value as AdjustmentReason)}
              >
                {ADJUSTMENT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {ADJUSTMENT_REASON_LABELS[r]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm">
              Optional note
              <Input
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>
          <div className="space-y-2">
            {baseline.map((row) => {
              const input = inputs[row.productId] ?? { onHand: "", backup: "" };
              let delta: string = "—";
              try {
                const c = reviewCounts([row], { [row.productId]: input });
                delta = c.length
                  ? `${c[0].delta >= 0 ? "+" : ""}${formatQuantity(c[0].delta)}`
                  : "0";
              } catch {
                delta = "Check counts";
              }
              return (
                <fieldset
                  key={row.productId}
                  className="border-border grid min-w-0 gap-2 rounded-lg border p-3 md:grid-cols-[2fr_1fr_1fr_1fr] md:items-end"
                >
                  <legend className="px-1 font-medium">{row.name}</legend>
                  <div className="text-muted-foreground text-sm">
                    <p>{row.vendor}</p>
                    <DateAlert row={row} />
                    <p>
                      Current: {formatQuantity(row.onHand)} on hand ·{" "}
                      {formatQuantity(row.backup)} backup
                    </p>
                  </div>
                  {(["onHand", "backup"] as const).map((field) => (
                    <label key={field} className="text-sm">
                      New {field === "onHand" ? "On Hand" : "Backup"}
                      <Input
                        aria-label={`New ${field === "onHand" ? "On Hand" : "Backup"}: ${row.name}`}
                        inputMode="decimal"
                        value={input[field]}
                        placeholder="Unchanged"
                        onChange={(e) => {
                          setInputs((current) => ({
                            ...current,
                            [row.productId]: {
                              ...input,
                              [field]: e.target.value,
                            },
                          }));
                          setError(null);
                        }}
                      />
                    </label>
                  ))}
                  <p className="text-sm">Difference: {delta}</p>
                </fieldset>
              );
            })}
          </div>
          <Button disabled={!!conflict} onClick={prepare}>
            Review Changes
          </Button>
        </>
      )}
    </Sheet>
  );
}
