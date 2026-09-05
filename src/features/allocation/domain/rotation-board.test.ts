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

  it("limits employees to their own column", () => {
    expect(
      mayWriteColumn({ isManager: false, profileId: "mia", columnId: "mia" }),
    ).toBe(true);
    expect(
      mayWriteColumn({ isManager: false, profileId: "mia", columnId: "leo" }),
    ).toBe(false);
  });
});
