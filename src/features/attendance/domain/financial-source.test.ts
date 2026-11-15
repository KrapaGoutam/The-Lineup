import { describe, expect, it } from "vitest";

import { aggregateHours } from "./attendance-report";
import {
  RECORDED_FINANCIAL_POLICY_APPROVALS,
  detectCorrectionsAfterSnapshot,
  evaluateExternalRow,
  evaluateFinancialActivation,
  evaluateNativeSession,
  flagDuplicateSourceRecords,
  resolveFinancialSource,
  summarizeFinancialReadiness,
  type ExternalRowInput,
  type FinancialPolicyApprovals,
  type NativeEvaluationContext,
  type NativeSummaryInput,
} from "./financial-source";

const ORG = "org-1";
const LOC = "loc-1";
const EMP = "emp-1";
const TZ = "America/Chicago";

const CTX: NativeEvaluationContext = {
  expected: { organizationId: ORG, locationId: LOC },
  timeZone: TZ,
};

/**
 * Builds a COMPLETED, fully resolved native row. Durations are derived from the instants
 * with the literal arithmetic the schema's own definition gives (gross = out − in; net =
 * gross − confirmed-unpaid), written here independently of the code under test.
 */
function native(
  over: Partial<NativeSummaryInput> & {
    inAt?: string;
    outAt?: string | null;
  } = {},
): NativeSummaryInput {
  const inAt = over.inAt ?? "2026-05-04T14:00:00.000Z"; // 09:00 CDT
  const outAt =
    over.outAt === undefined ? "2026-05-04T22:00:00.000Z" : over.outAt;
  const gross =
    outAt === null ? null : (Date.parse(outAt) - Date.parse(inAt)) / 1000;
  const unpaid = over.unpaidBreakSeconds ?? 0;
  const base: NativeSummaryInput = {
    sessionId: "s-1",
    organizationId: ORG,
    locationId: LOC,
    profileId: EMP,
    serviceDate: "2026-05-04",
    status: "completed",
    clockInAt: inAt,
    clockOutAt: outAt,
    grossElapsedSeconds: gross,
    totalBreakSeconds: unpaid,
    unpaidBreakSeconds: unpaid,
    openBreakCount: 0,
    breakPolicyResolved: true,
    netPayableSeconds: gross === null ? null : gross - unpaid,
    version: 1,
    correctionCount: 0,
    lastCorrectedAt: null,
  };
  const { inAt: _i, outAt: _o, ...rest } = over;
  void _i;
  void _o;
  return { ...base, ...rest };
}

describe("resolveFinancialSource", () => {
  it("maps each configured mode to its record source", () => {
    expect(resolveFinancialSource("internal_the_lineup")).toEqual({
      state: "INTERNAL_THE_LINEUP",
      recordSource: "INTERNAL_THE_LINEUP",
      legacyCompatible: false,
    });
    expect(resolveFinancialSource("external")).toEqual({
      state: "EXTERNAL",
      recordSource: "EXTERNAL_NEON",
      legacyCompatible: false,
    });
  });

  it("DISABLED produces no record source at all (not an empty native source)", () => {
    expect(resolveFinancialSource("disabled")).toEqual({
      state: "DISABLED",
      recordSource: null,
      legacyCompatible: false,
    });
  });

  it("unconfigured / unknown keeps the legacy external reader and never implies native", () => {
    for (const raw of [null, undefined, "", "bogus", "INTERNAL"]) {
      const decision = resolveFinancialSource(raw);
      expect(decision.state).toBe("UNCONFIGURED");
      expect(decision.recordSource).toBe("EXTERNAL_NEON");
      expect(decision.legacyCompatible).toBe(true);
    }
  });
});

describe("evaluateFinancialActivation — owner policy gate", () => {
  const internal = resolveFinancialSource("internal_the_lineup");
  const synthetic = (
    over: Partial<FinancialPolicyApprovals> = {},
  ): FinancialPolicyApprovals => ({
    q1BreakClassification: "approved",
    q4PayrollRules: "approved",
    q6ConfirmedPeriodCorrections: "approved",
    ...over,
  });

  it("the RECORDED approvals approve nothing (no owner decision exists)", () => {
    expect(Object.values(RECORDED_FINANCIAL_POLICY_APPROVALS)).toEqual([
      "not_approved",
      "not_approved",
      "not_approved",
    ]);
  });

  it("blocks native attendance as a financial source under the recorded approvals", () => {
    expect(evaluateFinancialActivation(internal)).toEqual({
      status: "BLOCKED_POLICY",
      pending: [
        "q1BreakClassification",
        "q4PayrollRules",
        "q6ConfirmedPeriodCorrections",
      ],
    });
  });

  it("each of Q1, Q4, Q6 independently blocks (synthetic approvals)", () => {
    for (const key of [
      "q1BreakClassification",
      "q4PayrollRules",
      "q6ConfirmedPeriodCorrections",
    ] as const) {
      expect(
        evaluateFinancialActivation(
          internal,
          synthetic({ [key]: "not_approved" }),
        ),
      ).toEqual({ status: "BLOCKED_POLICY", pending: [key] });
    }
  });

  it("activates native only when all three are approved (synthetic)", () => {
    expect(evaluateFinancialActivation(internal, synthetic())).toEqual({
      status: "ACTIVE",
      basis: "approved_policy",
    });
  });

  it("external and unconfigured stay on their unchanged legacy path regardless of approvals", () => {
    for (const mode of ["external", null]) {
      expect(evaluateFinancialActivation(resolveFinancialSource(mode))).toEqual(
        { status: "ACTIVE_LEGACY_UNCHANGED" },
      );
    }
  });

  it("disabled never produces attendance hours", () => {
    expect(
      evaluateFinancialActivation(
        resolveFinancialSource("disabled"),
        synthetic(),
      ),
    ).toEqual({ status: "NO_ATTENDANCE_HOURS" });
  });
});

describe("evaluateNativeSession — eligibility", () => {
  it("a completed, resolved session is eligible with seconds derived from the instants (8h = 28800)", () => {
    const r = evaluateNativeSession(native(), CTX);
    expect(r.isFinanciallyEligible).toBe(true);
    expect(r.recordStatus).toBe("COMPLETE_AND_RESOLVED");
    expect(r.ineligibilityReasons).toEqual([]);
    expect(r.payable).toEqual({ kind: "seconds", seconds: 28800 });
    expect(r.attendanceSource).toBe("INTERNAL_THE_LINEUP");
    expect(r.audit).toBe("append_only_ledger");
    expect(r.locationTimezone).toBe(TZ);
    expect(r.externalUserId).toBeNull();
  });

  it("a paid break does not reduce payable time", () => {
    // 30 min paid break: totalBreak 1800, confirmed-unpaid 0.
    const r = evaluateNativeSession(
      native({ totalBreakSeconds: 1800, unpaidBreakSeconds: 0 }),
      CTX,
    );
    expect(r.payable).toEqual({ kind: "seconds", seconds: 28800 });
    expect(r.totalBreakSeconds).toBe(1800);
    expect(r.confirmedUnpaidBreakSeconds).toBe(0);
  });

  it("a confirmed UNPAID break reduces payable time by exactly that break (28800 − 1800)", () => {
    const r = evaluateNativeSession(
      native({ totalBreakSeconds: 1800, unpaidBreakSeconds: 1800 }),
      CTX,
    );
    expect(r.payable).toEqual({ kind: "seconds", seconds: 27000 });
  });

  it("an UNCLASSIFIED break makes the session ineligible and payable UNRESOLVED — never zero", () => {
    const r = evaluateNativeSession(
      native({
        breakPolicyResolved: false,
        netPayableSeconds: null,
        totalBreakSeconds: 1800,
      }),
      CTX,
    );
    expect(r.isFinanciallyEligible).toBe(false);
    expect(r.recordStatus).toBe("UNCLASSIFIED_BREAK");
    expect(r.ineligibilityReasons).toContain("UNCLASSIFIED_BREAK");
    expect(r.payable).toEqual({ kind: "unresolved" });
    expect(r.payable).not.toHaveProperty("seconds");
  });

  it("an OPEN session is not zero hours: it is OPEN_SESSION with unresolved payable", () => {
    for (const status of ["active", "on_break"] as const) {
      const r = evaluateNativeSession(
        native({
          status,
          outAt: null,
          grossElapsedSeconds: null,
          netPayableSeconds: null,
          breakPolicyResolved: false,
        }),
        CTX,
      );
      expect(r.recordStatus).toBe("OPEN_SESSION");
      expect(r.isClosed).toBe(false);
      expect(r.payable).toEqual({ kind: "unresolved" });
      expect(r.isFinanciallyEligible).toBe(false);
    }
  });

  it("a completed session that still reports an open break is ineligible", () => {
    const r = evaluateNativeSession(
      native({
        openBreakCount: 1,
        breakPolicyResolved: false,
        netPayableSeconds: null,
      }),
      CTX,
    );
    expect(r.ineligibilityReasons).toContain("OPEN_BREAK");
    expect(r.recordStatus).toBe("OPEN_SESSION");
  });

  it("a VOIDED session is never consumed", () => {
    const r = evaluateNativeSession(native({ status: "voided" }), CTX);
    expect(r.recordStatus).toBe("VOIDED");
    expect(r.isFinanciallyEligible).toBe(false);
    expect(r.payable).toEqual({ kind: "unresolved" });
  });

  it("the reserved auto_clocked_out status is not trusted (no policy approved, Q2)", () => {
    const r = evaluateNativeSession(
      native({ status: "auto_clocked_out" }),
      CTX,
    );
    expect(r.ineligibilityReasons).toContain("AUTO_CLOCK_OUT_UNAPPROVED");
    expect(r.isFinanciallyEligible).toBe(false);
  });

  it("a corrected session carries its provenance and is judged on its EFFECTIVE values", () => {
    const r = evaluateNativeSession(
      native({
        version: 5,
        correctionCount: 2,
        lastCorrectedAt: "2026-05-05T10:00:00.000Z",
      }),
      CTX,
    );
    expect(r.isCorrected).toBe(true);
    expect(r.correctionVersion).toBe(5);
    expect(r.lastCorrectedAt).toBe("2026-05-05T10:00:00.000Z");
    expect(r.isFinanciallyEligible).toBe(true);
  });

  it("an uncorrected session reports isCorrected=false", () => {
    expect(evaluateNativeSession(native(), CTX).isCorrected).toBe(false);
  });
});

describe("evaluateNativeSession — tenancy and identity", () => {
  it("rejects a foreign organization, a foreign location and a different employee", () => {
    expect(
      evaluateNativeSession(native({ organizationId: "org-2" }), CTX)
        .ineligibilityReasons,
    ).toContain("ORGANIZATION_MISMATCH");
    expect(
      evaluateNativeSession(native({ locationId: "loc-2" }), CTX)
        .ineligibilityReasons,
    ).toContain("LOCATION_MISMATCH");
    expect(
      evaluateNativeSession(native({ profileId: "emp-2" }), {
        ...CTX,
        expected: { ...CTX.expected, profileId: EMP },
      }).ineligibilityReasons,
    ).toContain("EMPLOYEE_MISMATCH");
  });

  it("does not demand an employee match when none is expected", () => {
    expect(
      evaluateNativeSession(native({ profileId: "emp-9" }), CTX)
        .isFinanciallyEligible,
    ).toBe(true);
  });
});

describe("evaluateNativeSession — durations, overnight and DST", () => {
  it("a shift crossing midnight is one session of absolute elapsed time (8h)", () => {
    // 23:00 CDT on 05-02 → 07:00 CDT on 05-03 = 04:00Z → 12:00Z.
    const row = native({
      inAt: "2026-05-03T04:00:00.000Z",
      outAt: "2026-05-03T12:00:00.000Z",
      serviceDate: "2026-05-02",
    });
    const r = evaluateNativeSession(row, {
      ...CTX,
      period: { startDate: "2026-05-01", endDate: "2026-05-31" },
    });
    expect(r.isFinanciallyEligible).toBe(true);
    expect(r.payable).toEqual({ kind: "seconds", seconds: 28800 });
    expect(r.serviceDate).toBe("2026-05-02");
  });

  it("spring-forward: 22:00 CST → 08:00 CDT is 9h of real time, not the 10h on the wall clock", () => {
    // 2026-03-07 22:00 CST = 04:00Z (03-08); 2026-03-08 08:00 CDT = 13:00Z. 9h = 32400.
    const r = evaluateNativeSession(
      native({
        inAt: "2026-03-08T04:00:00.000Z",
        outAt: "2026-03-08T13:00:00.000Z",
        serviceDate: "2026-03-07",
      }),
      CTX,
    );
    expect(r.isFinanciallyEligible).toBe(true);
    expect(r.payable).toEqual({ kind: "seconds", seconds: 32400 });
  });

  it("fall-back: 22:00 CDT → 07:00 CST is 10h of real time, not the 9h on the wall clock", () => {
    // 2026-10-31 22:00 CDT = 03:00Z (11-01); 2026-11-01 07:00 CST = 13:00Z. 10h = 36000.
    const r = evaluateNativeSession(
      native({
        inAt: "2026-11-01T03:00:00.000Z",
        outAt: "2026-11-01T13:00:00.000Z",
        serviceDate: "2026-10-31",
      }),
      CTX,
    );
    expect(r.isFinanciallyEligible).toBe(true);
    expect(r.payable).toEqual({ kind: "seconds", seconds: 36000 });
  });

  it("flags a stored gross that disagrees with the instants", () => {
    const r = evaluateNativeSession(
      native({ grossElapsedSeconds: 28801, netPayableSeconds: 28801 }),
      CTX,
    );
    expect(r.ineligibilityReasons).toContain("DURATION_MISMATCH");
    expect(r.payable).toEqual({ kind: "unresolved" });
  });

  it("flags a net that disagrees with gross − confirmed unpaid", () => {
    const r = evaluateNativeSession(
      native({ unpaidBreakSeconds: 1800, netPayableSeconds: 28800 }),
      CTX,
    );
    expect(r.ineligibilityReasons).toContain("DURATION_MISMATCH");
  });

  it("flags clock-out before clock-in and negative payable", () => {
    expect(
      evaluateNativeSession(
        native({
          inAt: "2026-05-04T22:00:00.000Z",
          outAt: "2026-05-04T14:00:00.000Z",
          grossElapsedSeconds: -28800,
          netPayableSeconds: -28800,
        }),
        CTX,
      ).ineligibilityReasons,
    ).toContain("NEGATIVE_DURATION");
    expect(
      evaluateNativeSession(native({ netPayableSeconds: -1 }), CTX)
        .ineligibilityReasons,
    ).toContain("NEGATIVE_DURATION");
  });

  it("a completed row with no clock-out or no gross is an inconsistent record", () => {
    expect(
      evaluateNativeSession(
        native({ outAt: null, grossElapsedSeconds: null }),
        CTX,
      ).ineligibilityReasons,
    ).toContain("INCONSISTENT_RECORD");
  });

  it("flags a service date that is not the location-local date of the clock-in", () => {
    // 14:00Z on 05-04 is 09:00 CDT on 05-04; a stored 05-05 is wrong.
    expect(
      evaluateNativeSession(native({ serviceDate: "2026-05-05" }), CTX)
        .ineligibilityReasons,
    ).toContain("SERVICE_DATE_MISMATCH");
  });

  it("uses the LOCATION zone, not the machine's, for the service date", () => {
    // 02:30Z on 05-05 is 21:30 CDT on 05-04 in Chicago but 04:30 on 05-05 in Berlin.
    const row = native({
      inAt: "2026-05-05T02:30:00.000Z",
      outAt: "2026-05-05T06:30:00.000Z",
      serviceDate: "2026-05-04",
    });
    expect(evaluateNativeSession(row, CTX).isFinanciallyEligible).toBe(true);
    expect(
      evaluateNativeSession(row, { ...CTX, timeZone: "Europe/Berlin" })
        .ineligibilityReasons,
    ).toContain("SERVICE_DATE_MISMATCH");
  });
});

describe("evaluateNativeSession — period boundaries are surfaced, never split or clipped", () => {
  const period = { startDate: "2026-05-01", endDate: "2026-05-31" };

  it("includes a session whose service date and end are inside the period", () => {
    expect(
      evaluateNativeSession(native(), { ...CTX, period }).isFinanciallyEligible,
    ).toBe(true);
  });

  it("excludes a session on a service date outside the period", () => {
    const r = evaluateNativeSession(
      native({
        inAt: "2026-06-01T14:00:00.000Z",
        outAt: "2026-06-01T22:00:00.000Z",
        serviceDate: "2026-06-01",
      }),
      { ...CTX, period },
    );
    expect(r.ineligibilityReasons).toContain("OUTSIDE_PERIOD");
  });

  it("flags — and does not split — a shift that starts on the last day and ends after it", () => {
    // 22:00 CDT on 05-31 → 06:00 CDT on 06-01.
    const r = evaluateNativeSession(
      native({
        inAt: "2026-06-01T03:00:00.000Z",
        outAt: "2026-06-01T11:00:00.000Z",
        serviceDate: "2026-05-31",
      }),
      { ...CTX, period },
    );
    expect(r.ineligibilityReasons).toEqual(["PERIOD_BOUNDARY"]);
    expect(r.isFinanciallyEligible).toBe(false);
    // The full 8h is still reported as a fact; nothing was clipped to the period end.
    expect(r.grossElapsedSeconds).toBe(28800);
  });
});

describe("duplicate and already-consumed source records", () => {
  it("flags a session delivered twice; the first occurrence is untouched", () => {
    const a = evaluateNativeSession(native({ sessionId: "dup" }), CTX);
    const b = evaluateNativeSession(native({ sessionId: "dup" }), CTX);
    const out = flagDuplicateSourceRecords([a, b]);
    expect(out[0].isFinanciallyEligible).toBe(true);
    expect(out[1].isFinanciallyEligible).toBe(false);
    expect(out[1].ineligibilityReasons).toContain("DUPLICATE_SOURCE_RECORD");
    expect(out[1].payable).toEqual({ kind: "unresolved" });
  });

  it("two DIFFERENT sessions of one employee are both kept", () => {
    const out = flagDuplicateSourceRecords([
      evaluateNativeSession(native({ sessionId: "a" }), CTX),
      evaluateNativeSession(native({ sessionId: "b" }), CTX),
    ]);
    expect(out.every((r) => r.isFinanciallyEligible)).toBe(true);
  });

  it("does not double-add the duplicate reason when applied twice (idempotent)", () => {
    const a = evaluateNativeSession(native({ sessionId: "dup" }), CTX);
    const once = flagDuplicateSourceRecords([a, a]);
    const twice = flagDuplicateSourceRecords(once);
    expect(
      twice[1].ineligibilityReasons.filter(
        (x) => x === "DUPLICATE_SOURCE_RECORD",
      ),
    ).toHaveLength(1);
  });

  it("flags a record a consumer has already used", () => {
    const r = evaluateNativeSession(native({ sessionId: "used" }), {
      ...CTX,
      alreadyConsumedSourceIds: new Set(["used"]),
    });
    expect(r.ineligibilityReasons).toContain("ALREADY_CONSUMED");
    expect(r.isFinanciallyEligible).toBe(false);
  });
});

// ─── External (Neon) ──────────────────────────────────────────────────────────────────

function ext(over: Partial<ExternalRowInput> = {}): ExternalRowInput {
  return {
    id: 100,
    userId: 7,
    date: "2026-05-04",
    clockIn: "2026-05-04T14:00:00.000Z",
    clockOut: "2026-05-04T21:30:00.000Z",
    hoursWorked: 7.5,
    autoClockedOut: false,
    ...over,
  };
}

const EXT_CTX = {
  organizationId: ORG,
  identity: new Map<number, readonly string[]>([[7, [EMP]]]),
  requireProfileIdentity: false,
};

describe("evaluateExternalRow — Neon compatibility adapter", () => {
  it("carries the source's own hours and never claims internal audit guarantees", () => {
    const r = evaluateExternalRow(ext(), EXT_CTX);
    expect(r.attendanceSource).toBe("EXTERNAL_NEON");
    expect(r.payable).toEqual({ kind: "hours_reported_by_source", hours: 7.5 });
    expect(r.audit).toBe("none_provided");
    expect(r.isCorrected).toBeNull();
    expect(r.correctionVersion).toBeNull();
    expect(r.lastCorrectedAt).toBeNull();
    expect(r.breakPolicyResolved).toBeNull();
    expect(r.totalBreakSeconds).toBeNull();
    expect(r.confirmedUnpaidBreakSeconds).toBeNull();
    expect(r.grossElapsedSeconds).toBeNull();
    expect(r.sessionId).toBeNull();
    expect(r.locationId).toBeNull();
    expect(r.locationTimezone).toBeNull();
    expect(r.sourceRecordId).toBe("neon:100");
    expect(r.isFinanciallyEligible).toBe(true);
  });

  it("a row with no recorded hours is excluded WITH a reason, not counted as zero", () => {
    const r = evaluateExternalRow(ext({ hoursWorked: null }), EXT_CTX);
    expect(r.isFinanciallyEligible).toBe(false);
    expect(r.ineligibilityReasons).toEqual(["HOURS_NOT_RECORDED"]);
    expect(r.payable).toEqual({ kind: "unresolved" });
  });

  it("an open Neon shift is OPEN_SESSION", () => {
    const r = evaluateExternalRow(
      ext({ clockOut: null, hoursWorked: null }),
      EXT_CTX,
    );
    expect(r.recordStatus).toBe("OPEN_SESSION");
    expect(r.isClosed).toBe(false);
  });

  it("an auto-closed row WITH hours still counts, exactly as existing Payroll does", () => {
    const r = evaluateExternalRow(ext({ autoClockedOut: true }), EXT_CTX);
    expect(r.isFinanciallyEligible).toBe(true);
    expect(r.autoClockedOut).toBe(true);
  });

  it("rejects non-finite or negative hours", () => {
    for (const hoursWorked of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        evaluateExternalRow(ext({ hoursWorked }), EXT_CTX).ineligibilityReasons,
      ).toContain("NEGATIVE_DURATION");
    }
  });

  it("Payroll (keyed by Neon id) does not need a profile mapping; a roster consumer does", () => {
    const unmapped = ext({ userId: 99 });
    expect(evaluateExternalRow(unmapped, EXT_CTX).isFinanciallyEligible).toBe(
      true,
    );
    expect(
      evaluateExternalRow(unmapped, {
        ...EXT_CTX,
        requireProfileIdentity: true,
      }).ineligibilityReasons,
    ).toEqual(["IDENTITY_UNMAPPED"]);
  });

  it("never picks one of several profiles for an ambiguous Neon user", () => {
    const ctx = {
      ...EXT_CTX,
      identity: new Map<number, readonly string[]>([[7, ["a", "b"]]]),
      requireProfileIdentity: true,
    };
    const r = evaluateExternalRow(ext(), ctx);
    expect(r.ineligibilityReasons).toEqual(["IDENTITY_AMBIGUOUS"]);
    expect(r.employeeId).toBeNull();
  });

  it("maps a single link to the canonical profile id (UUID-to-UUID, never by name)", () => {
    expect(evaluateExternalRow(ext(), EXT_CTX).employeeId).toBe(EMP);
    expect(evaluateExternalRow(ext(), EXT_CTX).externalUserId).toBe(7);
  });

  it("uses the Neon date for the period (existing rule), with no boundary logic", () => {
    const period = { startDate: "2026-05-01", endDate: "2026-05-31" };
    expect(
      evaluateExternalRow(ext(), { ...EXT_CTX, period }).isFinanciallyEligible,
    ).toBe(true);
    expect(
      evaluateExternalRow(ext({ date: "2026-06-01" }), { ...EXT_CTX, period })
        .ineligibilityReasons,
    ).toContain("OUTSIDE_PERIOD");
    // A late shift that ends the next day stays on its Neon date.
    expect(
      evaluateExternalRow(
        ext({ date: "2026-05-31", clockOut: "2026-06-01T06:00:00.000Z" }),
        { ...EXT_CTX, period },
      ).isFinanciallyEligible,
    ).toBe(true);
  });

  it("flags a malformed Neon date", () => {
    expect(
      evaluateExternalRow(ext({ date: "05/04/2026" }), EXT_CTX)
        .ineligibilityReasons,
    ).toContain("INCONSISTENT_RECORD");
  });

  it("flags a Neon row already consumed", () => {
    expect(
      evaluateExternalRow(ext(), {
        ...EXT_CTX,
        alreadyConsumedSourceIds: new Set(["neon:100"]),
      }).ineligibilityReasons,
    ).toContain("ALREADY_CONSUMED");
  });

  it("PARITY with existing Payroll: eligible external hours sum equals aggregateHours", () => {
    const rows = [
      ext({ id: 1, hoursWorked: 7.5 }),
      ext({ id: 2, hoursWorked: 8 }),
      ext({ id: 3, hoursWorked: 6.25, autoClockedOut: true }),
      ext({ id: 4, hoursWorked: null, clockOut: null }),
    ];
    const legacy = aggregateHours(rows);
    const summary = summarizeFinancialReadiness(
      "EXTERNAL_NEON",
      rows.map((r) => evaluateExternalRow(r, EXT_CTX)),
    );
    const total = summary.employees.reduce(
      (sum, e) => sum + e.eligibleReportedHours,
      0,
    );
    expect(total).toBe(legacy.totalHours);
    expect(total).toBe(21.75); // 7.5 + 8 + 6.25, by hand
    // The legacy path silently dropped the null row; the contract surfaces it.
    expect(summary.excludedCount).toBe(legacy.excludedRowCount);
    expect(summary.excludedByReason.OPEN_SESSION).toBe(1);
    expect(summary.totalsComplete).toBe(false);
  });
});

// ─── Summaries ────────────────────────────────────────────────────────────────────────

describe("summarizeFinancialReadiness", () => {
  it("sums eligible native seconds independently and reports completeness", () => {
    const records = [
      evaluateNativeSession(native({ sessionId: "a" }), CTX), // 8h = 28800
      evaluateNativeSession(
        native({
          sessionId: "b",
          inAt: "2026-05-05T14:00:00.000Z",
          outAt: "2026-05-05T20:00:00.000Z",
          serviceDate: "2026-05-05",
        }),
        CTX,
      ), // 6h = 21600
    ];
    const s = summarizeFinancialReadiness("INTERNAL_THE_LINEUP", records);
    expect(s.eligibleCount).toBe(2);
    expect(s.excludedCount).toBe(0);
    expect(s.totalsComplete).toBe(true);
    expect(s.employees).toHaveLength(1);
    expect(s.employees[0].eligibleSeconds).toBe(28800 + 21600);
    expect(s.employees[0].finalizable).toBe(true);
  });

  it("an employee with ANY excluded session is not finalizable; the partial sum is not a total", () => {
    const records = [
      evaluateNativeSession(native({ sessionId: "a" }), CTX),
      evaluateNativeSession(
        native({
          sessionId: "b",
          breakPolicyResolved: false,
          netPayableSeconds: null,
          totalBreakSeconds: 900,
        }),
        CTX,
      ),
    ];
    const s = summarizeFinancialReadiness("INTERNAL_THE_LINEUP", records);
    const e = s.employees[0];
    expect(s.totalsComplete).toBe(false);
    expect(e.finalizable).toBe(false);
    expect(e.eligibleSeconds).toBe(28800); // partial, honest
    expect(e.excludedCount).toBe(1);
    expect(e.excluded[0]).toMatchObject({
      sourceRecordId: "b",
      recordStatus: "UNCLASSIFIED_BREAK",
      reasons: ["UNCLASSIFIED_BREAK"],
    });
    expect(s.excludedByReason).toEqual({ UNCLASSIFIED_BREAK: 1 });
  });

  it("keeps each employee separate and never merges by display name", () => {
    const s = summarizeFinancialReadiness("INTERNAL_THE_LINEUP", [
      evaluateNativeSession(
        native({ sessionId: "a", profileId: "emp-1" }),
        CTX,
      ),
      evaluateNativeSession(
        native({ sessionId: "b", profileId: "emp-2" }),
        CTX,
      ),
    ]);
    expect(s.employees.map((e) => e.employeeId).sort()).toEqual([
      "emp-1",
      "emp-2",
    ]);
  });

  it("a truncated read can never claim complete totals", () => {
    const s = summarizeFinancialReadiness(
      "INTERNAL_THE_LINEUP",
      [evaluateNativeSession(native(), CTX)],
      true,
    );
    expect(s.truncated).toBe(true);
    expect(s.totalsComplete).toBe(false);
  });

  it("an empty successful read is complete and zero records, distinct from a failed read", () => {
    const s = summarizeFinancialReadiness("INTERNAL_THE_LINEUP", []);
    expect(s.recordCount).toBe(0);
    expect(s.totalsComplete).toBe(true);
  });

  it("counts each ineligibility reason once per record", () => {
    const s = summarizeFinancialReadiness("INTERNAL_THE_LINEUP", [
      evaluateNativeSession(native({ sessionId: "v", status: "voided" }), CTX),
      evaluateNativeSession(
        native({
          sessionId: "o",
          status: "active",
          outAt: null,
          grossElapsedSeconds: null,
          netPayableSeconds: null,
          breakPolicyResolved: false,
        }),
        CTX,
      ),
    ]);
    expect(s.excludedByReason).toEqual({ VOIDED: 1, OPEN_SESSION: 1 });
    expect(s.excludedCount).toBe(2);
  });
});

describe("detectCorrectionsAfterSnapshot", () => {
  const corrected = evaluateNativeSession(
    native({
      sessionId: "c",
      version: 3,
      correctionCount: 1,
      lastCorrectedAt: "2026-06-02T12:00:00.000Z",
    }),
    CTX,
  );
  const untouched = evaluateNativeSession(native({ sessionId: "u" }), CTX);
  const external = evaluateExternalRow(ext(), EXT_CTX);

  it("returns native records corrected strictly after the snapshot, and only those", () => {
    const hits = detectCorrectionsAfterSnapshot(
      [corrected, untouched, external],
      "2026-06-01T00:00:00.000Z",
    );
    expect(hits).toEqual([
      {
        sourceRecordId: "c",
        employeeId: EMP,
        serviceDate: "2026-05-04",
        correctionVersion: 3,
        lastCorrectedAt: "2026-06-02T12:00:00.000Z",
      },
    ]);
  });

  it("a correction at or before the snapshot is not a post-snapshot change", () => {
    expect(
      detectCorrectionsAfterSnapshot([corrected], "2026-06-02T12:00:00.000Z"),
    ).toEqual([]);
    expect(
      detectCorrectionsAfterSnapshot([corrected], "2026-07-01T00:00:00.000Z"),
    ).toEqual([]);
  });

  it("an unparseable snapshot time yields nothing rather than a guess", () => {
    expect(detectCorrectionsAfterSnapshot([corrected], "not-a-date")).toEqual(
      [],
    );
  });
});

describe("presentation vocabulary", () => {
  it("has a non-empty plain-language label for every ineligibility reason", async () => {
    const { INELIGIBILITY_LABELS } = await import("./financial-source");
    const reasons: (keyof typeof INELIGIBILITY_LABELS)[] = [
      "VOIDED",
      "OPEN_SESSION",
      "OPEN_BREAK",
      "UNCLASSIFIED_BREAK",
      "AUTO_CLOCK_OUT_UNAPPROVED",
      "INCONSISTENT_RECORD",
      "NEGATIVE_DURATION",
      "DURATION_MISMATCH",
      "SERVICE_DATE_MISMATCH",
      "ORGANIZATION_MISMATCH",
      "LOCATION_MISMATCH",
      "EMPLOYEE_MISMATCH",
      "IDENTITY_UNMAPPED",
      "IDENTITY_AMBIGUOUS",
      "HOURS_NOT_RECORDED",
      "OUTSIDE_PERIOD",
      "PERIOD_BOUNDARY",
      "DUPLICATE_SOURCE_RECORD",
      "ALREADY_CONSUMED",
    ];
    expect(Object.keys(INELIGIBILITY_LABELS).sort()).toEqual(
      [...reasons].sort(),
    );
    for (const r of reasons)
      expect(INELIGIBILITY_LABELS[r].length).toBeGreaterThan(3);
  });

  it("describeActivation names exactly the pending owner decisions", async () => {
    const { describeActivation } = await import("./financial-source");
    const text = describeActivation({
      status: "BLOCKED_POLICY",
      pending: ["q1BreakClassification", "q6ConfirmedPeriodCorrections"],
    });
    expect(text).toContain("how breaks are classified paid or unpaid");
    expect(text).toContain("corrections after a confirmed period");
    expect(text).not.toContain("which payroll rules apply");
    expect(describeActivation({ status: "ACTIVE_LEGACY_UNCHANGED" })).toMatch(
      /unchanged|existing/i,
    );
  });
});
