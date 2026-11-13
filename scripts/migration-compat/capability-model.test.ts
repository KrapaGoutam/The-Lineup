import { describe, expect, it } from "vitest";

import {
  band,
  compareBands,
  levelString,
  levelsFor,
} from "./capability-model.mjs";

const N1 = (orgHasAnyLocationRow: boolean) => ({
  activeLocationCount: 1,
  orgHasAnyLocationRow,
});
const str = (role: string, row: string | null, rows: boolean) => {
  const l = levelsFor(role, row, N1(rows));
  return l ? levelString(l) : null;
};

// These literals are the MEASURED deployed output asserted by
// supabase/tests/database/0081_b2_role_ladder_capability.test.sql (LAD-01..LAD-15).
// If the database changes, 0081 fails; if this model drifts from it, this file fails.
describe("capability model is pinned to the measured *_profile_level output (pgTAP 0081)", () => {
  it("before: legacy fallback state (no row anywhere)", () => {
    expect(str("owner", null, false)).toBe("4:4:4:4:4:4");
    expect(str("general_manager", null, false)).toBe("3:3:3:3:3:3");
    expect(str("shift_manager", null, false)).toBe("2:2:2:2:2:2");
    expect(str("host", null, false)).toBe("1:1:1:1:1:1");
    expect(str("server", null, false)).toBe("1:1:1:1:1:1");
  });

  it("partial: the owner alone has a row (the cliff)", () => {
    expect(str("owner", "manager", true)).toBe("4:4:4:3:3:3");
    expect(str("general_manager", null, true)).toBe("3:3:3:3:0:0");
    expect(str("shift_manager", null, true)).toBe("2:2:2:0:0:0");
    expect(str("host", null, true)).toBe("1:1:1:0:0:0");
    expect(str("server", null, true)).toBe("1:1:1:0:0:0");
  });

  it("after: the complete ladder", () => {
    expect(str("owner", "manager", true)).toBe("4:4:4:3:3:3");
    expect(str("general_manager", "manager", true)).toBe("3:3:3:3:3:3");
    expect(str("shift_manager", "assistant_manager", true)).toBe("2:2:2:2:2:2");
    expect(str("host", "staff", true)).toBe("1:1:1:1:1:1");
    expect(str("server", "staff", true)).toBe("1:1:1:1:1:1");
  });
});

describe("capability bands", () => {
  it("level 4 and 3 are the same band: no threshold distinguishes an owner from a manager", () => {
    expect(band(4)).toBe(band(3));
    expect(band(2)).toBe("assistant");
    expect(band(1)).toBe("staff");
    expect(band(0)).toBe("none");
  });

  it("the complete ladder has no expansion and no reduction for any legacy role", () => {
    const rows = {
      owner: "manager",
      general_manager: "manager",
      shift_manager: "assistant_manager",
      host: "staff",
      server: "staff",
    } as const;
    for (const [role, loc] of Object.entries(rows)) {
      const before = levelsFor(role, null, N1(false))!;
      const after = levelsFor(role, loc, N1(true))!;
      expect(
        compareBands(before, after).filter((c) => c.change !== "unchanged"),
      ).toEqual([]);
    }
  });

  it("the PARTIAL state is a reduction for everyone except the owner (what atomicity prevents)", () => {
    for (const role of ["general_manager", "shift_manager", "host", "server"]) {
      const before = levelsFor(role, null, N1(false))!;
      const after = levelsFor(role, null, N1(true))!;
      expect(
        compareBands(before, after).some((c) => c.change === "reduction"),
      ).toBe(true);
    }
  });

  it("outside the measured domain the model refuses to answer instead of guessing", () => {
    expect(
      levelsFor("owner", null, {
        activeLocationCount: 2,
        orgHasAnyLocationRow: false,
      }),
    ).toBeNull();
    expect(levelsFor("bartender", null, N1(false))).toBeNull();
  });
});
