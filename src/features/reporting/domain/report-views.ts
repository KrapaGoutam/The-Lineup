/**
 * V2.0.7 — presentation-side helpers over a composed report: which sections each Reporting
 * Center view prints, register subtotals computed from the VISIBLE rows (so a printed
 * subtotal always equals the sum of the rows above it), filenames and CSV datasets.
 * Pure: no I/O, no authorization.
 */

import type { CsvCell } from "@/lib/csv/write";

import { formatCents, formatSeconds } from "./report-composer";
import type {
  CombinedReport,
  EmployeeKey,
  RegisterRow,
  ReportContent,
} from "./report-types";

export type ReportViewKey = "combined" | "attendance" | "payroll" | "ledger";

export type ReportSectionKey =
  | "cover"
  | "summary"
  | "register"
  | "statements"
  | "attendance"
  | "ledger";

export const VIEW_LABELS: Readonly<Record<ReportViewKey, string>> = {
  combined: "Combined Reports",
  attendance: "Attendance Statements",
  payroll: "Payroll Statements",
  ledger: "Payment Ledger",
};

const VIEW_SECTIONS: Readonly<
  Record<ReportViewKey, readonly ReportSectionKey[]>
> = {
  combined: [
    "cover",
    "summary",
    "register",
    "statements",
    "attendance",
    "ledger",
  ],
  attendance: ["cover", "summary", "statements", "attendance"],
  payroll: ["cover", "summary", "register", "statements", "ledger"],
  ledger: ["cover", "ledger"],
};

export function sectionsForView(
  view: ReportViewKey,
): readonly ReportSectionKey[] {
  return VIEW_SECTIONS[view];
}

/** The content a view asks the server for (Combined lets the user choose). */
export function contentForView(
  view: ReportViewKey,
  chosen: ReportContent,
): ReportContent {
  switch (view) {
    case "attendance":
      return "attendance";
    case "payroll":
    case "ledger":
      return "payroll";
    default:
      return chosen;
  }
}

export interface RegisterTotals {
  readonly attendanceSeconds: number;
  readonly unresolvedShifts: number;
  readonly baseCents: number;
  readonly adjustmentEffectCents: number;
  readonly grossAfterAdjustmentsCents: number;
  readonly confirmedPaymentsCents: number;
  readonly balanceCents: number;
  readonly rows: number;
}

/**
 * Sums exactly the rows given. Rows excluded from totals (source conflicts) and rows with no
 * payroll record contribute nothing financial; attendance seconds are always summed.
 */
export function registerTotals(rows: readonly RegisterRow[]): RegisterTotals {
  const t = {
    attendanceSeconds: 0,
    unresolvedShifts: 0,
    baseCents: 0,
    adjustmentEffectCents: 0,
    grossAfterAdjustmentsCents: 0,
    confirmedPaymentsCents: 0,
    balanceCents: 0,
    rows: rows.length,
  };
  for (const r of rows) {
    t.attendanceSeconds += r.attendanceSeconds ?? 0;
    t.unresolvedShifts += r.unresolvedShifts;
    if (!r.includedInTotals || r.baseCents === null) continue;
    t.baseCents += r.baseCents;
    t.adjustmentEffectCents += r.adjustmentEffectCents ?? 0;
    t.grossAfterAdjustmentsCents += r.grossAfterAdjustmentsCents ?? 0;
    t.confirmedPaymentsCents += r.confirmedPaymentsCents ?? 0;
    t.balanceCents += r.balanceCents ?? 0;
  }
  return t;
}

export interface RegisterGroup {
  readonly organizationId: string;
  readonly organization: string;
  readonly locationId: string | null;
  readonly branch: string;
  readonly rows: readonly RegisterRow[];
  readonly totals: RegisterTotals;
}

/** Register rows grouped by organization then branch, in the composer's order. */
export function groupRegister(rows: readonly RegisterRow[]): RegisterGroup[] {
  const map = new Map<string, RegisterRow[]>();
  for (const r of rows) {
    const key = `${r.organizationId}|${r.locationId ?? "-"}`;
    const list = map.get(key) ?? [];
    list.push(r);
    map.set(key, list);
  }
  return [...map.values()].map((list) => ({
    organizationId: list[0]!.organizationId,
    organization: list[0]!.organization,
    locationId: list[0]!.locationId,
    branch: list[0]!.branch,
    rows: list,
    totals: registerTotals(list),
  }));
}

/** Employees that actually have data in this report, in display order. */
export function employeesWithData(report: CombinedReport): EmployeeKey[] {
  const keys = new Set<EmployeeKey>();
  for (const r of report.attendanceRows) keys.add(r.employeeKey);
  for (const e of report.payrollEntries) keys.add(e.employeeKey);
  return report.employees.filter((e) => keys.has(e.key)).map((e) => e.key);
}

/** True when there is nothing to print (an empty report is shown, never a blank document). */
export function isEmptyReport(report: CombinedReport): boolean {
  return (
    report.attendanceRows.length === 0 && report.payrollEntries.length === 0
  );
}

/** Print and export are refused for an incomplete or empty report. */
export function outputBlockedReason(
  reports: readonly CombinedReport[],
): string | null {
  if (reports.length === 0) return "Generate a report first.";
  if (reports.every(isEmptyReport)) {
    return "There are no records to print or export for this selection.";
  }
  const incomplete = reports.find((r) => !r.completeness.complete);
  if (incomplete) {
    return "This report is incomplete, so printing and export are turned off. Narrow the dates, branches or employees, then generate it again.";
  }
  return null;
}

function money(cents: number | null): CsvCell {
  return cents === null ? "" : Number((cents / 100).toFixed(2));
}
function hours(seconds: number | null): CsvCell {
  return seconds === null ? "" : Number((seconds / 3600).toFixed(2));
}

export type CsvDataset = "register" | "attendance" | "ledger" | "exceptions";

export const CSV_DATASET_LABELS: Readonly<Record<CsvDataset, string>> = {
  register: "Payroll register",
  attendance: "Attendance detail",
  ledger: "Adjustments & payments ledger",
  exceptions: "Exceptions",
};

export function reportCsvRows(
  report: CombinedReport,
  dataset: CsvDataset,
): CsvCell[][] {
  const context: CsvCell[] = [
    report.reference,
    report.period.label,
    report.period.payrollLabel,
  ];
  switch (dataset) {
    case "register":
      return [
        [
          "Report reference",
          "Attendance period",
          "Payroll period(s)",
          "Employee",
          "Organization",
          "Branch",
          "Payroll month",
          "Attendance hours",
          "Unresolved shifts",
          "Base (USD)",
          "Adjustments effect (USD)",
          "Gross after adjustments (USD)",
          "Confirmed payments (USD)",
          "Remaining balance (USD)",
          "Financial status",
          "Source",
          "In totals",
        ],
        ...report.register.map((r) => [
          ...context,
          r.employeeName,
          r.organization,
          r.branch,
          r.payrollPeriodMonth ?? "",
          hours(r.attendanceSeconds),
          r.unresolvedShifts,
          money(r.baseCents),
          money(r.adjustmentEffectCents),
          money(r.grossAfterAdjustmentsCents),
          money(r.confirmedPaymentsCents),
          money(r.balanceCents),
          r.financialStatus,
          r.source ?? "",
          r.includedInTotals ? "yes" : "no",
        ]),
      ];
    case "attendance":
      return [
        [
          "Report reference",
          "Attendance period",
          "Employee",
          "Organization",
          "Branch",
          "Business date",
          "Clock in",
          "Clock out",
          "Counted hours",
          "Hours status",
          "Source",
          "Missing punch",
          "Corrected",
          "Time zone",
        ],
        ...report.attendanceRows.map((r) => [
          report.reference,
          report.period.label,
          r.employeeName,
          r.organization,
          r.branch,
          r.businessDate,
          r.clockIn ?? "",
          r.clockOut ?? "",
          hours(r.workedSeconds),
          r.hoursStatus,
          r.sourceLabel,
          r.missingPunches ? "yes" : "no",
          r.corrected ? `yes (${r.correctionCount})` : "no",
          r.timeZone,
        ]),
      ];
    case "ledger":
      return [
        [
          "Report reference",
          "Reference",
          "Employee",
          "Organization",
          "Branch",
          "Payroll month",
          "Event date",
          "Type",
          "Description",
          "Status",
          "Amount (USD)",
          "Effect on amount owed (USD)",
          "Remaining balance (USD)",
          "Recorded by",
        ],
        ...report.ledger.map((l) => [
          report.reference,
          l.ref,
          l.employeeName,
          l.organization,
          l.branch,
          l.periodMonth,
          l.eventDate,
          l.kind,
          l.description,
          l.status,
          money(l.amountCents),
          money(l.effectCents),
          money(l.remainingBalanceCents),
          l.actor ?? "",
        ]),
      ];
    case "exceptions":
      return [
        ["Report reference", "Severity", "Code", "Message"],
        ...report.exceptions.map((x) => [
          report.reference,
          x.severity,
          x.code,
          x.message,
        ]),
      ];
  }
}

/** Safe suggested file name (no path separators or control characters). */
export function reportFilename(
  report: CombinedReport,
  suffix?: string,
): string {
  const orgs =
    report.organizations.length === 1
      ? report.organizations[0]!.name
      : "Combined";
  const raw = `${orgs} ${report.title} ${report.period.label}${suffix ? ` ${suffix}` : ""}`;
  return raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export { formatCents, formatSeconds };

export interface LedgerTotals {
  /** Σ confirmed payments (positive amount paid). Drafts are never counted. */
  readonly confirmedPaymentsCents: number;
  /** Σ effect of adjustments on the amount owed. */
  readonly adjustmentEffectCents: number;
  readonly entries: number;
}

/** Totals over exactly the ledger rows given; entries excluded by a source conflict add nothing. */
export function ledgerTotals(
  entries: readonly CombinedReport["ledger"][number][],
): LedgerTotals {
  let confirmed = 0;
  let adjustments = 0;
  for (const e of entries) {
    if (!e.includedInTotals) continue;
    if (e.kind === "payment" && e.status === "Confirmed") {
      confirmed += e.amountCents;
    } else if (e.kind === "adjustment") {
      adjustments += e.effectCents;
    }
  }
  return {
    confirmedPaymentsCents: confirmed,
    adjustmentEffectCents: adjustments,
    entries: entries.length,
  };
}
