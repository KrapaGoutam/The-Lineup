import { describe, expect, it } from "vitest";

import { normalizeNativeAttendanceToUnified } from "@/features/attendance/domain/unified-attendance-report";

import { composeCombinedReport, type ComposeInput } from "./report-composer";
import { partitionComposeInput } from "./report-partition";

const TAP = { id: "org-tap", name: "Liquor Tap", slug: "liquor-tap" };
const MONKS = { id: "org-monks", name: "The Monk's", slug: "monks" };
const BRANCHES = [
  {
    id: "loc-league",
    organizationId: "org-tap",
    name: "League City",
    timeZone: "America/Chicago",
  },
  {
    id: "loc-nasa",
    organizationId: "org-tap",
    name: "NASA",
    timeZone: "America/Chicago",
  },
  {
    id: "loc-webster",
    organizationId: "org-monks",
    name: "Webster",
    timeZone: "America/Chicago",
  },
  {
    id: null,
    organizationId: "org-tap",
    name: "Organization-level (no branch recorded)",
    timeZone: null,
  },
];

function slice(
  orgId: string,
  locId: string,
  orgName: string,
  branch: string,
  profile: string,
) {
  return {
    organizationId: orgId,
    locationId: locId,
    provider: "internal_the_lineup" as const,
    report: normalizeNativeAttendanceToUnified(
      [
        {
          sessionId: `${locId}-1`,
          profileId: profile,
          employeeName: profile,
          locationId: locId,
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
        },
      ],
      {
        organization: orgName,
        branch,
        reportingPeriod: "November 2026",
        timeZone: "America/Chicago",
      },
    ),
  };
}

function payroll(
  id: number,
  orgId: string,
  loc: string | null,
  profile: string,
) {
  return {
    periodId: id,
    source: "internal_the_lineup" as const,
    organizationId: orgId,
    locationId: loc,
    branchAttribution: (loc ? "recorded" : "organization_level") as
      | "recorded"
      | "organization_level",
    profileId: profile,
    neonUserId: null,
    periodMonth: "2026-11-01",
    status: "locked" as const,
    hoursSnapshot: 6,
    rateCents: 2000,
    grossCents: 12000,
    payments: [],
    adjustments: [],
  };
}

const INPUT: ComposeInput = {
  generatedAt: "2026-11-30T20:00:00.000Z",
  filters: {
    content: "both",
    output: "combined",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
  },
  organizations: [TAP, MONKS],
  branches: BRANCHES,
  attendance: [
    slice("org-tap", "loc-league", "Liquor Tap", "League City", "ava"),
    slice("org-tap", "loc-nasa", "Liquor Tap", "NASA", "ava"),
    slice("org-monks", "loc-webster", "The Monk's", "Webster", "zed"),
  ],
  payroll: [
    payroll(1, "org-tap", "loc-league", "ava"),
    payroll(2, "org-monks", "loc-webster", "zed"),
    payroll(3, "org-tap", null, "bo"),
  ],
  identityLinks: [],
  profileNames: { ava: "Ava", zed: "Zed", bo: "Bo" },
  neonUsers: {},
  actorNames: {},
  issues: [
    {
      code: "attendance_truncated",
      severity: "blocking",
      message: "league truncated",
      organizationId: "org-tap",
      locationId: "loc-league",
    },
    { code: "payroll_truncated", severity: "blocking", message: "global note" },
  ],
};

describe("partitionComposeInput", () => {
  it("combined = one input, untouched", () => {
    expect(partitionComposeInput(INPUT, "combined")).toEqual([INPUT]);
  });

  it("by organization: one report per organization with its OWN totals (never a slice of the other's)", () => {
    const parts = partitionComposeInput(INPUT, "by_organization");
    expect(parts).toHaveLength(2);
    const [tap, monks] = parts.map((p) => composeCombinedReport(p));
    expect(tap!.organizations.map((o) => o.name)).toEqual(["Liquor Tap"]);
    expect(monks!.organizations.map((o) => o.name)).toEqual(["The Monk's"]);
    expect(tap!.summary.baseCents).toBe(24000); // Ava (league) + Bo (org-level)
    expect(monks!.summary.baseCents).toBe(12000);
    expect(tap!.summary.informationalAggregate).toBe(false);
    // the all-organization total equals the sum of the parts
    const whole = composeCombinedReport(INPUT);
    expect(whole.summary.baseCents).toBe(
      tap!.summary.baseCents + monks!.summary.baseCents,
    );
    expect(whole.summary.attendanceSeconds).toBe(
      tap!.summary.attendanceSeconds + monks!.summary.attendanceSeconds,
    );
  });

  it("by branch: one report per branch, org-level records in their own group", () => {
    const parts = partitionComposeInput(INPUT, "by_branch");
    expect(parts).toHaveLength(4);
    const names = parts.map((p) => p.branches.map((b) => b.name).join());
    expect(names).toEqual([
      "League City",
      "NASA",
      "Organization-level (no branch recorded)",
      "Webster",
    ]);
  });

  it("scopes read issues to the branch they belong to; global notes go everywhere", () => {
    const parts = partitionComposeInput(INPUT, "by_branch");
    const byBranch = Object.fromEntries(
      parts.map((p) => [p.branches[0]!.name, p.issues.map((i) => i.message)]),
    );
    expect(byBranch["League City"]).toEqual([
      "league truncated",
      "global note",
    ]);
    expect(byBranch["NASA"]).toEqual(["global note"]);
    expect(byBranch["Webster"]).toEqual(["global note"]);
  });

  it("an empty report is returned whole instead of vanishing", () => {
    const empty = { ...INPUT, attendance: [], payroll: [] };
    expect(partitionComposeInput(empty, "by_organization")).toEqual([empty]);
  });
});
