"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Minus, Pencil, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  applyCorrections,
  correctedProgress,
  correctionFor,
} from "../domain/chore-cycles";
import {
  boardProgress,
  findCompletion,
  isLiveColumn,
  isLiveRow,
  rowAppliesTo,
  sortByOrder,
} from "../domain/chore-rules";
import { RUN_STATUS_LABELS, type ChoreRunDetail } from "../domain/chore-types";
import type { ChoreController } from "../hooks/use-chore-controller";
import { formatBusinessDate, formatRunStamp } from "./chore-run-format";

type Props = {
  cycleId: string;
  controller: ChoreController;
  timeZone: string;
  onClose: () => void;
};

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; detail: ChoreRunDetail };

/**
 * A finished run exactly as it was recorded: the frozen rows, people and cells, never
 * today's template. Managers can append a correction (with a reason); the original
 * recorded event is never edited, and the corrected reading is shown next to it.
 */
export function ChoreRunDetailDialog({
  cycleId,
  controller,
  timeZone,
  onClose,
}: Props) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const loader = controller.loadRunDetail;

  const fetchDetail = useCallback(async () => {
    const result = await loader(cycleId);
    setLoad(
      result.ok
        ? { state: "ready", detail: result.data }
        : { state: "error", message: result.error },
    );
  }, [loader, cycleId]);

  useEffect(() => {
    // Subscribing to the data source on open; the state update is the result.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchDetail();
    // The loader changes identity with the controller; only the run id re-fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  const title =
    load.state === "ready"
      ? `${load.detail.summary.boardName} · Run ${load.detail.summary.sequence}`
      : "Chore run";

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={
        load.state === "ready"
          ? RUN_STATUS_LABELS[load.detail.summary.status]
          : undefined
      }
      className="max-w-[min(96vw,64rem)] sm:w-[min(96vw,64rem)]"
    >
      {load.state === "loading" ? (
        <p role="status" className="text-muted-foreground p-4 text-sm">
          Loading the saved run…
        </p>
      ) : load.state === "error" ? (
        <p role="alert" className="text-destructive p-4 text-sm">
          {load.message}
        </p>
      ) : (
        <RunBody
          detail={load.detail}
          timeZone={timeZone}
          controller={controller}
          onChanged={() => void fetchDetail()}
        />
      )}
    </Dialog>
  );
}

function RunBody({
  detail,
  timeZone,
  controller,
  onChanged,
}: {
  detail: ChoreRunDetail;
  timeZone: string;
  controller: ChoreController;
  onChanged: () => void;
}) {
  const { summary, board, corrections } = detail;
  const recorded = boardProgress(board);
  const corrected = correctedProgress(detail);
  const effective = useMemo(
    () => applyCorrections(board, corrections),
    [board, corrections],
  );
  const rows = sortByOrder(board.rows);
  const columns = sortByOrder(board.columns);
  const [editing, setEditing] = useState<{
    rowId: string;
    columnId: string;
  } | null>(null);
  const differs =
    corrected.completed !== recorded.completed ||
    corrected.required !== recorded.required;

  return (
    <div className="space-y-4" data-testid="chore-run-detail">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <Fact
          label="Business day"
          value={formatBusinessDate(summary.businessDate)}
        />
        <Fact
          label="Started"
          value={formatRunStamp(summary.openedAt, timeZone)}
        />
        <Fact
          label="Finished"
          value={
            summary.closedAt ? formatRunStamp(summary.closedAt, timeZone) : "—"
          }
        />
        <Fact
          label="Closed by"
          value={
            summary.closedByKind === "system"
              ? summary.status === "expired"
                ? "Automatically (the day ended before it was complete)"
                : "Automatically (every required check was done)"
              : (summary.closedByName ?? "A manager")
          }
        />
        <Fact
          label="Recorded"
          value={`${recorded.completed} of ${recorded.required} required checks${
            recorded.optionalTotal > 0
              ? ` · optional ${recorded.optionalCompleted} of ${recorded.optionalTotal}`
              : ""
          }`}
        />
        {differs ? (
          <Fact
            label="After corrections"
            value={`${corrected.completed} of ${corrected.required} required checks`}
          />
        ) : null}
        {summary.note ? <Fact label="Reason" value={summary.note} /> : null}
      </dl>
      {summary.structureChanged ? (
        <p
          role="status"
          className="border-warn/30 bg-warn/10 rounded-xl border px-3 py-2 text-sm"
        >
          The board&apos;s chores or people were changed while this run was in
          progress. What you see is the setup when it closed.
        </p>
      ) : null}

      <div
        className="border-border overflow-x-auto rounded-2xl border"
        role="region"
        aria-label="Saved chore matrix"
        tabIndex={0}
      >
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">
            {summary.boardName}, run {summary.sequence}: the chores and people
            exactly as they were when the run closed.
          </caption>
          <thead>
            <tr className="bg-muted/40">
              <th
                scope="col"
                className="bg-muted/40 sticky left-0 z-10 px-3 py-2 text-left font-semibold"
              >
                Chore
              </th>
              {columns.map((c) => (
                <th key={c.id} scope="col" className="px-3 py-2 text-center">
                  <span className="block font-semibold">{c.label}</span>
                  {!isLiveColumn(c) ? (
                    <span className="text-muted-foreground block text-xs font-normal">
                      removed later
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-border border-t">
                <th
                  scope="row"
                  className="bg-card sticky left-0 z-10 px-3 py-2 text-left font-medium"
                >
                  {row.title}
                  <span className="text-muted-foreground block text-xs font-normal">
                    {row.isRequired ? "Required" : "Optional"}
                    {!isLiveRow(row) ? " · removed later" : ""}
                  </span>
                </th>
                {columns.map((column) => {
                  const original = findCompletion(board, row.id, column.id);
                  const now = findCompletion(effective, row.id, column.id);
                  const fix = correctionFor(corrections, row.id, column.id);
                  const applies = rowAppliesTo(row, column);
                  const label = `${row.title}, ${column.label}: ${
                    now
                      ? `done${fix ? " (corrected)" : original ? ` by ${original.completedByName}` : ""}`
                      : original
                        ? "not done (corrected from done)"
                        : applies
                          ? "not done"
                          : "not applicable"
                  }`;
                  const glyph = now ? (
                    <Check aria-hidden="true" className="text-ok size-5" />
                  ) : original ? (
                    <X aria-hidden="true" className="text-destructive size-5" />
                  ) : applies ? (
                    <span
                      aria-hidden="true"
                      className="border-border size-4 rounded border"
                    />
                  ) : (
                    <Minus
                      aria-hidden="true"
                      className="text-muted-foreground size-4"
                    />
                  );
                  return (
                    <td key={column.id} className="px-2 py-1 text-center">
                      {detail.canCorrect ? (
                        <button
                          type="button"
                          aria-label={`Correct ${label}`}
                          title={
                            original
                              ? `${original.completedByName} · ${formatRunStamp(original.completedAt, timeZone)}`
                              : undefined
                          }
                          onClick={() =>
                            setEditing({ rowId: row.id, columnId: column.id })
                          }
                          className={cn(
                            "focus-visible:ring-ring mx-auto grid size-11 place-items-center rounded-lg outline-none focus-visible:ring-2",
                            fix && "bg-warn/15",
                          )}
                        >
                          {glyph}
                        </button>
                      ) : (
                        <span
                          role="img"
                          aria-label={label}
                          title={
                            original
                              ? `${original.completedByName} · ${formatRunStamp(original.completedAt, timeZone)}`
                              : undefined
                          }
                          className={cn(
                            "mx-auto grid size-11 place-items-center rounded-lg",
                            fix && "bg-warn/15",
                          )}
                        >
                          {glyph}
                        </span>
                      )}
                      {now && original ? (
                        <span className="text-muted-foreground block text-[11px] leading-tight">
                          {original.completedByName}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!detail.canCorrect ? (
        <p className="text-muted-foreground text-xs">
          This saved run cannot be changed. Corrections are off for this board
          (Manage → Access → Manager correction).
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          Select a cell to add a correction. The original record is kept and the
          correction is listed below.
        </p>
      )}

      {editing ? (
        <CorrectionForm
          key={`${editing.rowId}:${editing.columnId}`}
          detail={detail}
          rowId={editing.rowId}
          columnId={editing.columnId}
          controller={controller}
          timeZone={timeZone}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}

      <section aria-label="Corrections" className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Pencil aria-hidden="true" className="size-4" />
          Corrections
          <Badge tone={corrections.length ? "warning" : "neutral"}>
            {corrections.length}
          </Badge>
        </h3>
        {corrections.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            None. This is exactly what was recorded.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="chore-corrections">
            {[...corrections].reverse().map((c) => {
              const row = board.rows.find((r) => r.id === c.rowId);
              const col = board.columns.find((x) => x.id === c.columnId);
              return (
                <li
                  key={c.id}
                  className="border-border rounded-xl border p-3 text-sm"
                >
                  <p className="font-medium">
                    {row?.title ?? "Chore"} · {col?.label ?? "Person"}:{" "}
                    {c.doneBefore ? "done" : "not done"} →{" "}
                    {c.doneAfter ? "done" : "not done"}
                  </p>
                  <p className="text-muted-foreground">
                    {c.correctedByName} ·{" "}
                    {formatRunStamp(c.createdAt, timeZone)}
                    {c.beforeCompletedByName
                      ? ` · originally recorded by ${c.beforeCompletedByName}`
                      : ""}
                  </p>
                  <p>Reason: {c.reason}</p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground shrink-0">{label}:</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}

function CorrectionForm({
  detail,
  rowId,
  columnId,
  controller,
  timeZone,
  onCancel,
  onSaved,
}: {
  detail: ChoreRunDetail;
  rowId: string;
  columnId: string;
  controller: ChoreController;
  timeZone: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const row = detail.board.rows.find((r) => r.id === rowId);
  const column = detail.board.columns.find((c) => c.id === columnId);
  const effective = applyCorrections(detail.board, detail.corrections);
  const current = findCompletion(effective, rowId, columnId);
  const original = findCompletion(detail.board, rowId, columnId);
  const [done, setDone] = useState<"done" | "not_done">(
    current ? "not_done" : "done",
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await controller.run({
      type: "cycleCorrect",
      cycleId: detail.summary.cycleId,
      rowId,
      columnId,
      done: done === "done",
      reason: reason.trim(),
    });
    setBusy(false);
    if (result.ok) onSaved();
    else setError(result.error);
  }

  return (
    <form
      aria-label="Correct this cell"
      data-testid="chore-correction-form"
      className="border-border bg-surface space-y-3 rounded-2xl border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-sm font-semibold">
        Correct: {row?.title} · {column?.label}
      </p>
      <p className="text-muted-foreground text-xs">
        Recorded:{" "}
        {original
          ? `done by ${original.completedByName} at ${formatRunStamp(original.completedAt, timeZone)}`
          : "not done"}
        . Currently read as: {current ? "done" : "not done"}.
      </p>
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Change to</span>
          <Select
            value={done}
            onChange={(e) => setDone(e.target.value as "done" | "not_done")}
          >
            <option value="done">Done</option>
            <option value="not_done">Not done</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Reason (required)</span>
          <Input
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            data-testid="chore-correction-reason"
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={busy || reason.trim().length < 3}
          data-testid="chore-correction-save"
        >
          {busy ? "Saving…" : "Save correction"}
        </Button>
      </div>
    </form>
  );
}
