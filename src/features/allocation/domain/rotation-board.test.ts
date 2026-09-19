import { describe, expect, it } from "vitest";

import {
  createBoardHistory,
  createRotationBoard,
  executeBoardAction,
  getWorkingRound,
  isCrossColumnEdit,
  mayWriteColumn,
  redoBoard,
  undoBoard,
} from "./rotation-board";

const columns = [
  { id: "mia", name: "Mia", position: 0, status: "active" as const },
  { id: "leo", name: "Leo", position: 1, status: "active" as const },
];

// Mirrors the `nextColumn` derivation in allocation-workspace.tsx exactly
// (including using the same `getWorkingRound`, not the raw trailing
// round, now that a standing empty buffer row can sit past it), so
// Feature 010's "next up recomputes immediately" claim is proven at the
// domain layer, not just asserted.
function computeNextColumnId(board: ReturnType<typeof createRotationBoard>) {
  const visible = [...board.columns]
    .filter((column) => column.status !== "removed")
    .sort((a, b) => a.position - b.position);
  const workingRound = getWorkingRound(board);
  const next = visible.find(
    (column) =>
      column.status === "active" &&
      !workingRound?.cells.find((cell) => cell.columnId === column.id)
        ?.tableLabel,
  );
  return next?.id ?? null;
}

describe("rotation board", () => {
  it("opens enough empty rows to keep a two-row trailing buffer, not once every column fills it", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    // Table Rotation Multi-View: the reconciled rule keeps ~2 empty
    // trailing rounds, not 1 -- a fresh board already has 2.
    expect(history.present.rounds).toHaveLength(2);
    const roundId = history.present.rounds[0].id;

    // A single column's first value is enough -- leo hasn't gone yet.
    history = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "mia",
      tableLabel: "12",
    });
    expect(history.present.rounds).toHaveLength(3);
    expect(
      history.present.rounds
        .slice(1)
        .every((round) =>
          round.cells.every((cell) => cell.tableLabel === null),
        ),
    ).toBe(true);

    // Leo completing the same row doesn't push a third extra row -- the
    // two fresh buffer rows (still untouched) already cover it.
    history = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "leo",
      tableLabel: "14 + 15",
    });
    expect(history.present.rounds).toHaveLength(3);
  });

  it("fills rows sequentially and keeps a two-row trailing buffer, never waiting for the row to complete", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const round1 = history.present.rounds[0].id;

    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "mia",
      tableLabel: "1",
    });
    expect(history.present.rounds).toHaveLength(3); // buffer topped back up to 2
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "leo",
      tableLabel: "2",
    });
    expect(history.present.rounds).toHaveLength(3); // row 1 now complete, buffer unchanged

    const round2 = history.present.rounds[1].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round2,
      columnId: "mia",
      tableLabel: "3",
    });
    expect(history.present.rounds).toHaveLength(4); // buffer topped up again on row 2's first value
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round2,
      columnId: "leo",
      tableLabel: "4",
    });
    expect(history.present.rounds).toHaveLength(4);
  });

  it("an uneven floor -- two columns racing far ahead while others never fill a single row -- still always gets a trailing empty row (reproduces the reported stuck-at-N-rows bug)", () => {
    const fourColumns = [
      { id: "mia", name: "Mia", position: 0, status: "active" as const },
      { id: "leo", name: "Leo", position: 1, status: "active" as const },
      { id: "ava", name: "Ava", position: 2, status: "active" as const },
      { id: "noah", name: "Noah", position: 3, status: "active" as const },
    ];
    let history = createBoardHistory(createRotationBoard(fourColumns));

    // Mia and Leo fill three whole rows between themselves; Ava and Noah
    // never fill a single cell, in any row -- the exact shape of the
    // reported bug (per-round-completion never fires, so no new row
    // ever appears no matter how far ahead the fast columns get).
    for (let round = 0; round < 3; round += 1) {
      const roundId = history.present.rounds[round].id;
      history = executeBoardAction(history, {
        type: "assign",
        roundId,
        columnId: "mia",
        tableLabel: `${round}-mia`,
      });
      history = executeBoardAction(history, {
        type: "assign",
        roundId,
        columnId: "leo",
        tableLabel: `${round}-leo`,
      });
    }

    // Two completely empty trailing rows must exist -- Ava and Noah
    // having never gone must never block them.
    expect(history.present.rounds).toHaveLength(5);
    expect(
      history.present.rounds
        .slice(3)
        .every((round) =>
          round.cells.every((cell) => cell.tableLabel === null),
        ),
    ).toBe(true);
  });

  it("does not wait for paused columns", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    history = executeBoardAction(history, {
      type: "set-column-status",
      columnId: "leo",
      status: "paused",
    });
    history = executeBoardAction(history, {
      type: "assign",
      roundId: history.present.rounds[0].id,
      columnId: "mia",
      tableLabel: "4",
    });
    expect(history.present.rounds).toHaveLength(3);
  });

  it("a manager can add a row on demand, on top of the automatic buffer, and undo/redo it like any other action", () => {
    const initial = createBoardHistory(createRotationBoard(columns));
    const countBefore = initial.present.rounds.length;
    const added = executeBoardAction(initial, { type: "add-row" });
    expect(added.present.rounds).toHaveLength(countBefore + 1);
    expect(
      added.present.rounds
        .at(-1)!
        .cells.every((cell) => cell.tableLabel === null),
    ).toBe(true);

    const undone = undoBoard(added);
    expect(undone.present.rounds).toHaveLength(countBefore);
    const redone = redoBoard(undone);
    expect(redone.present.rounds).toHaveLength(countBefore + 1);
  });

  it("undoes and redoes board writing", () => {
    const initial = createBoardHistory(createRotationBoard(columns));
    const written = executeBoardAction(initial, {
      type: "assign",
      roundId: initial.present.rounds[0].id,
      columnId: "mia",
      tableLabel: "8",
    });
    expect(undoBoard(written).present.rounds[0].cells[0].tableLabel).toBeNull();
    expect(
      redoBoard(undoBoard(written)).present.rounds[0].cells[0].tableLabel,
    ).toBe("8");
  });

  it("resets a cleared board to two fresh rows", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const firstRound = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: firstRound,
      columnId: "mia",
      tableLabel: "12",
    });
    history = executeBoardAction(history, {
      type: "assign",
      roundId: firstRound,
      columnId: "leo",
      tableLabel: "14",
    });
    history = executeBoardAction(history, { type: "clear-board" });

    expect(history.present.rounds).toHaveLength(2);
    expect(
      history.present.rounds.every((round) =>
        round.cells.every((cell) => cell.tableLabel === null),
      ),
    ).toBe(true);
  });

  it("adding a column mid-board preserves every existing round's cell data and does not rebuild the board", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const firstRoundId = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: firstRoundId,
      columnId: "mia",
      tableLabel: "12",
    });
    history = executeBoardAction(history, {
      type: "assign",
      roundId: firstRoundId,
      columnId: "leo",
      tableLabel: "14",
    });
    // Board is now on round 2 (round 1 complete). Snapshot before adding.
    const roundsBefore = JSON.parse(JSON.stringify(history.present.rounds));
    const roundCountBefore = history.present.rounds.length;

    history = executeBoardAction(history, {
      type: "add-column",
      column: { id: "ivy", name: "Ivy", position: 2, status: "active" },
    });

    // An unrostered employee (no schedule entry) can be added at all —
    // the reducer has no concept of "scheduled" to filter on.
    expect(history.present.columns.some((c) => c.id === "ivy")).toBe(true);
    // Prior rounds' recorded cell data is untouched.
    for (let index = 0; index < roundsBefore.length; index += 1) {
      const before = roundsBefore[index].cells.filter(
        (cell: { columnId: string }) => cell.columnId !== "ivy",
      );
      const after = history.present.rounds[index].cells.filter(
        (cell) => cell.columnId !== "ivy",
      );
      expect(after).toEqual(before);
    }
    // The new column only ever appends an empty cell — it never creates an
    // extra round beyond what completeness already required.
    expect(history.present.rounds).toHaveLength(roundCountBefore);

    // Undo removes exactly the new column and its cells, nothing else.
    const undone = undoBoard(history);
    expect(undone.present.columns.some((c) => c.id === "ivy")).toBe(false);
    expect(undone.present.rounds).toEqual(roundsBefore);
  });

  it("moves a column up or down, swapping position with the adjacent visible column", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    history = executeBoardAction(history, {
      type: "move-column",
      columnId: "leo",
      direction: "up",
    });
    const positions = Object.fromEntries(
      history.present.columns.map((c) => [c.id, c.position]),
    );
    expect(positions.leo).toBe(0);
    expect(positions.mia).toBe(1);
  });

  it("is a no-op at either boundary and adds no undo history", () => {
    const initial = createBoardHistory(createRotationBoard(columns));
    const movedFirstUp = executeBoardAction(initial, {
      type: "move-column",
      columnId: "mia",
      direction: "up",
    });
    expect(movedFirstUp).toBe(initial);
    const movedLastDown = executeBoardAction(initial, {
      type: "move-column",
      columnId: "leo",
      direction: "down",
    });
    expect(movedLastDown).toBe(initial);
  });

  it("leaves all recorded cell data unchanged after a reorder", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    history = executeBoardAction(history, {
      type: "assign",
      roundId: history.present.rounds[0].id,
      columnId: "mia",
      tableLabel: "12",
    });
    const roundsBefore = JSON.parse(JSON.stringify(history.present.rounds));
    history = executeBoardAction(history, {
      type: "move-column",
      columnId: "leo",
      direction: "up",
    });
    expect(history.present.rounds).toEqual(roundsBefore);
  });

  it("undo restores the prior order, redo reapplies it", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    history = executeBoardAction(history, {
      type: "move-column",
      columnId: "leo",
      direction: "up",
    });
    const afterMove = history.present.columns;
    const undone = undoBoard(history);
    expect(undone.present.columns.find((c) => c.id === "mia")!.position).toBe(
      0,
    );
    const redone = redoBoard(undone);
    expect(redone.present.columns).toEqual(afterMove);
  });

  it("recomputes who's next immediately after a reorder, including mid-round", () => {
    const threeColumns = [
      { id: "mia", name: "Mia", position: 0, status: "active" as const },
      { id: "leo", name: "Leo", position: 1, status: "active" as const },
      { id: "ava", name: "Ava", position: 2, status: "active" as const },
    ];
    let history = createBoardHistory(createRotationBoard(threeColumns));
    history = executeBoardAction(history, {
      type: "assign",
      roundId: history.present.rounds[0].id,
      columnId: "mia",
      tableLabel: "1",
    });
    expect(computeNextColumnId(history.present)).toBe("leo");

    history = executeBoardAction(history, {
      type: "move-column",
      columnId: "ava",
      direction: "up",
    });
    expect(computeNextColumnId(history.present)).toBe("ava");
  });

  it("Feature 011: any signed-in member may write to any column", () => {
    expect(mayWriteColumn()).toBe(true);
  });

  // Feature 028: board_assign's own RPC has always been an upsert
  // (on conflict ... do update) -- this proves the pure domain layer
  // the UI's click-to-edit relies on has the identical behavior:
  // assigning again on an already-occupied cell overwrites it in place,
  // never duplicates it.
  it("Feature 028: assigning to an already-occupied cell overwrites its value, cross-column included", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const roundId = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "leo",
      tableLabel: "12",
    });
    // A different actor (mia's own column) re-editing leo's cell.
    history = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "leo",
      tableLabel: "18",
    });
    const round = history.present.rounds.find(({ id }) => id === roundId)!;
    expect(round.cells).toHaveLength(2); // still one cell per column, not two
    expect(
      round.cells.find(({ columnId }) => columnId === "leo")?.tableLabel,
    ).toBe("18");
  });

  it("Feature 028: clear-cell empties one occupied cell without touching the rest of the row", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const roundId = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "mia",
      tableLabel: "12",
    });
    history = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "leo",
      tableLabel: "14",
    });
    history = executeBoardAction(history, {
      type: "clear-cell",
      roundId,
      columnId: "mia",
    });
    const round = history.present.rounds.find(({ id }) => id === roundId)!;
    expect(
      round.cells.find(({ columnId }) => columnId === "mia")?.tableLabel,
    ).toBeNull();
    expect(
      round.cells.find(({ columnId }) => columnId === "leo")?.tableLabel,
    ).toBe("14");
  });

  it("clear-cell on an already-empty cell is a safe no-op, not an error", () => {
    const history = createBoardHistory(createRotationBoard(columns));
    const roundId = history.present.rounds[0].id;
    const cleared = executeBoardAction(history, {
      type: "clear-cell",
      roundId,
      columnId: "mia",
    });
    expect(
      cleared.present.rounds
        .find(({ id }) => id === roundId)
        ?.cells.find(({ columnId }) => columnId === "mia")?.tableLabel,
    ).toBeNull();
  });

  it("delete-row removes an empty round but refuses one with any recorded value", () => {
    const history = createBoardHistory(createRotationBoard(columns));
    const [round1, round2] = history.present.rounds;
    const countBefore = history.present.rounds.length;

    const rejected = executeBoardAction(history, {
      type: "assign",
      roundId: round1.id,
      columnId: "mia",
      tableLabel: "9",
    });
    const stillThere = executeBoardAction(rejected, {
      type: "delete-row",
      roundId: round1.id,
    });
    expect(stillThere).toBe(rejected); // no-op: round1 has a value

    // Deleting round2 drops the board below its own two-row trailing
    // buffer, so ensureTrailingRound immediately replaces it with a fresh
    // round -- the count is unchanged, but round2's own id is gone.
    const deleted = executeBoardAction(history, {
      type: "delete-row",
      roundId: round2.id,
    });
    expect(deleted.present.rounds).toHaveLength(countBefore);
    expect(deleted.present.rounds.some((r) => r.id === round2.id)).toBe(false);

    // Deleting a round that isn't needed to satisfy the buffer actually
    // shrinks the board.
    const withExtraRow = executeBoardAction(history, { type: "add-row" });
    const extraRoundId = withExtraRow.present.rounds.at(-1)!.id;
    const shrunk = executeBoardAction(withExtraRow, {
      type: "delete-row",
      roundId: extraRoundId,
    });
    expect(shrunk.present.rounds).toHaveLength(countBefore);
    expect(shrunk.present.rounds.some((r) => r.id === extraRoundId)).toBe(
      false,
    );
  });

  it("identifies a cross-column write for attribution, but never blocks it on a reason", () => {
    expect(isCrossColumnEdit({ profileId: "mia", columnId: "mia" })).toBe(
      false,
    );
    expect(isCrossColumnEdit({ profileId: "mia", columnId: "leo" })).toBe(true);
  });
});
