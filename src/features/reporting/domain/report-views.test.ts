import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/csv/write";

import { composeCombinedReport } from "./report-composer";
import type { ComposeInput } from "./report-composer";
import {
  contentForView,
  groupRegister,
  isEmptyReport,
  outputBlockedReason,
  registerTotals,
  reportCsvRows,
  reportFilename,
  sectionsForView,
} from "./report-views";

const ORG = { id: "org-tap", name: "Liquor Tap", slug: "liquor-tap" };
const BRANCH = {
  id: "loc-1",
  organizationId: "org-tap",
  name: "League City",
  timeZone: "America/Chicago",
};

function input(over: Partial<ComposeInput>): ComposeInput {
  return {
    generatedAt: "2026-11-30T20:00:00.000Z",
    filters: {
      content: "payroll",
      output: "combined",
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    },
    organizations: [ORG],
    branches: [BRANCH],
    attendance: null,
    payroll: [],
    identityLinks: [],
    profileNames: { a: "=Evil Ann", b: "Ben" },
    neonUsers: {},
    actorNames: {},
    issues: [],
    ...over,
  };
}

const period = (id: number, profile: string, gross: number, extra = {}) => ({
  periodId: id,
  source: "internal_the_lineup" as const,
  organizationId: "org-tap",
  locationId: "loc-1",
  branchAttribution: "recorded" as const,
  profileId: profile,
  neonUserId: null,
  periodMonth: "2026-11-01",
  status: "locked" as const,
  hoursSnapshot: 1,
  rateCents: gross,
  grossCents: gross,
  payments: [],
  adjustments: [],
  ...extra,
});

describe("views", () => {
  it("each view prints a fixed, ordered set of sections", () => {
    expect(sectionsForView("combined")).toEqual([
      "cover",
      "summary",
      "register",
      "statements",
      "attendance",
      "ledger",
    ]);
    expect(sectionsForView("ledger")).toEqual(["cover", "ledger"]);
    expect(sectionsForView("attendance")).not.toContain("ledger");
    expect(sectionsForView("payroll")).not.toContain("attendance");
  });

  it("views other than Combined fix the content; Combined honours the choice", () => {
    expect(contentForView("attendance", "both")).toBe("attendance");
    expect(contentForView("payroll", "both")).toBe("payroll");
    expect(contentForView("ledger", "attendance")).toBe("payroll");
    expect(contentForView("combined", "attendance")).toBe("attendance");
  });
});

describe("register subtotals equal the sum of the visible rows", () => {
  it("sums exactly the rows given, excluding conflicts from money but not from hours", () => {
    const r = composeCombinedReport(
      input({ payroll: [period(1, "a", 10001), period(2, "b", 20002)] }),
    );
    const t = registerTotals(r.register);
    expect(t.baseCents).toBe(30003);
    expect(t.balanceCents).toBe(30003);
    expect(t.rows).toBe(2);
    const groups = groupRegister(r.register);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.totals.baseCents).toBe(30003);
  });
});

describe("output blocking", () => {
  it("blocks an empty bundle, an empty report and an incomplete report", () => {
    expect(outputBlockedReason([])).toMatch(/Generate/);
    const empty = composeCombinedReport(input({}));
    expect(isEmptyReport(empty)).toBe(true);
    expect(outputBlockedReason([empty])).toMatch(/no records/);
    const incomplete = composeCombinedReport(
      input({
        payroll: [period(1, "a", 100)],
        issues: [
          { code: "payroll_truncated", severity: "blocking", message: "x" },
        ],
      }),
    );
    expect(outputBlockedReason([incomplete])).toMatch(/incomplete/);
    const ok = composeCombinedReport(input({ payroll: [period(1, "a", 100)] }));
    expect(outputBlockedReason([ok])).toBeNull();
  });
});

describe("exports", () => {
  it("emits register CSV with decimal dollars, source and in-totals flag", () => {
    const r = composeCombinedReport(
      input({ payroll: [period(1, "b", 12345)] }),
    );
    const rows = reportCsvRows(r, "register");
    expect(rows[0]).toContain("Remaining balance (USD)");
    expect(rows[1]).toContain(123.45);
    expect(rows[1]).toContain("internal_the_lineup");
  });

  it("neutralizes spreadsheet-formula text in names (CSV injection)", () => {
    const r = composeCombinedReport(input({ payroll: [period(1, "a", 100)] }));
    const csv = toCsv(reportCsvRows(r, "register"));
    expect(csv).toContain("'=Evil Ann");
    expect(csv).not.toMatch(/,=Evil Ann/);
  });

  it("keeps negative amounts numeric (an overpayment stays -2.5, not a quoted string)", () => {
    const r = composeCombinedReport(
      input({
        payroll: [
          period(1, "b", 10000, {
            payments: [
              {
                id: 1,
                amountCents: 10250,
                paymentDate: "2026-11-10",
                status: "confirmed",
                comment: null,
                createdBy: null,
                confirmedBy: null,
                confirmedAt: null,
                reversesPaymentId: null,
              },
            ],
          }),
        ],
      }),
    );
    const csv = toCsv(reportCsvRows(r, "register"));
    expect(csv).toContain(",-2.5,");
    expect(csv).not.toContain("'-2.5");
  });

  it("builds ledger and exception datasets and a safe filename", () => {
    const r = composeCombinedReport(
      input({ payroll: [period(1, "b", 100, { status: "draft" })] }),
    );
    expect(reportCsvRows(r, "ledger")[0]).toContain("Remaining balance (USD)");
    expect(reportCsvRows(r, "exceptions").length).toBeGreaterThan(1);
    const name = reportFilename({ ...r, title: 'A/B:C*"x' });
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
    expect(name).toContain("Liquor Tap");
    expect(name).toContain("November 2026");
  });
});
