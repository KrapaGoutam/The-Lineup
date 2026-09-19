export type ColumnStatus = "active" | "paused" | "removed";

export type RotationColumn = {
  id: string;
  name: string;
  position: number;
  status: ColumnStatus;
};

export type RotationCell = {
  columnId: string;
  tableLabel: string | null;
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
  | { type: "delete-row"; roundId: string };

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
      .map((column) => ({ columnId: column.id, tableLabel: null })),
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

function isRoundEmpty(round: RotationRound) {
  return round.cells.every((cell) => !cell.tableLabel);
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
      if (existing) existing.tableLabel = label;
      else round.cells.push({ columnId: action.columnId, tableLabel: label });
      break;
    }
    // Feature 028: the per-cell counterpart to clear-row/clear-column,
    // open to any active member (see mayWriteColumn) unlike those two,
    // which stay manager-only. Matches clear-row's own convention of
    // nulling tableLabel rather than removing the cell from the array.
    case "clear-cell": {
      const round = board.rounds.find(({ id }) => id === action.roundId);
      const cell = round?.cells.find(
        ({ columnId }) => columnId === action.columnId,
      );
      if (cell) cell.tableLabel = null;
      break;
    }
    case "add-column":
      board.columns.push({ ...action.column });
      for (const round of board.rounds) {
        if (
          !round.cells.some(({ columnId }) => columnId === action.column.id)
        ) {
          round.cells.push({ columnId: action.column.id, tableLabel: null });
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
        }));
      }
      break;
    }
    case "clear-column":
      for (const round of board.rounds) {
        const cell = round.cells.find(
          ({ columnId }) => columnId === action.columnId,
        );
        if (cell) cell.tableLabel = null;
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
