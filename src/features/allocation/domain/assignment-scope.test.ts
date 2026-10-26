import { describe, expect, it } from "vitest";

import {
  getAssignmentScope,
  otherTablesInAssignment,
} from "./assignment-scope";
import { resolveFloorTables } from "./floor-layout";

describe("assignment scope (#109 U3)", () => {
  it("109-020 a single table has no scope copy at all", () => {
    const scope = getAssignmentScope("T1");
    expect(scope).toMatchObject({
      combined: false,
      tables: ["T1"],
      label: "T1",
      summary: null,
      transferNote: null,
      endNote: null,
      unassignNote: null,
    });
  });

  it("109-021..023 a two-table assignment explains the whole-assignment actions", () => {
    const scope = getAssignmentScope("T1 + T2");
    expect(scope.combined).toBe(true);
    expect(scope.summary).toBe("T1 + T2 are one assignment.");
    expect(scope.transferNote).toBe(
      "Transfer moves the entire assignment (T1 + T2).",
    );
    expect(scope.endNote).toBe("Ending this assignment releases both tables.");
    expect(scope.unassignNote).toBe(
      "Unassign removes the entire assignment (T1 + T2).",
    );
  });

  it("counts three or more tables", () => {
    expect(getAssignmentScope("1+2+3").endNote).toBe(
      "Ending this assignment releases all 3 tables.",
    );
  });

  it("accepts an already-parsed list and ignores blanks", () => {
    expect(getAssignmentScope(["T1", "", "T2"]).label).toBe("T1 + T2");
    expect(getAssignmentScope([]).combined).toBe(false);
  });

  it("never leaks database terminology into user copy", () => {
    const scope = getAssignmentScope("T1 + T2");
    const copy = [
      scope.summary,
      scope.transferNote,
      scope.endNote,
      scope.unassignNote,
    ].join(" ");
    expect(copy).not.toMatch(/rotation_member|entry_id|claim|row|round_id/i);
  });

  it("lists the other tables sharing an assignment", () => {
    expect(otherTablesInAssignment(["T1", "T2", "T3"], "T2")).toEqual([
      "T1",
      "T3",
    ]);
    expect(otherTablesInAssignment(["T1"], "T1")).toEqual([]);
  });
});

describe("resolveFloorTables carries the whole assignment", () => {
  const layout = ["T1", "T2", "T3"].map((label, index) => ({
    label,
    x: index * 10,
    y: 10,
    resourceType: "table" as const,
  }));
  const team = [{ id: "a", name: "Ann", color: "red" }];

  it("gives every part of a combined cell the same assignment", () => {
    const tables = resolveFloorTables(
      layout,
      {
        rounds: [
          {
            id: "r1",
            cells: [{ columnId: "a", tableLabel: "T1 + T2", status: "active" }],
          },
        ],
      },
      team,
    );
    expect(tables[0].occupiedBy?.assignmentTables).toEqual(["T1", "T2"]);
    expect(tables[1].occupiedBy?.assignmentTables).toEqual(["T1", "T2"]);
    expect(tables[1].occupiedBy?.roundId).toBe("r1");
    expect(tables[2].occupiedBy).toBeNull();
  });

  it("an ended combined cell contributes nothing", () => {
    const tables = resolveFloorTables(
      layout,
      {
        rounds: [
          {
            id: "r1",
            cells: [{ columnId: "a", tableLabel: "T1 + T2", status: "ended" }],
          },
        ],
      },
      team,
    );
    expect(tables.every((table) => table.occupiedBy === null)).toBe(true);
  });
});
