import { describe, expect, it } from "vitest";

import {
  computeDineInMetrics,
  dineInParts,
} from "@/features/allocation/domain/dine-in-metrics";
import type { RegistryTable } from "@/features/allocation/domain/floor-layout";
import {
  applyBoardAction,
  createRotationBoard,
  type BoardAction,
  type RotationBoard,
} from "@/features/allocation/domain/rotation-board";

const registry: RegistryTable[] = [
  { label: "T1", x: 10, y: 10, resourceType: "table" },
  { label: "T2", x: 20, y: 10, resourceType: "table" },
  { label: "T3", x: 30, y: 10, resourceType: "table" },
  { label: "B1", x: 10, y: 90, resourceType: "bar_seat" },
  // A bar-area table that is NOT named "B…" and a dine-in table that IS: the
  // class must come from the registry, never from the prefix.
  { label: "Counter 1", x: 40, y: 90, resourceType: "bar_seat" },
  { label: "B-Booth", x: 50, y: 50, resourceType: "table" },
];

function board(): RotationBoard {
  return createRotationBoard([
    { id: "mia", name: "Mia", position: 0, status: "active" },
    { id: "leo", name: "Leo", position: 1, status: "active" },
    { id: "ava", name: "Ava", position: 2, status: "paused" },
  ]);
}

function run(...actions: BoardAction[]): RotationBoard {
  return actions.reduce(applyBoardAction, board());
}

const metrics = (b: RotationBoard) =>
  computeDineInMetrics({ board: b, registry });

describe("computeDineInMetrics", () => {
  it("is zero on an empty board and names the first active server next", () => {
    expect(metrics(board())).toEqual({
      dineInToday: 0,
      active: 0,
      completed: 0,
      eligibleServers: 2,
      nextColumnId: "mia",
    });
  });

  it("counts an active table once and a completed one as completed", () => {
    const b = run(
      { type: "assign", roundId: "round-1", columnId: "mia", tableLabel: "T1" },
      { type: "assign", roundId: "round-1", columnId: "leo", tableLabel: "T2" },
      { type: "end-table", roundId: "round-1", columnId: "mia" },
    );
    const m = metrics(b);
    expect(m.dineInToday).toBe(2);
    expect(m.active).toBe(1);
    expect(m.completed).toBe(1);
  });

  it("counts a physical table seated, completed and seated again as two cycles", () => {
    const b = run(
      { type: "assign", roundId: "round-1", columnId: "mia", tableLabel: "T1" },
      { type: "end-table", roundId: "round-1", columnId: "mia" },
      { type: "assign", roundId: "round-2", columnId: "leo", tableLabel: "T1" },
    );
    const m = metrics(b);
    expect(m.dineInToday).toBe(2);
    expect(m.active).toBe(1);
    expect(m.completed).toBe(1);
  });

  it("does not count a transfer as a new seating", () => {
    const b = run(
      { type: "assign", roundId: "round-1", columnId: "mia", tableLabel: "T1" },
      {
        type: "transfer",
        sourceRoundId: "round-1",
        sourceColumnId: "mia",
        destColumnId: "leo",
      },
    );
    expect(metrics(b)).toMatchObject({
      dineInToday: 1,
      active: 1,
      completed: 0,
    });
  });

  it("keeps a transferred-then-completed table as ONE completed cycle", () => {
    const b = run(
      { type: "assign", roundId: "round-1", columnId: "mia", tableLabel: "T1" },
      {
        type: "transfer",
        sourceRoundId: "round-1",
        sourceColumnId: "mia",
        destColumnId: "leo",
      },
      { type: "end-table", roundId: "round-1", columnId: "leo" },
    );
    expect(metrics(b)).toMatchObject({
      dineInToday: 1,
      active: 0,
      completed: 1,
    });
  });

  it("counts a chain of transfers once", () => {
    const b = run(
      { type: "assign", roundId: "round-1", columnId: "mia", tableLabel: "T1" },
      {
        type: "transfer",
        sourceRoundId: "round-1",
        sourceColumnId: "mia",
        destColumnId: "leo",
      },
      {
        type: "transfer",
        sourceRoundId: "round-1",
        sourceColumnId: "leo",
        destColumnId: "mia",
      },
    );
    expect(metrics(b)).toMatchObject({ dineInToday: 1, active: 1 });
  });

  it("does not count skipped turns", () => {
    const b = run(
      { type: "skip-turn", roundId: "round-1", columnId: "mia" },
      { type: "assign", roundId: "round-1", columnId: "leo", tableLabel: "T2" },
    );
    expect(metrics(b).dineInToday).toBe(1);
  });

  it("does not count a cleared entry", () => {
    const b = run(
      { type: "assign", roundId: "round-1", columnId: "mia", tableLabel: "T1" },
      { type: "clear-cell", roundId: "round-1", columnId: "mia" },
    );
    expect(metrics(b)).toMatchObject({ dineInToday: 0, active: 0 });
  });

  it("counts each physical part of a combined assignment", () => {
    const b = run({
      type: "assign",
      roundId: "round-1",
      columnId: "mia",
      tableLabel: "T1 + T2",
    });
    expect(metrics(b)).toMatchObject({ dineInToday: 2, active: 2 });
  });

  it("excludes bar seats by registry class, not by label prefix", () => {
    const b = run(
      { type: "assign", roundId: "round-1", columnId: "mia", tableLabel: "B1" },
      {
        type: "assign",
        roundId: "round-1",
        columnId: "leo",
        tableLabel: "Counter 1",
      },
      {
        type: "assign",
        roundId: "round-2",
        columnId: "mia",
        tableLabel: "B-Booth",
      },
    );
    expect(metrics(b)).toMatchObject({ dineInToday: 1, active: 1 });
  });

  it("treats an unregistered free-text table as dine-in", () => {
    const b = run({
      type: "assign",
      roundId: "round-1",
      columnId: "mia",
      tableLabel: "Patio A",
    });
    expect(metrics(b).dineInToday).toBe(1);
  });

  it("counts the continuing seating when a transfer's source entry was cleared", () => {
    const b = run(
      { type: "assign", roundId: "round-1", columnId: "mia", tableLabel: "T3" },
      {
        type: "transfer",
        sourceRoundId: "round-1",
        sourceColumnId: "mia",
        destColumnId: "leo",
      },
      // Correction: the (ended) source entry is cleared.
      { type: "clear-cell", roundId: "round-1", columnId: "mia" },
    );
    expect(metrics(b)).toMatchObject({
      dineInToday: 1,
      active: 1,
      completed: 0,
    });
  });

  it("counts only active servers as eligible and follows the canonical next", () => {
    const b = run(
      { type: "assign", roundId: "round-1", columnId: "mia", tableLabel: "T1" },
      { type: "set-column-status", columnId: "leo", status: "paused" },
    );
    expect(metrics(b)).toMatchObject({
      eligibleServers: 1,
      nextColumnId: null,
    });
  });
});

describe("dineInParts", () => {
  it("returns no parts for a missing label", () => {
    expect(dineInParts(null, registry)).toEqual([]);
  });
});
