import { describe, expect, it } from "vitest";

import { can, normalizeDatabaseRole } from "@/features/auth/domain/passcode";
import {
  applyBoardAction,
  createRotationBoard,
  getNextColumn,
  getWorkingRound,
  undoBoard,
  createBoardHistory,
  executeBoardAction,
  type RotationBoard,
} from "@/features/allocation/domain/rotation-board";
import {
  buildBoardReadModel,
  type BoardReadModel,
} from "@/features/allocation/domain/board-read-model";
import { DOMAIN_WORLD } from "@/features/allocation/testing/cross-view-matrix";

/**
 * X4 -- the next-turn / auto-open-row / clear / pause-resume-reorder contract
 * as it ACTUALLY is today (no new business behavior is invented here), plus
 * permission parity. These are the rules every view's mutation must leave
 * intact regardless of where the action originated.
 *
 *  - The board always keeps a trailing buffer of two empty rows; a row "opens"
 *    as soon as the previous one gets any value (not when it is full).
 *  - "Next" = first ACTIVE column, in rotation order, with no turn recorded in
 *    the working row. A skip is a turn. Paused/removed columns are never next
 *    and are never waited for.
 *  - When every active server has a turn the next turn is "New round"
 *    (undefined) until the next entry lands in the following row.
 */
const team = (["a", "b", "c"] as const).map((id, i) => ({
  id,
  name: ["Ann", "Bea", "Cy"][i],
  color: "x",
}));
const cols = (n: number) =>
  team.slice(0, n).map((t, position) => ({
    id: t.id,
    name: t.name,
    position,
    status: "active" as const,
  }));

function firstEmptyRound(board: RotationBoard, columnId: string) {
  return board.rounds.find(
    (r) =>
      (r.cells.find((c) => c.columnId === columnId)?.status ?? "empty") ===
      "empty",
  )!.id;
}
function give(board: RotationBoard, columnId: string, label: string) {
  return applyBoardAction(board, {
    type: "assign",
    roundId: firstEmptyRound(board, columnId),
    columnId,
    tableLabel: label,
  });
}
function skip(board: RotationBoard, columnId: string) {
  return applyBoardAction(board, {
    type: "skip-turn",
    roundId: firstEmptyRound(board, columnId),
    columnId,
  });
}
const nextId = (b: RotationBoard) => getNextColumn(b)?.id ?? null;
const trailingEmpty = (b: RotationBoard) => {
  let n = 0;
  for (let i = b.rounds.length - 1; i >= 0; i -= 1) {
    if (!b.rounds[i].cells.every((c) => c.status === "empty")) break;
    n += 1;
  }
  return n;
};

describe("XM-051 auto-open row contract", () => {
  it("2 active servers: A gets a turn, B gets a turn -> new round; the next entry opens row 2", () => {
    let board = createRotationBoard(cols(2));
    expect(nextId(board)).toBe("a");
    board = give(board, "a", "T1");
    expect(nextId(board)).toBe("b");
    expect(trailingEmpty(board)).toBeGreaterThanOrEqual(2);
    board = give(board, "b", "T2");
    expect(nextId(board)).toBeNull(); // everyone has a turn: "New round"
    expect(getWorkingRound(board)?.id).toBe(board.rounds[0].id);
    board = give(board, "a", "T3");
    // A's next turn landed in row 2, which is now the working row.
    expect(getWorkingRound(board)?.id).toBe(board.rounds[1].id);
    expect(nextId(board)).toBe("b");
    expect(trailingEmpty(board)).toBeGreaterThanOrEqual(2);
  });

  it("a skipped server has taken its turn (skip is a turn, not 'not yet')", () => {
    let board = createRotationBoard(cols(2));
    board = skip(board, "a");
    expect(nextId(board)).toBe("b");
    board = give(board, "b", "T2");
    expect(nextId(board)).toBeNull();
  });

  it("a paused server is not waited for, and is next again after resume", () => {
    let board = createRotationBoard(cols(2));
    board = give(board, "a", "T1");
    board = applyBoardAction(board, {
      type: "set-column-status",
      columnId: "b",
      status: "paused",
    });
    expect(nextId(board)).toBeNull();
    board = applyBoardAction(board, {
      type: "set-column-status",
      columnId: "b",
      status: "active",
    });
    expect(nextId(board)).toBe("b");
  });

  it("a server added mid-row is next immediately", () => {
    let board = createRotationBoard(cols(2));
    board = give(give(board, "a", "T1"), "b", "T2");
    expect(nextId(board)).toBeNull();
    board = applyBoardAction(board, {
      type: "add-column",
      column: { id: "c", name: "Cy", position: 2, status: "active" },
    });
    expect(nextId(board)).toBe("c");
  });

  it("a server removed mid-row is no longer waited for", () => {
    let board = createRotationBoard(cols(3));
    board = give(board, "a", "T1");
    expect(nextId(board)).toBe("b");
    board = applyBoardAction(board, {
      type: "set-column-status",
      columnId: "b",
      status: "removed",
    });
    expect(nextId(board)).toBe("c");
  });

  it("pause, resume and reorder never change who holds which table", () => {
    let board = createRotationBoard(cols(3));
    board = give(give(board, "a", "T1"), "b", "T2");
    const owners = (b: RotationBoard): Record<string, string> => {
      const model = buildBoardReadModel({
        board: b,
        layout: DOMAIN_WORLD.layout,
        registry: DOMAIN_WORLD.registry,
        team,
      });
      return Object.fromEntries(
        model.tables.map((t) => [t.label, t.occupiedBy?.columnId ?? ""]),
      );
    };
    const before = owners(board);
    board = applyBoardAction(board, {
      type: "set-column-status",
      columnId: "a",
      status: "paused",
    });
    board = applyBoardAction(board, {
      type: "move-column",
      columnId: "b",
      direction: "up",
    });
    board = applyBoardAction(board, {
      type: "set-column-status",
      columnId: "a",
      status: "active",
    });
    expect(owners(board)).toEqual(before);
  });
});

describe("XM-060 clear operations", () => {
  function model(board: RotationBoard): BoardReadModel {
    return buildBoardReadModel({
      board,
      layout: DOMAIN_WORLD.layout,
      registry: DOMAIN_WORLD.registry,
      team,
    });
  }
  const seeded = () =>
    give(
      give(give(createRotationBoard(cols(3)), "a", "T1"), "b", "T2"),
      "c",
      "T3",
    );

  it("clear cell (Unassign) removes the entry: table available, count and next recomputed, no history", () => {
    let board = seeded();
    board = applyBoardAction(board, {
      type: "clear-cell",
      roundId: board.rounds[0].id,
      columnId: "b",
    });
    const m = model(board);
    expect(m.tables.find((t) => t.label === "T2")?.occupiedBy).toBeNull();
    expect(m.stats.occupiedTables).toBe(2);
    expect(m.stats.endedAssignments).toBe(0);
    expect(m.nextColumnId).toBe("b");
  });

  it("clear row empties the whole row (including ended history in it)", () => {
    let board = seeded();
    board = applyBoardAction(board, {
      type: "end-table",
      roundId: board.rounds[0].id,
      columnId: "a",
    });
    expect(model(board).stats.endedAssignments).toBe(1);
    board = applyBoardAction(board, {
      type: "clear-row",
      roundId: board.rounds[0].id,
    });
    const m = model(board);
    expect(m.stats.occupiedTables).toBe(0);
    expect(m.stats.endedAssignments).toBe(0);
    expect(m.tables.every((t) => t.occupiedBy === null)).toBe(true);
  });

  it("clear board resets every table to available; Undo restores the previous board", () => {
    let history = createBoardHistory(seeded());
    const before = history.present;
    history = executeBoardAction(history, { type: "clear-board" });
    const cleared = model(history.present);
    expect(cleared.stats.occupiedTables).toBe(0);
    expect(cleared.stats.availableTables).toBe(DOMAIN_WORLD.registry.length);
    history = undoBoard(history);
    expect(history.present).toEqual(before);
    expect(model(history.present).stats.occupiedTables).toBe(3);
  });
});

describe("XM-090 permission parity (a view never changes permissions)", () => {
  it("every database role that may operate the board may do so identically from every view", () => {
    // private.can_operate_board: owner, general_manager, shift_manager, host, server.
    for (const dbRole of [
      "owner",
      "general_manager",
      "shift_manager",
      "host",
      "server",
    ]) {
      const role = normalizeDatabaseRole([dbRole]);
      expect(can(role, "allocation:operate")).toBe(true);
      expect(can(role, "allocation:write-any")).toBe(true);
    }
  });

  it("only managers/owners get the tips-reopen style management capability, never via a view", () => {
    expect(can("server", "allocation:manage")).toBe(false);
    expect(can("manager", "allocation:manage")).toBe(true);
    expect(can("owner", "allocation:manage")).toBe(true);
  });
});
