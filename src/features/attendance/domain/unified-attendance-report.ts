import { formatBusinessTime } from "@/lib/date-time";
import { calendarWeekday } from "./attendance-metrics";
import type { NeonAttendanceRow, NeonUser } from "../data/attendance-data";
import type { NativeReportRow } from "./native-report";

export const NEON_REPORT_SOURCE_LABEL = "Monks Neon (External)";
export const NATIVE_REPORT_SOURCE_LABEL = "TheLineup Internal";

/**
 * Documented source semantics for the hours shown on a statement. These strings are
 * printed on the statement so a reader can tell what a total means.
 *
 * - TheLineup Internal: NET PAYABLE time of closed sessions whose break pay is fully
 *   resolved. Gross elapsed time is NOT substituted for payable time; open sessions and
 *   sessions with an open/unclassified break contribute no hours and are counted as
 *   "unresolved" instead of being guessed.
 * - Monks Neon: the `hours_worked` value reported by the external system. Its gross/net
 *   policy is the source's own and is not re-derived here.
 */
export const NATIVE_HOURS_BASIS_LABEL =
  "Net payable hours of closed shifts with resolved breaks";
export const NEON_HOURS_BASIS_LABEL = "Hours as reported by Monks Neon";

const SECONDS_PER_HOUR = 3600;

/** Why a row has (or does not have) countable hours. */
export type UnifiedHoursStatus =
  | "counted"
  | "open"
  | "break_review"
  | "no_duration";

export interface UnifiedAttendanceRow {
  readonly id: string;
  readonly employeeId: string | number;
  readonly employeeName: string;
  readonly employeeRole?: string;
  readonly organization: string;
  readonly branch: string;
  readonly reportingPeriod: string;
  readonly attendanceSource: string;
  readonly businessDate: string; // YYYY-MM-DD
  readonly weekday: string; // e.g. "Mon"
  readonly clockIn: string | null; // e.g. "10:59 AM"
  readonly clockOut: string | null; // e.g. "04:30 PM"
  readonly clockInIso: string | null;
  readonly clockOutIso: string | null;
  /** Exact countable seconds (canonical). Null when no hours may be claimed. */
  readonly workedSeconds: number | null;
  /** `workedSeconds / 3600`, UNROUNDED. Never round before aggregating. */
  readonly workedHours: number | null;
  /** Presentation only, e.g. "5.5h" or "—". */
  readonly workedHoursDisplay: string;
  readonly hoursStatus: UnifiedHoursStatus;
  readonly missingPunches: boolean;
  readonly missingPunchType?: "clock_in" | "clock_out" | "break" | null;
  readonly correctionIndicators: {
    readonly isCorrected: boolean;
    readonly count: number;
    readonly lastCorrectedAt?: string | null;
  };
  readonly timeZone: string;
  readonly rawStatus?: string;
}

export interface UnifiedEmployeeSection {
  readonly employeeId: string | number;
  readonly employeeName: string;
  readonly employeeRole?: string;
  readonly rows: readonly UnifiedAttendanceRow[];
  readonly totalSeconds: number;
  /** `totalSeconds / 3600`, unrounded. */
  readonly totalHours: number;
  /** Presentation only (rounded once, after aggregation). */
  readonly totalHoursDisplay: string;
  readonly totalShifts: number;
  /** Shifts that contribute no hours (open, or break pay unresolved). */
  readonly unresolvedShiftCount: number;
  readonly missingPunchCount: number;
  readonly correctedShiftCount: number;
}

export interface UnifiedAttendanceReport {
  readonly organization: string;
  readonly branch: string;
  readonly reportingPeriod: string;
  readonly attendanceSource: string;
  readonly timeZone: string;
  /** What the hours on this statement mean (printed on the statement). */
  readonly hoursBasis: string;
  /**
   * True when the underlying read hit its row limit. A partial report must never be
   * presented or printed as a complete statement.
   */
  readonly isPartial: boolean;
  /** Voided sessions are left out of the statement entirely; they are counted here. */
  readonly excludedVoidedCount: number;
  readonly sections: readonly UnifiedEmployeeSection[];
  readonly grandTotalSeconds: number;
  readonly grandTotalHours: number;
  readonly grandTotalHoursDisplay: string;
  readonly grandTotalShifts: number;
  readonly totalUnresolvedShifts: number;
  readonly totalEmployees: number;
  readonly totalMissingPunches: number;
  readonly totalCorrectedShifts: number;
}

/**
 * Presentation-only formatting. Callers pass exact seconds (already aggregated); this is
 * the ONLY place hours are rounded (to 0.01h), so rounding never feeds back into a total.
 */
export function formatHoursDisplay(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  return `${Number((seconds / SECONDS_PER_HOUR).toFixed(2))}h`;
}

function safeClockFormat(
  iso: string | null | undefined,
  timeZone: string,
): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return formatBusinessTime(iso, timeZone);
  } catch {
    return null;
  }
}

function compareRows(a: UnifiedAttendanceRow, b: UnifiedAttendanceRow): number {
  return (
    a.businessDate.localeCompare(b.businessDate) ||
    (a.clockInIso ?? "").localeCompare(b.clockInIso ?? "")
  );
}

interface SectionAccumulator {
  name: string;
  role?: string;
  rows: UnifiedAttendanceRow[];
}

/** Aggregates grouped rows in integer seconds; rounding happens only at display. */
function buildReport(
  grouped: ReadonlyMap<string | number, SectionAccumulator>,
  meta: {
    readonly organization: string;
    readonly branch: string;
    readonly reportingPeriod: string;
    readonly attendanceSource: string;
    readonly timeZone: string;
    readonly hoursBasis: string;
    readonly isPartial: boolean;
    readonly excludedVoidedCount: number;
  },
): UnifiedAttendanceReport {
  const sections: UnifiedEmployeeSection[] = [];
  let grandSeconds = 0;
  let grandShifts = 0;
  let grandUnresolved = 0;
  let totalMissingPunches = 0;
  let totalCorrectedShifts = 0;

  for (const [employeeId, group] of grouped.entries()) {
    group.rows.sort(compareRows);

    let seconds = 0;
    let unresolved = 0;
    let missing = 0;
    let corrected = 0;
    for (const r of group.rows) {
      if (r.workedSeconds !== null) seconds += r.workedSeconds;
      else unresolved += 1;
      if (r.missingPunches) missing += 1;
      if (r.correctionIndicators.isCorrected) corrected += 1;
    }

    grandSeconds += seconds;
    grandShifts += group.rows.length;
    grandUnresolved += unresolved;
    totalMissingPunches += missing;
    totalCorrectedShifts += corrected;

    sections.push({
      employeeId,
      employeeName: group.name,
      employeeRole: group.role,
      rows: group.rows,
      totalSeconds: seconds,
      totalHours: seconds / SECONDS_PER_HOUR,
      totalHoursDisplay: formatHoursDisplay(seconds),
      totalShifts: group.rows.length,
      unresolvedShiftCount: unresolved,
      missingPunchCount: missing,
      correctedShiftCount: corrected,
    });
  }

  sections.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return {
    organization: meta.organization,
    branch: meta.branch,
    reportingPeriod: meta.reportingPeriod,
    attendanceSource: meta.attendanceSource,
    timeZone: meta.timeZone,
    hoursBasis: meta.hoursBasis,
    isPartial: meta.isPartial,
    excludedVoidedCount: meta.excludedVoidedCount,
    sections,
    grandTotalSeconds: grandSeconds,
    grandTotalHours: grandSeconds / SECONDS_PER_HOUR,
    grandTotalHoursDisplay: formatHoursDisplay(grandSeconds),
    grandTotalShifts: grandShifts,
    totalUnresolvedShifts: grandUnresolved,
    totalEmployees: sections.length,
    totalMissingPunches,
    totalCorrectedShifts,
  };
}

/**
 * Normalizes external Monks Neon attendance rows into the canonical Unified Attendance Report.
 * Preserves V2.0.5 timezone semantics (resolved wall times in America/Chicago).
 *
 * Hours are the source-reported `hours_worked`; each is converted to whole seconds once
 * and summed as integers, so totals carry no per-row display rounding.
 */
export function normalizeNeonAttendanceToUnified(
  rows: readonly NeonAttendanceRow[],
  options: {
    readonly organization?: string;
    readonly branch?: string;
    readonly reportingPeriod: string;
    readonly timeZone: string;
    readonly users?: ReadonlyMap<number, NeonUser> | readonly NeonUser[];
    readonly truncated?: boolean;
  },
): UnifiedAttendanceReport {
  const organization = options.organization || "The Monk's";
  const branch = options.branch || "Webster";
  const timeZone = options.timeZone;
  const reportingPeriod = options.reportingPeriod;

  const usersMap = new Map<number, NeonUser>();
  if (options.users) {
    if ("get" in options.users) {
      for (const [id, u] of (
        options.users as ReadonlyMap<number, NeonUser>
      ).entries()) {
        usersMap.set(id, u);
      }
    } else {
      for (const u of options.users as readonly NeonUser[]) {
        usersMap.set(u.id, u);
      }
    }
  }

  const grouped = new Map<string | number, SectionAccumulator>();

  for (const r of rows) {
    const user = usersMap.get(r.userId);
    const employeeName = user?.fullName || `Employee #${r.userId}`;
    const employeeRole = user?.role?.trim() || undefined;

    const clockInFormatted = safeClockFormat(r.clockIn, timeZone);
    const clockOutFormatted = safeClockFormat(r.clockOut, timeZone);
    const missingPunches = !r.clockIn || !r.clockOut;
    const missingPunchType = !r.clockIn
      ? "clock_in"
      : !r.clockOut
        ? "clock_out"
        : null;

    const workedSeconds =
      r.hoursWorked !== null && Number.isFinite(r.hoursWorked)
        ? Math.round(r.hoursWorked * SECONDS_PER_HOUR)
        : null;

    const row: UnifiedAttendanceRow = {
      id: `neon-${r.id}`,
      employeeId: r.userId,
      employeeName,
      employeeRole,
      organization,
      branch,
      reportingPeriod,
      attendanceSource: NEON_REPORT_SOURCE_LABEL,
      businessDate: r.date,
      weekday: calendarWeekday(r.date),
      clockIn: clockInFormatted,
      clockOut: clockOutFormatted,
      clockInIso: r.clockIn,
      clockOutIso: r.clockOut,
      workedSeconds,
      workedHours:
        workedSeconds === null ? null : workedSeconds / SECONDS_PER_HOUR,
      workedHoursDisplay: formatHoursDisplay(workedSeconds),
      hoursStatus: workedSeconds === null ? "no_duration" : "counted",
      missingPunches,
      missingPunchType,
      correctionIndicators: {
        isCorrected: false,
        count: 0,
      },
      timeZone,
    };

    let group = grouped.get(r.userId);
    if (!group) {
      group = { name: employeeName, role: employeeRole, rows: [] };
      grouped.set(r.userId, group);
    }
    group.rows.push(row);
  }

  return buildReport(grouped, {
    organization,
    branch,
    reportingPeriod,
    attendanceSource: NEON_REPORT_SOURCE_LABEL,
    timeZone,
    hoursBasis: NEON_HOURS_BASIS_LABEL,
    isPartial: options.truncated === true,
    excludedVoidedCount: 0,
  });
}

/**
 * Normalizes TheLineup Internal attendance rows into the canonical Unified Attendance Report.
 * Includes audited correction indicators and net payable hours.
 *
 * Payable hours follow the native model exactly (see `summarizeNativeReport`): only the
 * policy-resolved `netPayableSeconds` of a CLOSED session counts. A session that is still
 * open, or whose break pay is unresolved, contributes no hours (it is counted as
 * unresolved) — gross elapsed time is never substituted. Voided sessions are excluded.
 */
export function normalizeNativeAttendanceToUnified(
  rows: readonly NativeReportRow[],
  options: {
    readonly organization?: string;
    readonly branch?: string;
    readonly reportingPeriod: string;
    readonly timeZone: string;
    readonly truncated?: boolean;
  },
): UnifiedAttendanceReport {
  const organization = options.organization || "The Lineup";
  const branch = options.branch || "Operations";
  const timeZone = options.timeZone;
  const reportingPeriod = options.reportingPeriod;

  const grouped = new Map<string | number, SectionAccumulator>();
  let excludedVoidedCount = 0;

  for (const r of rows) {
    if (r.status === "voided") {
      excludedVoidedCount += 1;
      continue;
    }

    const clockInFormatted = safeClockFormat(r.clockInAt, timeZone);
    const clockOutFormatted = safeClockFormat(r.clockOutAt, timeZone);
    const isOpen = r.status === "active" || r.status === "on_break";
    const missingPunches = isOpen || !r.clockOutAt || r.openBreakCount > 0;
    const missingPunchType = !r.clockInAt
      ? "clock_in"
      : !r.clockOutAt || isOpen
        ? "clock_out"
        : r.openBreakCount > 0
          ? "break"
          : null;

    // Only a resolved NET payable figure of a closed session is countable.
    let workedSeconds: number | null = null;
    let hoursStatus: UnifiedHoursStatus;
    if (isOpen) {
      hoursStatus = "open";
    } else if (r.netPayableSeconds !== null) {
      workedSeconds = r.netPayableSeconds;
      hoursStatus = "counted";
    } else if (r.grossElapsedSeconds !== null) {
      hoursStatus = "break_review";
    } else {
      hoursStatus = "no_duration";
    }

    const row: UnifiedAttendanceRow = {
      id: `native-${r.sessionId}`,
      employeeId: r.profileId,
      employeeName: r.employeeName,
      organization,
      branch,
      reportingPeriod,
      attendanceSource: NATIVE_REPORT_SOURCE_LABEL,
      businessDate: r.serviceDate || "",
      weekday: r.serviceDate ? calendarWeekday(r.serviceDate) : "—",
      clockIn: clockInFormatted,
      clockOut: clockOutFormatted,
      clockInIso: r.clockInAt,
      clockOutIso: r.clockOutAt,
      workedSeconds,
      workedHours:
        workedSeconds === null ? null : workedSeconds / SECONDS_PER_HOUR,
      workedHoursDisplay: formatHoursDisplay(workedSeconds),
      hoursStatus,
      missingPunches,
      missingPunchType,
      correctionIndicators: {
        isCorrected: r.correctionCount > 0,
        count: r.correctionCount,
        lastCorrectedAt: r.lastCorrectedAt,
      },
      timeZone,
      rawStatus: r.status,
    };

    let group = grouped.get(r.profileId);
    if (!group) {
      group = { name: r.employeeName, rows: [] };
      grouped.set(r.profileId, group);
    }
    group.rows.push(row);
  }

  return buildReport(grouped, {
    organization,
    branch,
    reportingPeriod,
    attendanceSource: NATIVE_REPORT_SOURCE_LABEL,
    timeZone,
    hoursBasis: NATIVE_HOURS_BASIS_LABEL,
    isPartial: options.truncated === true,
    excludedVoidedCount,
  });
}
