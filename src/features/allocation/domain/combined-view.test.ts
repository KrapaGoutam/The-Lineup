import { describe, expect, it } from "vitest";

import {
  buildActiveRecords,
  buildHistoryRows,
  buildPickerTiles,
  fitFloorTables,
  parseCombinedMode,
  resolveTarget,
  targetRoundFor,
} from "@/features/allocation/domain/combined-view";
import { buildBoardReadModel } from "@/features/allocation/domain/board-read-model";
import {
  DEMO_FLOOR_LAYOUT,
  type FloorLayoutEntry,
} from "@/features/allocation/domain/floor-layout";
import {
  applyBoardAction,
  createRotationBoard,
  type BoardAction,
  type RotationBoard,
} from "@/features/allocation/domain/rotation-board";

const layout: FloorLayoutEntry[] = [
  { label: "T1", x: 20, y: 20, resourceType: "table" },
  { label: "T2", x: 60, y: 20, resourceType: "table" },
  { label: "B1", x: 20, y: 80, resourceType: "bar_seat" },
];
const team = [
  { id: "mia", name: "Mia", color: "red" },
  { id: "leo", name: "Leo", color: "blue" },
];

function start(): RotationBoard {
  return createRotationBoard([
    { id: "mia", name: "Mia", position: 0, status: "active" },
    { id: "leo", name: "Leo", position: 1, status: "active" },
  ]);
}
const run = (...actions: BoardAction[]) =>
  actions.reduce(applyBoardAction, start());

const columns = (board: RotationBoard) =>
  board.columns.slice().sort((a, b) => a.position - b.position);

describe("buildHistoryRows", () => {
  it("lists only recorded turns, newest first, keyed by the round", () => {
    const board = run(
      { type: "assign", roundId: "round-1", columnId: "mia", tableLabel: "T1" },
      { type: "assign", roundId: "round-1", columnId: "leo", tableLabel: "T2" },
      { type: "end-table", roundId: "round-1", columnId: "mia" },
      { type: "assign", roundId: "round-2", columnId: "mia", tableLabel: "B1" },
    );
    const rows = buildHistoryRows(board, columns(board));
    expect(rows.map((r) => [r.roundId, r.sequence])).toEqual([
      ["round-2", 2],
      ["round-1", 1],
    ]);
    expect(rows[1].cells.get("mia")).toMatchObject({
      status: "ended",
      label: "T1",
    });
    // Leo recorded nothing in turn 2: no cell, not a shifted copy of turn 1.
    expect(rows[0].cells.has("leo")).toBe(false);
  });

  it("returns no rows for a fresh board and flags a transfer continuation", () => {
    expect(buildHistoryRows(start(), columns(start()))).toEqual([]);
    const board = run(
      { type: "assign", roundId: "round-1", columnId: "mia", tableLabel: "T1" },
      {
        type: "transfer",
        sourceRoundId: "round-1",
        sourceColumnId: "mia",
        destColumnId: "leo",
      },
    );
    const [row] = buildHistoryRows(board, columns(board));
    expect(row.cells.get("leo")).toMatchObject({ transferredIn: true });
    expect(row.cells.get("mia")).toMatchObject({ transferredIn: false });
  });

  it("ignores columns that are not on the visible rotation", () => {
    const board = run({
      type: "assign",
      roundId: "round-1",
      columnId: "mia",
      tableLabel: "T1",
    });
    const rows = buildHistoryRows(
      board,
      columns(board).filter(({ id }) => id === "leo"),
    );
    expect(rows).toEqual([]);
  });
});

describe("buildActiveRecords", () => {
  it("shows active assignments only", () => {
    const board = run(
      {
        type: "assign",
        roundId: "round-1",
        columnId: "mia",
        tableLabel: "T1 + T2",
      },
      { type: "skip-turn", roundId: "round-1", columnId: "leo" },
      { type: "assign", roundId: "round-2", columnId: "leo", tableLabel: "B1" },
      { type: "end-table", roundId: "round-2", columnId: "leo" },
    );
    expect(buildActiveRecords(board, columns(board))).toEqual([
      {
        roundId: "round-1",
        columnId: "mia",
        serverName: "Mia",
        sequence: 1,
        label: "T1 + T2",
        tables: ["T1", "T2"],
      },
    ]);
  });
});

describe("resolveTarget", () => {
  const board = run(
    { type: "assign", roundId: "round-1", columnId: "mia", tableLabel: "T1" },
    { type: "skip-turn", roundId: "round-1", columnId: "leo" },
  );
  const model = buildBoardReadModel({ board, layout, team });
  const base = {
    board,
    columns: columns(board),
    tables: model.tables,
    offMapTables: model.offMapTables,
  };

  it("resolves a free table, an occupied table and a missing one", () => {
    expect(
      resolveTarget({ ...base, selection: { type: "table", label: "T2" } }),
    ).toEqual({ kind: "free-table", label: "T2" });
    expect(
      resolveTarget({ ...base, selection: { type: "table", label: "T1" } }),
    ).toMatchObject({ kind: "active", columnId: "mia", serverName: "Mia" });
    expect(
      resolveTarget({ ...base, selection: { type: "table", label: "T99" } }),
    ).toEqual({ kind: "none" });
    expect(resolveTarget({ ...base, selection: null })).toEqual({
      kind: "none",
    });
  });

  it("resolves rotation entries by their live status", () => {
    expect(
      resolveTarget({
        ...base,
        selection: { type: "entry", roundId: "round-1", columnId: "leo" },
      }),
    ).toMatchObject({ kind: "history", status: "skipped" });
    expect(
      resolveTarget({
        ...base,
        selection: { type: "entry", roundId: "round-2", columnId: "mia" },
      }),
    ).toMatchObject({ kind: "open-cell", sequence: 2 });
    // The selected round was deleted elsewhere: degrade, never act on stale data.
    expect(
      resolveTarget({
        ...base,
        selection: { type: "entry", roundId: "round-404", columnId: "mia" },
      }),
    ).toEqual({ kind: "none" });
  });
});

describe("targetRoundFor / buildPickerTiles / parseCombinedMode", () => {
  it("targets each server's own earliest empty round", () => {
    const board = run({
      type: "assign",
      roundId: "round-1",
      columnId: "mia",
      tableLabel: "T1",
    });
    expect(targetRoundFor(board, "mia")).toBe("round-2");
    expect(targetRoundFor(board, "leo")).toBe("round-1");
  });

  it("builds one tile list from the same tables the plan draws", () => {
    const board = run({
      type: "assign",
      roundId: "round-1",
      columnId: "mia",
      tableLabel: "Patio A",
    });
    const model = buildBoardReadModel({ board, layout, team });
    const tiles = buildPickerTiles(model.tables, model.offMapTables);
    expect(tiles.map((t) => t.label)).toEqual(["B1", "T1", "T2", "Patio A"]);
    expect(tiles.find((t) => t.label === "Patio A")).toMatchObject({
      offMap: true,
      occupiedBy: { columnId: "mia" },
    });
  });

  it("accepts only known modes", () => {
    expect(parseCombinedMode("rotation")).toBe("rotation");
    expect(parseCombinedMode("grid")).toBeNull();
    expect(parseCombinedMode(null)).toBeNull();
  });
});

describe("fitFloorTables", () => {
  it("scales a sparse layout up uniformly without touching the source", () => {
    const source = [
      { label: "A", x: 40, y: 40 },
      { label: "B", x: 60, y: 60 },
    ];
    const fitted = fitFloorTables(source);
    expect(source[0]).toEqual({ label: "A", x: 40, y: 40 });
    // 20-unit span, 84 room, capped at 1.6 -> centred, still in proportion.
    expect(fitted[0].x).toBeCloseTo(34);
    expect(fitted[1].x).toBeCloseTo(66);
    expect(fitted[0].y).toBeCloseTo(34);
    expect(fitted[1].y).toBeCloseTo(66);
  });

  it("leaves a layout that already fills the map nearly as drawn", () => {
    const fitted = fitFloorTables([
      { label: "A", x: 8, y: 10 },
      { label: "B", x: 90, y: 90 },
    ]);
    expect(fitted[0].x).toBeGreaterThan(5);
    expect(fitted[1].x).toBeLessThan(96);
  });

  it("handles one table and an empty layout", () => {
    expect(fitFloorTables([])).toEqual([]);
    expect(fitFloorTables([{ x: 10, y: 10 }])).toEqual([{ x: 50, y: 50 }]);
  });

  it("produces balanced, visually comparable aisle gaps for Monks reference layout", () => {
    const fitted = fitFloorTables(DEMO_FLOOR_LAYOUT);
    const t15 = fitted.find((t) => t.label === "T15");
    const t10 = fitted.find((t) => t.label === "T10");
    const t7 = fitted.find((t) => t.label === "T7");

    expect(t15).toBeDefined();
    expect(t10).toBeDefined();
    expect(t7).toBeDefined();

    const topToMiddleGap = t10!.y - t15!.y;
    const middleToLowerGap = t7!.y - t10!.y;

    // Both gaps are around ~25% and balanced within 1% of each other
    expect(topToMiddleGap).toBeGreaterThan(24);
    expect(middleToLowerGap).toBeGreaterThan(24);
    expect(Math.abs(topToMiddleGap - middleToLowerGap)).toBeLessThan(1.0);
  });
});
