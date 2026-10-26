import { describe, expect, it } from "vitest";

import { buildBoardReadModel, resolveTableIdentity } from "./board-read-model";
import type { FloorLayoutEntry, RegistryTable } from "./floor-layout";
import {
  applyBoardAction,
  createRotationBoard,
  type RotationBoard,
} from "./rotation-board";

// X1 / X3: canonical identity, off-map representation, session history.

const columns = [
  { id: "a", name: "Ann", position: 0, status: "active" as const },
  { id: "b", name: "Bea", position: 1, status: "active" as const },
];
const team = [
  { id: "a", name: "Ann", color: "red" },
  { id: "b", name: "Bea", color: "green" },
];
// Mapped: T1 (id 19), T2 (id 18), T6 (id 12). Registered but unpositioned: P1.
const layout: FloorLayoutEntry[] = [
  { diningTableId: 19, label: "T1", x: 8, y: 72, resourceType: "table" },
  { diningTableId: 18, label: "T2", x: 8, y: 58, resourceType: "table" },
  { diningTableId: 12, label: "T6", x: 40, y: 56, resourceType: "table" },
];
const registry: RegistryTable[] = [
  ...layout,
  { diningTableId: 77, label: "P1", x: null, y: null, resourceType: "table" },
];

function boardWith(
  cells: {
    columnId: string;
    label: string | null;
    status: "active" | "ended" | "skipped";
  }[][],
): RotationBoard {
  return {
    columns,
    rounds: cells.map((row, index) => ({
      id: `r${index + 1}`,
      sequence: index + 1,
      cells: row.map((c) => ({
        columnId: c.columnId,
        tableLabel: c.label,
        status: c.status,
      })),
    })),
    nextRoundNumber: cells.length + 1,
  };
}

// #157: these tests pin how a STORED board label resolves for display (exact,
// no normalization). Typed input is canonicalized BEFORE it is stored ("1" ->
// "T1" when T1 is registered -- see table-input.test.ts and the shorthand
// matrix scenarios), so a stored free-text "1" is a legacy / unregistered
// label only.
describe("table identity of a stored label (X1)", () => {
  it('a stored "1" is an unregistered label with no id; "T1" is the registered table (id 19)', () => {
    const one = resolveTableIdentity("1", { layout, registry });
    const t1 = resolveTableIdentity("T1", { layout, registry });
    expect(one).toMatchObject({
      diningTableId: null,
      registered: false,
      mapped: false,
      key: "label:1",
    });
    expect(t1).toMatchObject({
      diningTableId: 19,
      registered: true,
      mapped: true,
      key: "id:19",
    });
    expect(one.key).not.toBe(t1.key);
  });

  it("a registered but unpositioned table keeps its database id and is not mapped", () => {
    expect(resolveTableIdentity("P1", { layout, registry })).toMatchObject({
      diningTableId: 77,
      registered: true,
      mapped: false,
      key: "id:77",
    });
  });

  it("matching is exact: no case folding, prefixes or trimming tricks", () => {
    for (const label of ["t1", "Table T1", "T 1", "01"]) {
      expect(resolveTableIdentity(label, { layout, registry })).toMatchObject({
        registered: false,
        diningTableId: null,
      });
    }
  });
});

describe("off-map representation (X1)", () => {
  it('a legacy stored free-text "1" is off-map: Ann holds "1" and T6; Bea holds T2; T1 stays available', () => {
    const board = boardWith([
      [
        { columnId: "a", label: "1", status: "active" },
        { columnId: "b", label: "T2", status: "active" },
      ],
      [{ columnId: "a", label: "T6", status: "active" }],
    ]);
    const model = buildBoardReadModel({ board, layout, registry, team });

    const t1 = model.tables.find((t) => t.label === "T1");
    expect(t1?.occupiedBy).toBeNull(); // T1 is NOT "1"
    expect(model.tables.find((t) => t.label === "T6")?.occupiedBy?.name).toBe(
      "Ann",
    );

    const one = model.offMapTables.find((t) => t.label === "1");
    expect(one).toMatchObject({
      registered: false,
      diningTableId: null,
      occupiedBy: { name: "Ann" },
    });
    // Not drawn: it is not a map tile.
    expect(model.tables.some((t) => t.label === "1")).toBe(false);

    const ann = model.servers.find((s) => s.columnId === "a")!;
    expect(ann.activeTableLabels).toEqual(["1", "T6"]);
    expect(ann.unmappedTableLabels).toEqual(["1"]);
    expect(model.stats.occupiedTables).toBe(3);
    expect(model.stats.unmappedActiveLabels).toEqual(["1"]);
  });

  it("a registered unpositioned table is listed (available) and counted available", () => {
    const model = buildBoardReadModel({
      board: boardWith([[]]),
      layout,
      registry,
      team,
    });
    expect(model.offMapTables).toEqual([
      expect.objectContaining({
        label: "P1",
        diningTableId: 77,
        registered: true,
        occupiedBy: null,
      }),
    ]);
    // 3 mapped + 1 off-map, all available.
    expect(model.stats.availableTables).toBe(4);
    expect(model.stats.availableOffMapTables).toBe(1);
  });

  it("a held unpositioned registered table is active in every count and not available", () => {
    const board = boardWith([
      [{ columnId: "b", label: "P1", status: "active" }],
    ]);
    const model = buildBoardReadModel({ board, layout, registry, team });
    expect(model.offMapTables[0]).toMatchObject({
      label: "P1",
      diningTableId: 77,
      occupiedBy: { name: "Bea" },
    });
    expect(model.stats.occupiedTables).toBe(1);
    expect(model.stats.availableTables).toBe(3);
  });

  it("without a registry (demo) every layout table is mapped and nothing is invented", () => {
    const model = buildBoardReadModel({
      board: boardWith([[]]),
      layout,
      team,
    });
    expect(model.offMapTables).toEqual([]);
    expect(model.stats.availableTables).toBe(3);
  });
});

describe("Servers session history (X3)", () => {
  const board = boardWith([
    [
      { columnId: "a", label: "T2", status: "ended" },
      { columnId: "b", label: "T6", status: "active" },
    ],
    [{ columnId: "a", label: "T1 + T6x", status: "active" }],
  ]);

  it("an ended table stays in history, contributes 0 to the active count, and is available again", () => {
    const model = buildBoardReadModel({ board, layout, registry, team });
    const ann = model.servers.find((s) => s.columnId === "a")!;
    expect(ann.sessionHistory.map((h) => [h.label, h.status])).toEqual([
      ["T2", "ended"],
      ["T1 + T6x", "active"],
    ]);
    expect(ann.activeTableLabels).toEqual(["T1", "T6x"]);
    expect(model.tables.find((t) => t.label === "T2")?.occupiedBy).toBeNull();
    expect(model.stats.endedAssignments).toBe(1);
  });

  it("ended then reassigned: both lifecycle truths are visible", () => {
    const reassigned = boardWith([
      [
        { columnId: "a", label: "T2", status: "ended" },
        { columnId: "b", label: "T2", status: "active" },
      ],
    ]);
    const model = buildBoardReadModel({
      board: reassigned,
      layout,
      registry,
      team,
    });
    const ann = model.servers.find((s) => s.columnId === "a")!;
    const bea = model.servers.find((s) => s.columnId === "b")!;
    expect(ann.sessionHistory).toEqual([
      expect.objectContaining({ label: "T2", status: "ended" }),
    ]);
    expect(ann.activeTableLabels).toEqual([]);
    expect(bea.activeTableLabels).toEqual(["T2"]);
    expect(model.tables.find((t) => t.label === "T2")?.occupiedBy?.name).toBe(
      "Bea",
    );
  });

  it("skipped and empty cells are not history", () => {
    const model = buildBoardReadModel({
      board: boardWith([[{ columnId: "a", label: null, status: "skipped" }]]),
      layout,
      registry,
      team,
    });
    expect(model.servers[0].sessionHistory).toEqual([]);
  });
});

describe("reducer: End + Assign of a whole combined holder (X2)", () => {
  function start() {
    const base = createRotationBoard(columns);
    const [r1, r2] = base.rounds.map((r) => r.id);
    const held = applyBoardAction(base, {
      type: "assign",
      roundId: r1,
      columnId: "a",
      tableLabel: "T4 + T5",
    });
    return { held, r1, r2 };
  }

  it("without endWholeAssignment a wider combined holder is refused", () => {
    const { held, r2 } = start();
    const next = applyBoardAction(held, {
      type: "assign",
      roundId: r2,
      columnId: "b",
      tableLabel: "T4",
      confirmTransfer: true,
    });
    expect(next).toBe(held);
  });

  it("with endWholeAssignment the whole holder is ended (history kept) and only the wanted table is assigned", () => {
    const { held, r1, r2 } = start();
    const next = applyBoardAction(held, {
      type: "assign",
      roundId: r2,
      columnId: "b",
      tableLabel: "T4",
      confirmTransfer: true,
      endWholeAssignment: true,
    });
    const cell = (round: string, col: string) =>
      next.rounds
        .find((r) => r.id === round)!
        .cells.find((c) => c.columnId === col)!;
    expect(cell(r1, "a")).toMatchObject({
      tableLabel: "T4 + T5",
      status: "ended",
    });
    expect(cell(r2, "b")).toMatchObject({ tableLabel: "T4", status: "active" });
  });

  it("a server never holds the same table twice", () => {
    const { held, r2 } = start();
    const next = applyBoardAction(held, {
      type: "assign",
      roundId: r2,
      columnId: "a",
      tableLabel: "T5",
    });
    expect(next).toBe(held);
  });
});
