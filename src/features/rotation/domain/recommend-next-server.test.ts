import { describe, expect, it } from "vitest";

import {
  recommendNextServer,
  type RotationMember,
} from "./recommend-next-server";

const member = (
  overrides: Partial<RotationMember> &
    Pick<RotationMember, "id" | "displayName">,
): RotationMember => ({
  status: "active",
  position: 0,
  partyCount: 0,
  coverCount: 0,
  activeTableCount: 0,
  maxConcurrentTables: null,
  lastSeatedAt: null,
  ...overrides,
});

describe("recommendNextServer", () => {
  it("chooses the eligible server with the lowest effective workload", () => {
    const result = recommendNextServer([
      member({ id: "a", displayName: "Ari", partyCount: 3, coverCount: 9 }),
      member({ id: "b", displayName: "Bea", partyCount: 1, coverCount: 4 }),
    ]);

    expect(result?.member.id).toBe("b");
  });

  it("excludes paused and at-capacity servers", () => {
    const result = recommendNextServer([
      member({ id: "a", displayName: "Ari", status: "paused" }),
      member({
        id: "b",
        displayName: "Bea",
        activeTableCount: 2,
        maxConcurrentTables: 2,
      }),
      member({ id: "c", displayName: "Cam" }),
    ]);

    expect(result?.member.id).toBe("c");
  });

  it("uses oldest last seating and then position as deterministic ties", () => {
    const result = recommendNextServer([
      member({
        id: "a",
        displayName: "Ari",
        position: 2,
        lastSeatedAt: "2026-09-05T01:00:00.000Z",
      }),
      member({
        id: "b",
        displayName: "Bea",
        position: 1,
        lastSeatedAt: "2026-09-05T01:00:00.000Z",
      }),
    ]);

    expect(result?.member.id).toBe("b");
  });

  it("returns null when nobody is eligible", () => {
    expect(
      recommendNextServer([
        member({ id: "a", displayName: "Ari", status: "unavailable" }),
      ]),
    ).toBeNull();
  });
});
