import { formatBusinessTime } from "@/lib/date-time";
import { calendarWeekday } from "./attendance-metrics";
import type { NeonAttendanceRow, NeonUser } from "../data/attendance-data";
import type { NativeReportRow } from "./native-report";

export const NEON_REPORT_SOURCE_LABEL = "Monks Neon (External)";
export const NATIVE_REPORT_SOURCE_LABEL = "TheLineup Internal";

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
  readonly workedHours: number | null;
  readonly workedHoursDisplay: string; // e.g. "5.5h" or "—"
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
  readonly totalHours: number;
  readonly totalShifts: number;
  readonly missingPunchCount: number;
  readonly correctedShiftCount: number;
}

export interface UnifiedAttendanceReport {
  readonly organization: string;
  readonly branch: string;
  readonly reportingPeriod: string;
  readonly attendanceSource: string;
  readonly timeZone: string;
  readonly sections: readonly UnifiedEmployeeSection[];
  readonly grandTotalHours: number;
  readonly grandTotalShifts: number;
  readonly totalEmployees: number;
  readonly totalMissingPunches: number;
  readonly totalCorrectedShifts: number;
}

function formatHoursDisplay(hours: number | null): string {
  if (hours === null || Number.isNaN(hours)) return "—";
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
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

/**
 * Normalizes external Monks Neon attendance rows into the canonical Unified Attendance Report.
 * Preserves V2.0.5 timezone semantics (resolved wall times in America/Chicago).
 */
export function normalizeNeonAttendanceToUnified(
  rows: readonly NeonAttendanceRow[],
  options: {
    readonly organization?: string;
    readonly branch?: string;
    readonly reportingPeriod: string;
    readonly timeZone: string;
    readonly users?: ReadonlyMap<number, NeonUser> | readonly NeonUser[];
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

  const grouped = new Map<
    number,
    { name: string; role?: string; rows: UnifiedAttendanceRow[] }
  >();

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
      workedHours: r.hoursWorked,
      workedHoursDisplay: formatHoursDisplay(r.hoursWorked),
      missingPunches,
      missingPunchType,
      correctionIndicators: {
        isCorrected: false,
        count: 0,
      },
      timeZone,
    };

    if (!grouped.has(r.userId)) {
      grouped.set(r.userId, {
        name: employeeName,
        role: employeeRole,
        rows: [],
      });
    }
    grouped.get(r.userId)!.rows.push(row);
  }

  const sections: UnifiedEmployeeSection[] = [];
  let grandTotalHours = 0;
  let grandTotalShifts = 0;
  let totalMissingPunches = 0;
  let totalCorrectedShifts = 0;

  for (const [empId, group] of grouped.entries()) {
    // Sort chronological: oldest to newest
    group.rows.sort((a, b) => a.businessDate.localeCompare(b.businessDate));

    let empHours = 0;
    let missingCount = 0;
    let correctedCount = 0;

    for (const r of group.rows) {
      if (r.workedHours !== null) empHours += r.workedHours;
      if (r.missingPunches) missingCount += 1;
      if (r.correctionIndicators.isCorrected) correctedCount += 1;
    }

    grandTotalHours += empHours;
    grandTotalShifts += group.rows.length;
    totalMissingPunches += missingCount;
    totalCorrectedShifts += correctedCount;

    sections.push({
      employeeId: empId,
      employeeName: group.name,
      employeeRole: group.role,
      rows: group.rows,
      totalHours: Math.round(empHours * 10) / 10,
      totalShifts: group.rows.length,
      missingPunchCount: missingCount,
      correctedShiftCount: correctedCount,
    });
  }

  // Sort sections alphabetically by employee name
  sections.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return {
    organization,
    branch,
    reportingPeriod,
    attendanceSource: NEON_REPORT_SOURCE_LABEL,
    timeZone,
    sections,
    grandTotalHours: Math.round(grandTotalHours * 10) / 10,
    grandTotalShifts,
    totalEmployees: sections.length,
    totalMissingPunches,
    totalCorrectedShifts,
  };
}

/**
 * Normalizes TheLineup Internal attendance rows into the canonical Unified Attendance Report.
 * Includes audited correction indicators and net payable hours.
 */
export function normalizeNativeAttendanceToUnified(
  rows: readonly NativeReportRow[],
  options: {
    readonly organization?: string;
    readonly branch?: string;
    readonly reportingPeriod: string;
    readonly timeZone: string;
  },
): UnifiedAttendanceReport {
  const organization = options.organization || "The Lineup";
  const branch = options.branch || "Operations";
  const timeZone = options.timeZone;
  const reportingPeriod = options.reportingPeriod;

  const grouped = new Map<
    string,
    { name: string; rows: UnifiedAttendanceRow[] }
  >();

  for (const r of rows) {
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

    // Convert net payable seconds to hours (or gross elapsed if net is pending)
    const effectiveSeconds =
      r.netPayableSeconds !== null
        ? r.netPayableSeconds
        : r.grossElapsedSeconds;
    const workedHours =
      effectiveSeconds !== null
        ? Math.round((effectiveSeconds / 3600) * 10) / 10
        : null;

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
      workedHours,
      workedHoursDisplay: formatHoursDisplay(workedHours),
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

    if (!grouped.has(r.profileId)) {
      grouped.set(r.profileId, { name: r.employeeName, rows: [] });
    }
    grouped.get(r.profileId)!.rows.push(row);
  }

  const sections: UnifiedEmployeeSection[] = [];
  let grandTotalHours = 0;
  let grandTotalShifts = 0;
  let totalMissingPunches = 0;
  let totalCorrectedShifts = 0;

  for (const [profId, group] of grouped.entries()) {
    group.rows.sort((a, b) => a.businessDate.localeCompare(b.businessDate));

    let empHours = 0;
    let missingCount = 0;
    let correctedCount = 0;

    for (const r of group.rows) {
      if (r.workedHours !== null) empHours += r.workedHours;
      if (r.missingPunches) missingCount += 1;
      if (r.correctionIndicators.isCorrected) correctedCount += 1;
    }

    grandTotalHours += empHours;
    grandTotalShifts += group.rows.length;
    totalMissingPunches += missingCount;
    totalCorrectedShifts += correctedCount;

    sections.push({
      employeeId: profId,
      employeeName: group.name,
      rows: group.rows,
      totalHours: Math.round(empHours * 10) / 10,
      totalShifts: group.rows.length,
      missingPunchCount: missingCount,
      correctedShiftCount: correctedCount,
    });
  }

  sections.sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return {
    organization,
    branch,
    reportingPeriod,
    attendanceSource: NATIVE_REPORT_SOURCE_LABEL,
    timeZone,
    sections,
    grandTotalHours: Math.round(grandTotalHours * 10) / 10,
    grandTotalShifts,
    totalEmployees: sections.length,
    totalMissingPunches,
    totalCorrectedShifts,
  };
}
