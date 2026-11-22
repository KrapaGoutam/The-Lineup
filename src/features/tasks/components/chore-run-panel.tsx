"use client";

import { useState } from "react";
import { CheckCircle2, History, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import type { ChoreCommand } from "../domain/chore-commands";
import { runReadiness } from "../domain/chore-cycles";
import {
  RUN_STATUS_LABELS,
  type ChoreBoardView,
  type ChoreViewer,
} from "../domain/chore-types";
import type { ChoreRunResult } from "../hooks/use-chore-controller";
import { formatBusinessDate } from "./chore-run-format";

type Props = {
  board: ChoreBoardView;
  viewer: ChoreViewer;
  run: (command: ChoreCommand) => Promise<ChoreRunResult>;
  /** Opens Tasks → History on this board's runs. */
  onOpenHistory?: (boardId: string) => void;
};

const NEXT_RUN_TEXT: Record<string, string> = {
  daily: "The next run starts on the next business day.",
  weekly: "The next run starts next week.",
  continuous: "A manager can start the next run.",
  manual: "A manager starts the next run.",
  per_shift: "A manager starts the next run.",
};

/**
 * The state of the board's CURRENT run and what a manager can do about it:
 * complete work is not the same as closing it, and closing it is not the same as
 * starting the next one. Staff never get a close / start control; they only check
 * cells. The server re-evaluates every one of these and refuses anyone else.
 */
export function ChoreRunPanel({ board, viewer, run, onOpenHistory }: Props) {
  const readiness = runReadiness(board);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const auto = board.resetIntent === "automatic_after_completion";

  async function exec(command: ChoreCommand) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await run(command);
    setBusy(false);
    if (!result.ok) setError(result.error);
    return result;
  }

  const history = onOpenHistory ? (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onOpenHistory(board.id)}
      data-testid="chore-open-history"
    >
      <History aria-hidden="true" />
      Run history
    </Button>
  ) : null;

  // Between runs: nothing is open. Show what happened last and (managers) a way on.
  if (readiness === "no_run") {
    const last = board.lastRun;
    return (
      <section
        aria-label="Run status"
        data-testid="chore-between-runs"
        className="border-border bg-surface space-y-2 rounded-2xl border p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">No run is open</h3>
          {last ? (
            <Badge tone={last.completed ? "success" : "warning"}>
              Run {last.sequence} · {RUN_STATUS_LABELS[last.status]}
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          {last
            ? `Run ${last.sequence} finished with ${last.requiredDone} of ${last.requiredTotal} required checks (${formatBusinessDate(last.businessDate)}). `
            : ""}
          {auto
            ? (NEXT_RUN_TEXT[board.recurrenceIntent] ?? "")
            : "A manager starts the next run."}
        </p>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {viewer.isManager ? (
            <Button
              disabled={busy}
              onClick={() =>
                void exec({ type: "cycleStart", boardId: board.id })
              }
              data-testid="chore-start-run"
            >
              <Play aria-hidden="true" />
              {busy ? "Starting…" : "Start next run"}
            </Button>
          ) : null}
          {history}
        </div>
      </section>
    );
  }

  const cycle = board.cycle;
  if (!cycle) return null;

  return (
    <>
      {readiness === "no_required_work" ? (
        <p
          role="status"
          data-testid="chore-no-required-work"
          className="border-warn/30 bg-warn/10 rounded-xl border px-3.5 py-2.5 text-sm"
        >
          This board has no required chores, so this run can never be completed
          and will not close or reset by itself.
          {viewer.isManager
            ? " Add a required chore and a person in Manage."
            : " Ask a manager to finish setting it up."}
        </p>
      ) : null}

      {readiness === "ready" ? (
        <section
          aria-label="Run complete"
          data-testid="chore-ready-to-close"
          className="border-ok/30 bg-ok/10 space-y-2 rounded-2xl border p-4"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 aria-hidden="true" className="text-ok size-5" />
            <h3 className="font-semibold">Every required check is done</h3>
          </div>
          <p className="text-muted-foreground text-sm">
            {auto
              ? "This run is closing and will be saved to History. Reload if it still shows."
              : "Nothing resets on its own. A manager closes this run, which saves it to History, and starts the next one."}
          </p>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          {viewer.isManager ? (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                data-testid="chore-close-and-start"
                onClick={() =>
                  void exec({
                    type: "cycleClose",
                    boardId: board.id,
                    cycleId: cycle.id,
                    outcome: "completed",
                    note: null,
                    startNext: true,
                  })
                }
              >
                {busy ? "Closing…" : "Close run and start next"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                data-testid="chore-close-only"
                onClick={() =>
                  void exec({
                    type: "cycleClose",
                    boardId: board.id,
                    cycleId: cycle.id,
                    outcome: "completed",
                    note: null,
                    startNext: false,
                  })
                }
              >
                Close run only
              </Button>
            </div>
          ) : (
            <p className="text-sm">A manager needs to close this run.</p>
          )}
        </section>
      ) : null}

      {viewer.isManager || history ? (
        <div className="flex flex-wrap items-center gap-2">
          {viewer.isManager && readiness !== "ready" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCancelling(true)}
              data-testid="chore-cancel-run"
            >
              Cancel this run…
            </Button>
          ) : null}
          {history}
          <span className="text-muted-foreground text-xs">
            Run {cycle.sequence}
            {cycle.openedBySystem ? " · started automatically" : ""}
            {" · "}
            {formatBusinessDate(cycle.businessDate)}
          </span>
        </div>
      ) : null}

      {cancelling ? (
        <CancelRunDialog
          board={board}
          onClose={() => setCancelling(false)}
          run={run}
        />
      ) : null}
    </>
  );
}

/**
 * Abandoning an unfinished run is its own explicit action: it needs a reason and the
 * run stays in History as Not Completed (never as Completed).
 */
function CancelRunDialog({
  board,
  run,
  onClose,
}: {
  board: ChoreBoardView;
  run: Props["run"];
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [startNext, setStartNext] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cycle = board.cycle;

  async function save() {
    if (busy || !cycle) return;
    setBusy(true);
    setError(null);
    const result = await run({
      type: "cycleClose",
      boardId: board.id,
      cycleId: cycle.id,
      outcome: "cancelled",
      note: note.trim(),
      startNext,
    });
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Cancel this run"
      description={`${board.name} · run ${cycle?.sequence ?? ""}`}
      className="max-w-[min(94vw,30rem)] sm:w-[min(94vw,30rem)]"
    >
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          The run is saved to History as{" "}
          <strong>Cancelled (not completed)</strong> with the checks that were
          done. It is never recorded as completed.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Why are you cancelling it?</span>
          <Input
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            data-testid="chore-cancel-reason"
            placeholder="e.g. Closed early for a private event"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={startNext}
            onChange={(e) => setStartNext(e.target.checked)}
            className="size-4"
          />
          Start a fresh run right away
        </label>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Keep the run
          </Button>
          <Button
            onClick={() => void save()}
            disabled={busy || note.trim().length < 3}
            data-testid="chore-cancel-confirm"
          >
            {busy ? "Cancelling…" : "Cancel run"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
