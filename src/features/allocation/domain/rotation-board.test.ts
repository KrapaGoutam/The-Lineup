import { describe, expect, it } from "vitest";

import {
  createBoardHistory,
  createRotationBoard,
  executeBoardAction,
  mayWriteColumn,
  redoBoard,
  undoBoard,
} from "./rotation-board";

const columns = [
  { id: "mia", name: "Mia", position: 0, status: "active" as const },
  { id: "leo", name: "Leo", position: 1, status: "active" as const },
];

describe("rotation board", () => {
  it("adds a new row after every active column is filled", () => {
    let history = createBoardHistory(createRotationBoard(columns));
    const roundId = history.present.rounds[0].id;
    history = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "mia",
      tableLabel: "12",
    });
    expect(history.present.rounds).toHaveLength(1);
    expect(history.present.rounds[0].sequence).toBe(1);
    history = executeBoardAction(history, {
      type: "assign",
      roundId,
      columnId: "leo",
      tableLabel: "14 + 15",
    });
    expect(history.present.rounds).toHaveLength(2);
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
    expect(history.present.rounds).toHaveLength(2);
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

  it("resets a cleared board to one fresh row", () => {
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

    expect(history.present.rounds).toHaveLength(1);
    expect(
      history.present.rounds[0].cells.every((cell) => cell.tableLabel === null),
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

  it("limits employees to their own column", () => {
    expect(
      mayWriteColumn({ isManager: false, profileId: "mia", columnId: "mia" }),
    ).toBe(true);
    expect(
      mayWriteColumn({ isManager: false, profileId: "mia", columnId: "leo" }),
    ).toBe(false);
  });
});
