import { describe, expect, it } from "vitest";

import {
  DEMO_FLOOR_LAYOUT,
  combinedTableLabel,
  parseCombinedTableLabel,
  resolveFloorTables,
} from "./floor-layout";

const team = [
  { id: "mia", name: "Mia", color: "var(--server-one)" },
  { id: "leo", name: "Leo", color: "var(--server-two)" },
];

describe("floor layout", () => {
  it("covers every table named in the approved physical layout (T1-T19, B1-B8)", () => {
    const labels = DEMO_FLOOR_LAYOUT.map((entry) => entry.label).sort();
    const expected = [
      ...Array.from({ length: 19 }, (_, i) => `T${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `B${i + 1}`),
    ].sort();
    expect(labels).toEqual(expected);
  });

  it("parses and rebuilds combined-table syntax matching production ('12 + 13')", () => {
    expect(parseCombinedTableLabel("12 + 13")).toEqual(["12", "13"]);
    expect(parseCombinedTableLabel("T1+T2")).toEqual(["T1", "T2"]);
    expect(parseCombinedTableLabel("T1")).toEqual(["T1"]);
    expect(combinedTableLabel(["T1", "T2"])).toBe("T1 + T2");
  });

  it("marks a table available when no column currently holds it", () => {
    const resolved = resolveFloorTables(
      DEMO_FLOOR_LAYOUT,
      { rounds: [{ id: "round-1", cells: [] }] },
      team,
    );
    expect(resolved.find((t) => t.label === "T1")?.occupiedBy).toBeNull();
  });

  it("attributes a table to the column that most recently recorded it", () => {
    const board = {
      rounds: [
        { id: "round-1", cells: [{ columnId: "mia", tableLabel: "T1" }] },
        { id: "round-2", cells: [{ columnId: "leo", tableLabel: "T1" }] },
      ],
    };
    const resolved = resolveFloorTables(DEMO_FLOOR_LAYOUT, board, team);
    expect(resolved.find((t) => t.label === "T1")?.occupiedBy).toEqual({
      columnId: "leo",
      roundId: "round-2",
      name: "Leo",
      color: "var(--server-two)",
    });
  });

  it("a combined label reserves both member tables", () => {
    const board = {
      rounds: [
        { id: "round-1", cells: [{ columnId: "mia", tableLabel: "T1 + T2" }] },
      ],
    };
    const resolved = resolveFloorTables(DEMO_FLOOR_LAYOUT, board, team);
    expect(resolved.find((t) => t.label === "T1")?.occupiedBy?.columnId).toBe(
      "mia",
    );
    expect(resolved.find((t) => t.label === "T2")?.occupiedBy?.columnId).toBe(
      "mia",
    );
  });

  it("a cleared cell (current value null) makes the table available again", () => {
    const board = {
      rounds: [
        { id: "round-1", cells: [{ columnId: "mia", tableLabel: null }] },
      ],
    };
    const resolved = resolveFloorTables(DEMO_FLOOR_LAYOUT, board, team);
    expect(resolved.find((t) => t.label === "T1")?.occupiedBy).toBeNull();
  });
});
