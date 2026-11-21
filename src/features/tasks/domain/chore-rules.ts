import type {
  ChoreBoardView,
  ChoreColumnView,
  ChoreCompletionView,
  ChoreEntryKind,
  ChoreRowView,
  ChoreSnapshot,
  ChoreViewer,
} from "./chore-types";

/** Pure rules shared by the board UI and the demo engine. The database enforces the same rules. */

export function isLiveColumn(column: ChoreColumnView): boolean {
  return column.isActive && !column.archived;
}

export function isLiveRow(row: ChoreRowView): boolean {
  return row.isActive && !row.archived;
}

export function isBoardLive(board: ChoreBoardView): boolean {
  return board.isActive && !board.archived;
}

export function liveColumns(board: ChoreBoardView): ChoreColumnView[] {
  return board.columns.filter(isLiveColumn);
}

export function liveRows(board: ChoreBoardView): ChoreRowView[] {
  return board.rows.filter(isLiveRow);
}

/** Does this chore apply to this column at all? */
export function rowAppliesTo(
  row: ChoreRowView,
  column: ChoreColumnView,
): boolean {
  if (!isLiveRow(row) || !isLiveColumn(column)) return false;
  if (row.mode === "selected_columns") {
    return row.selectedColumnIds.includes(column.id);
  }
  return true;
}

export function findCompletion(
  board: ChoreBoardView,
  rowId: string,
  columnId: string,
): ChoreCompletionView | undefined {
  return board.completions.find(
    (c) => c.rowId === rowId && c.columnId === columnId,
  );
}

/** The cells of one chore that count toward its requirement. */
function countedColumns(
  board: ChoreBoardView,
  row: ChoreRowView,
): ChoreColumnView[] {
  return liveColumns(board).filter((c) => rowAppliesTo(row, c));
}

export type CellState =
  | "not_applicable"
  | "required_open"
  | "required_done"
  | "optional_open"
  | "optional_done"
  /** Any-one chore already satisfied by a different column. */
  | "covered";

export function cellState(
  board: ChoreBoardView,
  row: ChoreRowView,
  column: ChoreColumnView,
): CellState {
  if (!rowAppliesTo(row, column)) return "not_applicable";
  const done = findCompletion(board, row.id, column.id) !== undefined;
  if (!done && row.mode === "any_one") {
    const other = countedColumns(board, row).some(
      (c) => c.id !== column.id && findCompletion(board, row.id, c.id),
    );
    if (other) return "covered";
  }
  if (row.isRequired) return done ? "required_done" : "required_open";
  return done ? "optional_done" : "optional_open";
}

export type BoardProgress = {
  required: number;
  completed: number;
  remaining: number;
  /** Whole percent, 0 when nothing is required. */
  percent: number;
  optionalTotal: number;
  optionalCompleted: number;
};

/**
 * Required checks by rule:
 *  - all columns: live chores x applicable live columns;
 *  - selected: only the selected live columns;
 *  - any one: ONE check per chore, done when any live column completed it
 *    (never pretend every person did the work).
 * Not-applicable cells and optional chores never count toward the total.
 */
export function boardProgress(board: ChoreBoardView): BoardProgress {
  let required = 0;
  let completed = 0;
  let optionalTotal = 0;
  let optionalCompleted = 0;
  for (const row of liveRows(board)) {
    const columns = countedColumns(board, row);
    let total: number;
    let done: number;
    if (row.mode === "any_one") {
      total = columns.length > 0 ? 1 : 0;
      done = columns.some((c) => findCompletion(board, row.id, c.id)) ? 1 : 0;
    } else {
      total = columns.length;
      done = columns.filter((c) => findCompletion(board, row.id, c.id)).length;
    }
    if (row.isRequired) {
      required += total;
      completed += done;
    } else {
      optionalTotal += total;
      optionalCompleted += done;
    }
  }
  return {
    required,
    completed,
    remaining: required - completed,
    percent: required === 0 ? 0 : Math.round((completed / required) * 100),
    optionalTotal,
    optionalCompleted,
  };
}

/** Progress of one chore row (for the row header). */
export function rowProgress(
  board: ChoreBoardView,
  row: ChoreRowView,
): { total: number; done: number } {
  const columns = countedColumns(board, row);
  if (row.mode === "any_one") {
    return {
      total: columns.length > 0 ? 1 : 0,
      done: columns.some((c) => findCompletion(board, row.id, c.id)) ? 1 : 0,
    };
  }
  return {
    total: columns.length,
    done: columns.filter((c) => findCompletion(board, row.id, c.id)).length,
  };
}

/** Progress of one column (the phone person view). */
export function columnProgress(
  board: ChoreBoardView,
  column: ChoreColumnView,
): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const row of liveRows(board)) {
    if (!row.isRequired || !rowAppliesTo(row, column)) continue;
    if (row.mode === "any_one") {
      if (cellState(board, row, column) === "covered") continue;
      total += 1;
      if (findCompletion(board, row.id, column.id)) done += 1;
      continue;
    }
    total += 1;
    if (findCompletion(board, row.id, column.id)) done += 1;
  }
  return { total, done };
}

export type TickDecision =
  | { allowed: true; as: ChoreEntryKind }
  | { allowed: false; reason: string };

/**
 * Whether the viewer may tick / untick this cell. A UI hint only: the database
 * decides again from the authenticated identity, so a tampered client gains
 * nothing. The actor is never a parameter of the write.
 */
export function canTickCell(
  viewer: ChoreViewer,
  board: ChoreBoardView,
  row: ChoreRowView,
  column: ChoreColumnView,
): TickDecision {
  if (!isBoardLive(board)) {
    return { allowed: false, reason: "This board is turned off." };
  }
  const state = cellState(board, row, column);
  if (state === "not_applicable") {
    return { allowed: false, reason: "This chore does not apply here." };
  }
  if (state === "covered") {
    const winner = board.completions.find((c) => c.rowId === row.id);
    return {
      allowed: false,
      reason: winner
        ? `Already done by ${winner.completedByName}.`
        : "Already done.",
    };
  }
  if (column.profileId === viewer.profileId) {
    return { allowed: true, as: "self" };
  }
  if (column.profileId === null) return { allowed: true, as: "position" };
  if (board.staffAccess === "any_workforce") {
    return { allowed: true, as: "shared" };
  }
  if (board.managerOverride && viewer.isManager) {
    return { allowed: true, as: "manager_correction" };
  }
  return {
    allowed: false,
    reason: `Only ${column.label} can update this column.`,
  };
}

/** Stable key of one cell (used for in-flight tracking). */
export function cellKey(
  boardId: string,
  rowId: string,
  columnId: string,
): string {
  return `${boardId}:${rowId}:${columnId}`;
}

export function sortByOrder<T extends { sortOrder: number; id: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
}

/**
 * The in-flight ticks laid over a snapshot, so a tap shows at once. Dropping the
 * overlay (on failure) restores exactly what the server last returned.
 */
export function withCellOverlay(
  snapshot: ChoreSnapshot,
  overlay: ReadonlyMap<string, boolean>,
  viewer: ChoreViewer,
): ChoreSnapshot {
  if (overlay.size === 0) return snapshot;
  const nowIso = new Date().toISOString();
  return {
    boards: snapshot.boards.map((board) => {
      let completions = board.completions;
      for (const [key, done] of overlay) {
        const [boardId, rowId, columnId] = key.split(":");
        if (boardId !== board.id || !rowId || !columnId) continue;
        const present = completions.some(
          (c) => c.rowId === rowId && c.columnId === columnId,
        );
        if (done && !present) {
          completions = [
            ...completions,
            {
              rowId,
              columnId,
              completedBy: viewer.profileId,
              completedByName: viewer.name,
              completedAt: nowIso,
              enteredAs: "self",
            },
          ];
        } else if (!done && present) {
          completions = completions.filter(
            (c) => !(c.rowId === rowId && c.columnId === columnId),
          );
        }
      }
      return completions === board.completions
        ? board
        : { ...board, completions };
    }),
  };
}

/** Rows/columns a viewer's phone list should show first: their own column, else the first live one. */
export function defaultColumnFor(
  viewer: ChoreViewer,
  board: ChoreBoardView,
): ChoreColumnView | null {
  const live = sortByOrder(liveColumns(board));
  return live.find((c) => c.profileId === viewer.profileId) ?? live[0] ?? null;
}
