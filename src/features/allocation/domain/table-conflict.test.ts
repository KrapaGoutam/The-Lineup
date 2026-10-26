import { describe, expect, it } from "vitest";

import type { RotationBoard } from "./rotation-board";
import {
  classifyTableClaim,
  describeHeldConflict,
  describeSameServer,
  describeSameServerRepeat,
  listTables,
  verdictFromServerConflict,
} from "./table-conflict";

const columns = [
  { id: "a", name: "Ann", position: 0, status: "active" as const },
  { id: "b", name: "Bea", position: 1, status: "active" as const },
  { id: "c", name: "Cy", position: 2, status: "active" as const },
];
const names: Record<string, string> = { a: "Ann", b: "Bea", c: "Cy" };

function boardWith(
  cells: {
    round: string;
    columnId: string;
    label: string;
    status?: "active" | "ended";
  }[],
): RotationBoard {
  const rounds = new Map<string, RotationBoard["rounds"][number]>();
  for (const { round, columnId, label, status } of cells) {
    if (!rounds.has(round)) {
      rounds.set(round, {
        id: round,
        sequence: rounds.size + 1,
        cells: [],
      });
    }
    rounds.get(round)!.cells.push({
      columnId,
      tableLabel: label,
      status: status ?? "active",
    });
  }
  return { columns, rounds: [...rounds.values()], nextRoundNumber: 9 };
}

describe("classifyTableClaim", () => {
  it("a free table is free", () => {
    expect(
      classifyTableClaim(boardWith([]), { label: "T6", columnId: "b" }),
    ).toEqual({ kind: "free" });
  });

  it("an ended entry holds nothing", () => {
    const board = boardWith([
      { round: "r1", columnId: "a", label: "T6", status: "ended" },
    ]);
    expect(classifyTableClaim(board, { label: "T6", columnId: "b" }).kind).toBe(
      "free",
    );
  });

  it("another server's active table is held and transferable", () => {
    const board = boardWith([{ round: "r1", columnId: "a", label: "T6" }]);
    const verdict = classifyTableClaim(board, { label: "T6", columnId: "b" });
    expect(verdict).toMatchObject({
      kind: "held",
      contestedTables: ["T6"],
      transferable: true,
      holders: [{ columnId: "a", roundId: "r1", assignmentLabel: "T6" }],
    });
  });

  it("the same server asking again on a LATER turn is a repeat, never a transfer to self", () => {
    const board = boardWith([{ round: "r1", columnId: "a", label: "T6" }]);
    expect(
      classifyTableClaim(board, {
        label: "T6",
        columnId: "a",
        targetRoundId: "r2",
      }),
    ).toEqual({
      kind: "same-server-repeat",
      tables: ["T6"],
      previous: [
        {
          columnId: "a",
          roundId: "r1",
          assignmentLabel: "T6",
          assignmentTables: ["T6"],
        },
      ],
    });
  });

  it("without a chosen cell the repeat targets the server's earliest empty turn", () => {
    const board = boardWith([{ round: "r1", columnId: "a", label: "T6" }]);
    board.rounds.push({ id: "r2", sequence: 2, cells: [] });
    expect(classifyTableClaim(board, { label: "T6", columnId: "a" }).kind).toBe(
      "same-server-repeat",
    );
  });

  it("a table held in the SAME or a LATER turn is blocked, not a repeat", () => {
    const board = boardWith([
      { round: "r1", columnId: "b", label: "T1" },
      { round: "r2", columnId: "a", label: "T6" },
    ]);
    // r1 is a's empty earlier turn; its T6 sits in the later r2.
    expect(
      classifyTableClaim(board, {
        label: "T6",
        columnId: "a",
        targetRoundId: "r1",
      }),
    ).toEqual({ kind: "same-server", tables: ["T6"] });
  });

  it("a repeat of one part of a combined assignment names the WHOLE previous assignment", () => {
    const board = boardWith([{ round: "r1", columnId: "a", label: "T2 + T3" }]);
    expect(
      classifyTableClaim(board, {
        label: "T2",
        columnId: "a",
        targetRoundId: "r2",
      }),
    ).toMatchObject({
      kind: "same-server-repeat",
      tables: ["T2"],
      previous: [
        { assignmentLabel: "T2 + T3", assignmentTables: ["T2", "T3"] },
      ],
    });
  });

  it("an ended previous assignment is history, not a repeat", () => {
    const board = boardWith([
      { round: "r1", columnId: "a", label: "T6", status: "ended" },
    ]);
    expect(
      classifyTableClaim(board, {
        label: "T6",
        columnId: "a",
        targetRoundId: "r2",
      }).kind,
    ).toBe("free");
  });

  it("the cell being edited does not conflict with itself", () => {
    const board = boardWith([{ round: "r1", columnId: "a", label: "T6" }]);
    expect(
      classifyTableClaim(board, {
        label: "T6 + T7",
        columnId: "a",
        targetRoundId: "r1",
      }).kind,
    ).toBe("free");
  });

  it("a combined holder is ONE assignment: the whole of it is offered for transfer", () => {
    const board = boardWith([{ round: "r1", columnId: "a", label: "T6 + T7" }]);
    const verdict = classifyTableClaim(board, { label: "T6", columnId: "b" });
    expect(verdict).toMatchObject({
      kind: "held",
      contestedTables: ["T6"],
      transferable: true,
      holders: [
        {
          assignmentLabel: "T6 + T7",
          assignmentTables: ["T6", "T7"],
        },
      ],
    });
  });

  it("transfer is not offered when the holder does not cover everything wanted", () => {
    const board = boardWith([{ round: "r1", columnId: "a", label: "T6" }]);
    const verdict = classifyTableClaim(board, {
      label: "T6 + T8",
      columnId: "b",
    });
    expect(verdict).toMatchObject({ kind: "held", transferable: false });
  });

  it("two different holders: only End + Assign is possible", () => {
    const board = boardWith([
      { round: "r1", columnId: "a", label: "T6" },
      { round: "r1", columnId: "c", label: "T8" },
    ]);
    const verdict = classifyTableClaim(board, {
      label: "T6 + T8",
      columnId: "b",
    });
    expect(verdict).toMatchObject({
      kind: "held",
      transferable: false,
      contestedTables: ["T6", "T8"],
    });
    if (verdict.kind === "held") expect(verdict.holders).toHaveLength(2);
  });

  it('"1" and "T1" never conflict (no prefix handling, no normalization)', () => {
    const board = boardWith([{ round: "r1", columnId: "a", label: "T1" }]);
    expect(classifyTableClaim(board, { label: "1", columnId: "b" }).kind).toBe(
      "free",
    );
    expect(classifyTableClaim(board, { label: "t1", columnId: "b" }).kind).toBe(
      "free",
    );
    expect(
      classifyTableClaim(board, { label: "Table T1", columnId: "b" }).kind,
    ).toBe("free");
  });
});

describe("server-reported conflicts (stale client)", () => {
  it("rebuilds the same verdict the live board would have produced", () => {
    const live = classifyTableClaim(
      boardWith([{ round: "r1", columnId: "a", label: "T6 + T7" }]),
      { label: "T6", columnId: "b" },
    );
    const fromServer = verdictFromServerConflict(
      {
        kind: "held",
        label: "T6",
        holders: [{ columnId: "a", roundId: "r1", assignmentLabel: "T6 + T7" }],
      },
      "T6",
    );
    expect(fromServer).toEqual(live);
  });

  it("a same_server_repeat report becomes the repeat verdict with the previous assignment", () => {
    expect(
      verdictFromServerConflict(
        {
          kind: "same_server_repeat",
          label: "T2",
          holders: [
            { columnId: "a", roundId: "7", assignmentLabel: "T2 + T3" },
          ],
        },
        "T2",
      ),
    ).toEqual({
      kind: "same-server-repeat",
      tables: ["T2"],
      previous: [
        {
          columnId: "a",
          roundId: "7",
          assignmentLabel: "T2 + T3",
          assignmentTables: ["T2", "T3"],
        },
      ],
    });
  });

  it("a same_server report becomes the no-op notice", () => {
    expect(
      verdictFromServerConflict(
        { kind: "same_server", label: "T6", holders: [] },
        "T6",
      ),
    ).toEqual({ kind: "same-server", tables: ["T6"] });
  });
});

describe("conflict copy", () => {
  const held = (label: string, wanted: string) => {
    const verdict = classifyTableClaim(
      boardWith([{ round: "r1", columnId: "a", label }]),
      { label: wanted, columnId: "b" },
    );
    if (verdict.kind !== "held") throw new Error("expected held");
    return describeHeldConflict(verdict, {
      wantedLabel: wanted,
      requesterName: "Bea",
      holderName: (id) => names[id],
    });
  };

  it("single table", () => {
    const copy = held("T6", "T6");
    expect(copy.description).toBe(
      "T6 is currently assigned to Ann. What do you want to do?",
    );
    expect(copy.transferLabel).toBe("Transfer to Bea");
    expect(copy.endAndAssignLabel).toBe(
      "End Ann's assignment and assign T6 to Bea",
    );
  });

  it("combined holder names the whole assignment", () => {
    const copy = held("T6 + T7", "T6");
    expect(copy.description).toContain(
      "T6 belongs to the combined assignment T6 + T7, currently assigned to Ann.",
    );
    expect(copy.transferLabel).toBe(
      "Transfer entire T6 + T7 assignment to Bea",
    );
    expect(copy.endAndAssignLabel).toBe(
      "End the entire T6 + T7 assignment, then assign T6 to Bea",
    );
  });

  it("no transfer option when transfer is not valid", () => {
    const copy = held("T6", "T6 + T8");
    expect(copy.transferLabel).toBeNull();
  });

  it("repeat dialog copy: single table, and the combined whole-assignment warning", () => {
    const single = describeSameServerRepeat(
      {
        kind: "same-server-repeat",
        tables: ["T2"],
        previous: [
          {
            columnId: "a",
            roundId: "r1",
            assignmentLabel: "T2",
            assignmentTables: ["T2"],
          },
        ],
      },
      { wantedLabel: "T2", serverName: "Sidhu" },
    );
    expect(single.description).toBe(
      "T2 is already assigned to Sidhu. End Sidhu's previous T2 assignment and assign T2 to Sidhu for this turn?",
    );
    expect(single.endPreviousLabel).toBe("End Previous + Assign");

    const combined = describeSameServerRepeat(
      {
        kind: "same-server-repeat",
        tables: ["T2"],
        previous: [
          {
            columnId: "a",
            roundId: "r1",
            assignmentLabel: "T2 + T3",
            assignmentTables: ["T2", "T3"],
          },
        ],
      },
      { wantedLabel: "T2", serverName: "Sidhu" },
    );
    expect(combined.description).toContain("combined assignment T2 + T3");
    expect(combined.description).toContain(
      "ends the entire T2 + T3 assignment (T3 will be released too)",
    );
  });

  it("same-server message and table lists", () => {
    expect(describeSameServer(["T6"], "Ann")).toBe(
      "T6 is already assigned to Ann.",
    );
    expect(describeSameServer(["T6", "T7"], "Ann")).toBe(
      "T6 and T7 are already assigned to Ann.",
    );
    expect(listTables(["T1", "T2", "T3"])).toBe("T1, T2 and T3");
  });
});
