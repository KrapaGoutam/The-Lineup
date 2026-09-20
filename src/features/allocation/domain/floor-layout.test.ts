import { describe, expect, it } from "vitest";

import {
  DEMO_FLOOR_LAYOUT,
  combinedTableLabel,
  getInitials,
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

  // Table Rotation Multi-View, Upgrade 1.1: only an "active" cell ever
  // occupies a physical table -- an "ended" cell keeps its label for
  // history, but the table itself must show available again.
  it("an ended cell keeps its historical label but does not occupy the table", () => {
    const board = {
      rounds: [
        {
          id: "round-1",
          cells: [
            { columnId: "mia", tableLabel: "T1", status: "ended" as const },
          ],
        },
      ],
    };
    const resolved = resolveFloorTables(DEMO_FLOOR_LAYOUT, board, team);
    expect(resolved.find((t) => t.label === "T1")?.occupiedBy).toBeNull();
  });

  it("a skipped cell (no label) never occupies a table", () => {
    const board = {
      rounds: [
        {
          id: "round-1",
          cells: [
            { columnId: "mia", tableLabel: null, status: "skipped" as const },
          ],
        },
      ],
    };
    const resolved = resolveFloorTables(DEMO_FLOOR_LAYOUT, board, team);
    expect(resolved.every((t) => t.occupiedBy === null)).toBe(true);
  });

  it("reassigning a table's physical resource after it's ended lets the new active row win, regardless of round order", () => {
    const board = {
      rounds: [
        {
          id: "round-1",
          cells: [
            { columnId: "mia", tableLabel: "T1", status: "ended" as const },
          ],
        },
        {
          id: "round-2",
          cells: [
            { columnId: "leo", tableLabel: "T1", status: "active" as const },
          ],
        },
      ],
    };
    const resolved = resolveFloorTables(DEMO_FLOOR_LAYOUT, board, team);
    expect(resolved.find((t) => t.label === "T1")?.occupiedBy?.columnId).toBe(
      "leo",
    );
  });

  describe("getInitials", () => {
    it("takes the first letter of the first and last name for a two-part name", () => {
      expect(getInitials("Mia Chen")).toBe("MC");
      expect(getInitials("John Smith")).toBe("JS");
    });

    it("takes the first and last of a name with more than two parts", () => {
      expect(getInitials("Alex Rao Jr")).toBe("AJ");
    });

    it("takes the first two letters of a single-word name", () => {
      expect(getInitials("Mia")).toBe("MI");
    });

    it("uppercases regardless of input case", () => {
      expect(getInitials("mia chen")).toBe("MC");
    });

    it("tolerates extra whitespace", () => {
      expect(getInitials("  Mia   Chen  ")).toBe("MC");
    });

    it("returns an empty string for an empty name", () => {
      expect(getInitials("")).toBe("");
    });
  });
});
