/**
 * V2.0.7 — Combined Attendance & Payroll Reporting: serializable report contracts.
 *
 * Everything here is plain data (no functions, no Dates) so a composed report can cross the
 * server-action boundary unchanged. Money is ALWAYS integer cents and time is ALWAYS integer
 * seconds; rounding exists only in presentation helpers.
 *
 * This feature reads existing payroll snapshots and attendance records. It never creates,
 * recalculates or reassigns a financial record.
 */

import type { LocationAddress } from "@/features/locations/domain/location";
import type { ReportPeriodKind } from "@/lib/report-period";

/** The ledger stores integer cents with no currency column; every amount is US dollars. */
export const REPORT_CURRENCY = "USD" as const;

/** Hard bounds so a report can never silently become incomplete or unbounded. */
export const REPORT_MAX_RANGE_DAYS = 92;
export const REPORT_MAX_EMPLOYEE_SELECTION = 200;
export const REPORT_MAX_PAYROLL_PERIODS = 2000;

export type ReportContent = "attendance" | "payroll" | "both";
export type ReportOutputMode = "combined" | "by_organization" | "by_branch";
export type AttendanceProvider = "internal_the_lineup" | "external_neon";

/** `profile:<uuid>` (verified) or `neon:<organizationId>:<neonUserId>` (unmapped external). */
export type EmployeeKey = string;

export interface ReportFilters {
  /** null = every organization the caller is authorized for. */
  readonly organizationIds: readonly string[] | null;
  /** null = every authorized branch of the selected organizations. */
  readonly locationIds: readonly string[] | null;
  /** null = every authorized employee. Explicit selections are bounded (never truncated). */
  readonly employeeKeys: readonly EmployeeKey[] | null;
  readonly content: ReportContent;
  readonly startDate: string;
  readonly endDate: string;
  readonly output: ReportOutputMode;
}

export interface ReportOrganizationRef {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface ReportBranchRef {
  /** null = organization-level records that carry no branch (never guessed). */
  readonly id: string | null;
  readonly organizationId: string;
  readonly name: string;
  readonly timeZone: string | null;
  readonly address?: LocationAddress;
}

export interface ReportEmployee {
  readonly key: EmployeeKey;
  readonly displayName: string;
  readonly role?: string;
  /** `verified` = linked to one authenticated profile; `unmapped_external` = Neon only. */
  readonly identity: "verified" | "unmapped_external";
  readonly profileId: string | null;
  readonly organizationIds: readonly string[];
}

export type ExceptionSeverity = "info" | "warning" | "blocking";

export type ExceptionCode =
  | "attendance_truncated"
  | "payroll_truncated"
  | "source_unavailable"
  | "unmapped_identity"
  | "payroll_source_conflict"
  | "payroll_hours_differ"
  | "unresolved_hours"
  | "missing_punches"
  | "org_level_payroll_excluded"
  | "payroll_not_authorized"
  | "attendance_not_authorized"
  | "pending_payroll"
  | "draft_payments"
  | "partial_payroll_month"
  | "no_branch_provenance"
  | "no_payroll_record"
  | "voided_excluded"
  | "cross_organization";

export interface ReportException {
  readonly code: ExceptionCode;
  readonly severity: ExceptionSeverity;
  readonly message: string;
  readonly organizationId?: string;
  readonly locationId?: string | null;
  readonly employeeKey?: EmployeeKey;
  readonly count?: number;
}

/** One attendance record, with the identity and source it came from preserved. */
export interface AttendanceDetailRow {
  readonly id: string;
  readonly employeeKey: EmployeeKey;
  readonly employeeName: string;
  readonly organizationId: string;
  readonly organization: string;
  readonly locationId: string | null;
  readonly branch: string;
  readonly provider: AttendanceProvider;
  readonly sourceLabel: string;
  readonly timeZone: string;
  readonly businessDate: string;
  readonly weekday: string;
  readonly clockIn: string | null;
  readonly clockOut: string | null;
  readonly workedSeconds: number | null;
  readonly hoursStatus: "counted" | "open" | "break_review" | "no_duration";
  readonly missingPunches: boolean;
  readonly corrected: boolean;
  readonly correctionCount: number;
}

export interface AttendanceSliceSummary {
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly branch: string;
  readonly provider: AttendanceProvider;
  readonly sourceLabel: string;
  readonly hoursBasis: string;
  readonly isPartial: boolean;
  readonly excludedVoidedCount: number;
  readonly countedSeconds: number;
  readonly shifts: number;
  readonly unresolvedShifts: number;
  readonly missingPunches: number;
  readonly correctedShifts: number;
}

export interface PaymentRecord {
  readonly id: number;
  readonly amountCents: number;
  readonly paymentDate: string;
  readonly status: "draft" | "confirmed";
  readonly comment: string | null;
  readonly createdBy: string | null;
  readonly confirmedBy: string | null;
  readonly confirmedAt: string | null;
  readonly reversesPaymentId: number | null;
}

export interface AdjustmentRecord {
  readonly id: number;
  /** Signed delta exactly as stored; the balance is `base − confirmed payments − Σ delta`. */
  readonly deltaCents: number;
  readonly reason: string;
  readonly createdAt: string;
  readonly createdBy: string | null;
}

export type PaymentState = "unpaid" | "partially_paid" | "paid" | "overpaid";

/** One frozen payroll snapshot with its own ledger, attributed to one source and scope. */
export interface PayrollEntry {
  readonly periodId: number;
  readonly source: AttendanceProvider;
  readonly sourceRef: string;
  readonly organizationId: string;
  readonly locationId: string | null;
  readonly employeeKey: EmployeeKey;
  readonly employeeName: string;
  readonly periodMonth: string;
  readonly status: "draft" | "locked";
  readonly hoursSnapshot: number;
  readonly rateCents: number;
  /** Frozen snapshot amount (`payroll_periods.gross_cents`) — never recomputed. */
  readonly baseCents: number;
  /** Σ stored adjustment deltas (balance convention: subtracted). */
  readonly adjustmentDeltaCents: number;
  /** Effect on the amount owed (`−Σ delta`); what the register shows as "Adjustments". */
  readonly adjustmentEffectCents: number;
  /** `base + adjustment effect`: the amount owed after adjustments, before payments. */
  readonly grossAfterAdjustmentsCents: number;
  readonly confirmedPaymentsCents: number;
  readonly draftPaymentsCents: number;
  /** `computeBalanceCents` verbatim (may be negative = overpaid). */
  readonly balanceCents: number;
  readonly paymentState: PaymentState;
  readonly payments: readonly PaymentRecord[];
  readonly adjustments: readonly AdjustmentRecord[];
  /** False when the record is in an unresolved conflict and must not enter any total. */
  readonly includedInTotals: boolean;
  readonly currency: typeof REPORT_CURRENCY;
}

export interface RegisterRow {
  readonly key: string;
  readonly employeeKey: EmployeeKey;
  readonly employeeName: string;
  readonly organizationId: string;
  readonly organization: string;
  readonly locationId: string | null;
  readonly branch: string;
  /** `YYYY-MM-01` accounting period, or null for attendance-only rows. */
  readonly payrollPeriodMonth: string | null;
  /** Counted attendance seconds in the period; null when attendance was not requested. */
  readonly attendanceSeconds: number | null;
  readonly unresolvedShifts: number;
  readonly baseCents: number | null;
  readonly adjustmentEffectCents: number | null;
  readonly grossAfterAdjustmentsCents: number | null;
  readonly confirmedPaymentsCents: number | null;
  readonly balanceCents: number | null;
  readonly financialStatus:
    | "No payroll record"
    | "Draft"
    | "Locked — unpaid"
    | "Locked — partially paid"
    | "Locked — paid"
    | "Locked — overpaid"
    | "Excluded — source conflict";
  readonly source: AttendanceProvider | null;
  readonly includedInTotals: boolean;
}

export interface LedgerEntry {
  readonly ref: string;
  readonly kind: "payment" | "adjustment";
  readonly employeeKey: EmployeeKey;
  readonly employeeName: string;
  readonly organizationId: string;
  readonly organization: string;
  readonly locationId: string | null;
  readonly branch: string;
  readonly periodMonth: string;
  /** Signed effect on the amount owed (payment: −amount, adjustment: −delta). */
  readonly effectCents: number;
  readonly amountCents: number;
  readonly eventDate: string;
  readonly status: string;
  readonly description: string;
  readonly actor: string | null;
  readonly remainingBalanceCents: number;
  readonly includedInTotals: boolean;
}

export interface TotalsBlock {
  readonly employees: number;
  readonly attendanceSeconds: number;
  readonly unresolvedShifts: number;
  readonly baseCents: number;
  readonly adjustmentEffectCents: number;
  readonly grossAfterAdjustmentsCents: number;
  readonly confirmedPaymentsCents: number;
  /** Σ max(0, balance) — what is still owed (an overpaid person never offsets another). */
  readonly balanceOwedCents: number;
  /** Σ max(0, −balance) — credit already paid beyond what was owed. */
  readonly overpaidCents: number;
  readonly draftPaymentsCents: number;
  readonly pendingPeriods: number;
  readonly payrollRecords: number;
}

export interface ScopedTotals extends TotalsBlock {
  readonly organizationId: string;
  readonly organization: string;
  readonly locationId: string | null;
  readonly branch: string | null;
}

export interface ExecutiveSummary extends TotalsBlock {
  readonly verifiedEmployees: number;
  readonly unmappedIdentities: number;
  readonly organizationCount: number;
  readonly branchCount: number;
  readonly exceptionCount: number;
  /** True when more than one organization contributes: totals are informational only. */
  readonly informationalAggregate: boolean;
}

export interface ReportPeriodInfo {
  readonly startDate: string;
  readonly endDate: string;
  readonly label: string;
  readonly kind: ReportPeriodKind;
  /** Attendance range, distinct from the payroll accounting months it touches. */
  readonly payrollMonths: readonly string[];
  readonly payrollLabel: string;
}

export interface ReportCompleteness {
  readonly complete: boolean;
  readonly reasons: readonly string[];
}

export interface CombinedReport {
  readonly reference: string;
  readonly generatedAt: string;
  readonly title: string;
  readonly content: ReportContent;
  readonly output: ReportOutputMode;
  readonly period: ReportPeriodInfo;
  readonly organizations: readonly ReportOrganizationRef[];
  readonly branches: readonly ReportBranchRef[];
  readonly employees: readonly ReportEmployee[];
  readonly attendanceSlices: readonly AttendanceSliceSummary[];
  readonly attendanceRows: readonly AttendanceDetailRow[];
  readonly payrollEntries: readonly PayrollEntry[];
  readonly register: readonly RegisterRow[];
  readonly ledger: readonly LedgerEntry[];
  readonly summary: ExecutiveSummary;
  readonly byOrganization: readonly ScopedTotals[];
  readonly byBranch: readonly ScopedTotals[];
  readonly exceptions: readonly ReportException[];
  readonly completeness: ReportCompleteness;
  readonly confidentiality: string;
}

export const REPORT_CONFIDENTIALITY_LABEL =
  "Confidential — contains employee compensation and attendance records. Authorized recipients only.";

export const INFORMATIONAL_AGGREGATE_NOTE =
  "Cross-organization totals are informational aggregates only. Each organization is a separate employer; its payroll obligations are never merged.";

export function profileKey(profileId: string): EmployeeKey {
  return `profile:${profileId}`;
}

export function neonKey(
  organizationId: string,
  neonUserId: number,
): EmployeeKey {
  return `neon:${organizationId}:${neonUserId}`;
}
