/**
 * V2-006.005 — Native (TheLineup Internal) attendance report model (pure domain).
 *
 * Provenance: every row produced here is `internal_the_lineup`. External (Neon) rows are
 * never mixed into this model and native rows are never converted into Neon rows.
 *
 * No financial figure is produced. Totals keep gross, break and payable time separate and
 * report how many sessions are still unresolved, so a total can never look more certain
 * than the data behind it.
 */

import { zonedWallTimeFromInstant } from "@/lib/timezone";

import type { AttendanceSessionStatus } from "./attendance-session";

export const NATIVE_REPORT_SOURCE = "internal_the_lineup" as const;
export const NATIVE_REPORT_SOURCE_LABEL = "TheLineup Internal";

export type NativeSessionState =
  | "open"
  | "open_across_midnight"
  | "completed"
  | "voided";

export interface NativeReportRow {
  readonly sessionId: string;
  readonly profileId: string;
  readonly employeeName: string;
  readonly locationId: string;
  readonly serviceDate: string; // YYYY-MM-DD, location-local
  readonly status: AttendanceSessionStatus;
  readonly clockInAt: string; // ISO instant
  readonly clockOutAt: string | null; // ISO instant
  readonly grossElapsedSeconds: number | null;
  readonly totalBreakSeconds: number;
  readonly paidBreakSeconds: number;
  readonly unpaidBreakSeconds: number;
  readonly unclassifiedBreakSeconds: number;
  readonly openBreakCount: number;
  readonly breakCount: number;
  readonly breakPolicyResolved: boolean;
  /** Null whenever payable time would depend on an assumption. */
  readonly netPayableSeconds: number | null;
  readonly version: number;
  readonly correctionCount: number;
  readonly lastCorrectedAt: string | null;
  readonly source: typeof NATIVE_REPORT_SOURCE;
  readonly timeZone: string;
}

/**
 * Display-only classification of a session. `open_across_midnight` means the session is
 * still open and its service date is before the location's current local date. It is NOT
 * a policy threshold and nothing is closed or altered because of it; it only tells a
 * manager that an open shift needs a look.
 */
export function classifySessionState(
  row: Pick<NativeReportRow, "status" | "serviceDate">,
  todayLocalDate: string,
): NativeSessionState {
  if (row.status === "voided") return "voided";
  if (row.status === "active" || row.status === "on_break") {
    return row.serviceDate < todayLocalDate ? "open_across_midnight" : "open";
  }
  return "completed";
}

/** Seconds a session has been open as of `nowMs` (display only). */
export function openElapsedSeconds(
  row: Pick<NativeReportRow, "clockInAt" | "clockOutAt" | "status">,
  nowMs: number,
): number | null {
  if (row.status !== "active" && row.status !== "on_break") return null;
  const inMs = new Date(row.clockInAt).getTime();
  if (Number.isNaN(inMs)) return null;
  return Math.max(0, Math.floor((nowMs - inMs) / 1000));
}

export interface NativeReportTotals {
  readonly sessionCount: number;
  readonly closedSessionCount: number;
  readonly openSessionCount: number;
  readonly voidedSessionCount: number;
  readonly correctedSessionCount: number;
  /** Gross elapsed time of CLOSED, non-voided sessions only. */
  readonly grossSeconds: number;
  readonly breakSeconds: number;
  readonly paidBreakSeconds: number;
  readonly unpaidBreakSeconds: number;
  readonly unclassifiedBreakSeconds: number;
  /**
   * Payable time summed over RESOLVED sessions only. Sessions with an open or
   * unclassified break are excluded and counted in `unresolvedSessionCount`, so this is
   * a lower bound, never a guess.
   */
  readonly resolvedNetPayableSeconds: number;
  readonly resolvedSessionCount: number;
  readonly unresolvedSessionCount: number;
}

export function summarizeNativeReport(
  rows: readonly NativeReportRow[],
): NativeReportTotals {
  let closed = 0;
  let open = 0;
  let voided = 0;
  let corrected = 0;
  let gross = 0;
  let breaks = 0;
  let paid = 0;
  let unpaid = 0;
  let unclassified = 0;
  let net = 0;
  let resolved = 0;
  let unresolved = 0;

  for (const row of rows) {
    if (row.correctionCount > 0) corrected += 1;
    if (row.status === "voided") {
      voided += 1;
      continue;
    }
    if (row.status === "active" || row.status === "on_break") {
      open += 1;
      continue;
    }
    closed += 1;
    gross += row.grossElapsedSeconds ?? 0;
    breaks += row.totalBreakSeconds;
    paid += row.paidBreakSeconds;
    unpaid += row.unpaidBreakSeconds;
    unclassified += row.unclassifiedBreakSeconds;
    if (row.netPayableSeconds !== null) {
      net += row.netPayableSeconds;
      resolved += 1;
    } else {
      unresolved += 1;
    }
  }

  return {
    sessionCount: rows.length,
    closedSessionCount: closed,
    openSessionCount: open,
    voidedSessionCount: voided,
    correctedSessionCount: corrected,
    grossSeconds: gross,
    breakSeconds: breaks,
    paidBreakSeconds: paid,
    unpaidBreakSeconds: unpaid,
    unclassifiedBreakSeconds: unclassified,
    resolvedNetPayableSeconds: net,
    resolvedSessionCount: resolved,
    unresolvedSessionCount: unresolved,
  };
}

/** "9:05 AM" in the location's own time zone (never the viewer's). */
export function formatLocalTime(iso: string | null, timeZone: string): string {
  if (!iso) return "—";
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "—";
  const { time } = zonedWallTimeFromInstant(instant, timeZone);
  const [hh, mm] = time.split(":").map(Number);
  const suffix = hh >= 12 ? "PM" : "AM";
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, "0")} ${suffix}`;
}

/** Short zone label, e.g. "CST"/"CDT", for the instant being displayed. */
export function timeZoneAbbreviation(
  iso: string | null,
  timeZone: string,
): string {
  const instant = iso ? new Date(iso) : new Date();
  if (Number.isNaN(instant.getTime())) return timeZone;
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(instant)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/** True when the shift's wall-clock end falls on a later local date than its start. */
export function crossesLocalMidnight(
  clockInAt: string,
  clockOutAt: string | null,
  timeZone: string,
): boolean {
  if (!clockOutAt) return false;
  const a = zonedWallTimeFromInstant(new Date(clockInAt), timeZone).date;
  const b = zonedWallTimeFromInstant(new Date(clockOutAt), timeZone).date;
  return b > a;
}

/** "Mon, Nov 9, 9:05 AM CST" — an instant rendered in the LOCATION's zone with its label. */
export function formatInstantInZone(
  iso: string | null,
  timeZone: string,
): string {
  if (!iso) return "—";
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(instant);
}

/** Payable time for display: unresolved is stated, never shown as zero. */
export function describePayable(
  netPayableSeconds: number | null,
  unit: (seconds: number) => string,
): string {
  return netPayableSeconds === null
    ? "Pending break classification"
    : unit(netPayableSeconds);
}
