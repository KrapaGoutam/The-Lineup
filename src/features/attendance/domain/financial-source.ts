/**
 * V2-006.006 / .007 — canonical, provenance-aware attendance source contract for the
 * financial consumers (Payroll, Tips). Pure domain: no I/O, no money, no wage rules.
 *
 * What this is: a way to describe ONE attendance record from EITHER source (native
 * TheLineup or the external Neon clock) and to say, with reasons, whether it may be
 * consumed financially. It is the shared shape both adapters produce.
 *
 * What this is NOT: a payroll engine. It never multiplies by a rate, never rounds money,
 * never applies overtime/holiday/rounding rules (none are approved — see OWNER POLICY
 * below), and it does not write anything. Payroll keeps its own formula
 * (`computeGrossCents`) and Tips keep their own interval allocation.
 *
 * HONESTY RULES (each is covered by a test):
 *  - A missing/unresolved quantity is `null` / an ineligibility reason, NEVER zero.
 *  - An unavailable, failed or forbidden source read is a distinct outcome, NEVER an empty
 *    or zero-hour result.
 *  - An external record never claims internal audit guarantees: fields the external source
 *    cannot supply are `null`, and `audit` says `none_provided`.
 *  - One source per location and period: native and external records are never merged.
 *
 * OWNER POLICY: Q1 (break classification), Q4 (payroll rules) and Q6 (corrections after a
 * confirmed period) have NO recorded approval. Therefore native attendance is not an
 * active financial source: `evaluateFinancialActivation` reports it as blocked until all
 * three are approved. The adapters still work and are fully testable against explicitly
 * synthetic approvals.
 */

import { zonedWallTimeFromInstant } from "@/lib/timezone";

import { computeGrossElapsedSeconds } from "./attendance-session";
import { decideReportSource } from "./attendance-source";

// ─── Sources and configuration states ───────────────────────────────────────────────

/** Where a record actually came from. Only these two produce attendance records. */
export type AttendanceRecordSource = "INTERNAL_THE_LINEUP" | "EXTERNAL_NEON";

/** The per-location configuration state; DISABLED/UNCONFIGURED never produce records. */
export type AttendanceConfigState =
  | "INTERNAL_THE_LINEUP"
  | "EXTERNAL"
  | "DISABLED"
  | "UNCONFIGURED";

export interface FinancialSourceDecision {
  readonly state: AttendanceConfigState;
  /** The record source to read, or `null` when no attendance-derived hours exist. */
  readonly recordSource: AttendanceRecordSource | null;
  /**
   * `true` only for UNCONFIGURED: the pre-V2 legacy behaviour (existing external reader)
   * is kept, and native attendance is never implied.
   */
  readonly legacyCompatible: boolean;
}

/**
 * Which record source a location's financial attendance comes from. Mirrors the report
 * source decision so the report and the financial feed can never disagree.
 */
export function resolveFinancialSource(
  rawMode: string | null | undefined,
): FinancialSourceDecision {
  switch (decideReportSource(rawMode).source) {
    case "internal":
      return {
        state: "INTERNAL_THE_LINEUP",
        recordSource: "INTERNAL_THE_LINEUP",
        legacyCompatible: false,
      };
    case "external":
      return {
        state: "EXTERNAL",
        recordSource: "EXTERNAL_NEON",
        legacyCompatible: false,
      };
    case "disabled":
      return { state: "DISABLED", recordSource: null, legacyCompatible: false };
    case "unconfigured":
      return {
        state: "UNCONFIGURED",
        recordSource: "EXTERNAL_NEON",
        legacyCompatible: true,
      };
  }
}

// ─── Owner policy gate ──────────────────────────────────────────────────────────────

export type PolicyApproval = "approved" | "not_approved";

export interface FinancialPolicyApprovals {
  /** Q1 — how breaks are classified paid/unpaid. */
  readonly q1BreakClassification: PolicyApproval;
  /** Q4 — which existing payroll rules apply to native attendance hours. */
  readonly q4PayrollRules: PolicyApproval;
  /** Q6 — what happens to a correction after a period is confirmed. */
  readonly q6ConfirmedPeriodCorrections: PolicyApproval;
}

/**
 * The ACTIVATION record for native attendance as a financial source.
 *
 * On 2026-11-10 the owner approved the DECISIONS Q1, Q4, Q6, Q9 and Q9b (V2-006 R2) and
 * authorized local implementation, but expressly did NOT authorize activating native
 * financial processing, real payments, hosted DEV (Q8), or backend enforcement. This record
 * is the application-level activation gate, so it intentionally stays `not_approved`; the
 * database has its own independent switch (`attendance_financial_activation.enabled`,
 * default off). Opening the gate is the activation step: it needs the owner's written
 * activation authorization and its own reviewed PR. Tests never flip this constant; they
 * pass synthetic approvals.
 */
export const RECORDED_FINANCIAL_POLICY_APPROVALS: FinancialPolicyApprovals = {
  q1BreakClassification: "not_approved",
  q4PayrollRules: "not_approved",
  q6ConfirmedPeriodCorrections: "not_approved",
};

export type FinancialActivation =
  | { readonly status: "ACTIVE"; readonly basis: "approved_policy" }
  | { readonly status: "ACTIVE_LEGACY_UNCHANGED" }
  | { readonly status: "NO_ATTENDANCE_HOURS" }
  | {
      readonly status: "BLOCKED_POLICY";
      readonly pending: readonly (keyof FinancialPolicyApprovals)[];
    };

/**
 * Whether the decided source may feed real Payroll/Tips. External and unconfigured keep
 * their existing, unchanged legacy path (this module neither enables nor disables it).
 * Native attendance needs ALL of Q1, Q4 and Q6.
 */
export function evaluateFinancialActivation(
  decision: FinancialSourceDecision,
  approvals: FinancialPolicyApprovals = RECORDED_FINANCIAL_POLICY_APPROVALS,
): FinancialActivation {
  if (decision.state === "DISABLED") return { status: "NO_ATTENDANCE_HOURS" };
  if (decision.recordSource === "EXTERNAL_NEON") {
    return { status: "ACTIVE_LEGACY_UNCHANGED" };
  }
  const pending = (
    Object.keys(approvals) as (keyof FinancialPolicyApprovals)[]
  ).filter((key) => approvals[key] !== "approved");
  if (pending.length > 0) return { status: "BLOCKED_POLICY", pending };
  return { status: "ACTIVE", basis: "approved_policy" };
}

// ─── Eligibility vocabulary ─────────────────────────────────────────────────────────

export type IneligibilityReason =
  | "VOIDED"
  | "OPEN_SESSION"
  | "OPEN_BREAK"
  | "UNCLASSIFIED_BREAK"
  /** Reserved status; no auto-clock-out policy is approved (Q2), so it is never trusted. */
  | "AUTO_CLOCK_OUT_UNAPPROVED"
  | "INCONSISTENT_RECORD"
  | "NEGATIVE_DURATION"
  | "DURATION_MISMATCH"
  | "SERVICE_DATE_MISMATCH"
  | "ORGANIZATION_MISMATCH"
  | "LOCATION_MISMATCH"
  | "EMPLOYEE_MISMATCH"
  | "IDENTITY_UNMAPPED"
  | "IDENTITY_AMBIGUOUS"
  | "HOURS_NOT_RECORDED"
  | "OUTSIDE_PERIOD"
  /** Shift ends after the period does; allocation across periods is undefined, so it is surfaced, never split or clipped. */
  | "PERIOD_BOUNDARY"
  | "DUPLICATE_SOURCE_RECORD"
  | "ALREADY_CONSUMED";

/** Primary status of a record; the first matching of these wins (see `statusFor`). */
export type RecordStatus =
  | "COMPLETE_AND_RESOLVED"
  | "OPEN_SESSION"
  | "UNCLASSIFIED_BREAK"
  | "VOIDED"
  | "INELIGIBLE";

/** How payable time is represented: never a bare number that could hide "unknown". */
export type PayableTime =
  | { readonly kind: "seconds"; readonly seconds: number }
  | { readonly kind: "hours_reported_by_source"; readonly hours: number }
  | { readonly kind: "unresolved" };

export interface AttendanceFinancialRecord {
  readonly attendanceSource: AttendanceRecordSource;
  readonly organizationId: string;
  /** `null` for external records: the Neon clock carries no verified location. */
  readonly locationId: string | null;
  /** Canonical profile id. `null` when an external record has no (or an ambiguous) mapping. */
  readonly employeeId: string | null;
  /** Neon user id; external records only. */
  readonly externalUserId: number | null;
  /** Stable identity of the source row: the session uuid, or `neon:<row id>`. */
  readonly sourceRecordId: string;
  /** Native session id; `null` for external records. */
  readonly sessionId: string | null;
  readonly serviceDate: string;
  /** IANA zone used for service-date grouping; `null` for external records. */
  readonly locationTimezone: string | null;
  readonly clockInAt: string | null;
  readonly clockOutAt: string | null;
  readonly grossElapsedSeconds: number | null;
  /** Internal only: the source does not split breaks externally. */
  readonly totalBreakSeconds: number | null;
  readonly confirmedUnpaidBreakSeconds: number | null;
  readonly payable: PayableTime;
  readonly isClosed: boolean;
  /** `null` for external: not provided by the source. */
  readonly breakPolicyResolved: boolean | null;
  /** `null` for external: the source cannot say whether a row was corrected. */
  readonly isCorrected: boolean | null;
  /** Native session version (bumped on every change); `null` for external. */
  readonly correctionVersion: number | null;
  readonly lastCorrectedAt: string | null;
  /** External flag only (`null` natively). Existing payroll counts such hours; preserved. */
  readonly autoClockedOut: boolean | null;
  /** Native ledger is append-only and attributed; external rows carry no such guarantee. */
  readonly audit: "append_only_ledger" | "none_provided";
  readonly recordStatus: RecordStatus;
  readonly isFinanciallyEligible: boolean;
  readonly ineligibilityReasons: readonly IneligibilityReason[];
}

// ─── Read outcomes ──────────────────────────────────────────────────────────────────

/**
 * The result of reading a source. Failures are first-class and distinct: an unavailable
 * service, an internal error and a denied caller are NOT an empty set of records.
 */
export type AttendanceSourceRead =
  | {
      readonly status: "OK";
      readonly source: AttendanceRecordSource;
      readonly records: readonly AttendanceFinancialRecord[];
      /** `true` when the row cap was hit; totals are then incomplete. */
      readonly truncated: boolean;
    }
  | { readonly status: "NOT_APPLICABLE"; readonly state: "DISABLED" }
  | {
      readonly status: "SOURCE_UNAVAILABLE";
      readonly source: AttendanceRecordSource;
    }
  | { readonly status: "SOURCE_ERROR"; readonly source: AttendanceRecordSource }
  | { readonly status: "ACCESS_DENIED" };

// ─── Period handling ────────────────────────────────────────────────────────────────

export interface ServicePeriod {
  /** Inclusive location-local service dates, `YYYY-MM-DD`. */
  readonly startDate: string;
  readonly endDate: string;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

// ─── Native adapter ─────────────────────────────────────────────────────────────────

/** One row of `attendance_session_summaries`, already validated non-null where required. */
export interface NativeSummaryInput {
  readonly sessionId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly profileId: string;
  readonly serviceDate: string;
  readonly status:
    | "active"
    | "on_break"
    | "completed"
    | "auto_clocked_out"
    | "voided";
  readonly clockInAt: string;
  readonly clockOutAt: string | null;
  readonly grossElapsedSeconds: number | null;
  readonly totalBreakSeconds: number;
  readonly unpaidBreakSeconds: number;
  readonly openBreakCount: number;
  readonly breakPolicyResolved: boolean;
  readonly netPayableSeconds: number | null;
  readonly version: number;
  readonly correctionCount: number;
  readonly lastCorrectedAt: string | null;
}

export interface NativeEvaluationContext {
  readonly expected: {
    readonly organizationId: string;
    readonly locationId: string;
    /** When set, the record must belong to this employee. */
    readonly profileId?: string;
  };
  readonly timeZone: string;
  readonly period?: ServicePeriod;
  /** Source ids a consumer has already used; reuse is surfaced, never silently repeated. */
  readonly alreadyConsumedSourceIds?: ReadonlySet<string>;
}

function statusFor(reasons: readonly IneligibilityReason[]): RecordStatus {
  if (reasons.length === 0) return "COMPLETE_AND_RESOLVED";
  if (reasons.includes("VOIDED")) return "VOIDED";
  if (reasons.includes("OPEN_SESSION") || reasons.includes("OPEN_BREAK")) {
    return "OPEN_SESSION";
  }
  if (reasons.includes("UNCLASSIFIED_BREAK")) return "UNCLASSIFIED_BREAK";
  return "INELIGIBLE";
}

/**
 * Evaluates ONE native session. A completed clock-out is necessary but never sufficient:
 * the break policy must be resolved, durations must agree with the absolute instants, and
 * the record must belong to the expected tenant/location/period.
 */
export function evaluateNativeSession(
  row: NativeSummaryInput,
  ctx: NativeEvaluationContext,
): AttendanceFinancialRecord {
  const reasons = new Set<IneligibilityReason>();

  // Status gate first: it decides which later checks are even meaningful.
  const open = row.status === "active" || row.status === "on_break";
  if (row.status === "voided") reasons.add("VOIDED");
  else if (open) reasons.add("OPEN_SESSION");
  else if (row.status === "auto_clocked_out") {
    reasons.add("AUTO_CLOCK_OUT_UNAPPROVED");
  }

  // Tenancy: server-expected scope, never trusted from the row's own claim alone.
  if (row.organizationId !== ctx.expected.organizationId) {
    reasons.add("ORGANIZATION_MISMATCH");
  }
  if (row.locationId !== ctx.expected.locationId) {
    reasons.add("LOCATION_MISMATCH");
  }
  if (ctx.expected.profileId && row.profileId !== ctx.expected.profileId) {
    reasons.add("EMPLOYEE_MISMATCH");
  }

  let payable: PayableTime = { kind: "unresolved" };

  if (row.status === "completed") {
    if (!row.clockOutAt || row.grossElapsedSeconds === null) {
      reasons.add("INCONSISTENT_RECORD");
    } else {
      // Independent recomputation from the absolute instants (DST/overnight safe).
      const recomputed = computeGrossElapsedSeconds(
        row.clockInAt,
        row.clockOutAt,
      );
      if (recomputed === null) reasons.add("NEGATIVE_DURATION");
      else if (recomputed !== row.grossElapsedSeconds) {
        reasons.add("DURATION_MISMATCH");
      }
    }

    if (row.openBreakCount > 0) reasons.add("OPEN_BREAK");
    else if (!row.breakPolicyResolved) reasons.add("UNCLASSIFIED_BREAK");

    if (row.breakPolicyResolved && row.openBreakCount === 0) {
      if (row.netPayableSeconds === null) {
        reasons.add("INCONSISTENT_RECORD");
      } else if (row.netPayableSeconds < 0) {
        reasons.add("NEGATIVE_DURATION");
      } else if (
        row.grossElapsedSeconds !== null &&
        row.netPayableSeconds !==
          row.grossElapsedSeconds - row.unpaidBreakSeconds
      ) {
        reasons.add("DURATION_MISMATCH");
      } else {
        payable = { kind: "seconds", seconds: row.netPayableSeconds };
      }
    }
  }

  // The service date is the location-local calendar date of the clock-in instant.
  const clockInMs = Date.parse(row.clockInAt);
  if (Number.isNaN(clockInMs)) {
    reasons.add("INCONSISTENT_RECORD");
  } else if (
    zonedWallTimeFromInstant(new Date(clockInMs), ctx.timeZone).date !==
    row.serviceDate
  ) {
    reasons.add("SERVICE_DATE_MISMATCH");
  }

  if (ctx.period) {
    const { startDate, endDate } = ctx.period;
    if (row.serviceDate < startDate || row.serviceDate > endDate) {
      reasons.add("OUTSIDE_PERIOD");
    } else if (row.clockOutAt) {
      const outMs = Date.parse(row.clockOutAt);
      if (
        !Number.isNaN(outMs) &&
        zonedWallTimeFromInstant(new Date(outMs), ctx.timeZone).date > endDate
      ) {
        reasons.add("PERIOD_BOUNDARY");
      }
    }
  }

  if (ctx.alreadyConsumedSourceIds?.has(row.sessionId)) {
    reasons.add("ALREADY_CONSUMED");
  }

  const ineligibilityReasons = [...reasons];
  const eligible = ineligibilityReasons.length === 0;
  return {
    attendanceSource: "INTERNAL_THE_LINEUP",
    organizationId: row.organizationId,
    locationId: row.locationId,
    employeeId: row.profileId,
    externalUserId: null,
    sourceRecordId: row.sessionId,
    sessionId: row.sessionId,
    serviceDate: row.serviceDate,
    locationTimezone: ctx.timeZone,
    clockInAt: row.clockInAt,
    clockOutAt: row.clockOutAt,
    grossElapsedSeconds: row.grossElapsedSeconds,
    totalBreakSeconds: row.totalBreakSeconds,
    confirmedUnpaidBreakSeconds: row.unpaidBreakSeconds,
    payable: eligible ? payable : { kind: "unresolved" },
    isClosed: row.status === "completed" || row.status === "auto_clocked_out",
    breakPolicyResolved: row.breakPolicyResolved,
    isCorrected: row.correctionCount > 0,
    correctionVersion: row.version,
    lastCorrectedAt: row.lastCorrectedAt,
    autoClockedOut: null,
    audit: "append_only_ledger",
    recordStatus: statusFor(ineligibilityReasons),
    isFinanciallyEligible: eligible,
    ineligibilityReasons,
  };
}

// ─── External (Neon) adapter ────────────────────────────────────────────────────────

/** Shape of the existing Neon reader's row (`NeonAttendanceRow`); duplicated structurally. */
export interface ExternalRowInput {
  readonly id: number;
  readonly userId: number;
  /** Plain calendar date `YYYY-MM-DD` exactly as the existing query returns it. */
  readonly date: string;
  readonly clockIn: string | null;
  readonly clockOut: string | null;
  readonly hoursWorked: number | null;
  readonly autoClockedOut: boolean;
}

export interface ExternalEvaluationContext {
  readonly organizationId: string;
  /**
   * Neon user id → profile ids linked to it (`attendance_identity_links`). A list, so an
   * ambiguous mapping is detectable rather than silently collapsed to one person.
   */
  readonly identity: ReadonlyMap<number, readonly string[]>;
  /**
   * `true` when the consumer needs a profile (e.g. Tips matching a roster). Existing
   * Payroll is keyed by Neon user id, so it does not require a mapping.
   */
  readonly requireProfileIdentity: boolean;
  readonly period?: ServicePeriod;
  readonly alreadyConsumedSourceIds?: ReadonlySet<string>;
}

/**
 * Translates one existing Neon row WITHOUT changing the rules existing Payroll applies to
 * it: hours are the source's own `hours_worked`; a row without recorded hours is excluded
 * (as `aggregateHours` already does) but is now surfaced with a reason; the Neon `date`
 * decides the period; an auto-closed row with hours still counts. Nothing is invented.
 */
export function evaluateExternalRow(
  row: ExternalRowInput,
  ctx: ExternalEvaluationContext,
): AttendanceFinancialRecord {
  const reasons = new Set<IneligibilityReason>();

  const linked = ctx.identity.get(row.userId) ?? [];
  let employeeId: string | null = null;
  if (linked.length === 1) employeeId = linked[0];
  if (ctx.requireProfileIdentity) {
    if (linked.length === 0) reasons.add("IDENTITY_UNMAPPED");
    else if (linked.length > 1) reasons.add("IDENTITY_AMBIGUOUS");
  }

  const hours = row.hoursWorked;
  let payable: PayableTime = { kind: "unresolved" };
  if (hours === null) {
    reasons.add(
      row.clockIn && !row.clockOut ? "OPEN_SESSION" : "HOURS_NOT_RECORDED",
    );
  } else if (!Number.isFinite(hours) || hours < 0) {
    reasons.add("NEGATIVE_DURATION");
  } else {
    payable = { kind: "hours_reported_by_source", hours };
  }

  if (!isValidDate(row.date)) reasons.add("INCONSISTENT_RECORD");
  else if (
    ctx.period &&
    (row.date < ctx.period.startDate || row.date > ctx.period.endDate)
  ) {
    reasons.add("OUTSIDE_PERIOD");
  }

  const sourceRecordId = `neon:${row.id}`;
  if (ctx.alreadyConsumedSourceIds?.has(sourceRecordId)) {
    reasons.add("ALREADY_CONSUMED");
  }

  const ineligibilityReasons = [...reasons];
  const eligible = ineligibilityReasons.length === 0;
  return {
    attendanceSource: "EXTERNAL_NEON",
    organizationId: ctx.organizationId,
    locationId: null,
    employeeId,
    externalUserId: row.userId,
    sourceRecordId,
    sessionId: null,
    serviceDate: row.date,
    locationTimezone: null,
    clockInAt: row.clockIn,
    clockOutAt: row.clockOut,
    // The source reports hours only; instants are passed through but not used to derive them.
    grossElapsedSeconds: null,
    totalBreakSeconds: null,
    confirmedUnpaidBreakSeconds: null,
    payable: eligible ? payable : { kind: "unresolved" },
    isClosed: row.clockOut !== null || row.autoClockedOut,
    breakPolicyResolved: null,
    isCorrected: null,
    correctionVersion: null,
    lastCorrectedAt: null,
    autoClockedOut: row.autoClockedOut,
    audit: "none_provided",
    recordStatus: statusFor(ineligibilityReasons),
    isFinanciallyEligible: eligible,
    ineligibilityReasons,
  };
}

// ─── Collections: duplicates and summaries ──────────────────────────────────────────

/**
 * Marks every repeat of a source record as a duplicate so a row delivered twice (a retry,
 * an overlapping query) can never be counted twice. The FIRST occurrence is kept as-is.
 */
export function flagDuplicateSourceRecords(
  records: readonly AttendanceFinancialRecord[],
): AttendanceFinancialRecord[] {
  const seen = new Set<string>();
  return records.map((record) => {
    if (!seen.has(record.sourceRecordId)) {
      seen.add(record.sourceRecordId);
      return record;
    }
    const ineligibilityReasons = record.ineligibilityReasons.includes(
      "DUPLICATE_SOURCE_RECORD",
    )
      ? record.ineligibilityReasons
      : [...record.ineligibilityReasons, "DUPLICATE_SOURCE_RECORD" as const];
    return {
      ...record,
      payable: { kind: "unresolved" },
      isFinanciallyEligible: false,
      ineligibilityReasons,
      recordStatus: statusFor(ineligibilityReasons),
    };
  });
}

export interface EmployeeReadiness {
  /** Native: profile id. External without a mapping: `null` (keyed by `externalUserId`). */
  readonly employeeId: string | null;
  readonly externalUserId: number | null;
  readonly eligibleCount: number;
  readonly excludedCount: number;
  /** Sum over eligible native records only. */
  readonly eligibleSeconds: number;
  /** Sum over eligible external records only (the source's own hours). */
  readonly eligibleReportedHours: number;
  /**
   * `true` only when EVERY record of this employee is eligible. The sums above are partial
   * whenever this is `false` and must never be presented as the employee's total.
   */
  readonly finalizable: boolean;
  readonly excluded: readonly {
    readonly sourceRecordId: string;
    readonly serviceDate: string;
    readonly recordStatus: RecordStatus;
    readonly reasons: readonly IneligibilityReason[];
  }[];
}

export interface FinancialReadiness {
  readonly source: AttendanceRecordSource;
  readonly recordCount: number;
  readonly eligibleCount: number;
  readonly excludedCount: number;
  readonly excludedByReason: Readonly<
    Partial<Record<IneligibilityReason, number>>
  >;
  /** `true` only when nothing is excluded and the read was not truncated. */
  readonly totalsComplete: boolean;
  readonly truncated: boolean;
  readonly employees: readonly EmployeeReadiness[];
}

/**
 * Summarises one source read. Excluded records are always listed with their reasons and
 * are NEVER folded into a total as zero. `totalsComplete` is the single flag a consumer
 * must check before presenting a figure as final.
 */
export function summarizeFinancialReadiness(
  source: AttendanceRecordSource,
  records: readonly AttendanceFinancialRecord[],
  truncated = false,
): FinancialReadiness {
  const byEmployee = new Map<string, EmployeeReadiness>();
  const excludedByReason: Partial<Record<IneligibilityReason, number>> = {};
  let eligibleCount = 0;

  for (const record of records) {
    const key =
      record.employeeId !== null
        ? `p:${record.employeeId}`
        : `x:${record.externalUserId ?? record.sourceRecordId}`;
    const current: EmployeeReadiness = byEmployee.get(key) ?? {
      employeeId: record.employeeId,
      externalUserId: record.externalUserId,
      eligibleCount: 0,
      excludedCount: 0,
      eligibleSeconds: 0,
      eligibleReportedHours: 0,
      finalizable: true,
      excluded: [],
    };

    if (record.isFinanciallyEligible) {
      eligibleCount += 1;
      byEmployee.set(key, {
        ...current,
        eligibleCount: current.eligibleCount + 1,
        eligibleSeconds:
          current.eligibleSeconds +
          (record.payable.kind === "seconds" ? record.payable.seconds : 0),
        eligibleReportedHours:
          current.eligibleReportedHours +
          (record.payable.kind === "hours_reported_by_source"
            ? record.payable.hours
            : 0),
      });
    } else {
      for (const reason of record.ineligibilityReasons) {
        excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1;
      }
      byEmployee.set(key, {
        ...current,
        excludedCount: current.excludedCount + 1,
        finalizable: false,
        excluded: [
          ...current.excluded,
          {
            sourceRecordId: record.sourceRecordId,
            serviceDate: record.serviceDate,
            recordStatus: record.recordStatus,
            reasons: record.ineligibilityReasons,
          },
        ],
      });
    }
  }

  const excludedCount = records.length - eligibleCount;
  return {
    source,
    recordCount: records.length,
    eligibleCount,
    excludedCount,
    excludedByReason,
    totalsComplete: excludedCount === 0 && !truncated,
    truncated,
    employees: [...byEmployee.values()],
  };
}

// ─── Corrections after a snapshot ───────────────────────────────────────────────────

export interface PostSnapshotCorrection {
  readonly sourceRecordId: string;
  readonly employeeId: string | null;
  readonly serviceDate: string;
  readonly correctionVersion: number;
  readonly lastCorrectedAt: string;
}

/**
 * Detects native records corrected AFTER a financial snapshot was taken (a payroll period
 * generated/locked, or a tip pool confirmed). Detection only: it creates no adjustment and
 * changes nothing. Handling a correction against a confirmed period is owner decision Q6;
 * until it is approved a hit must be shown to an authorised reviewer, not auto-posted.
 * External records can never appear here: the source cannot say when a row was corrected.
 */
export function detectCorrectionsAfterSnapshot(
  records: readonly AttendanceFinancialRecord[],
  snapshotAtIso: string,
): PostSnapshotCorrection[] {
  const snapshotMs = Date.parse(snapshotAtIso);
  if (Number.isNaN(snapshotMs)) return [];
  const hits: PostSnapshotCorrection[] = [];
  for (const record of records) {
    if (record.attendanceSource !== "INTERNAL_THE_LINEUP") continue;
    if (!record.lastCorrectedAt || record.correctionVersion === null) continue;
    const correctedMs = Date.parse(record.lastCorrectedAt);
    if (!Number.isNaN(correctedMs) && correctedMs > snapshotMs) {
      hits.push({
        sourceRecordId: record.sourceRecordId,
        employeeId: record.employeeId,
        serviceDate: record.serviceDate,
        correctionVersion: record.correctionVersion,
        lastCorrectedAt: record.lastCorrectedAt,
      });
    }
  }
  return hits;
}

// ─── Presentation vocabulary ────────────────────────────────────────────────────────

/** Plain-language reason, written for a manager deciding what to fix. */
export const INELIGIBILITY_LABELS: Readonly<
  Record<IneligibilityReason, string>
> = {
  VOIDED: "Voided shift",
  OPEN_SESSION: "Shift still open",
  OPEN_BREAK: "Break still open",
  UNCLASSIFIED_BREAK: "Break not yet decided paid or unpaid",
  AUTO_CLOCK_OUT_UNAPPROVED: "Closed automatically (no approved rule)",
  INCONSISTENT_RECORD: "Record is incomplete or inconsistent",
  NEGATIVE_DURATION: "Clock-out is before clock-in, or time is negative",
  DURATION_MISMATCH: "Stored hours do not match the clock times",
  SERVICE_DATE_MISMATCH: "Service date does not match the clock-in time",
  ORGANIZATION_MISMATCH: "Belongs to a different organization",
  LOCATION_MISMATCH: "Belongs to a different location",
  EMPLOYEE_MISMATCH: "Belongs to a different employee",
  IDENTITY_UNMAPPED: "Employee is not linked to an account",
  IDENTITY_AMBIGUOUS: "Employee link is ambiguous",
  HOURS_NOT_RECORDED: "No hours recorded",
  OUTSIDE_PERIOD: "Outside the selected dates",
  PERIOD_BOUNDARY: "Shift runs past the end of the selected dates",
  DUPLICATE_SOURCE_RECORD: "Duplicate of another record",
  ALREADY_CONSUMED: "Already used",
};

const POLICY_LABELS: Readonly<Record<keyof FinancialPolicyApprovals, string>> =
  {
    q1BreakClassification: "how breaks are classified paid or unpaid",
    q4PayrollRules: "which payroll rules apply",
    q6ConfirmedPeriodCorrections:
      "how corrections after a confirmed period are handled",
  };

/** One sentence a manager can read; names exactly which owner decisions are pending. */
export function describeActivation(activation: FinancialActivation): string {
  switch (activation.status) {
    case "ACTIVE":
      return "Approved for payroll.";
    case "ACTIVE_LEGACY_UNCHANGED":
      return "External attendance keeps its existing payroll and tip behaviour.";
    case "NO_ATTENDANCE_HOURS":
      return "Attendance is off, so no attendance hours are used.";
    case "BLOCKED_POLICY":
      return `Not used for payroll or tips yet. Waiting on the owner to decide: ${activation.pending
        .map((key) => POLICY_LABELS[key])
        .join("; ")}.`;
  }
}
