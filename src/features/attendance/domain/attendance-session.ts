/**
 * V2-006.002 — Internal Attendance Session & Event Domain Models (pure domain).
 *
 * Defines the core types, status transitions, duration computations,
 * and presentation formats for native Lineup attendance.
 *
 * BREAK-PAY POLICY: the owner has not decided whether breaks are paid. Nothing in this
 * module assumes a policy. Gross elapsed time and break time are facts; payable time is
 * only produced when EVERY break has been explicitly classified paid/unpaid, otherwise
 * it is `null` ("unresolved") and must be presented as such — never as zero or a guess.
 */

import type { Database } from "@/types/database.generated";

export type AttendanceSessionStatus =
  Database["public"]["Enums"]["attendance_session_status"];
export type AttendanceEventType =
  Database["public"]["Enums"]["attendance_event_type"];
export type AttendanceEventSource =
  Database["public"]["Enums"]["attendance_event_source"];
export type AttendanceBreakPayClassification =
  Database["public"]["Enums"]["attendance_break_pay_classification"];

export interface AttendanceBreakModel {
  readonly id: number;
  readonly sessionId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly profileId: string;
  readonly startTime: string; // ISO UTC instant
  readonly endTime: string | null; // ISO UTC instant or null if open
  readonly durationSeconds: number | null;
  readonly payClassification: AttendanceBreakPayClassification;
  readonly classifiedBy: string | null;
  readonly classifiedAt: string | null;
}

export interface AttendanceEventModel {
  readonly id: number;
  readonly sessionId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly profileId: string;
  readonly eventType: AttendanceEventType;
  readonly eventTime: string; // ISO UTC instant
  readonly serviceDate: string; // YYYY-MM-DD in location timezone
  readonly source: AttendanceEventSource;
  readonly idempotencyKey: string | null;
  readonly actorProfileId: string;
  readonly isManagerCorrection: boolean;
  readonly reversesEventId: number | null;
  readonly correctionReason: string | null;
  readonly metadata: Record<string, unknown>;
}

export interface AttendanceSessionModel {
  readonly id: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly profileId: string;
  readonly serviceDate: string; // YYYY-MM-DD
  readonly status: AttendanceSessionStatus;
  readonly clockInAt: string; // ISO UTC instant
  readonly clockOutAt: string | null; // ISO UTC instant
  /** Elapsed time between the two absolute instants. Null while the session is open. */
  readonly grossElapsedSeconds: number | null;
  /** Sum of ALL closed break durations, regardless of pay classification. */
  readonly totalBreakSeconds: number;
  readonly createdBy: string;
  readonly updatedBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Gross elapsed whole seconds between two absolute instants, or `null` when either
 * instant is invalid or the interval is negative. Policy-neutral: no break is
 * subtracted. Operates on epoch milliseconds — never string or wall-clock arithmetic,
 * so overnight shifts and DST transitions are exact.
 */
export function computeGrossElapsedSeconds(
  clockInIso: string | Date,
  clockOutIso: string | Date,
): number | null {
  const clockInMs =
    clockInIso instanceof Date
      ? clockInIso.getTime()
      : new Date(clockInIso).getTime();
  const clockOutMs =
    clockOutIso instanceof Date
      ? clockOutIso.getTime()
      : new Date(clockOutIso).getTime();

  if (
    Number.isNaN(clockInMs) ||
    Number.isNaN(clockOutMs) ||
    clockOutMs < clockInMs
  ) {
    return null;
  }

  return Math.floor((clockOutMs - clockInMs) / 1000);
}

export interface BreakPayInput {
  readonly durationSeconds: number | null;
  readonly endTime: string | null;
  readonly payClassification: AttendanceBreakPayClassification;
}

export interface SessionBreakPaySummary {
  readonly paidBreakSeconds: number;
  readonly unpaidBreakSeconds: number;
  readonly unclassifiedBreakSeconds: number;
  readonly openBreakCount: number;
  readonly breakCount: number;
  /** True only when the session is closed and every break is explicitly classified. */
  readonly breakPolicyResolved: boolean;
  /**
   * Gross elapsed minus CONFIRMED-unpaid break time. `null` whenever the result would
   * depend on an assumption (open session, open break, or any unclassified break).
   */
  readonly netPayableSeconds: number | null;
}

/**
 * Mirrors the `attendance_session_summaries` database view so the UI and tests can
 * reason about a session without a round trip. An unclassified break is NEVER counted
 * as unpaid.
 */
export function summarizeSessionBreakPay(input: {
  readonly status: AttendanceSessionStatus;
  readonly grossElapsedSeconds: number | null;
  readonly breaks: readonly BreakPayInput[];
}): SessionBreakPaySummary {
  let paid = 0;
  let unpaid = 0;
  let unclassified = 0;
  let open = 0;
  let unclassifiedCount = 0;

  for (const b of input.breaks) {
    const seconds = b.durationSeconds ?? 0;
    if (b.endTime === null) open += 1;
    if (b.payClassification === "paid") paid += seconds;
    else if (b.payClassification === "unpaid") unpaid += seconds;
    else {
      unclassified += seconds;
      unclassifiedCount += 1;
    }
  }

  const closed =
    input.status === "completed" || input.status === "auto_clocked_out";
  const resolved = closed && open === 0 && unclassifiedCount === 0;

  return {
    paidBreakSeconds: paid,
    unpaidBreakSeconds: unpaid,
    unclassifiedBreakSeconds: unclassified,
    openBreakCount: open,
    breakCount: input.breaks.length,
    breakPolicyResolved: resolved,
    netPayableSeconds:
      resolved && input.grossElapsedSeconds !== null
        ? Math.max(0, input.grossElapsedSeconds - unpaid)
        : null,
  };
}

/**
 * Formats seconds into decimal hours with 2 decimal places (e.g. 7.50).
 * `null`/`undefined` means "unknown" and renders as an em dash — never as "0.00".
 */
export function formatWorkedHours(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds <= 0) return "0.00";
  const hours = seconds / 3600;
  return hours.toFixed(2);
}

/**
 * Formats seconds into human-readable "Xh Ym" (e.g. "7h 30m").
 * `null`/`undefined` means "unknown" and renders as an em dash — never as "0m".
 */
export function formatWorkedDuration(
  seconds: number | null | undefined,
): string {
  if (seconds == null) return "—";
  if (seconds <= 0) return "0m";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
