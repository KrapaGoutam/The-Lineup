import { describe, expect, it } from "vitest";

import type { NeonAttendanceRow } from "@/features/attendance/data/attendance-data";
import type { NativeReportRow } from "@/features/attendance/domain/native-report";
import {
  normalizeNativeAttendanceToUnified,
  normalizeNeonAttendanceToUnified,
} from "@/features/attendance/domain/unified-attendance-report";

import {
  composeCombinedReport,
  formatCents,
  type ComposeInput,
  type PayrollPeriodInput,
} from "./report-composer";
import {
  neonKey,
  profileKey,
  type ReportBranchRef,
  type ReportOrganizationRef,
} from "./report-types";

const MONKS: ReportOrganizationRef = {
  id: "org-monks",
  name: "The Monk's",
  slug: "monks",
};
const TAP: ReportOrganizationRef = {
  id: "org-tap",
  name: "Liquor Tap",
  slug: "liquor-tap",
};
const WEBSTER: ReportBranchRef = {
  id: "loc-webster",
  organizationId: "org-monks",
  name: "Webster",
  timeZone: "America/Chicago",
};
const LEAGUE: ReportBranchRef = {
  id: "loc-league",
  organizationId: "org-tap",
  name: "League City",
  timeZone: "America/Chicago",
};
const NASA: ReportBranchRef = {
  id: "loc-nasa",
  organizationId: "org-tap",
  name: "NASA",
  timeZone: "America/Chicago",
};

function nativeRow(over: Partial<NativeReportRow>): NativeReportRow {
  return {
    sessionId: "s",
    profileId: "p-ava",
    employeeName: "Ava Cruz",
    locationId: "loc-league",
    serviceDate: "2026-11-04",
    status: "completed",
    clockInAt: "2026-11-04T16:00:00.000Z",
    clockOutAt: "2026-11-04T22:00:00.000Z",
    grossElapsedSeconds: 21600,
    totalBreakSeconds: 0,
    paidBreakSeconds: 0,
    unpaidBreakSeconds: 0,
    unclassifiedBreakSeconds: 0,
    openBreakCount: 0,
    breakCount: 0,
    breakPolicyResolved: true,
    netPayableSeconds: 21600,
    version: 1,
    correctionCount: 0,
    lastCorrectedAt: null,
    source: "internal_the_lineup",
    timeZone: "America/Chicago",
    ...over,
  };
}

function nativeSlice(
  org: ReportOrganizationRef,
  branch: ReportBranchRef,
  rows: NativeReportRow[],
  truncated = false,
) {
  return {
    organizationId: org.id,
    locationId: branch.id,
    provider: "internal_the_lineup" as const,
    report: normalizeNativeAttendanceToUnified(rows, {
      organization: org.name,
      branch: branch.name,
      reportingPeriod: "November 2026",
      timeZone: "America/Chicago",
      truncated,
    }),
  };
}

function neonRow(over: Partial<NeonAttendanceRow>): NeonAttendanceRow {
  return {
    id: 1,
    userId: 7,
    date: "2026-11-03",
    clockIn: "2026-11-03T16:00:00.000Z",
    clockOut: "2026-11-03T20:00:00.000Z",
    hoursWorked: 4,
    autoClockedOut: false,
    ...over,
  };
}

function neonSlice(
  rows: NeonAttendanceRow[],
  users: Array<{ id: number; fullName: string }>,
) {
  return {
    organizationId: MONKS.id,
    locationId: WEBSTER.id,
    provider: "external_neon" as const,
    report: normalizeNeonAttendanceToUnified(rows, {
      organization: MONKS.name,
      branch: WEBSTER.name,
      reportingPeriod: "November 2026",
      timeZone: "America/Chicago",
      users: users.map((u) => ({
        ...u,
        role: "Server",
        phone: null,
        createdAt: "",
        isActive: true,
      })),
    }),
  };
}

function period(over: Partial<PayrollPeriodInput>): PayrollPeriodInput {
  return {
    periodId: 1,
    source: "internal_the_lineup",
    organizationId: TAP.id,
    locationId: LEAGUE.id,
    branchAttribution: "recorded",
    profileId: "p-ava",
    neonUserId: null,
    periodMonth: "2026-11-01",
    status: "locked",
    hoursSnapshot: 6,
    rateCents: 2000,
    grossCents: 12000,
    payments: [],
    adjustments: [],
    ...over,
  };
}

function compose(over: Partial<ComposeInput>) {
  return composeCombinedReport({
    generatedAt: "2026-11-30T20:00:00.000Z",
    filters: {
      content: "both",
      output: "combined",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    },
    organizations: [TAP],
    branches: [LEAGUE, NASA],
    attendance: [],
    payroll: [],
    identityLinks: [],
    profileNames: { "p-ava": "Ava Cruz" },
    neonUsers: {},
    actorNames: {},
    issues: [],
    ...over,
  });
}

describe("payroll arithmetic (existing balance convention, integer cents)", () => {
  it("balance = base − confirmed payments − Σ adjustment deltas; drafts are not counted", () => {
    const r = compose({
      payroll: [
        period({
          payments: [
            {
              id: 1,
              amountCents: 5000,
              paymentDate: "2026-11-15",
              status: "confirmed",
              comment: null,
              createdBy: null,
              confirmedBy: null,
              confirmedAt: null,
              reversesPaymentId: null,
            },
            {
              id: 2,
              amountCents: 3000,
              paymentDate: "2026-11-20",
              status: "draft",
              comment: null,
              createdBy: null,
              confirmedBy: null,
              confirmedAt: null,
              reversesPaymentId: null,
            },
          ],
          adjustments: [
            {
              id: 1,
              deltaCents: -1000, // negative delta INCREASES what is owed
              reason: "Mis-keyed hours",
              createdAt: "2026-11-16T15:00:00.000Z",
              createdBy: null,
            },
          ],
        }),
      ],
    });
    const e = r.payrollEntries[0]!;
    expect(e.baseCents).toBe(12000);
    expect(e.adjustmentDeltaCents).toBe(-1000);
    expect(e.adjustmentEffectCents).toBe(1000);
    expect(e.grossAfterAdjustmentsCents).toBe(13000);
    expect(e.confirmedPaymentsCents).toBe(5000);
    expect(e.draftPaymentsCents).toBe(3000);
    expect(e.balanceCents).toBe(8000);
    expect(e.paymentState).toBe("partially_paid");
    expect(r.summary.balanceOwedCents).toBe(8000);
    expect(r.summary.confirmedPaymentsCents).toBe(5000);
    expect(r.summary.draftPaymentsCents).toBe(3000);
  });

  it("classifies unpaid / paid / overpaid and keeps an overpayment from offsetting what is owed", () => {
    const pay = (id: number, amount: number) => ({
      id,
      amountCents: amount,
      paymentDate: "2026-11-20",
      status: "confirmed" as const,
      comment: null,
      createdBy: null,
      confirmedBy: null,
      confirmedAt: null,
      reversesPaymentId: null,
    });
    const r = compose({
      profileNames: {
        "p-ava": "Ava Cruz",
        "p-ben": "Ben Ortiz",
        "p-cy": "Cy Dunn",
      },
      payroll: [
        period({ periodId: 1, profileId: "p-ava", grossCents: 10000 }),
        period({
          periodId: 2,
          profileId: "p-ben",
          grossCents: 10000,
          payments: [pay(1, 10000)],
        }),
        period({
          periodId: 3,
          profileId: "p-cy",
          grossCents: 10000,
          payments: [pay(2, 12500)],
        }),
      ],
    });
    const state = (n: string) =>
      r.payrollEntries.find((e) => e.employeeName === n)!.paymentState;
    expect(state("Ava Cruz")).toBe("unpaid");
    expect(state("Ben Ortiz")).toBe("paid");
    expect(state("Cy Dunn")).toBe("overpaid");
    expect(r.summary.balanceOwedCents).toBe(10000); // Cy's −2,500 does not offset Ava's 10,000
    expect(r.summary.overpaidCents).toBe(2500);
  });

  it("never sums cents through floating point (no drift on many small amounts)", () => {
    const payments = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      amountCents: 1,
      paymentDate: "2026-11-02",
      status: "confirmed" as const,
      comment: null,
      createdBy: null,
      confirmedBy: null,
      confirmedAt: null,
      reversesPaymentId: null,
    }));
    const r = compose({
      payroll: [period({ grossCents: 1000, payments })],
    });
    expect(r.payrollEntries[0]!.balanceCents).toBe(0);
    expect(r.payrollEntries[0]!.paymentState).toBe("paid");
  });

  it("formats cents without rounding errors", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(123456789)).toBe("$1,234,567.89");
    expect(formatCents(-250)).toBe("−$2.50");
  });
});

describe("identity — never merged without a verified link", () => {
  it("keeps two different employees with the same name separate", () => {
    const r = compose({
      profileNames: { "p-a": "Alex Kim", "p-b": "Alex Kim" },
      attendance: [
        nativeSlice(TAP, LEAGUE, [
          nativeRow({
            sessionId: "1",
            profileId: "p-a",
            employeeName: "Alex Kim",
          }),
          nativeRow({
            sessionId: "2",
            profileId: "p-b",
            employeeName: "Alex Kim",
          }),
        ]),
      ],
    });
    expect(r.employees).toHaveLength(2);
    expect(r.summary.verifiedEmployees).toBe(2);
  });

  it("counts one verified employee once across two branches of the same organization", () => {
    const r = compose({
      attendance: [
        nativeSlice(TAP, LEAGUE, [nativeRow({ sessionId: "1" })]),
        nativeSlice(TAP, NASA, [
          nativeRow({
            sessionId: "2",
            locationId: "loc-nasa",
            serviceDate: "2026-11-05",
          }),
        ]),
      ],
    });
    expect(r.employees).toHaveLength(1);
    expect(r.summary.verifiedEmployees).toBe(1);
    expect(r.summary.attendanceSeconds).toBe(43200);
    expect(r.byBranch).toHaveLength(2);
    expect(r.byBranch.every((b) => b.employees === 1)).toBe(true);
  });

  it("links an external (Neon) person to a native profile ONLY through an identity link", () => {
    const linked = compose({
      organizations: [MONKS, TAP],
      branches: [WEBSTER, LEAGUE],
      identityLinks: [
        { organizationId: MONKS.id, neonUserId: 7, profileId: "p-ava" },
      ],
      attendance: [
        neonSlice([neonRow({})], [{ id: 7, fullName: "Ava C." }]),
        nativeSlice(TAP, LEAGUE, [nativeRow({ sessionId: "1" })]),
      ],
    });
    expect(linked.employees).toHaveLength(1);
    expect(linked.employees[0]!.key).toBe(profileKey("p-ava"));
    expect(linked.employees[0]!.organizationIds).toEqual(
      expect.arrayContaining([MONKS.id, TAP.id]),
    );

    // Same name, same number — but NO link: two separate identities and a warning.
    const unlinked = compose({
      organizations: [MONKS, TAP],
      branches: [WEBSTER, LEAGUE],
      identityLinks: [],
      attendance: [
        neonSlice([neonRow({})], [{ id: 7, fullName: "Ava Cruz" }]),
        nativeSlice(TAP, LEAGUE, [nativeRow({ sessionId: "1" })]),
      ],
    });
    expect(unlinked.employees).toHaveLength(2);
    expect(unlinked.summary.verifiedEmployees).toBe(1);
    expect(unlinked.summary.unmappedIdentities).toBe(1);
    expect(unlinked.employees.map((e) => e.key)).toContain(
      neonKey(MONKS.id, 7),
    );
    expect(
      unlinked.exceptions.some((x) => x.code === "unmapped_identity"),
    ).toBe(true);
  });
});

describe("source conflicts and duplicates", () => {
  it("counts the very same payroll record once even if it is read twice", () => {
    const r = compose({ payroll: [period({}), period({})] });
    expect(r.payrollEntries).toHaveLength(1);
    expect(r.summary.baseCents).toBe(12000);
  });

  it("excludes two DIFFERENT-source records for one person-month from every total and flags the report incomplete", () => {
    const r = compose({
      organizations: [MONKS],
      branches: [WEBSTER],
      identityLinks: [
        { organizationId: MONKS.id, neonUserId: 7, profileId: "p-ava" },
      ],
      payroll: [
        period({
          periodId: 10,
          source: "external_neon",
          organizationId: MONKS.id,
          locationId: WEBSTER.id,
          profileId: null,
          neonUserId: 7,
          grossCents: 50000,
        }),
        period({
          periodId: 11,
          source: "internal_the_lineup",
          organizationId: MONKS.id,
          locationId: WEBSTER.id,
          grossCents: 50000,
        }),
      ],
    });
    expect(r.payrollEntries).toHaveLength(2);
    expect(r.payrollEntries.every((e) => !e.includedInTotals)).toBe(true);
    expect(r.summary.baseCents).toBe(0);
    expect(r.summary.payrollRecords).toBe(0);
    expect(r.completeness.complete).toBe(false);
    expect(r.exceptions.some((x) => x.code === "payroll_source_conflict")).toBe(
      true,
    );
    expect(
      r.register.every(
        (row) => row.financialStatus === "Excluded — source conflict",
      ),
    ).toBe(true);
  });
});

describe("attendance aggregation", () => {
  it("sums exact seconds and reports unresolved shifts separately from counted hours", () => {
    const r = compose({
      attendance: [
        nativeSlice(TAP, LEAGUE, [
          nativeRow({ sessionId: "1", netPayableSeconds: 7050 }), // 1h57m30s
          nativeRow({
            sessionId: "2",
            netPayableSeconds: 7050,
            serviceDate: "2026-11-05",
          }),
          nativeRow({
            sessionId: "3",
            status: "active",
            clockOutAt: null,
            grossElapsedSeconds: null,
            netPayableSeconds: null,
            serviceDate: "2026-11-06",
          }),
        ]),
      ],
    });
    expect(r.summary.attendanceSeconds).toBe(14100);
    expect(r.summary.unresolvedShifts).toBe(1);
    expect(r.exceptions.some((x) => x.code === "unresolved_hours")).toBe(true);
  });

  it("a truncated read makes the report incomplete with a blocking exception", () => {
    const r = compose({
      attendance: [
        nativeSlice(TAP, LEAGUE, [nativeRow({ sessionId: "1" })], true),
      ],
    });
    expect(r.completeness.complete).toBe(false);
    expect(
      r.exceptions.find((x) => x.code === "attendance_truncated")?.severity,
    ).toBe("blocking");
  });

  it("Neon hours are summed once, in whole seconds (V2.0.5 wall-time instants preserved)", () => {
    const r = compose({
      organizations: [MONKS],
      branches: [WEBSTER],
      attendance: [
        neonSlice(
          [
            neonRow({ id: 1, hoursWorked: 1.9583333 }),
            neonRow({ id: 2, date: "2026-11-04", hoursWorked: 1.9583333 }),
          ],
          [{ id: 7, fullName: "Ava Cruz" }],
        ),
      ],
    });
    expect(r.summary.attendanceSeconds).toBe(2 * Math.round(1.9583333 * 3600));
    expect(r.attendanceRows[0]!.provider).toBe("external_neon");
    expect(r.attendanceRows[0]!.timeZone).toBe("America/Chicago");
  });
});

describe("register, ledger and reconciliation reporting", () => {
  it("matches attendance to the payroll month and reports (not reconciles) a hours difference", () => {
    const r = compose({
      attendance: [nativeSlice(TAP, LEAGUE, [nativeRow({ sessionId: "1" })])], // 6h
      payroll: [period({ hoursSnapshot: 8 })], // snapshot says 8h
    });
    const row = r.register.find((x) => x.payrollPeriodMonth === "2026-11-01")!;
    expect(row.attendanceSeconds).toBe(21600);
    expect(row.baseCents).toBe(12000); // untouched: no recalculation from attendance
    const diff = r.exceptions.find((x) => x.code === "payroll_hours_differ");
    expect(diff?.message).toMatch(/8h/);
    expect(diff?.message).toMatch(/6h/);
    expect(r.payrollEntries[0]!.baseCents).toBe(12000);
  });

  it("emits attendance-only register rows as 'No payroll record' and never invents money", () => {
    const r = compose({
      attendance: [
        nativeSlice(TAP, NASA, [
          nativeRow({ sessionId: "1", locationId: "loc-nasa" }),
        ]),
      ],
    });
    expect(r.register).toHaveLength(1);
    expect(r.register[0]!.financialStatus).toBe("No payroll record");
    expect(r.register[0]!.baseCents).toBeNull();
    expect(r.summary.baseCents).toBe(0);
  });

  it("separates payroll accounting months from the attendance range at a year boundary", () => {
    const r = compose({
      filters: {
        content: "both",
        output: "combined",
        startDate: "2025-12-15",
        endDate: "2026-01-15",
      },
      attendance: [
        nativeSlice(TAP, LEAGUE, [
          nativeRow({ sessionId: "1", serviceDate: "2025-12-31" }),
          nativeRow({ sessionId: "2", serviceDate: "2026-01-01" }),
        ]),
      ],
      payroll: [
        period({ periodId: 1, periodMonth: "2025-12-01" }),
        period({ periodId: 2, periodMonth: "2026-01-01" }),
      ],
    });
    expect(r.period.payrollMonths).toEqual(["2025-12-01", "2026-01-01"]);
    expect(r.period.label).toBe("Mon, Dec 15, 2025 – Thu, Jan 15, 2026");
    const dec = r.register.find((x) => x.payrollPeriodMonth === "2025-12-01")!;
    const jan = r.register.find((x) => x.payrollPeriodMonth === "2026-01-01")!;
    expect(dec.attendanceSeconds).toBe(21600);
    expect(jan.attendanceSeconds).toBe(21600);
    expect(
      r.exceptions.filter((x) => x.code === "partial_payroll_month"),
    ).toHaveLength(2);
  });

  it("builds a ledger with a running remaining balance that ignores draft payments", () => {
    const r = compose({
      actorNames: { "m-1": "Mia Manager" },
      payroll: [
        period({
          payments: [
            {
              id: 1,
              amountCents: 4000,
              paymentDate: "2026-11-10",
              status: "confirmed",
              comment: "Advance",
              createdBy: "m-1",
              confirmedBy: "m-1",
              confirmedAt: null,
              reversesPaymentId: null,
            },
            {
              id: 2,
              amountCents: 2000,
              paymentDate: "2026-11-12",
              status: "draft",
              comment: null,
              createdBy: "m-1",
              confirmedBy: null,
              confirmedAt: null,
              reversesPaymentId: null,
            },
          ],
        }),
      ],
    });
    expect(r.ledger.map((l) => [l.ref, l.remainingBalanceCents])).toEqual([
      ["PAY-1", 8000],
      ["PAY-2", 8000],
    ]);
    expect(r.ledger[0]!.actor).toBe("Mia Manager");
    expect(r.ledger[1]!.status).toMatch(/Draft/);
    expect(r.summary.draftPaymentsCents).toBe(2000);
  });

  it("derives an adjustment's event date in the branch's own zone, not UTC", () => {
    const r = compose({
      payroll: [
        period({
          adjustments: [
            {
              id: 1,
              deltaCents: 500,
              reason: "Late-night fix",
              // 03:30 UTC on Nov 6 is still Nov 5 evening in Chicago
              createdAt: "2026-11-06T03:30:00.000Z",
              createdBy: null,
            },
          ],
        }),
      ],
    });
    expect(r.ledger[0]!.eventDate).toBe("2026-11-05");
  });
});

describe("cross-organization output", () => {
  it("labels multi-organization totals informational and keeps organizations separate", () => {
    const r = compose({
      organizations: [MONKS, TAP],
      branches: [WEBSTER, LEAGUE],
      profileNames: { "p-ava": "Ava Cruz", "p-zed": "Zed Ray" },
      payroll: [
        period({ periodId: 1, grossCents: 10000 }),
        period({
          periodId: 2,
          organizationId: MONKS.id,
          locationId: WEBSTER.id,
          profileId: "p-zed",
          grossCents: 30000,
        }),
      ],
    });
    expect(r.summary.informationalAggregate).toBe(true);
    expect(r.summary.baseCents).toBe(40000);
    expect(r.byOrganization.map((o) => [o.organization, o.baseCents])).toEqual([
      ["Liquor Tap", 10000],
      ["The Monk's", 30000],
    ]);
    expect(r.exceptions.some((x) => x.code === "cross_organization")).toBe(
      true,
    );
  });

  it("flags draft payroll as pending and keeps it out of balance-owed misreads", () => {
    const r = compose({ payroll: [period({ status: "draft" })] });
    expect(r.summary.pendingPeriods).toBe(1);
    expect(r.register[0]!.financialStatus).toBe("Draft");
    expect(r.exceptions.some((x) => x.code === "pending_payroll")).toBe(true);
  });

  it("shows organization-level (no branch) payroll as such instead of guessing a branch", () => {
    const r = compose({
      payroll: [
        period({ locationId: null, branchAttribution: "organization_level" }),
      ],
    });
    expect(r.register[0]!.branch).toMatch(/Organization-level/);
    expect(r.exceptions.some((x) => x.code === "no_branch_provenance")).toBe(
      true,
    );
  });

  it("produces a stable, input-derived reference and the confidentiality label", () => {
    const a = compose({ payroll: [period({})] });
    const b = compose({ payroll: [period({})] });
    expect(a.reference).toBe(b.reference);
    expect(a.reference).toMatch(/^RPT-20261101-[0-9A-F]{8}$/);
    expect(a.confidentiality).toMatch(/Confidential/);
  });
});
