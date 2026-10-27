"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

import type { InventoryRow } from "../domain/inventory-rows";
import type { CatalogConflict } from "../domain/inventory-types";
import {
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REASON_LABELS,
  toCents,
  type AdjustmentReason,
} from "../domain/stock-rules";
import { Sheet } from "./table-kit/sheet";
import { StatusBadge } from "./table-kit/status-badge";

type SaveResult =
  | { ok: true }
  | { ok: false; error: string; conflict?: CatalogConflict };

export type ItemSheetActions = {
  saveCounts: (
    row: InventoryRow,
    counts: { onHand: number; backup: number },
    extra: { reason: AdjustmentReason; note: string | null },
    expectedVersion: number,
  ) => Promise<SaveResult>;
  saveLevels: (
    row: InventoryRow,
    levels: {
      cutoff: number | null;
      warning: number | null;
      par: number | null;
    },
    expectedVersion: number,
  ) => Promise<SaveResult>;
};

function parseQuantity(
  label: string,
  text: string,
  required: boolean,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (text.trim() === "") {
    return required
      ? { ok: false, error: `Enter a number for ${label}.` }
      : { ok: true, value: null };
  }
  const n = Number(text);
  if (!Number.isFinite(n))
    return { ok: false, error: `Enter a number for ${label}.` };
  try {
    toCents(n);
  } catch (e) {
    return { ok: false, error: `${label}: ${(e as Error).message}` };
  }
  if (n < 0) return { ok: false, error: `${label} cannot be negative.` };
  return { ok: true, value: n };
}

const text = (value: number | null) => (value === null ? "" : String(value));

/**
 * Full edit of one item (the phone detail sheet, also reachable from the
 * table's row action). Counts and levels save separately because they are
 * different operations in the database: counts write the immutable ledger,
 * levels are change-logged.
 */
export function ItemSheet({
  row,
  defaultReason,
  actions,
  onClose,
}: {
  row: InventoryRow | null;
  defaultReason: AdjustmentReason;
  actions: ItemSheetActions;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={row !== null}
      onClose={onClose}
      title={row ? row.name : "Item"}
      description={
        row ? `${row.vendor}${row.size ? ` · ${row.size}` : ""}` : undefined
      }
    >
      {row ? (
        <ItemForm
          key={row.productId}
          row={row}
          defaultReason={defaultReason}
          actions={actions}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function ItemForm({
  row,
  defaultReason,
  actions,
  onClose,
}: {
  row: InventoryRow;
  defaultReason: AdjustmentReason;
  actions: ItemSheetActions;
  onClose: () => void;
}) {
  const id = useId();
  // Versions as the sheet was opened; a stale conflict moves them forward only
  // when the person chooses "Save over their change".
  const [countsVersion, setCountsVersion] = useState(row.stockVersion);
  const [levelsVersion, setLevelsVersion] = useState(row.stockVersion);
  const [onHand, setOnHand] = useState(text(row.onHand));
  const [backup, setBackup] = useState(text(row.backup));
  const [reason, setReason] = useState<AdjustmentReason>(defaultReason);
  const [note, setNote] = useState("");
  const [cutoff, setCutoff] = useState(text(row.cutoff));
  const [warning, setWarning] = useState(text(row.warning));
  const [par, setPar] = useState(text(row.par));
  const [busy, setBusy] = useState<"counts" | "levels" | null>(null);
  const [message, setMessage] = useState<{
    kind: "error" | "stale" | "ok";
    text: string;
  } | null>(null);

  function describe(
    result: Extract<SaveResult, { ok: false }>,
    which: "counts" | "levels",
  ) {
    if (result.conflict?.kind === "stale") {
      const who = result.conflict.updatedBy ?? "Someone";
      if (which === "counts") setCountsVersion(result.conflict.currentVersion);
      else setLevelsVersion(result.conflict.currentVersion);
      setMessage({
        kind: "stale",
        text: `${who} changed this item${result.conflict.current ? ` (on hand ${result.conflict.current.onHand}, backup ${result.conflict.current.backup})` : ""}. Review the latest, then save again to replace their change.`,
      });
    } else {
      setMessage({ kind: "error", text: result.error });
    }
  }

  async function submitCounts() {
    const a = parseQuantity("On hand", onHand, true);
    const b = parseQuantity("Backup", backup, true);
    if (!a.ok || !b.ok) {
      setMessage({
        kind: "error",
        text: !a.ok ? a.error : (b as { error: string }).error,
      });
      return;
    }
    setBusy("counts");
    setMessage(null);
    const result = await actions.saveCounts(
      row,
      { onHand: a.value as number, backup: b.value as number },
      { reason, note: note.trim() === "" ? null : note },
      countsVersion,
    );
    setBusy(null);
    if (result.ok) onClose();
    else describe(result, "counts");
  }

  async function submitLevels() {
    const c = parseQuantity("Cutoff", cutoff, false);
    const w = parseQuantity("Warning level", warning, false);
    const p = parseQuantity("Par", par, false);
    const bad = [c, w, p].find((r) => !r.ok) as { error: string } | undefined;
    if (bad) {
      setMessage({ kind: "error", text: bad.error });
      return;
    }
    setBusy("levels");
    setMessage(null);
    const result = await actions.saveLevels(
      row,
      {
        cutoff: (c as { value: number | null }).value,
        warning: (w as { value: number | null }).value,
        par: (p as { value: number | null }).value,
      },
      levelsVersion,
    );
    setBusy(null);
    if (result.ok) onClose();
    else describe(result, "levels");
  }

  const staleNow = message?.kind === "stale";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={row.status} />
        <span>
          Total {row.total}
          {row.cutoff !== null ? ` · cutoff ${row.cutoff}` : ""}
        </span>
        {row.suggestedOrder !== null ? (
          <span>· Order {row.suggestedOrder}</span>
        ) : null}
        {row.orderNeeded ? <span>· Order needed</span> : null}
      </div>

      <fieldset className="border-border flex flex-col gap-3 rounded-xl border p-3">
        <legend className="px-1 text-sm font-semibold">Count</legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-on`}>On hand</Label>
            <Input
              id={`${id}-on`}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={onHand}
              onChange={(e) => setOnHand(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-back`}>Backup</Label>
            <Input
              id={`${id}-back`}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={backup}
              onChange={(e) => setBackup(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-reason`}>Reason</Label>
          <Select
            id={`${id}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value as AdjustmentReason)}
          >
            {ADJUSTMENT_REASONS.map((r) => (
              <option key={r} value={r}>
                {ADJUSTMENT_REASON_LABELS[r]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-note`}>Note (optional)</Label>
          <Input
            id={`${id}-note`}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Button disabled={busy !== null} onClick={() => void submitCounts()}>
          {busy === "counts"
            ? "Saving…"
            : staleNow
              ? "Save count over their change"
              : "Save count"}
        </Button>
      </fieldset>

      <fieldset className="border-border flex flex-col gap-3 rounded-xl border p-3">
        <legend className="px-1 text-sm font-semibold">Levels</legend>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-cutoff`}>Cutoff</Label>
            <Input
              id={`${id}-cutoff`}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-warning`}>Warning</Label>
            <Input
              id={`${id}-warning`}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={warning}
              onChange={(e) => setWarning(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-par`}>Par</Label>
            <Input
              id={`${id}-par`}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={par}
              onChange={(e) => setPar(e.target.value)}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Leave Warning blank to use the automatic level
          {row.effectiveWarning !== null
            ? ` (currently ${row.effectiveWarning})`
            : ""}
          . Blank clears a level.
        </p>
        <Button
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void submitLevels()}
        >
          {busy === "levels"
            ? "Saving…"
            : staleNow
              ? "Save levels over their change"
              : "Save levels"}
        </Button>
      </fieldset>

      {message ? (
        <p
          role="alert"
          className={
            message.kind === "stale"
              ? "border-warn/30 bg-warn/15 text-warn rounded-lg border px-3 py-2 text-sm"
              : "border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
          }
        >
          {message.text}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
