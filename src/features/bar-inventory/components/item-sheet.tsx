"use client";

import { useId, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

import type { InventoryRow } from "../domain/inventory-rows";
import type {
  CatalogConflict,
  CatalogSnapshot,
} from "../domain/inventory-types";
import {
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REASON_LABELS,
  parseQuantityInput,
  type AdjustmentReason,
} from "../domain/stock-rules";
import type { LoadHistory } from "./history-view";
import type { RunCatalogCommand } from "./catalog-dialogs";
import { DateTrackingContent } from "./date-tracking";
import { ItemHistory } from "./item-history";
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
  const res = parseQuantityInput(text, { allowBlank: !required, label });
  if (res.ok) return { ok: true, value: res.value };
  return { ok: false, error: res.error };
}

const text = (value: number | null) => (value === null ? "" : String(value));

/**
 * Full edit of one item (the phone detail sheet, also reachable from the
 * table's row action). Counts and levels save separately because they are
 * different operations in the database: counts write the immutable ledger,
 * levels are change-logged.
 */
export type ItemHistorySource = { timeZone: string; load: LoadHistory };
export type ItemSheetTab = "counts" | "levels" | "dates" | "history";
const ITEM_TABS: { id: ItemSheetTab; label: string }[] = [
  { id: "counts", label: "Counts" },
  { id: "levels", label: "Levels" },
  { id: "dates", label: "Dates" },
  { id: "history", label: "History" },
];

export type ItemDatesSource = {
  snapshot: CatalogSnapshot;
  run: RunCatalogCommand;
  timeZone: string;
};

export function ItemSheet({
  row,
  defaultReason,
  actions,
  dates,
  history,
  initialTab = "counts",
  onClose,
}: {
  row: InventoryRow | null;
  defaultReason: AdjustmentReason;
  actions: ItemSheetActions;
  dates: ItemDatesSource;
  history?: ItemHistorySource;
  initialTab?: ItemSheetTab;
  onClose: () => void;
}) {
  const [datesBusy, setDatesBusy] = useState(false);
  const close = () => {
    if (!datesBusy) onClose();
  };
  return (
    <Sheet
      open={row !== null}
      onClose={close}
      title={row ? row.name : "Item"}
      description={
        row ? `${row.vendor}${row.size ? ` · ${row.size}` : ""}` : undefined
      }
      className="sm:w-[min(94vw,52rem)] sm:max-w-[52rem]"
    >
      {row ? (
        <ItemForm
          key={row.productId}
          row={row}
          defaultReason={defaultReason}
          actions={actions}
          dates={dates}
          history={history}
          initialTab={initialTab}
          datesBusy={datesBusy}
          onDatesBusyChange={setDatesBusy}
          onClose={close}
        />
      ) : null}
    </Sheet>
  );
}

function ItemForm({
  row,
  defaultReason,
  actions,
  dates,
  history,
  initialTab,
  datesBusy,
  onDatesBusyChange,
  onClose,
}: {
  row: InventoryRow;
  defaultReason: AdjustmentReason;
  actions: ItemSheetActions;
  dates: ItemDatesSource;
  history?: ItemHistorySource;
  initialTab: ItemSheetTab;
  datesBusy: boolean;
  onDatesBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [tab, setTab] = useState<ItemSheetTab>(initialTab);
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
  const tabBusy = busy !== null || datesBusy;

  function selectTab(next: ItemSheetTab, focus = false) {
    if (tabBusy) return;
    setTab(next);
    setMessage(null);
    if (focus) document.getElementById(`${id}-${next}-tab`)?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = ITEM_TABS.findIndex((item) => item.id === tab);
    let next: ItemSheetTab | null = null;
    if (event.key === "ArrowRight")
      next = ITEM_TABS[(index + 1) % ITEM_TABS.length].id;
    if (event.key === "ArrowLeft")
      next = ITEM_TABS[(index - 1 + ITEM_TABS.length) % ITEM_TABS.length].id;
    if (event.key === "Home") next = ITEM_TABS[0].id;
    if (event.key === "End") next = ITEM_TABS.at(-1)!.id;
    if (next) {
      event.preventDefault();
      selectTab(next, true);
    }
  }

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

      <div
        role="tablist"
        aria-label={`${row.name} details`}
        onKeyDown={handleTabKeyDown}
        className="border-border bg-muted/30 flex max-w-full gap-1 overflow-x-auto rounded-lg border p-1"
      >
        {ITEM_TABS.map(({ id: tabId, label }) => (
          <Button
            key={tabId}
            id={`${id}-${tabId}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === tabId}
            aria-controls={`${id}-${tabId}-panel`}
            tabIndex={tab === tabId ? 0 : -1}
            variant={tab === tabId ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0"
            disabled={tabBusy && tab !== tabId}
            onClick={() => selectTab(tabId)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div
        id={`${id}-${tab}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${tab}-tab`}
        tabIndex={0}
        className="flex flex-col gap-4 outline-none"
      >
        {tab === "counts" ? (
          <fieldset className="border-border flex flex-col gap-3 rounded-xl border p-3">
            <legend className="px-1 text-sm font-semibold">Count</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-on`}>On hand</Label>
                <Input
                  id={`${id}-on`}
                  type="text"
                  inputMode="decimal"
                  value={onHand}
                  onChange={(e) => setOnHand(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-back`}>Backup</Label>
                <Input
                  id={`${id}-back`}
                  type="text"
                  inputMode="decimal"
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
            <Button
              disabled={busy !== null}
              onClick={() => void submitCounts()}
            >
              {busy === "counts"
                ? "Saving…"
                : staleNow
                  ? "Save count over their change"
                  : "Save count"}
            </Button>
          </fieldset>
        ) : null}

        {tab === "levels" ? (
          <fieldset className="border-border flex flex-col gap-3 rounded-xl border p-3">
            <legend className="px-1 text-sm font-semibold">Levels</legend>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-cutoff`}>Cutoff</Label>
                <Input
                  id={`${id}-cutoff`}
                  type="text"
                  inputMode="decimal"
                  value={cutoff}
                  onChange={(e) => setCutoff(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-warning`}>Warning</Label>
                <Input
                  id={`${id}-warning`}
                  type="text"
                  inputMode="decimal"
                  value={warning}
                  onChange={(e) => setWarning(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-par`}>Par</Label>
                <Input
                  id={`${id}-par`}
                  type="text"
                  inputMode="decimal"
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
        ) : null}

        {message && (tab === "counts" || tab === "levels") ? (
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
        {tab === "dates" ? (
          <DateTrackingContent
            row={row}
            snapshot={dates.snapshot}
            run={dates.run}
            timeZone={dates.timeZone}
            onBusyChange={onDatesBusyChange}
          />
        ) : null}
        {tab === "history" && history ? (
          <ItemHistory
            productId={row.productId}
            timeZone={history.timeZone}
            load={history.load}
            initialOpen
          />
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
