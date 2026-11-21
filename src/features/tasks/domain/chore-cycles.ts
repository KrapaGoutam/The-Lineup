import { addDaysToDate } from "./task-rules";
import { boardProgress, isLiveColumn, isLiveRow } from "./chore-rules";
import type { BoardProgress } from "./chore-rules";
import type {
  ChoreBoardView,
  ChoreCompletionView,
  ChoreCorrectionView,
  ChoreRunDetail,
  ChoreRunSummary,
  RecurrenceIntent,
  ResetIntent,
  RunStatus,
} from "./chore-types";

/**
 * V2.0.13 Batch C: pure run / recurrence rules. The database is authoritative; this
 * module is the shared vocabulary of the UI and the demo engine, and mirrors
 * `private.chore_period_start`, `private.chore_cycle_is_complete` and the snapshot
 * rules of the Batch C migration (tests pin the same vectors on both sides).
 */

/** Where a board's CURRENT run stands. */
export type RunReadiness =
  | "no_run"
  /** No required work exists: the run can never complete, so it never closes by itself. */
  | "no_required_work"
  | "in_progress"
  | "ready";

export function runReadiness(board: ChoreBoardView): RunReadiness {
  if (!board.cycle) return "no_run";
  const progress = boardProgress(board);
  if (progress.required === 0) return "no_required_work";
  return progress.completed === progress.required ? "ready" : "in_progress";
}

/** ISO week (Monday) / day start of the period a business date belongs to; null for modes without periods. */
export function periodStart(
  recurrence: RecurrenceIntent,
  date: string,
): string | null {
  if (recurrence === "daily") return date;
  if (recurrence === "weekly") {
    const [y, m, d] = date.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
    return addDaysToDate(date, -((weekday + 6) % 7));
  }
  return null;
}

/** "d:2026-11-21" / "w:2026-11-16", the key the scheduler stores once per board and period. */
export function periodKey(
  recurrence: RecurrenceIntent,
  date: string,
): string | null {
  const start = periodStart(recurrence, date);
  return start === null ? null : `${recurrence.slice(0, 1)}:${start}`;
}

export const RECURRENCE_BEHAVIOR: Record<RecurrenceIntent, string> = {
  continuous: "A new run starts as soon as the last one is finished.",
  daily: "One run per business day, in this location's time zone.",
  weekly: "One run per week (Monday to Sunday), in this location's time zone.",
  per_shift:
    "Not available yet: shifts are not part of a board. Start runs by hand.",
  manual: "A manager starts each run.",
};

export const RESET_BEHAVIOR: Record<ResetIntent, string> = {
  automatic_after_completion:
    "When every required check is done the run closes by itself and is saved to History.",
  manual_restart:
    "A finished run waits until a manager closes it. Nothing resets on its own.",
};

/** One sentence for the board header ("Daily · closes itself when complete"). */
export function recurrenceSummary(
  recurrence: RecurrenceIntent,
  reset: ResetIntent,
): string {
  const rec =
    recurrence === "continuous"
      ? "Continuous"
      : recurrence === "daily"
        ? "Daily"
        : recurrence === "weekly"
          ? "Weekly"
          : recurrence === "manual"
            ? "Manual starts"
            : "Per shift";
  return `${rec} · ${
    reset === "automatic_after_completion"
      ? "closes itself when complete"
      : "a manager closes it"
  }`;
}

/** Month key ("YYYY-MM") a run is grouped under in History. */
export function runMonthKey(
  run: Pick<ChoreRunSummary, "businessDate">,
): string {
  return run.businessDate.slice(0, 7);
}

export function isFinishedStatus(status: RunStatus): boolean {
  return status !== "open";
}

/**
 * A frozen copy of the live structure, the way the database writes a snapshot:
 * live rows / columns plus anything removed that still carries completions of this
 * run (kept as evidence, `isActive = false` so it never counts).
 */
export function freezeBoard(board: ChoreBoardView): ChoreBoardView {
  const doneRows = new Set(board.completions.map((c) => c.rowId));
  const doneColumns = new Set(board.completions.map((c) => c.columnId));
  const rows = board.rows
    .filter((r) => isLiveRow(r) || doneRows.has(r.id))
    .map((r) => ({
      ...r,
      selectedColumnIds: [...r.selectedColumnIds],
      isActive: isLiveRow(r),
      archived: false,
    }));
  const columns = board.columns
    .filter((c) => isLiveColumn(c) || doneColumns.has(c.id))
    .map((c) => ({ ...c, isActive: isLiveColumn(c), archived: false }));
  return {
    ...board,
    rows,
    columns,
    completions: board.completions.map((c) => ({ ...c })),
    assignments: [],
    lastRun: null,
  };
}

export type RunCloseInfo = {
  status: Exclude<RunStatus, "open">;
  trigger: NonNullable<ChoreRunSummary["closeTrigger"]>;
  closedAt: string;
  byKind: "user" | "system";
  byName: string | null;
  note: string | null;
  /** The location-local day the run is closed (used for runs without a scheduled period). */
  today: string;
};

/** The History row of a run as it stands now (open) or as it closed. */
export function summarizeRun(
  board: ChoreBoardView,
  close: RunCloseInfo | null,
  structureChanged: boolean,
): ChoreRunSummary {
  const cycle = board.cycle;
  if (!cycle) throw new Error("A run summary needs a run.");
  const progress = boardProgress(board);
  const scheduled = periodStart(board.recurrenceIntent, cycle.businessDate);
  return {
    cycleId: cycle.id,
    boardId: board.id,
    boardName: board.name,
    sequence: cycle.sequence,
    status: close ? close.status : "open",
    completed: close?.status === "completed",
    businessDate: close
      ? (scheduled ?? close.today)
      : (scheduled ?? cycle.businessDate),
    requiredTotal: progress.required,
    requiredDone: progress.completed,
    optionalTotal: progress.optionalTotal,
    optionalDone: progress.optionalCompleted,
    openedAt: cycle.openedAt,
    closedAt: close?.closedAt ?? null,
    closedByKind: close?.byKind ?? null,
    closedByName: close?.byName ?? null,
    closeTrigger: close?.trigger ?? null,
    note: close?.note ?? null,
    structureChanged,
  };
}

/** The ORIGINAL frozen board with every correction laid on top (corrected interpretation). */
export function applyCorrections(
  board: ChoreBoardView,
  corrections: readonly ChoreCorrectionView[],
): ChoreBoardView {
  if (corrections.length === 0) return board;
  const latest = new Map<string, ChoreCorrectionView>();
  for (const c of [...corrections].sort((a, b) => a.id - b.id)) {
    latest.set(`${c.rowId}:${c.columnId}`, c);
  }
  let completions: ChoreCompletionView[] = [...board.completions];
  for (const [key, c] of latest) {
    const [rowId, columnId] = key.split(":");
    completions = completions.filter(
      (x) => !(x.rowId === rowId && x.columnId === columnId),
    );
    if (c.doneAfter) {
      completions.push({
        rowId,
        columnId,
        completedBy: "",
        completedByName: c.correctedByName,
        completedAt: c.createdAt,
        enteredAs: "manager_correction",
      });
    }
  }
  return { ...board, completions };
}

export function correctedProgress(detail: ChoreRunDetail): BoardProgress {
  return boardProgress(applyCorrections(detail.board, detail.corrections));
}

/** Has any correction touched this cell? (for the marker in the frozen matrix) */
export function correctionFor(
  corrections: readonly ChoreCorrectionView[],
  rowId: string,
  columnId: string,
): ChoreCorrectionView | undefined {
  let found: ChoreCorrectionView | undefined;
  for (const c of corrections) {
    if (c.rowId === rowId && c.columnId === columnId) {
      if (!found || c.id > found.id) found = c;
    }
  }
  return found;
}
