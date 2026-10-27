"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import type { CatalogConflict } from "../domain/inventory-types";
import {
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REASON_LABELS,
  toCents,
  type AdjustmentReason,
} from "../domain/stock-rules";

export type CellSave = (
  value: number | null,
  extra: { reason: AdjustmentReason; note: string | null } | null,
  expectedVersion: number,
) => Promise<
  { ok: true } | { ok: false; error: string; conflict?: CatalogConflict }
>;

export const formatQuantity = (value: number | null) =>
  value === null ? "—" : String(value);

type Phase = "idle" | "edit" | "reason" | "saving";
type Stale = Extract<CatalogConflict, { kind: "stale" }>;

/**
 * One editable number in the Inventory table.
 *
 *  - quantity cells (On hand, Backup): Enter/blur then a compact reason step
 *    (default = the last reason used, structured list, optional note) that
 *    never blocks keyboard flow: Tab to the reason, Enter saves;
 *  - level cells (Cutoff, Warning, Par): commit silently (change-logged by the
 *    database); an empty value clears the level.
 *
 * Esc reverts. A stale write (someone else changed it first) is never applied
 * silently: the cell says who changed it and offers "Keep theirs" or "Apply
 * mine".
 */
export function EditableCell({
  label,
  itemName,
  value,
  mode,
  defaultReason,
  expectedVersion: latestVersion,
  onSave,
}: {
  label: string;
  itemName: string;
  value: number | null;
  mode: "quantity" | "level";
  defaultReason: AdjustmentReason;
  expectedVersion: number;
  onSave: CellSave;
}) {
  const id = useId();
  const [phase, setPhaseState] = useState<Phase>("idle");
  // The ref lets blur handlers see the phase set in the same tick.
  const phaseRef = useRef<Phase>("idle");
  const go = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };
  // The version the edit STARTED from. A refresh while typing must never move
  // it forward: that would silently overwrite someone else's change.
  const [expectedVersion, setExpectedVersion] = useState(latestVersion);
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState<AdjustmentReason>(defaultReason);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<Stale | null>(null);
  const [mine, setMine] = useState<{
    value: number | null;
    reason: AdjustmentReason;
    note: string | null;
  } | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  const reset = () => {
    go("idle");
    setError(null);
    setDraft("");
    requestAnimationFrame(() => button.current?.focus());
  };

  function parse():
    | { ok: true; value: number | null }
    | { ok: false; error: string } {
    const text = draft.trim();
    if (text === "") {
      return mode === "level"
        ? { ok: true, value: null }
        : { ok: false, error: `Enter a number for ${label}.` };
    }
    const n = Number(text);
    if (!Number.isFinite(n))
      return { ok: false, error: `Enter a number for ${label}.` };
    try {
      toCents(n);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    if (n < 0) return { ok: false, error: `${label} cannot be negative.` };
    return { ok: true, value: n };
  }

  async function save(
    next: number | null,
    extra: { reason: AdjustmentReason; note: string | null } | null,
    version: number,
  ) {
    go("saving");
    setError(null);
    setMine(
      extra
        ? { value: next, reason: extra.reason, note: extra.note }
        : { value: next, reason, note: null },
    );
    const result = await onSave(next, extra, version);
    if (result.ok) {
      setStale(null);
      reset();
      return;
    }
    if (result.conflict?.kind === "stale") {
      setStale(result.conflict);
      go("idle");
      return;
    }
    setError(result.error);
    go(mode === "quantity" && extra ? "reason" : "edit");
  }

  function commitDraft() {
    const parsed = parse();
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (parsed.value === value) {
      reset();
      return;
    }
    if (mode === "level") {
      void save(parsed.value, null, expectedVersion);
    } else {
      setError(null);
      setReason(defaultReason);
      go("reason");
    }
  }

  if (stale) {
    return (
      <div
        role="alert"
        className="border-warn/30 bg-warn/15 text-warn flex max-w-56 flex-col gap-1 rounded-lg border p-2 text-xs"
      >
        <span>
          {stale.updatedBy ?? "Someone"} changed this
          {stale.updatedAt
            ? ` at ${new Date(stale.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : ""}{" "}
          (now {formatQuantity(value)}).
        </span>
        <span className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setStale(null);
              reset();
            }}
          >
            Keep theirs
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void save(
                mine?.value ?? null,
                mode === "quantity"
                  ? { reason: mine?.reason ?? reason, note: mine?.note ?? null }
                  : null,
                stale.currentVersion,
              )
            }
          >
            Apply mine ({formatQuantity(mine?.value ?? null)})
          </Button>
        </span>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <button
        ref={button}
        type="button"
        aria-label={`Edit ${label} for ${itemName}, currently ${formatQuantity(value)}`}
        onClick={() => {
          setDraft(value === null ? "" : String(value));
          setExpectedVersion(latestVersion);
          go("edit");
        }}
        className="hover:bg-muted focus-visible:ring-ring min-h-9 min-w-11 rounded-lg px-2 text-right tabular-nums outline-none focus-visible:ring-2"
      >
        {formatQuantity(value)}
      </button>
    );
  }

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          reset();
        }
      }}
    >
      <Input
        autoFocus
        type="number"
        inputMode="decimal"
        step="any"
        min={0}
        aria-label={`${label} for ${itemName}`}
        aria-invalid={error !== null}
        className="min-h-9 w-24 text-right"
        value={draft}
        disabled={phase === "saving" || phase === "reason"}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft();
          }
        }}
        onBlur={() => {
          if (phaseRef.current === "edit") commitDraft();
        }}
      />
      {phase === "reason" || (phase === "saving" && mode === "quantity") ? (
        <div
          role="group"
          aria-label={`Reason for changing ${label}`}
          className="border-border bg-popover text-popover-foreground absolute top-full right-0 z-30 mt-1 flex w-64 flex-col gap-2 rounded-xl border p-3 shadow-xl"
        >
          <p className="text-xs">
            {itemName}: {label} {formatQuantity(value)} → {draft}
          </p>
          <label
            className="flex flex-col gap-1 text-xs font-medium"
            htmlFor={`${id}-reason`}
          >
            Reason
            <Select
              id={`${id}-reason`}
              autoFocus
              value={reason}
              onChange={(event) =>
                setReason(event.target.value as AdjustmentReason)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const parsed = parse();
                  if (parsed.ok)
                    void save(
                      parsed.value,
                      { reason, note: note.trim() === "" ? null : note },
                      expectedVersion,
                    );
                }
              }}
            >
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {ADJUSTMENT_REASON_LABELS[r]}
                </option>
              ))}
            </Select>
          </label>
          <label
            className="flex flex-col gap-1 text-xs font-medium"
            htmlFor={`${id}-note`}
          >
            Note (optional)
            <Input
              id={`${id}-note`}
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const parsed = parse();
                  if (parsed.ok)
                    void save(
                      parsed.value,
                      { reason, note: note.trim() === "" ? null : note },
                      expectedVersion,
                    );
                }
              }}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={reset}
              disabled={phase === "saving"}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={phase === "saving"}
              onClick={() => {
                const parsed = parse();
                if (parsed.ok)
                  void save(
                    parsed.value,
                    { reason, note: note.trim() === "" ? null : note },
                    expectedVersion,
                  );
              }}
            >
              {phase === "saving" ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="text-destructive absolute top-full left-0 z-20 mt-1 w-56 text-xs"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
