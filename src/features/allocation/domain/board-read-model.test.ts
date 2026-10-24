import { describe, expect, it } from "vitest";

import {
  buildBoardReadModel,
  findClaimDivergences,
  type PhysicalClaim,
} from "./board-read-model";
import type { FloorLayoutEntry } from "./floor-layout";
import {
  createBoardHistory,
  createRotationBoard,
  executeBoardAction,
  type BoardAction,
  type RotationBoard,
} from "./rotation-board";

const columns = [
  { id: "a", name: "Ann", position: 0, status: "active" as const },
  { id: "b", name: "Bea", position: 1, status: "active" as const },
  { id: "c", name: "Cy", position: 2, status: "active" as const },
];
const team = [
  { id: "a", name: "Ann", color: "red" },
  { id: "b", name: "Bea", color: "green" },
  { id: "c", name: "Cy", color: "blue" },
];
const layout: FloorLayoutEntry[] = ["1", "2", "7", "11", "15", "16"].map(
  (label, index) => ({
    label,
    x: index * 10,
    y: 10,
    resourceType: "table" as const,
  }),
);

function play(actions: BoardAction[]): RotationBoard {
  let history = createBoardHistory(createRotationBoard(columns));
  for (const action of actions) {
    history = executeBoardAction(history, action);
  }
  return history.present;
}

// The extended live-service scenario from the Part 1 brief:
//   Row 1  A->1   B->15  C->16
//   Row 2  A->15  B->11  C->2     (A taking 15 ENDS B's 15)
//   Row 3  A->7
function liveService(): RotationBoard {
  const probe = createRotationBoard(columns);
  const [r1, r2, r3] = probe.rounds.map((round) => round.id);
  // createRotationBoard only starts with two empty rounds; add one more.
  return play([
    { type: "add-row" },
    { type: "assign", roundId: r1, columnId: "a", tableLabel: "1" },
    { type: "assign", roundId: r1, columnId: "b", tableLabel: "15" },
    { type: "assign", roundId: r1, columnId: "c", tableLabel: "16" },
    {
      type: "assign",
      roundId: r2,
      columnId: "a",
      tableLabel: "15",
      confirmTransfer: true,
    },
    { type: "assign", roundId: r2, columnId: "b", tableLabel: "11" },
    { type: "assign", roundId: r2, columnId: "c", tableLabel: "2" },
    {
      type: "assign",
      roundId: r3 ?? "round-3",
      columnId: "a",
      tableLabel: "7",
    },
  ]);
}

describe("buildBoardReadModel — one derivation for all five views", () => {
  it("extended live-service scenario: A→1,15,7  B→11  C→16,2", () => {
    const board = liveService();
    const model = buildBoardReadModel({ board, layout, team });

    const byServer = Object.fromEntries(
      model.servers.map((s) => [s.name, [...s.activeTableLabels].sort()]),
    );
    expect(byServer).toEqual({
      Ann: ["1", "15", "7"].sort(),
      Bea: ["11"],
      Cy: ["16", "2"].sort(),
    });

    // Floor / Picker: current state only, one owner per table.
    const owners = Object.fromEntries(
      model.tables
        .filter((t) => t.occupiedBy)
        .map((t) => [t.label, t.occupiedBy!.name]),
    );
    expect(owners).toEqual({
      "1": "Ann",
      "2": "Cy",
      "7": "Ann",
      "11": "Bea",
      "15": "Ann",
      "16": "Cy",
    });

    // Dashboard numbers come from the same data.
    expect(model.stats).toMatchObject({
      activeServers: 3,
      occupiedTables: 6,
      availableTables: 0,
      unmappedActiveLabels: [],
    });

    // Grid history is untouched: B's old 15 is still on the board, ENDED.
    const b15 = board.rounds
      .flatMap((round) => round.cells)
      .find((cell) => cell.columnId === "b" && cell.tableLabel === "15");
    expect(b15?.status).toBe("ended");
  });

  it("an ended or skipped cell never occupies a table, but the history stays", () => {
    const [r1, r2] = createRotationBoard(columns).rounds.map((r) => r.id);
    const board = play([
      { type: "assign", roundId: r1, columnId: "a", tableLabel: "1" },
      { type: "end-table", roundId: r1, columnId: "a" },
      { type: "skip-turn", roundId: r2, columnId: "a" },
    ]);
    const model = buildBoardReadModel({ board, layout, team });
    expect(model.tables.find((t) => t.label === "1")?.occupiedBy).toBeNull();
    expect(model.stats.occupiedTables).toBe(0);
    expect(model.servers[0].activeAssignments).toEqual([]);
  });

  it("counts a held table that is not on the floor map instead of dropping it", () => {
    const [r1] = createRotationBoard(columns).rounds.map((r) => r.id);
    const board = play([
      { type: "assign", roundId: r1, columnId: "a", tableLabel: "99" },
    ]);
    const model = buildBoardReadModel({ board, layout, team });
    expect(model.stats.occupiedTables).toBe(1);
    expect(model.stats.unmappedActiveLabels).toEqual(["99"]);
    expect(model.stats.availableTables).toBe(layout.length);
  });

  it("a skipped server is not next; reorder changes who is next but not ownership", () => {
    const [r1] = createRotationBoard(columns).rounds.map((r) => r.id);
    const board = play([
      { type: "assign", roundId: r1, columnId: "a", tableLabel: "1" },
      { type: "skip-turn", roundId: r1, columnId: "b" },
    ]);
    expect(buildBoardReadModel({ board, layout, team }).nextColumnId).toBe("c");

    const reordered = executeBoardAction(createBoardHistory(board), {
      type: "move-column",
      columnId: "c",
      direction: "up",
    }).present;
    const after = buildBoardReadModel({ board: reordered, layout, team });
    expect(after.servers.map((s) => s.columnId)).toEqual(["a", "c", "b"]);
    expect(
      after.tables.find((t) => t.label === "1")?.occupiedBy?.columnId,
    ).toBe("a");
  });
});

describe("findClaimDivergences — board vs authoritative ledger", () => {
  const board = (() => {
    const [r1] = createRotationBoard(columns).rounds.map((r) => r.id);
    return play([
      { type: "assign", roundId: r1, columnId: "a", tableLabel: "1" },
      { type: "assign", roundId: r1, columnId: "b", tableLabel: "5 + 6" },
    ]);
  })();
  const registered = ["1", "5", "6", "7"];
  const claim = (label: string, owner: string): PhysicalClaim => ({
    diningTableId: Number(label),
    label,
    serverProfileId: owner,
    rotationMemberId: null,
    entryId: null,
  });

  it("agrees when every active label has exactly its claim", () => {
    expect(
      findClaimDivergences({
        board,
        registeredLabels: registered,
        claims: [claim("1", "a"), claim("5", "b"), claim("6", "b")],
      }),
    ).toEqual([]);
  });

  it("reports a missing claim, an orphan claim and an owner mismatch", () => {
    const result = findClaimDivergences({
      board,
      registeredLabels: registered,
      claims: [claim("1", "c"), claim("5", "b"), claim("7", "a")],
    });
    expect(result).toEqual(
      expect.arrayContaining([
        {
          kind: "owner-mismatch",
          label: "1",
          boardOwner: "a",
          claimOwner: "c",
        },
        { kind: "claim-without-assignment", label: "7", claimOwner: "a" },
        { kind: "assignment-without-claim", label: "6", boardOwner: "b" },
      ]),
    );
    expect(result).toHaveLength(3);
  });

  it("ignores board labels that are not registered tables (they can never have a claim)", () => {
    expect(
      findClaimDivergences({
        board,
        registeredLabels: ["1"],
        claims: [claim("1", "a")],
      }),
    ).toEqual([]);
  });
});
