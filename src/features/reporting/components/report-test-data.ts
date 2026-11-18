/** Test-only fixtures: composed reports for component tests. Not imported by production code. */
import type { NativeReportRow } from "@/features/attendance/domain/native-report";
import { normalizeNativeAttendanceToUnified } from "@/features/attendance/domain/unified-attendance-report";

import {
  composeCombinedReport,
  type ComposeInput,
  type PayrollPeriodInput,
} from "../domain/report-composer";
import type {
  CombinedReport,
  ReportBranchRef,
  ReportOrganizationRef,
} from "../domain/report-types";

export const TAP: ReportOrganizationRef = {
  id: "org-tap",
  name: "Liquor Tap",
  slug: "liquor-tap",
};
export const MONKS: ReportOrganizationRef = {
  id: "org-monks",
  name: "The Monk's",
  slug: "monks",
};
export const LEAGUE: ReportBranchRef = {
  id: "loc-league",
  organizationId: "org-tap",
  name: "League City",
  timeZone: "America/Chicago",
};
export const NASA: ReportBranchRef = {
  id: "loc-nasa",
  organizationId: "org-tap",
  name: "NASA",
  timeZone: "America/Chicago",
};
export const WEBSTER: ReportBranchRef = {
  id: "loc-webster",
  organizationId: "org-monks",
  name: "Webster",
  timeZone: "America/Chicago",
  address: {
    line1: "1416 FM 528 Rd, Suite D",
    city: "Webster",
    region: "TX",
    postalCode: "77598",
  } as never,
};

export function nativeRow(over: Partial<NativeReportRow>): NativeReportRow {
  return {
    sessionId: "s1",
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

export function slice(
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
      branch: branch.name ?? "",
      reportingPeriod: "November 2026",
      timeZone: "America/Chicago",
      truncated,
    }),
  };
}

export function period(over: Partial<PayrollPeriodInput>): PayrollPeriodInput {
  return {
    periodId: 1,
    source: "internal_the_lineup",
    organizationId: "org-tap",
    locationId: "loc-league",
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

export function build(over: Partial<ComposeInput> = {}): CombinedReport {
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
    attendance: [slice(TAP, LEAGUE, [nativeRow({})])],
    payroll: [
      period({
        payments: [
          {
            id: 7,
            amountCents: 5000,
            paymentDate: "2026-11-15",
            status: "confirmed",
            comment: "Advance",
            createdBy: null,
            confirmedBy: null,
            confirmedAt: null,
            reversesPaymentId: null,
          },
        ],
        adjustments: [
          {
            id: 3,
            deltaCents: -500,
            reason: "Mis-keyed hours",
            createdAt: "2026-11-16T15:00:00.000Z",
            createdBy: null,
          },
        ],
      }),
    ],
    identityLinks: [],
    profileNames: { "p-ava": "Ava Cruz", "p-ben": "Ben Ortiz" },
    neonUsers: {},
    actorNames: {},
    issues: [],
    ...over,
  });
}
