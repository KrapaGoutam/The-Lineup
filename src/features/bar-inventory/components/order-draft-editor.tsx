"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { MarkSentFacts } from "../actions/order-draft-actions";
import type { OrderDraftFillMode } from "../domain/order-draft";
import { purchaseLines } from "../domain/order-draft-share";
import {
  diffDraftEdits,
  draftTotals,
  EMPTY_EDITS,
  fillableBlankCount,
  formatDraftTime,
  needsManualQuantity,
  orderQtyText,
  parseOrderQtyInput,
  replaceableQuantityCount,
  sortDraftLines,
  type DraftEdits,
  type DraftErrors,
  type LineEdit,
  type OrderDraftLine,
  type OrderDraftView,
} from "../domain/order-draft-view";
import type { StockStatus } from "../domain/stock-rules";
import type { OrderDraftApi } from "../hooks/use-order-drafts";
import { formatQuantity } from "./editable-cell";
import type { RunExport } from "./export-control";
import { ShareActions } from "./order-draft-share";
import { StatusBadge } from "./table-kit/status-badge";

/** What the module needs to know to stop a person leaving unsaved edits. */
export type DraftGuard = { dirty: boolean; save: () => Promise<boolean> };

/** What the screen needs after Mark Sent succeeds (or was already done). */
export type DraftSentOutcome = {
  draftId: string;
  /** False when the order had already been marked sent (a retry). */
  changed: boolean;
  sent: MarkSentFacts | undefined;
};

const NO_QUANTITY_MESSAGE = "Add a quantity before marking this order sent.";
const STALE_SEND_MESSAGE =
  "This order draft changed elsewhere. Reload the latest version before marking it sent.";

type Notice = { kind: "status" | "alert"; text: string } | null;

const TEXTAREA =
  "border-input bg-background/70 text-foreground placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-ring/40 min-h-11 w-full resize-y rounded-xl border px-3 py-2 text-sm transition outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

// Item | Suggested | Order Qty | Item note | Included -- one grid for the column
// header and every row. Below `md` each row stacks as a card instead.
const ROW_GRID =
  "md:grid md:grid-cols-[minmax(0,2fr)_6.5rem_8.5rem_minmax(0,2fr)_7.5rem] md:items-start md:gap-3";

const isStockStatus = (
  value: string,
): value is Exclude<StockStatus, "archived"> =>
  ["critical", "low", "healthy", "no_cutoff"].includes(value);

function Totals({
  draft,
  edits,
}: {
  draft: OrderDraftView;
  edits: DraftEdits;
}) {
  const totals = draftTotals(draft, edits);
  return (
    <div
      data-testid="draft-totals"
      className="border-border bg-muted/30 grid gap-x-6 gap-y-2 rounded-xl border p-3 text-sm sm:grid-cols-2 lg:grid-cols-4"
    >
      <div>
        <p className="text-muted-foreground text-xs">Suggested total</p>
        <p
          className="font-semibold tabular-nums"
          data-testid="draft-suggested-total"
        >
          {formatQuantity(totals.suggestedTotal)}
          {totals.orderNeededCount > 0 ? (
            <span className="text-muted-foreground text-xs font-normal">
              {" "}
              + {totals.orderNeededCount} order needed
            </span>
          ) : null}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">Planned order total</p>
        <p
          className="font-semibold tabular-nums"
          data-testid="draft-planned-total"
        >
          {formatQuantity(totals.plannedTotal)}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">Included lines</p>
        <p className="font-semibold tabular-nums">
          {totals.includedCount} of {draft.lines.length}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground text-xs">Manual quantity needed</p>
        <p
          className="font-semibold tabular-nums"
          data-testid="draft-manual-count"
        >
          {totals.manualQuantityRequiredCount}
          <span className="text-muted-foreground text-xs font-normal">
            {" "}
            included{" "}
            {totals.manualQuantityRequiredCount === 1
              ? "line has"
              : "lines have"}{" "}
            no quantity
          </span>
        </p>
      </div>
      <p className="text-muted-foreground text-xs sm:col-span-2 lg:col-span-4">
        Totals are ordering units, not dollars. Lines without a quantity are
        left out of the planned total.
      </p>
    </div>
  );
}

function LineRow({
  line,
  label,
  edit,
  errors,
  reveal,
  onEdit,
  onReveal,
}: {
  line: OrderDraftLine;
  label: string;
  edit: LineEdit | undefined;
  errors: { orderQty?: string; itemNote?: string } | undefined;
  reveal: (key: string) => boolean;
  onEdit: (patch: LineEdit) => void;
  onReveal: (key: string) => void;
}) {
  const uid = useId();
  const included = edit?.included ?? line.included;
  const qtyKey = `${line.productId}:qty`;
  const noteKey = `${line.productId}:note`;
  const qtyError = reveal(qtyKey) ? errors?.orderQty : undefined;
  const noteError = reveal(noteKey) ? errors?.itemNote : undefined;
  const status = isStockStatus(line.statusAtSnapshot)
    ? line.statusAtSnapshot
    : null;
  const typedQty =
    edit?.orderQty !== undefined
      ? parseOrderQtyInput(edit.orderQty, label)
      : null;
  const manual = needsManualQuantity({
    ...line,
    included,
    orderQty: typedQty?.ok ? typedQty.value : line.orderQty,
  });

  return (
    <li
      data-testid="draft-line"
      data-name={line.name}
      data-included={included}
      className={cn(
        "flex flex-col gap-3 px-3 py-3",
        ROW_GRID,
        !included && "bg-muted/40",
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            "font-medium break-words",
            !included && "text-muted-foreground line-through",
          )}
        >
          {label}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {status ? <StatusBadge status={status} /> : null}
          {!included ? <Badge tone="neutral">Excluded</Badge> : null}
          <span className="text-muted-foreground text-xs">
            {line.unit}
            {line.sku ? ` · ${line.sku}` : ""}
          </span>
        </div>
      </div>

      <div>
        <p className="text-muted-foreground text-xs md:sr-only">
          Suggested Order
        </p>
        <p className="font-semibold tabular-nums" data-testid="draft-suggested">
          {line.suggestedQty === null
            ? "Order needed"
            : formatQuantity(line.suggestedQty)}
        </p>
        <p className="text-muted-foreground text-xs">
          At draft: total {formatQuantity(line.totalAtSnapshot)}
          {line.parAtSnapshot !== null
            ? ` · par ${formatQuantity(line.parAtSnapshot)}`
            : " · no par"}
        </p>
      </div>

      <div>
        <Label htmlFor={`${uid}-qty`} className="text-xs md:sr-only">
          <span className="sr-only">Order quantity for {label}</span>
          <span aria-hidden="true">Order Qty</span>
        </Label>
        <Input
          id={`${uid}-qty`}
          inputMode="decimal"
          autoComplete="off"
          className="text-right tabular-nums"
          value={edit?.orderQty ?? orderQtyText(line.orderQty)}
          onChange={(event) => onEdit({ orderQty: event.target.value })}
          onBlur={() => onReveal(qtyKey)}
          aria-invalid={qtyError ? true : undefined}
          aria-describedby={
            qtyError
              ? `${uid}-qty-error`
              : manual
                ? `${uid}-qty-hint`
                : undefined
          }
          placeholder={line.suggestedQty === null ? "Enter qty" : ""}
        />
        {qtyError ? (
          <p id={`${uid}-qty-error`} className="text-destructive mt-1 text-xs">
            {qtyError}
          </p>
        ) : manual ? (
          <p id={`${uid}-qty-hint`} className="text-warn mt-1 text-xs">
            Quantity needed
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor={`${uid}-note`} className="text-xs md:sr-only">
          <span className="sr-only">Item note for {label}</span>
          <span aria-hidden="true">Item note</span>
        </Label>
        <textarea
          id={`${uid}-note`}
          rows={1}
          className={TEXTAREA}
          value={edit?.itemNote ?? line.itemNote ?? ""}
          onChange={(event) => onEdit({ itemNote: event.target.value })}
          onBlur={() => onReveal(noteKey)}
          aria-invalid={noteError ? true : undefined}
          aria-describedby={noteError ? `${uid}-note-error` : undefined}
        />
        {noteError ? (
          <p id={`${uid}-note-error`} className="text-destructive mt-1 text-xs">
            {noteError}
          </p>
        ) : null}
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-5 shrink-0"
          checked={included}
          onChange={(event) => onEdit({ included: event.target.checked })}
          aria-label={`Include ${label} in the order`}
        />
        <span aria-hidden="true">Include</span>
      </label>
    </li>
  );
}

/**
 * The active draft for one vendor: Suggested Order (read-only) beside the
 * manager's own Order Qty, item notes, a vendor note and Include switches.
 *
 * Edits stay on screen until Save (one sparse RPC carrying only what changed,
 * against the version the edits started from), so a write another manager made
 * in between is refused and shown -- never overwritten silently.
 */
export function OrderDraftEditor({
  draft,
  shared,
  displayName,
  viewerName,
  timeZone,
  api,
  onGuard,
  runExport,
  onSent,
}: {
  draft: OrderDraftView;
  /** The same draft with the catalog's live labels: what Copy and Export share. */
  shared: OrderDraftView;
  /** Live catalog label for a line (a draft shows current names). */
  displayName: (line: OrderDraftLine) => string;
  viewerName: string;
  timeZone: string;
  api: OrderDraftApi;
  onGuard: (guard: DraftGuard | null) => void;
  runExport: RunExport;
  onSent: (outcome: DraftSentOutcome) => void;
}) {
  const uid = useId();
  const [edits, setEdits] = useState<DraftEdits>(EMPTY_EDITS);
  // The version the current edits started from; saves are checked against it.
  const [base, setBase] = useState<number | null>(null);
  const [staleHit, setStaleHit] = useState(false);
  const [busy, setBusy] = useState<"save" | "op" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<"fill" | "clear" | "send" | null>(null);
  // The version the manager was looking at when they opened the confirmation.
  const [sendVersion, setSendVersion] = useState(0);
  const [fillMode, setFillMode] = useState<OrderDraftFillMode>("empty_only");

  const diff = useMemo(() => diffDraftEdits(draft, edits), [draft, edits]);
  const errors: DraftErrors | null = diff.ok ? null : diff.errors;
  const dirty = !diff.ok || diff.payload !== null;
  const conflicted =
    dirty && (staleHit || (base !== null && draft.version !== base));
  const lines = useMemo(() => sortDraftLines(draft.lines), [draft.lines]);

  const reveal = (key: string) => revealed.has(key);
  const markRevealed = (key: string) =>
    setRevealed((current) => new Set(current).add(key));

  const edit = (productId: string, patch: LineEdit) => {
    setNotice(null);
    setBase((current) => (dirty ? (current ?? draft.version) : draft.version));
    if (!dirty) setStaleHit(false);
    setEdits((current) => ({
      ...current,
      lines: {
        ...current.lines,
        [productId]: { ...current.lines[productId], ...patch },
      },
    }));
  };

  const editVendorNote = (value: string) => {
    setNotice(null);
    setBase((current) => (dirty ? (current ?? draft.version) : draft.version));
    if (!dirty) setStaleHit(false);
    setEdits((current) => ({ ...current, vendorNote: value }));
  };

  const discard = () => {
    setEdits(EMPTY_EDITS);
    setBase(null);
    setStaleHit(false);
    setRevealed(new Set());
    setNotice(null);
  };

  const save = async (): Promise<boolean> => {
    if (busy) return false;
    if (!diff.ok) {
      setRevealed(
        new Set([
          ...(diff.errors.vendorNote ? ["vendorNote"] : []),
          ...Object.entries(diff.errors.lines).flatMap(([id, e]) => [
            ...(e.orderQty ? [`${id}:qty`] : []),
            ...(e.itemNote ? [`${id}:note`] : []),
          ]),
        ]),
      );
      setNotice({
        kind: "alert",
        text: "Fix the highlighted fields before saving. Nothing was saved.",
      });
      return false;
    }
    if (!diff.payload) {
      setNotice({ kind: "status", text: "There are no changes to save." });
      return true;
    }
    setBusy("save");
    setNotice(null);
    const result = await api.save({
      draftId: draft.id,
      expectedVersion: base ?? draft.version,
      ...diff.payload,
    });
    setBusy(null);
    if (result.ok) {
      setEdits(EMPTY_EDITS);
      setBase(null);
      setStaleHit(false);
      setRevealed(new Set());
      setNotice({
        kind: "status",
        text: result.changed
          ? "Order draft saved."
          : "There were no changes to save.",
      });
      return true;
    }
    if (result.conflict?.kind === "stale") {
      setStaleHit(true);
      return false;
    }
    setNotice({
      kind: "alert",
      text: `${result.error} Your changes are still here and have not been saved.`,
    });
    return false;
  };

  const runOp = async (
    run: () => ReturnType<OrderDraftApi["fill"]>,
    done: { changed: string; unchanged: string },
  ) => {
    if (busy) return;
    setBusy("op");
    setNotice(null);
    const result = await run();
    setBusy(null);
    if (result.ok) {
      setNotice({
        kind: "status",
        text: result.changed ? done.changed : done.unchanged,
      });
    } else if (result.conflict?.kind === "stale") {
      setNotice({
        kind: "alert",
        text: "This order draft changed elsewhere. The latest version is shown — check it, then try again.",
      });
    } else {
      setNotice({ kind: "alert", text: result.error });
    }
  };

  const blockedByEdits = () => {
    setNotice({
      kind: "alert",
      text: "Save or discard your changes first.",
    });
  };

  const startMarkSent = () => {
    if (busy) return;
    if (dirty) return blockedByEdits();
    if (purchaseLines(draft.lines).length === 0) {
      setNotice({ kind: "alert", text: NO_QUANTITY_MESSAGE });
      return;
    }
    setSendVersion(draft.version);
    setDialog("send");
  };

  const confirmMarkSent = async () => {
    setDialog(null);
    if (busy) return;
    setBusy("op");
    setNotice(null);
    // Against the version the manager reviewed, never the latest one.
    const result = await api.markSent(draft.id, sendVersion);
    setBusy(null);
    if (result.ok) {
      onSent({
        draftId: draft.id,
        changed: result.changed,
        sent: result.sent,
      });
    } else if (result.conflict?.kind === "stale") {
      setNotice({ kind: "alert", text: STALE_SEND_MESSAGE });
    } else {
      setNotice({ kind: "alert", text: result.error });
    }
  };

  const fillable = fillableBlankCount(draft);
  const replaceable = replaceableQuantityCount(draft);
  const startFill = () => {
    if (busy) return;
    if (dirty) return blockedByEdits();
    if (replaceable > 0) {
      setFillMode("empty_only");
      setDialog("fill");
      return;
    }
    if (fillable === 0) {
      setNotice({
        kind: "status",
        text: "Nothing to fill: there is no suggested quantity left to copy.",
      });
      return;
    }
    void runOp(() => api.fill(draft.id, draft.version, "empty_only"), {
      changed: "Filled from suggestions.",
      unchanged: "Nothing to fill.",
    });
  };

  // Let the module stop navigation away from unsaved edits.
  useEffect(() => {
    onGuard({ dirty, save });
  });
  useEffect(() => () => onGuard(null), [onGuard]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const ownChange = draft.updatedByName === viewerName;
  const vendorNoteValue = edits.vendorNote ?? draft.vendorNote ?? "";
  const vendorNoteError = reveal("vendorNote") ? errors?.vendorNote : undefined;
  const opsDisabled = busy !== null || dirty;

  return (
    <section
      aria-label={`${draft.vendorName} order draft`}
      data-testid="order-draft-editor"
      data-version={draft.version}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">{draft.vendorName}</h2>
        <p className="text-muted-foreground text-xs">
          Draft v{draft.version}
          {draft.updatedByName
            ? ` · updated by ${draft.updatedByName} ${formatDraftTime(draft.updatedAt, timeZone)}`
            : ""}
        </p>
      </div>

      <Totals draft={draft} edits={edits} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={startFill}
          aria-disabled={opsDisabled}
          className={opsDisabled ? "opacity-60" : undefined}
        >
          Fill from Suggestions
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            if (busy) return;
            if (dirty) return blockedByEdits();
            void runOp(() => api.sync(draft.id, draft.version), {
              changed: "Suggestions updated from current stock.",
              unchanged: "Suggestions are already up to date.",
            });
          }}
          aria-disabled={opsDisabled}
          className={opsDisabled ? "opacity-60" : undefined}
        >
          Update suggestions
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (busy) return;
            if (dirty) return blockedByEdits();
            setDialog("clear");
          }}
          aria-disabled={opsDisabled}
          className={cn(
            "border-destructive/40 text-destructive",
            opsDisabled && "opacity-60",
          )}
        >
          Clear Draft
        </Button>
      </div>

      <div className="flex flex-wrap items-start gap-2" data-testid="send-bar">
        <Button
          onClick={startMarkSent}
          aria-disabled={opsDisabled}
          className={opsDisabled ? "opacity-60" : undefined}
        >
          Mark Sent
        </Button>
        <ShareActions
          draft={shared}
          runExport={runExport}
          unsavedReason={
            dirty
              ? "Save your changes first. Copy and Export use the saved order."
              : undefined
          }
        />
      </div>

      <div
        data-testid="draft-save-bar"
        data-state={
          conflicted
            ? "conflict"
            : busy === "save"
              ? "saving"
              : dirty
                ? "dirty"
                : "clean"
        }
        className="border-border bg-card flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
      >
        <p role="status" className="text-sm">
          {busy === "save"
            ? "Saving…"
            : conflicted
              ? "Unsaved changes — blocked until you resolve the conflict."
              : dirty
                ? "Unsaved changes"
                : "No unsaved changes"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={discard}
            aria-disabled={!dirty || busy !== null}
          >
            Discard
          </Button>
          <Button
            onClick={() => {
              if (!dirty || conflicted) return;
              void save();
            }}
            aria-disabled={!dirty || conflicted || busy !== null}
            className={
              !dirty || conflicted || busy !== null ? "opacity-60" : undefined
            }
          >
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {conflicted ? (
        <div
          role={ownChange ? "status" : "alert"}
          data-testid="draft-conflict"
          className={cn(
            "rounded-xl border px-3 py-3 text-sm",
            ownChange
              ? "border-border bg-muted/40"
              : "border-warn/40 bg-warn/10",
          )}
        >
          <p className="font-medium">
            {ownChange
              ? "You changed this order draft in another tab or session."
              : "This order draft changed elsewhere."}
          </p>
          <p className="text-muted-foreground mt-1">
            {draft.updatedByName ?? "Someone"} saved version {draft.version}
            {" at "}
            {formatDraftTime(draft.updatedAt, timeZone)}. Your changes were not
            saved. Reload the latest version before continuing.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                discard();
                void api.reload();
              }}
            >
              Reload latest
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setBase(draft.version);
                setStaleHit(false);
              }}
            >
              Keep my edits on the latest
            </Button>
          </div>
        </div>
      ) : null}

      <p role="status" className="text-sm" data-testid="draft-notice">
        {notice?.kind === "status" ? notice.text : ""}
      </p>
      {notice?.kind === "alert" ? (
        <p
          role="alert"
          data-testid="draft-error"
          className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {notice.text}
        </p>
      ) : null}
      {dirty && !conflicted ? (
        <p className="text-muted-foreground text-xs">
          Fill, Update suggestions and Clear are available after you save or
          discard your changes.
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${uid}-vendor-note`}>Vendor note</Label>
        <textarea
          id={`${uid}-vendor-note`}
          rows={3}
          className={TEXTAREA}
          value={vendorNoteValue}
          onChange={(event) => editVendorNote(event.target.value)}
          onBlur={() => markRevealed("vendorNote")}
          aria-invalid={vendorNoteError ? true : undefined}
          aria-describedby={
            vendorNoteError
              ? `${uid}-vendor-note-error`
              : `${uid}-vendor-note-help`
          }
        />
        {vendorNoteError ? (
          <p
            id={`${uid}-vendor-note-error`}
            className="text-destructive text-xs"
          >
            {vendorNoteError}
          </p>
        ) : (
          <p
            id={`${uid}-vendor-note-help`}
            className="text-muted-foreground text-xs"
          >
            Up to 1,000 characters. Line breaks are kept.
          </p>
        )}
      </div>

      {draft.lines.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-sm">
              Nothing from {draft.vendorName} is low right now, so this draft
              has no lines yet. Use Update suggestions after stock changes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border-border bg-card overflow-hidden rounded-xl border">
          <div
            aria-hidden="true"
            className={cn(
              "text-muted-foreground bg-muted/40 hidden px-3 py-2 text-xs font-semibold",
              ROW_GRID,
            )}
          >
            <span>Item</span>
            <span>Suggested</span>
            <span className="text-right">Order Qty</span>
            <span>Item note</span>
            <span>Included</span>
          </div>
          <ul
            aria-label={`${draft.vendorName} order lines`}
            className="divide-border divide-y"
          >
            {lines.map((line) => (
              <LineRow
                key={line.productId}
                line={line}
                label={displayName(line)}
                edit={edits.lines[line.productId]}
                errors={errors?.lines[line.productId]}
                reveal={reveal}
                onEdit={(patch) => edit(line.productId, patch)}
                onReveal={markRevealed}
              />
            ))}
          </ul>
        </div>
      )}

      <Dialog
        open={dialog === "send"}
        onClose={() => setDialog(null)}
        title="Mark this order as sent?"
        description={`Use this after you have sent or shared the order with ${shared.vendorName} outside The Lineup. It only records that the order was sent.`}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            The draft becomes a sent order and is read-only: it can no longer be
            edited.
          </li>
          <li>
            It does <strong>not</strong> receive inventory or change your stock
            counts.
          </li>
          <li>
            It does <strong>not</strong> send anything: The Lineup does not
            email or message vendors.
          </li>
          <li>
            {purchaseLines(draft.lines).length} line
            {purchaseLines(draft.lines).length === 1 ? "" : "s"} · planned total{" "}
            {formatQuantity(draftTotals(draft).plannedTotal)} units.
          </li>
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button onClick={() => void confirmMarkSent()}>
            Yes, mark as sent
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "fill"}
        onClose={() => setDialog(null)}
        title="Fill from Suggestions"
        description="Copy each numeric suggestion into Order Qty. Items with no numeric suggestion stay blank."
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">How to fill</legend>
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input
              type="radio"
              name={`${uid}-fill`}
              className="mt-1 size-4"
              checked={fillMode === "empty_only"}
              onChange={() => setFillMode("empty_only")}
            />
            <span>
              Fill empty quantities only — keep the {replaceable} quantit
              {replaceable === 1 ? "y" : "ies"} you entered
            </span>
          </label>
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input
              type="radio"
              name={`${uid}-fill`}
              className="mt-1 size-4"
              checked={fillMode === "replace_all"}
              onChange={() => setFillMode("replace_all")}
            />
            <span>
              Replace all — overwrite {replaceable} quantit
              {replaceable === 1 ? "y" : "ies"} you entered with the suggestion
            </span>
          </label>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button
            variant={fillMode === "replace_all" ? "outline" : "default"}
            className={
              fillMode === "replace_all"
                ? "border-destructive/40 text-destructive"
                : undefined
            }
            onClick={() => {
              const mode = fillMode;
              setDialog(null);
              void runOp(() => api.fill(draft.id, draft.version, mode), {
                changed: "Filled from suggestions.",
                unchanged: "Nothing to fill.",
              });
            }}
          >
            {fillMode === "replace_all" ? "Replace all" : "Fill empty only"}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "clear"}
        onClose={() => setDialog(null)}
        title="Clear this draft?"
        description="This clears every Order Qty and item note, includes every line again, and removes the vendor note. Suggested quantities, items and your stock counts are not changed."
      >
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive"
            onClick={() => {
              setDialog(null);
              void runOp(() => api.clear(draft.id, draft.version), {
                changed: "Draft cleared.",
                unchanged: "The draft was already clear.",
              });
            }}
          >
            Clear draft
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
