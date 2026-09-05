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
  | { type: "assign"; roundId: string; columnId: string; tableLabel: string }
  | { type: "add-column"; column: RotationColumn }
  | { type: "set-column-status"; columnId: string; status: ColumnStatus }
  | { type: "clear-row"; roundId: string }
  | { type: "clear-column"; columnId: string }
  | { type: "clear-board" }
  | { type: "move-column"; columnId: string; direction: "up" | "down" }
  | { type: "add-row" };

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

function ensureTrailingRound(board: RotationBoard) {
  if (board.rounds.length === 0) {
    board.rounds.push(makeRound(board));
    board.nextRoundNumber += 1;
    return;
  }
  const activeIds = new Set(
    board.columns
      .filter((column) => column.status === "active")
      .map((column) => column.id),
  );
  const isRoundComplete = (round: RotationRound) =>
    activeIds.size > 0 &&
    [...activeIds].every((columnId) =>
      round.cells.some(
        (cell) => cell.columnId === columnId && Boolean(cell.tableLabel),
      ),
    );
  // A fresh empty row is kept ready one full row ahead of whichever row
  // people are actually filling in, instead of only appearing once that
  // row itself is completely done. Concretely: once a fully-empty
  // trailing "buffer" row exists, the row being worked is the one right
  // before it (the second-to-last row); finishing *that* one is what
  // advances the buffer, not finishing the buffer itself. Before a
  // buffer exists yet (board.rounds.length === 1), the single row is
  // both — finishing it behaves the same way it always has.
  //
  // Without this, whoever finishes their column first in the row being
  // worked has nowhere to go until the last straggler in that same row
  // catches up — exactly the "waits too long" bug this fixes.
  for (;;) {
    const rounds = board.rounds;
    const workingRound =
      rounds.length >= 2
        ? rounds[rounds.length - 2]
        : rounds[rounds.length - 1];
    if (!isRoundComplete(workingRound)) break;
    rounds.push(makeRound(board));
    board.nextRoundNumber += 1;
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
 * `rounds.at(-1)`, which is the standing empty buffer row once one
 * exists (see `ensureTrailingRound`). Consumers that need "who's up
 * next" (the allocation workspace's summary card, `computeNextColumnId`
 * in tests) must derive it from this, not from the literal last round,
 * or they'll compute against a row nobody has touched yet.
 */
export function getWorkingRound(
  board: RotationBoard,
): RotationRound | undefined {
  return board.rounds.length >= 2 ? board.rounds.at(-2) : board.rounds.at(-1);
}

/**
 * Writing to your own column is unattributed, same as always. Writing to
 * someone else's is always recorded (who, what column, when) so a
 * dispute has a trail — but per Feature 011's revision, a reason is
 * optional, not required: it must never block the edit itself. Kept as a
 * named export (was `writeRequiresReason` when a reason was mandatory)
 * so the one "is this a cross-column write" check stays in one place.
 */
export function isCrossColumnEdit(input: {
  profileId: string;
  columnId: string;
}) {
  return input.profileId !== input.columnId;
}
