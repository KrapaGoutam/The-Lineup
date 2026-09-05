import { describe, expect, it } from "vitest";

import {
  generateSectionAssignments,
  type DiningTable,
} from "./generate-section-assignments";

const table = (
  id: string,
  seatCount: number,
  overrides: Partial<DiningTable> = {},
): DiningTable => ({
  id,
  label: id,
  seatCount,
  areaOrder: 0,
  sequence: Number(id.replace(/\D/g, "")) || 0,
  occupied: false,
  currentServerId: null,
  ...overrides,
});

describe("generateSectionAssignments", () => {
  it("assigns each available table exactly once", () => {
    const result = generateSectionAssignments(
      [table("t1", 4), table("t2", 2), table("t3", 4)],
      ["s1", "s2"],
    );

    expect(result).toHaveLength(3);
    expect(new Set(result.map((assignment) => assignment.tableId)).size).toBe(
      3,
    );
    expect(result.every((assignment) => assignment.serverId !== null)).toBe(
      true,
    );
  });

  it("balances seat load deterministically as server count changes", () => {
    const result = generateSectionAssignments(
      [table("t1", 4), table("t2", 4), table("t3", 2), table("t4", 2)],
      ["s1", "s2"],
    );

    const counts = result.reduce<Record<string, number>>(
      (accumulator, item) => {
        if (item.serverId)
          accumulator[item.serverId] = (accumulator[item.serverId] ?? 0) + 1;
        return accumulator;
      },
      {},
    );

    expect(counts).toEqual({ s1: 2, s2: 2 });
  });

  it("never moves an occupied table automatically", () => {
    const result = generateSectionAssignments(
      [
        table("t1", 4, {
          occupied: true,
          currentServerId: "server-who-left",
        }),
        table("t2", 4),
      ],
      ["s1"],
    );

    expect(result[0]).toEqual({
      tableId: "t1",
      serverId: "server-who-left",
      locked: true,
    });
  });
});
