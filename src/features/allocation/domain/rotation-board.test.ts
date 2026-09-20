import { describe, expect, it } from "vitest";

import {
  createBoardHistory,
  createRotationBoard,
  executeBoardAction,
  findEarliestEmptyRoundForColumn,
  getActiveTablesForColumn,
  getWorkingRound,
  isCrossColumnEdit,
  mayWriteColumn,
  redoBoard,
  type RotationBoard,
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

// Table Rotation Multi-View, Upgrade 1.1: Transfer, End Table, Unassign,
// and Skip Turn as four distinct semantics -- see
// docs/features/table-rotation-multi-view/TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md.
describe("rotation board — Upgrade 1.1 lifecycle", () => {
  it("end-table preserves the historical label and frees the cell for occupancy purposes", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const roundId = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "mia",
      tableLabel: "12",
    });
    history = executeBoardAction(history, {
      type: "end-table",
      roundId,
      columnId: "mia",
    });
    const cell = history.present.rounds
      .find(({ id }) => id === roundId)!
      .cells.find(({ columnId }) => columnId === "mia")!;
    expect(cell.status).toBe("ended");
    expect(cell.tableLabel).toBe("12"); // history is preserved, not deleted
  });

  it("end-table is a no-op on a cell that isn't currently active", () => {
    const history = createBoardHistory(createRotationBoard(columns));
    const roundId = history.present.rounds[0].id;
    const result = executeBoardAction(history, {
      type: "end-table",
      roundId,
      columnId: "mia",
    });
    expect(result).toBe(history);
  });

  it("unassign (clear-cell) deletes an active assignment outright -- it never becomes a skip", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const roundId = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "mia",
      tableLabel: "12",
    });
    history = executeBoardAction(history, {
      type: "clear-cell",
      roundId,
      columnId: "mia",
    });
    const cell = history.present.rounds
      .find(({ id }) => id === roundId)!
      .cells.find(({ columnId }) => columnId === "mia")!;
    expect(cell.status).toBe("empty");
    expect(cell.tableLabel).toBeNull();
  });

  it("unassign also works as a correction on an ended or skipped cell", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const roundId = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "mia",
      tableLabel: "12",
    });
    history = executeBoardAction(history, {
      type: "end-table",
      roundId,
      columnId: "mia",
    });
    history = executeBoardAction(history, {
      type: "clear-cell",
      roundId,
      columnId: "mia",
    });
    const cell = history.present.rounds
      .find(({ id }) => id === roundId)!
      .cells.find(({ columnId }) => columnId === "mia")!;
    expect(cell.status).toBe("empty");
  });

  it("skip-turn records a semantic skip, not the literal label '0', and only targets a genuinely empty cell", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const roundId = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "skip-turn",
      roundId,
      columnId: "mia",
    });
    const cell = history.present.rounds
      .find(({ id }) => id === roundId)!
      .cells.find(({ columnId }) => columnId === "mia")!;
    expect(cell.status).toBe("skipped");
    expect(cell.tableLabel).toBeNull();

    // Refusing to overwrite anything already recorded there.
    const rejected = executeBoardAction(history, {
      type: "skip-turn",
      roundId,
      columnId: "mia",
    });
    expect(rejected).toBe(history);
  });

  it("skip-turn counts as a used cell for the auto-row rule, same as any other real entry", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const roundId = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "skip-turn",
      roundId,
      columnId: "mia",
    });
    history = executeBoardAction(history, {
      type: "skip-turn",
      roundId,
      columnId: "leo",
    });
    // Both cells in round 1 are now "used" (skipped), so the trailing
    // buffer must have topped back up to 2 fresh rows past it.
    expect(history.present.rounds).toHaveLength(3);
  });

  it("assign refuses to overwrite an ended or skipped cell instead of silently clobbering history", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const roundId = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "mia",
      tableLabel: "12",
    });
    history = executeBoardAction(history, {
      type: "end-table",
      roundId,
      columnId: "mia",
    });
    const rejected = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "mia",
      tableLabel: "99",
    });
    expect(rejected).toBe(history);

    history = executeBoardAction(history, {
      type: "skip-turn",
      roundId,
      columnId: "leo",
    });
    const rejectedSkip = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "leo",
      tableLabel: "99",
    });
    expect(rejectedSkip).toBe(history);
  });

  it("transfer moves the same assignment to the destination's earliest empty round, leaving no gap at the source", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const round1 = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "mia",
      tableLabel: "12",
    });
    history = executeBoardAction(history, {
      type: "transfer",
      sourceRoundId: round1,
      sourceColumnId: "mia",
      destColumnId: "leo",
    });

    const sourceCell = history.present.rounds
      .find(({ id }) => id === round1)!
      .cells.find(({ columnId }) => columnId === "mia")!;
    expect(sourceCell.status).toBe("empty"); // no gap left behind
    expect(sourceCell.tableLabel).toBeNull();

    // Leo already has an empty cell in round 1 (never assigned there
    // yet), so that's the earliest empty round for the destination.
    const destCell = history.present.rounds
      .find(({ id }) => id === round1)!
      .cells.find(({ columnId }) => columnId === "leo")!;
    expect(destCell.status).toBe("active");
    expect(destCell.tableLabel).toBe("12");
  });

  it("transfer never overwrites the destination's ended or skipped cells -- it lands on the earliest genuinely empty round instead", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const round1 = history.present.rounds[0].id;
    // Leo's round 1 cell becomes ended (still not "empty" -- it's real
    // history), so a transfer to Leo must skip past it.
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "leo",
      tableLabel: "5",
    });
    history = executeBoardAction(history, {
      type: "end-table",
      roundId: round1,
      columnId: "leo",
    });
    // Leo's round 2 cell becomes skipped -- also not "empty".
    const round2 = history.present.rounds[1].id;
    history = executeBoardAction(history, {
      type: "skip-turn",
      roundId: round2,
      columnId: "leo",
    });

    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "mia",
      tableLabel: "12",
    });
    history = executeBoardAction(history, {
      type: "transfer",
      sourceRoundId: round1,
      sourceColumnId: "mia",
      destColumnId: "leo",
    });

    // Round 1 and round 2 for leo are untouched.
    expect(
      history.present.rounds
        .find(({ id }) => id === round1)!
        .cells.find(({ columnId }) => columnId === "leo")!.status,
    ).toBe("ended");
    expect(
      history.present.rounds
        .find(({ id }) => id === round2)!
        .cells.find(({ columnId }) => columnId === "leo")!.status,
    ).toBe("skipped");
    // The transfer landed on leo's first genuinely empty round instead.
    const destRound = history.present.rounds.find((round) =>
      round.cells.some(
        (cell) => cell.columnId === "leo" && cell.tableLabel === "12",
      ),
    );
    expect(destRound).toBeDefined();
    expect(destRound!.id).not.toBe(round1);
    expect(destRound!.id).not.toBe(round2);
  });

  it("reassigning a table's physical resource after ending it opens a fresh active row while the old row stays historical", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const round1 = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "mia",
      tableLabel: "12",
    });
    history = executeBoardAction(history, {
      type: "end-table",
      roundId: round1,
      columnId: "mia",
    });
    // Table 12 is free again -- a later round can assign it fresh to
    // whoever's turn it is, without touching the old ended row.
    const round2 = history.present.rounds[1].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round2,
      columnId: "leo",
      tableLabel: "12",
    });

    const oldRow = history.present.rounds
      .find(({ id }) => id === round1)!
      .cells.find(({ columnId }) => columnId === "mia")!;
    expect(oldRow.status).toBe("ended");
    expect(oldRow.tableLabel).toBe("12");

    const newRow = history.present.rounds
      .find(({ id }) => id === round2)!
      .cells.find(({ columnId }) => columnId === "leo")!;
    expect(newRow.status).toBe("active");
    expect(newRow.tableLabel).toBe("12");
  });
});

// Table Rotation Multi-View, Upgrade 1.1 (multi-table): a server can
// have zero, one, or many active tables at once. The root cause of the
// original "assigning a second table silently transfers the first"
// bug was Floor always writing into one shared "current round" pointer
// for every new assignment -- these tests cover the fix
// (findEarliestEmptyRoundForColumn, used per-column instead) and the
// new "end-and-assign" composite action.
describe("rotation board — Upgrade 1.1 multi-table", () => {
  it("findEarliestEmptyRoundForColumn finds each column's own next free round, not a round shared across columns", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const round1 = history.present.rounds[0].id;
    // Mia fills round 1; Leo never goes -- their "next free round" must
    // differ (Mia's is round 2+, Leo's is still round 1).
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "mia",
      tableLabel: "1",
    });

    const miaNext = findEarliestEmptyRoundForColumn(history.present, "mia");
    const leoNext = findEarliestEmptyRoundForColumn(history.present, "leo");
    expect(miaNext?.id).not.toBe(round1);
    expect(leoNext?.id).toBe(round1);
  });

  // Production stability hotfix: real mode (allocation-data.ts) never
  // materializes an explicit "empty" cell -- a round with no
  // table_rotation_entries row for a column simply has no cell object
  // for it at all (RotationCellStatus's own doc comment: "empty there
  // means no row at all, rather than a stored value"). The demo reducer
  // above always creates one, so every other test in this file never
  // exercises that shape. Without the `cell?.status ?? "empty"`
  // fallback, this always returned undefined for a server who has never
  // been assigned anything, silently no-opping every Floor/Picker/
  // Server "assign this available table" and "Assign Also" action.
  it("findEarliestEmptyRoundForColumn treats a missing cell (real mode's shape) as empty, not just an explicit status: 'empty' cell", () => {
    const board: RotationBoard = {
      columns,
      rounds: [{ id: "r1", sequence: 1, cells: [] }],
      nextRoundNumber: 2,
    };
    expect(findEarliestEmptyRoundForColumn(board, "mia")?.id).toBe("r1");
  });

  it("getActiveTablesForColumn lists every active table for a column across all its rounds, but not ended/skipped ones", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const round1 = history.present.rounds[0].id;
    const round2 = history.present.rounds[1].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "mia",
      tableLabel: "1",
    });
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round2,
      columnId: "mia",
      tableLabel: "4",
    });

    expect(getActiveTablesForColumn(history.present, "mia")).toEqual(
      expect.arrayContaining([
        { roundId: round1, tableLabel: "1" },
        { roundId: round2, tableLabel: "4" },
      ]),
    );
    expect(getActiveTablesForColumn(history.present, "mia")).toHaveLength(2);
    expect(getActiveTablesForColumn(history.present, "leo")).toEqual([]);

    // Ending one of them removes it from the active list -- it's history
    // now, not a current active table.
    history = executeBoardAction(history, {
      type: "end-table",
      roundId: round1,
      columnId: "mia",
    });
    expect(getActiveTablesForColumn(history.present, "mia")).toEqual([
      { roundId: round2, tableLabel: "4" },
    ]);
  });

  it("assigning a second table to a column that already has one active table (Assign Also) never touches the first", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const round1 = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "mia",
      tableLabel: "1",
    });

    // This mirrors exactly what Floor's "Assign Also" does: look up the
    // column's own earliest empty round, assign there.
    const destRound = findEarliestEmptyRoundForColumn(history.present, "mia");
    expect(destRound).toBeDefined();
    history = executeBoardAction(history, {
      type: "assign",
      roundId: destRound!.id,
      columnId: "mia",
      tableLabel: "3",
    });

    const activeTables = getActiveTablesForColumn(history.present, "mia");
    expect(activeTables).toEqual(
      expect.arrayContaining([
        { roundId: round1, tableLabel: "1" },
        { roundId: destRound!.id, tableLabel: "3" },
      ]),
    );
    expect(activeTables).toHaveLength(2);
  });

  it("end-and-assign ends the chosen table in place and creates a new active row elsewhere, leaving the column's other active tables untouched", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const round1 = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "mia",
      tableLabel: "1",
    });
    const round2 = findEarliestEmptyRoundForColumn(history.present, "mia")!.id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round2,
      columnId: "mia",
      tableLabel: "4",
    });

    // End table "1" (round1) and assign a new table "9" in one step.
    history = executeBoardAction(history, {
      type: "end-and-assign",
      endRoundIds: [round1],
      columnId: "mia",
      tableLabel: "9",
    });

    const endedCell = history.present.rounds
      .find(({ id }) => id === round1)!
      .cells.find(({ columnId }) => columnId === "mia")!;
    expect(endedCell.status).toBe("ended");
    expect(endedCell.tableLabel).toBe("1"); // history preserved

    const untouchedCell = history.present.rounds
      .find(({ id }) => id === round2)!
      .cells.find(({ columnId }) => columnId === "mia")!;
    expect(untouchedCell.status).toBe("active");
    expect(untouchedCell.tableLabel).toBe("4"); // Mia's other table, unaffected

    const newActive = getActiveTablesForColumn(history.present, "mia").find(
      (t) => t.tableLabel === "9",
    );
    expect(newActive).toBeDefined();
    expect(newActive!.roundId).not.toBe(round1); // landed on a fresh round, not the one just ended
  });

  it("end-and-assign is a no-op if the target round isn't currently an active table for that column", () => {
    const history = createBoardHistory(createRotationBoard(columns));
    const round1 = history.present.rounds[0].id;
    // Mia's round1 cell is still empty -- nothing to end.
    const result = executeBoardAction(history, {
      type: "end-and-assign",
      endRoundIds: [round1],
      columnId: "mia",
      tableLabel: "9",
    });
    expect(result).toBe(history);
  });

  it("end-and-assign is a no-op (all-or-nothing) if no rounds are selected", () => {
    const history = createBoardHistory(createRotationBoard(columns));
    const result = executeBoardAction(history, {
      type: "end-and-assign",
      endRoundIds: [],
      columnId: "mia",
      tableLabel: "9",
    });
    expect(result).toBe(history);
  });

  it("end-and-assign ends multiple selected tables at once, leaving any other active table for that column untouched", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const round1 = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "mia",
      tableLabel: "1",
    });
    const round2 = findEarliestEmptyRoundForColumn(history.present, "mia")!.id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round2,
      columnId: "mia",
      tableLabel: "4",
    });
    const round3 = findEarliestEmptyRoundForColumn(history.present, "mia")!.id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round3,
      columnId: "mia",
      tableLabel: "7",
    });

    // End T1 and T4, leaving T7 active, and assign T3.
    history = executeBoardAction(history, {
      type: "end-and-assign",
      endRoundIds: [round1, round2],
      columnId: "mia",
      tableLabel: "3",
    });

    const cellIn = (roundId: string) =>
      history.present.rounds
        .find(({ id }) => id === roundId)!
        .cells.find(({ columnId }) => columnId === "mia")!;
    expect(cellIn(round1).status).toBe("ended");
    expect(cellIn(round2).status).toBe("ended");
    expect(cellIn(round3).status).toBe("active");
    expect(cellIn(round3).tableLabel).toBe("7"); // Mia's untouched third table

    const activeTables = getActiveTablesForColumn(history.present, "mia");
    expect(activeTables).toEqual(
      expect.arrayContaining([
        { roundId: round3, tableLabel: "7" },
        expect.objectContaining({ tableLabel: "3" }),
      ]),
    );
    expect(activeTables).toHaveLength(2);
  });

  it("end-and-assign can end every one of a column's active tables (End All)", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const round1 = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "mia",
      tableLabel: "1",
    });
    const round2 = findEarliestEmptyRoundForColumn(history.present, "mia")!.id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round2,
      columnId: "mia",
      tableLabel: "4",
    });

    history = executeBoardAction(history, {
      type: "end-and-assign",
      endRoundIds: [round1, round2],
      columnId: "mia",
      tableLabel: "3",
    });

    const cellIn = (roundId: string) =>
      history.present.rounds
        .find(({ id }) => id === roundId)!
        .cells.find(({ columnId }) => columnId === "mia")!;
    expect(cellIn(round1).status).toBe("ended");
    expect(cellIn(round2).status).toBe("ended");
    const activeTables = getActiveTablesForColumn(history.present, "mia");
    expect(activeTables).toHaveLength(1);
    expect(activeTables[0].tableLabel).toBe("3");
  });

  it("end-and-assign is all-or-nothing: if any selected round is no longer active, none of them end", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const round1 = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "mia",
      tableLabel: "1",
    });
    const round2 = findEarliestEmptyRoundForColumn(history.present, "mia")!.id;
    // round2 is still empty (never assigned) -- not a valid "active table
    // to end". Selecting it alongside the genuinely active round1 must
    // reject the whole action, not just skip the invalid one.
    const result = executeBoardAction(history, {
      type: "end-and-assign",
      endRoundIds: [round1, round2],
      columnId: "mia",
      tableLabel: "3",
    });
    expect(result).toBe(history);
    expect(
      result.present.rounds
        .find(({ id }) => id === round1)!
        .cells.find(({ columnId }) => columnId === "mia")!.status,
    ).toBe("active"); // untouched -- the whole action was rejected
  });

  it("undo/redo restore a multi-table board exactly (full-snapshot history, not per-action inverses, in demo mode)", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const round1 = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId: round1,
      columnId: "mia",
      tableLabel: "1",
    });
    const beforeEndAndAssign = history.present;
    history = executeBoardAction(history, {
      type: "end-and-assign",
      endRoundIds: [round1],
      columnId: "mia",
      tableLabel: "9",
    });
    expect(getActiveTablesForColumn(history.present, "mia")).toHaveLength(1);

    const undone = undoBoard(history);
    expect(undone.present).toEqual(beforeEndAndAssign);

    const redone = redoBoard(undone);
    expect(getActiveTablesForColumn(redone.present, "mia")).toHaveLength(1);
    expect(getActiveTablesForColumn(redone.present, "mia")[0].tableLabel).toBe(
      "9",
    );
  });
});
