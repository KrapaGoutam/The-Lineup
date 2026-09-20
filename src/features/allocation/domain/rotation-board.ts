export type ColumnStatus = "active" | "paused" | "removed";

export type RotationColumn = {
  id: string;
  name: string;
  position: number;
  status: ColumnStatus;
};

// Table Rotation Multi-View Upgrade 1.1: a cell is one of four distinct
// states, matching table_rotation_entries.status in real mode ("empty"
// there means no row at all, rather than a stored value). tableLabel is
// only ever set for "active"/"ended" -- "empty" and "skipped" always
// carry tableLabel: null, mirroring the DB's
// table_rotation_entries_label_status_check constraint.
export type RotationCellStatus = "empty" | "active" | "ended" | "skipped";

export type RotationCell = {
  columnId: string;
  tableLabel: string | null;
  status: RotationCellStatus;
};

export type RotationRound = {
  id: string;
  sequence: number;
  cells: RotationCell[];
};

export type RotationBoard = {
  columns: RotationColumn[];
  rounds: RotationRound[];
  nextRoundNumber: number;
};

export type BoardAction =
  | {
      type: "assign";
      roundId: string;
      columnId: string;
      tableLabel: string;
      // Table Rotation Multi-View: threaded through to board_assign's
      // p_confirm_transfer in real mode when the caller has explicitly
      // confirmed taking a table from its current holder (see
      // IMPLEMENTATION_CONTRACT.md section 6). The pure reducer has no
      // occupancy concept of its own (demo mode is single-user), so it
      // ignores this field entirely.
      confirmTransfer?: boolean;
    }
  | { type: "clear-cell"; roundId: string; columnId: string }
  | { type: "add-column"; column: RotationColumn }
  | { type: "set-column-status"; columnId: string; status: ColumnStatus }
  | { type: "clear-row"; roundId: string }
  | { type: "clear-column"; columnId: string }
  | { type: "clear-board" }
  | { type: "move-column"; columnId: string; direction: "up" | "down" }
  | { type: "add-row" }
  | { type: "delete-row"; roundId: string }
  // Table Rotation Multi-View Upgrade 1.1: moves the SAME active
  // assignment to another column's earliest genuinely empty cell. The
  // source cell becomes empty (no gap left behind); the destination
  // never overwrites an ended/skipped/active cell.
  | {
      type: "transfer";
      sourceRoundId: string;
      sourceColumnId: string;
      destColumnId: string;
    }
  // Completes service: table becomes available, history stays (status
  // becomes "ended", tableLabel is preserved, row is never removed).
  | { type: "end-table"; roundId: string; columnId: string }
  // Records a turn with no table. Only valid on a genuinely empty cell.
  | { type: "skip-turn"; roundId: string; columnId: string }
  // Table Rotation Multi-View Upgrade 1.1 (multi-table): a composite,
  // one-event action for the Floor decision dialog's "End existing &
  // assign" choice -- ends one of this column's active rows in place
  // (history preserved) and creates a brand new active row for the same
  // column at its earliest genuinely empty round, in one step. Distinct
  // from "transfer": the ended row stays a separate historical entry,
  // rather than the same row relocating. `endRoundIds` may name one,
  // several, or every one of the column's active rounds -- ending zero
  // is invalid (the caller must require at least one selection).
  | {
      type: "end-and-assign";
      endRoundIds: string[];
      columnId: string;
      tableLabel: string;
    };

export type BoardHistory = {
  past: RotationBoard[];
  present: RotationBoard;
  future: RotationBoard[];
};

function clone(board: RotationBoard): RotationBoard {
  return {
    ...board,
    columns: board.columns.map((column) => ({ ...column })),
    rounds: board.rounds.map((round) => ({
      ...round,
      cells: round.cells.map((cell) => ({ ...cell })),
    })),
  };
}

function makeRound(board: RotationBoard): RotationRound {
  return {
    id: `round-${board.nextRoundNumber}`,
    sequence: board.nextRoundNumber,
    cells: board.columns
      .filter((column) => column.status !== "removed")
      .map((column) => ({
        columnId: column.id,
        tableLabel: null,
        status: "empty" as const,
      })),
  };
}

// Table Rotation Multi-View: reconciled to ~2 trailing empty rounds (was
// exactly 1). "Empty" = no cell in the round has a tableLabel, regardless
// of any column's active/paused/removed status — matching the real-mode
// rule in private.ensure_trailing_round (see
// supabase/migrations/20260919120000_table_rotation_multi_view_foundation.sql).
// Recomputing and topping up to a fixed target after every action is
// mathematically equivalent to "when the last or second-to-last round
// gets a value, restore the buffer" — deliberately not implemented as a
// separate last-row/second-to-last-row check, to avoid two mechanisms
// that could drift apart. Only ever adds rounds, never removes them.
const TRAILING_EMPTY_TARGET = 2;

// "Empty" mirrors the real-mode auto-row rule exactly: a round with no
// table_rotation_entries row at all. Active, ended, and skipped cells are
// all real rows, so all three count as "used" here -- only "empty" cells
// (never written to, or fully unassigned back to empty) don't.
function isRoundEmpty(round: RotationRound) {
  return round.cells.every((cell) => cell.status === "empty");
}

function ensureTrailingRound(board: RotationBoard) {
  let trailingEmpty = 0;
  for (let i = board.rounds.length - 1; i >= 0; i -= 1) {
    if (!isRoundEmpty(board.rounds[i])) break;
    trailingEmpty += 1;
  }
  while (trailingEmpty < TRAILING_EMPTY_TARGET) {
    board.rounds.push(makeRound(board));
    board.nextRoundNumber += 1;
    trailingEmpty += 1;
  }
}

/**
 * Table Rotation Multi-View Upgrade 1.1 (multi-table): a server can have
 * zero, one, or many active tables at once -- there is nothing in this
 * model that limits a column to a single active row (each round is an
 * independent slot). Assign/Transfer/End+Assign all need "this column's
 * next genuinely free slot," never a single shared "current round"
 * pointer -- reusing a shared pointer across columns is exactly what
 * caused the original bug where a second Floor assignment silently
 * collided with (and looked like it transferred) a column's existing
 * one. This is the same search board_transfer already used for its
 * destination; factored out so board_transfer, the "end-and-assign"
 * case below, and callers outside this module (Floor's assign flow) all
 * agree on one definition of "the next free round for this column."
 */
export function findEarliestEmptyRoundForColumn(
  board: RotationBoard,
  columnId: string,
): RotationRound | undefined {
  return board.rounds.find((round) => {
    const cell = round.cells.find((c) => c.columnId === columnId);
    return cell?.status === "empty";
  });
}

/**
 * Every currently-active table for one column, across all rounds --
 * what Floor needs to decide whether an assignment is unambiguous (zero
 * active tables: assign directly) or needs the decision dialog (one or
 * more: Assign Also / Transfer / End & Assign), and what populates the
 * "which existing table" sub-picker when there's more than one.
 */
export function getActiveTablesForColumn(
  board: RotationBoard,
  columnId: string,
): { roundId: string; tableLabel: string }[] {
  const active: { roundId: string; tableLabel: string }[] = [];
  for (const round of board.rounds) {
    const cell = round.cells.find((c) => c.columnId === columnId);
    if (cell?.status === "active" && cell.tableLabel) {
      active.push({ roundId: round.id, tableLabel: cell.tableLabel });
    }
  }
  return active;
}

export function createRotationBoard(columns: RotationColumn[]): RotationBoard {
  const board: RotationBoard = {
    columns: columns.map((column) => ({ ...column })),
    rounds: [],
    nextRoundNumber: 1,
  };
  ensureTrailingRound(board);
  return board;
}

export function applyBoardAction(
  current: RotationBoard,
  action: BoardAction,
): RotationBoard {
  const board = clone(current);
  switch (action.type) {
    case "assign": {
      const round = board.rounds.find(({ id }) => id === action.roundId);
      const column = board.columns.find(({ id }) => id === action.columnId);
      if (!round || !column || column.status !== "active") return current;
      const label = action.tableLabel.trim();
      if (!label) return current;
      const existing = round.cells.find(
        ({ columnId }) => columnId === action.columnId,
      );
      // Upgrade 1.1: never silently overwrite an ended/skipped historical
      // cell -- matches board_assign's new guard. Assigning in place over
      // an already-active cell (an edit) is unchanged.
      if (
        existing &&
        existing.status !== "empty" &&
        existing.status !== "active"
      ) {
        return current;
      }
      if (existing) {
        existing.tableLabel = label;
        existing.status = "active";
      } else {
        round.cells.push({
          columnId: action.columnId,
          tableLabel: label,
          status: "active",
        });
      }
      break;
    }
    // Feature 028: the per-cell counterpart to clear-row/clear-column,
    // open to any active member (see mayWriteColumn) unlike those two,
    // which stay manager-only. This is Unassign: it deletes the entry
    // (back to empty) rather than preserving it as history, and works the
    // same way whether the cell was active, ended, or skipped (a
    // correction tool for any historical mistake).
    case "clear-cell": {
      const round = board.rounds.find(({ id }) => id === action.roundId);
      const cell = round?.cells.find(
        ({ columnId }) => columnId === action.columnId,
      );
      if (cell) {
        cell.tableLabel = null;
        cell.status = "empty";
      }
      break;
    }
    case "transfer": {
      const sourceRound = board.rounds.find(
        ({ id }) => id === action.sourceRoundId,
      );
      const sourceCell = sourceRound?.cells.find(
        ({ columnId }) => columnId === action.sourceColumnId,
      );
      const destColumn = board.columns.find(
        ({ id }) => id === action.destColumnId,
      );
      if (
        !sourceRound ||
        !sourceCell ||
        sourceCell.status !== "active" ||
        !sourceCell.tableLabel ||
        !destColumn ||
        destColumn.status !== "active"
      ) {
        return current;
      }
      const label = sourceCell.tableLabel;
      let destRound = findEarliestEmptyRoundForColumn(
        board,
        action.destColumnId,
      );
      if (!destRound) {
        // Defensive: ensureTrailingRound always keeps a genuinely empty
        // round available, so this should not normally happen.
        ensureTrailingRound(board);
        destRound = findEarliestEmptyRoundForColumn(board, action.destColumnId);
      }
      if (!destRound) return current;
      const destCell = destRound.cells.find(
        ({ columnId }) => columnId === action.destColumnId,
      )!;
      sourceCell.tableLabel = null;
      sourceCell.status = "empty";
      destCell.tableLabel = label;
      destCell.status = "active";
      break;
    }
    case "end-table": {
      const round = board.rounds.find(({ id }) => id === action.roundId);
      const cell = round?.cells.find(
        ({ columnId }) => columnId === action.columnId,
      );
      if (!cell || cell.status !== "active") return current;
      cell.status = "ended";
      break;
    }
    case "end-and-assign": {
      const column = board.columns.find(({ id }) => id === action.columnId);
      const label = action.tableLabel.trim();
      if (
        !column ||
        column.status !== "active" ||
        !label ||
        action.endRoundIds.length === 0
      ) {
        return current;
      }
      // All-or-nothing: every selected round must still hold an active
      // row for this column, checked before ending any of them, so a
      // stale selection (one entry already ended/reassigned elsewhere by
      // the time this runs) can't half-apply.
      const endCells = action.endRoundIds.map((roundId) => {
        const round = board.rounds.find(({ id }) => id === roundId);
        return round?.cells.find(
          ({ columnId }) => columnId === action.columnId,
        );
      });
      if (endCells.some((cell) => !cell || cell.status !== "active")) {
        return current;
      }
      // The search runs before ending any endCell, so those rounds
      // (which still hold active rows at this point) are correctly
      // excluded -- "end and assign" always lands the new table on a
      // genuinely different round, never reusing one just ended.
      let destRound = findEarliestEmptyRoundForColumn(board, action.columnId);
      if (!destRound) {
        ensureTrailingRound(board);
        destRound = findEarliestEmptyRoundForColumn(board, action.columnId);
      }
      if (!destRound) return current;
      for (const cell of endCells) {
        cell!.status = "ended";
      }
      const destCell = destRound.cells.find(
        ({ columnId }) => columnId === action.columnId,
      )!;
      destCell.tableLabel = label;
      destCell.status = "active";
      break;
    }
    case "skip-turn": {
      const round = board.rounds.find(({ id }) => id === action.roundId);
      const cell = round?.cells.find(
        ({ columnId }) => columnId === action.columnId,
      );
      if (!cell || cell.status !== "empty") return current;
      cell.status = "skipped";
      cell.tableLabel = null;
      break;
    }
    case "add-column":
      board.columns.push({ ...action.column });
      for (const round of board.rounds) {
        if (
          !round.cells.some(({ columnId }) => columnId === action.column.id)
        ) {
          round.cells.push({
            columnId: action.column.id,
            tableLabel: null,
            status: "empty",
          });
        }
      }
      break;
    case "set-column-status": {
      const column = board.columns.find(({ id }) => id === action.columnId);
      if (column) column.status = action.status;
      break;
    }
    case "clear-row": {
      const round = board.rounds.find(({ id }) => id === action.roundId);
      if (round) {
        round.cells = round.cells.map((cell) => ({
          ...cell,
          tableLabel: null,
          status: "empty",
        }));
      }
      break;
    }
    case "clear-column":
      for (const round of board.rounds) {
        const cell = round.cells.find(
          ({ columnId }) => columnId === action.columnId,
        );
        if (cell) {
          cell.tableLabel = null;
          cell.status = "empty";
        }
      }
      break;
    case "clear-board":
      board.rounds = [];
      board.nextRoundNumber = 1;
      break;
    case "move-column": {
      // Swap `position` with the adjacent *visible* column only. Cell data
      // is keyed by columnId, never by position, so no round's recorded
      // data changes — only who's considered "next" is affected, and only
      // for computations made after this action (see rotation-board's
      // consumers: `nextColumn` always derives fresh from current
      // positions). See docs/features/010-reorder-rotation-servers.md.
      const visible = board.columns
        .filter((column) => column.status !== "removed")
        .sort((a, b) => a.position - b.position);
      const index = visible.findIndex(({ id }) => id === action.columnId);
      if (index === -1) return current;
      const targetIndex = action.direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= visible.length) return current;
      const moving = board.columns.find(({ id }) => id === visible[index].id)!;
      const swapping = board.columns.find(
        ({ id }) => id === visible[targetIndex].id,
      )!;
      const swap = moving.position;
      moving.position = swapping.position;
      swapping.position = swap;
      break;
    }
    case "add-row":
      // A manager can always add an extra row on top of the automatic
      // buffer below — e.g. to hold a spot ahead of a known table turn.
      // ensureTrailingRound never removes rows, so this is a plain
      // append; it composes fine with the automatic buffer already in
      // place.
      board.rounds.push(makeRound(board));
      board.nextRoundNumber += 1;
      break;
    case "delete-row": {
      // Structural removal, only for a round with no recorded values —
      // clear first, then delete, same rule as board_delete_row (real
      // mode). Preserves history for anything ever assigned.
      const round = board.rounds.find(({ id }) => id === action.roundId);
      if (!round || !isRoundEmpty(round)) return current;
      board.rounds = board.rounds.filter(({ id }) => id !== action.roundId);
      break;
    }
  }
  ensureTrailingRound(board);
  return board;
}

export function createBoardHistory(board: RotationBoard): BoardHistory {
  return { past: [], present: clone(board), future: [] };
}

export function executeBoardAction(
  history: BoardHistory,
  action: BoardAction,
): BoardHistory {
  const next = applyBoardAction(history.present, action);
  if (next === history.present) return history;
  return {
    past: [...history.past, clone(history.present)],
    present: next,
    future: [],
  };
}

export function undoBoard(history: BoardHistory): BoardHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: clone(previous),
    future: [clone(history.present), ...history.future],
  };
}

export function redoBoard(history: BoardHistory): BoardHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, clone(history.present)],
    present: clone(next),
    future: history.future.slice(1),
  };
}

/**
 * Feature 011: any signed-in active member may write to any column — the
 * self-or-manager restriction is dropped for the allocation board only.
 * Kept as a named export, rather than inlining `true` at call sites, so a
 * future board-level lock (see `isCrossColumnEdit` and the finalized-day
 * freeze in allocation-workspace.tsx) has one obvious place to extend.
 */
export function mayWriteColumn() {
  return true;
}

/**
 * The row people are actually filling in right now — as opposed to
 * `rounds.at(-1)`, which is one of the standing ~2 empty buffer rows once
 * they exist (see `ensureTrailingRound`). The working round is the last
 * round with at least one recorded value, or the first round if the
 * board is entirely fresh. (Before the buffer grew to 2 rows, `at(-2)`
 * was an equivalent shortcut for this; it stopped being one once a
 * second trailing empty row could exist.) Consumers that need "who's up
 * next" (the allocation workspace's summary card, `computeNextColumnId`
 * in tests) must derive it from this, not from the literal last round,
 * or they'll compute against a row nobody has touched yet.
 */
export function getWorkingRound(
  board: RotationBoard,
): RotationRound | undefined {
  for (let i = board.rounds.length - 1; i >= 0; i -= 1) {
    if (!isRoundEmpty(board.rounds[i])) return board.rounds[i];
  }
  return board.rounds[0];
}

/**
 * Writing to your own column is unattributed, same as always. Writing to
 * someone else's is always recorded (who, what column, when) so a
 * dispute has a trail. Feature 011 was revised twice: a reason was
 * first made optional, then dropped from the UI entirely — there is no
 * reason field anywhere in the allocation board anymore, only this
 * unconditional attribution. Kept as a named export (was
 * `writeRequiresReason` when a reason was mandatory) so the one "is
 * this a cross-column write" check stays in one place.
 */
export function isCrossColumnEdit(input: {
  profileId: string;
  columnId: string;
}) {
  return input.profileId !== input.columnId;
}
