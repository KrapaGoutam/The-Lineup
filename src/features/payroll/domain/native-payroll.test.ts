import { describe, expect, it } from "vitest";

import {
  firstOfMonth,
  labelSourceTransitionBlockers,
  mapNativePayrollError,
  parseNotPayableCounts,
} from "./native-payroll";

describe("mapNativePayrollError", () => {
  it.each([
    [
      "NOT_ACTIVATED: native attendance financial processing has not been activated.",
      "not_activated",
    ],
    [
      "DUAL_IDENTITY_DUPLICATE: this employee already has a payroll period",
      "dual_identity",
    ],
    ["MIXED_SOURCE_MONTH: native attendance exists", "mixed_source_month"],
    [
      "NO_ATTENDANCE_HOURS: there is no payable native attendance for that month.",
      "no_hours",
    ],
    ["NO_RATE_CONFIGURED: no pay rate is configured", "no_rate"],
    ["PERIOD_FROZEN: this payroll period is locked or paid.", "period_frozen"],
    ["PERIOD_NOT_FINAL: attendance changed", "period_not_final"],
    [
      "PERIOD_NOT_RECONCILED: the hours snapshot does not match",
      "period_not_final",
    ],
    [
      'SOURCE_TRANSITION_BLOCKED: ["open_sessions"]',
      "source_transition_blocked",
    ],
    ["IDENTITY_LINK_IN_USE: this link protects", "identity_link_in_use"],
  ])("maps %s", (message, code) => {
    expect(mapNativePayrollError({ message, code: "55000" }).code).toBe(code);
  });

  it("maps authority failures uniformly and never echoes the database text", () => {
    const mapped = mapNativePayrollError({
      code: "42501",
      message: "Unauthorized for organization 0000-secret",
    });
    expect(mapped.code).toBe("denied");
    expect(mapped.message).not.toContain("secret");
  });

  it("maps a stale version and a bad argument", () => {
    expect(mapNativePayrollError({ code: "P0004", message: "x" }).code).toBe(
      "stale_version",
    );
    expect(mapNativePayrollError({ code: "22023", message: "x" }).code).toBe(
      "invalid",
    );
  });

  it("never leaks an unknown database message", () => {
    const mapped = mapNativePayrollError({
      code: "XX000",
      message: 'relation "payroll_x" exploded',
    });
    expect(mapped).toEqual({
      code: "unknown",
      message: "Unable to reach payroll data right now.",
    });
    expect(mapNativePayrollError(null).code).toBe("unknown");
  });

  it("describes each not-payable reason from the database counts", () => {
    const message =
      "ATTENDANCE_NOT_PAYABLE: open 1, auto clock-out 2, unclassified or open breaks 3, crosses month end 4, module disabled 5.";
    expect(parseNotPayableCounts(message)).toEqual({
      open: 1,
      autoClockOut: 2,
      unresolvedBreaks: 3,
      crossesMonthEnd: 4,
      moduleDisabled: 5,
    });
    const mapped = mapNativePayrollError({ code: "55000", message });
    expect(mapped.code).toBe("not_payable");
    expect(mapped.message).toContain("3 shift(s) with unclassified breaks");
    expect(mapped.message).toContain("1 shift(s) still open");
    expect(mapped.message).not.toContain("0 shift");
  });

  it("returns null for text that is not the not-payable message", () => {
    expect(parseNotPayableCounts("something else")).toBeNull();
    expect(parseNotPayableCounts(null)).toBeNull();
  });
});

describe("firstOfMonth", () => {
  it("normalizes any date to the first of its month without time zone arithmetic", () => {
    expect(firstOfMonth("2026-09-17")).toBe("2026-09-01");
    expect(firstOfMonth("2026-12-31")).toBe("2026-12-01");
  });
});

describe("labelSourceTransitionBlockers", () => {
  it("labels known blockers in a stable order and drops unknown ones", () => {
    expect(
      labelSourceTransitionBlockers([
        "open_sessions",
        "not_period_boundary",
        "mystery",
      ]),
    ).toEqual([
      "Switch only on the first day of a payroll month",
      "Employees are still clocked in",
    ]);
    expect(labelSourceTransitionBlockers([])).toEqual([]);
  });
});
