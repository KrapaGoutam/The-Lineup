import { describe, expect, it } from "vitest";

import type { NeonAttendanceRow } from "../data/attendance-data";
import type { NativeReportRow } from "./native-report";
import {
  NEON_REPORT_SOURCE_LABEL,
  NATIVE_REPORT_SOURCE_LABEL,
  normalizeNativeAttendanceToUnified,
  normalizeNeonAttendanceToUnified,
} from "./unified-attendance-report";

describe("Unified Attendance Reporting Domain", () => {
  describe("normalizeNeonAttendanceToUnified", () => {
    it("normalizes Neon rows with V2.0.5 timezone semantics, missing punches, and totals", () => {
      const users = [
        {
          id: 1,
          fullName: "Mia Chen",
          role: "Server",
          phone: null,
          createdAt: "2026-01-01",
          isActive: true,
        },
        {
          id: 2,
          fullName: "Leo Park",
          role: "Bartender",
          phone: null,
          createdAt: "2026-01-01",
          isActive: true,
        },
      ];

      // Monks Webster row with America/Chicago wall time
      const rows: NeonAttendanceRow[] = [
        {
          id: 101,
          userId: 1,
          date: "2026-11-04",
          // 2026-11-04 10:59:00 in Chicago (CST, UTC-6) -> 16:59:00Z
          clockIn: "2026-11-04T16:59:00.000Z",
          clockOut: "2026-11-04T22:30:00.000Z", // 4:30 PM CST
          hoursWorked: 5.5,
          autoClockedOut: false,
        },
        {
          id: 102,
          userId: 1,
          date: "2026-11-05",
          clockIn: "2026-11-05T17:00:00.000Z", // 11:00 AM CST
          clockOut: null, // Missing punch
          hoursWorked: null,
          autoClockedOut: false,
        },
        {
          id: 103,
          userId: 2,
          date: "2026-11-03",
          clockIn: "2026-11-03T16:00:00.000Z",
          clockOut: "2026-11-03T23:00:00.000Z",
          hoursWorked: 7.0,
          autoClockedOut: false,
        },
      ];

      const report = normalizeNeonAttendanceToUnified(rows, {
        organization: "The Monk's",
        branch: "Webster",
        reportingPeriod: "November 2026",
        timeZone: "America/Chicago",
        users,
      });

      expect(report.organization).toBe("The Monk's");
      expect(report.branch).toBe("Webster");
      expect(report.reportingPeriod).toBe("November 2026");
      expect(report.attendanceSource).toBe(NEON_REPORT_SOURCE_LABEL);
      expect(report.totalEmployees).toBe(2);
      expect(report.grandTotalHours).toBe(12.5);
      expect(report.grandTotalShifts).toBe(3);
      expect(report.totalMissingPunches).toBe(1);

      // Alphabetical section order: Leo Park before Mia Chen
      expect(report.sections[0].employeeName).toBe("Leo Park");
      expect(report.sections[0].totalHours).toBe(7.0);
      expect(report.sections[0].missingPunchCount).toBe(0);

      expect(report.sections[1].employeeName).toBe("Mia Chen");
      expect(report.sections[1].totalHours).toBe(5.5);
      expect(report.sections[1].missingPunchCount).toBe(1);

      const miaRows = report.sections[1].rows;
      expect(miaRows).toHaveLength(2);
      // Row 1: closed shift with 10:59 AM clock in
      expect(miaRows[0].businessDate).toBe("2026-11-04");
      expect(miaRows[0].weekday).toBe("Wed");
      expect(miaRows[0].clockIn).toBe("10:59 AM");
      expect(miaRows[0].clockOut).toBe("4:30 PM");
      expect(miaRows[0].workedHours).toBe(5.5);
      expect(miaRows[0].workedHoursDisplay).toBe("5.5h");
      expect(miaRows[0].missingPunches).toBe(false);

      // Row 2: open shift / missing punch
      expect(miaRows[1].businessDate).toBe("2026-11-05");
      expect(miaRows[1].clockIn).toBe("11:00 AM");
      expect(miaRows[1].clockOut).toBeNull();
      expect(miaRows[1].workedHours).toBeNull();
      expect(miaRows[1].workedHoursDisplay).toBe("—");
      expect(miaRows[1].missingPunches).toBe(true);
      expect(miaRows[1].missingPunchType).toBe("clock_out");
    });

    it("handles empty Neon rows gracefully", () => {
      const report = normalizeNeonAttendanceToUnified([], {
        reportingPeriod: "November 2026",
        timeZone: "America/Chicago",
      });

      expect(report.sections).toHaveLength(0);
      expect(report.grandTotalHours).toBe(0);
      expect(report.grandTotalShifts).toBe(0);
      expect(report.totalEmployees).toBe(0);
    });
  });

  describe("normalizeNativeAttendanceToUnified", () => {
    it("normalizes TheLineup Internal rows with audited correction indicators and net payable hours", () => {
      const rows: NativeReportRow[] = [
        {
          sessionId: "sess-1",
          profileId: "prof-1",
          employeeName: "Jack Taylor",
          locationId: "loc-1",
          serviceDate: "2026-11-10",
          status: "completed",
          clockInAt: "2026-11-10T16:00:00.000Z", // 10:00 AM CST
          clockOutAt: "2026-11-10T22:00:00.000Z", // 4:00 PM CST (6h = 21600s)
          grossElapsedSeconds: 21600,
          totalBreakSeconds: 1800,
          paidBreakSeconds: 0,
          unpaidBreakSeconds: 1800,
          unclassifiedBreakSeconds: 0,
          openBreakCount: 0,
          breakCount: 1,
          breakPolicyResolved: true,
          netPayableSeconds: 19800, // 5.5 hours
          version: 2,
          correctionCount: 1, // Audited correction!
          lastCorrectedAt: "2026-11-11T12:00:00.000Z",
          source: "internal_the_lineup",
          timeZone: "America/Chicago",
        },
        {
          sessionId: "sess-2",
          profileId: "prof-1",
          employeeName: "Jack Taylor",
          locationId: "loc-1",
          serviceDate: "2026-11-11",
          status: "active", // Open shift
          clockInAt: "2026-11-11T17:00:00.000Z", // 11:00 AM CST
          clockOutAt: null,
          grossElapsedSeconds: null,
          totalBreakSeconds: 0,
          paidBreakSeconds: 0,
          unpaidBreakSeconds: 0,
          unclassifiedBreakSeconds: 0,
          openBreakCount: 0,
          breakCount: 0,
          breakPolicyResolved: true,
          netPayableSeconds: null,
          version: 1,
          correctionCount: 0,
          lastCorrectedAt: null,
          source: "internal_the_lineup",
          timeZone: "America/Chicago",
        },
      ];

      const report = normalizeNativeAttendanceToUnified(rows, {
        organization: "Liquor Tap",
        branch: "League City",
        reportingPeriod: "November 2026",
        timeZone: "America/Chicago",
      });

      expect(report.organization).toBe("Liquor Tap");
      expect(report.branch).toBe("League City");
      expect(report.attendanceSource).toBe(NATIVE_REPORT_SOURCE_LABEL);
      expect(report.totalEmployees).toBe(1);
      expect(report.grandTotalHours).toBe(5.5);
      expect(report.grandTotalShifts).toBe(2);
      expect(report.totalMissingPunches).toBe(1);
      expect(report.totalCorrectedShifts).toBe(1);

      const section = report.sections[0];
      expect(section.employeeName).toBe("Jack Taylor");
      expect(section.correctedShiftCount).toBe(1);
      expect(section.missingPunchCount).toBe(1);

      const r1 = section.rows[0];
      expect(r1.clockIn).toBe("10:00 AM");
      expect(r1.clockOut).toBe("4:00 PM");
      expect(r1.workedHours).toBe(5.5);
      expect(r1.correctionIndicators.isCorrected).toBe(true);
      expect(r1.correctionIndicators.count).toBe(1);
      expect(r1.correctionIndicators.lastCorrectedAt).toBe(
        "2026-11-11T12:00:00.000Z",
      );

      const r2 = section.rows[1];
      expect(r2.missingPunches).toBe(true);
      expect(r2.missingPunchType).toBe("clock_out");
      expect(r2.rawStatus).toBe("active");
    });
  });
});
