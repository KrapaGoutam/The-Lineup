import { describe, expect, it } from "vitest";

import type { NeonAttendanceRow } from "../data/attendance-data";
import { summarizeNativeReport, type NativeReportRow } from "./native-report";
import {
  normalizeNativeAttendanceToUnified,
  normalizeNeonAttendanceToUnified,
} from "./unified-attendance-report";

function nativeRow(over: Partial<NativeReportRow>): NativeReportRow {
  return {
    sessionId: "s",
    profileId: "p1",
    employeeName: "Pat Doe",
    locationId: "loc-1",
    serviceDate: "2026-11-02",
    status: "completed",
    clockInAt: "2026-11-02T15:00:00.000Z",
    clockOutAt: "2026-11-02T21:00:00.000Z",
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
    ...over,
  };
}

const OPTS = {
  reportingPeriod: "November 2026",
  timeZone: "America/Chicago",
};

describe("Unified report precision and completeness (V2.0.6 review)", () => {
  it("aggregates exact seconds, so per-row display rounding cannot skew totals", () => {
    // Each shift is 1h 57m 30s = 7050s = 1.958333h. Rounding each row to 0.1h gives 2.0h,
    // i.e. 20.0h for ten shifts; the exact total is 19.583333h (19.58h displayed).
    const rows = Array.from({ length: 10 }, (_, i) =>
      nativeRow({
        sessionId: `s${i}`,
        serviceDate: `2026-11-${String(i + 1).padStart(2, "0")}`,
        grossElapsedSeconds: 7050,
        netPayableSeconds: 7050,
      }),
    );
    const report = normalizeNativeAttendanceToUnified(rows, OPTS);

    expect(report.sections[0].totalSeconds).toBe(70500);
    expect(report.grandTotalSeconds).toBe(70500);
    expect(report.grandTotalHours).toBeCloseTo(19.583333, 5);
    expect(report.grandTotalHoursDisplay).toBe("19.58h");
    expect(report.sections[0].totalHoursDisplay).toBe("19.58h");
    expect(report.grandTotalHours).not.toBe(20);
    // Row values are unrounded; only the display string is rounded.
    expect(report.sections[0].rows[0].workedSeconds).toBe(7050);
    expect(report.sections[0].rows[0].workedHours).toBeCloseTo(1.958333, 5);
    expect(report.sections[0].rows[0].workedHoursDisplay).toBe("1.96h");
  });

  it("never substitutes gross elapsed time for unresolved break pay", () => {
    const report = normalizeNativeAttendanceToUnified(
      [
        nativeRow({ sessionId: "ok", netPayableSeconds: 18000 }),
        nativeRow({
          sessionId: "unresolved",
          serviceDate: "2026-11-03",
          grossElapsedSeconds: 28800,
          unclassifiedBreakSeconds: 1800,
          totalBreakSeconds: 1800,
          breakPolicyResolved: false,
          netPayableSeconds: null,
        }),
      ],
      OPTS,
    );

    const [ok, unresolved] = report.sections[0].rows;
    expect(ok.hoursStatus).toBe("counted");
    expect(unresolved.hoursStatus).toBe("break_review");
    expect(unresolved.workedSeconds).toBeNull();
    expect(unresolved.workedHoursDisplay).toBe("—");
    expect(report.grandTotalSeconds).toBe(18000); // 5h, not 5h + 8h
    expect(report.totalUnresolvedShifts).toBe(1);
    expect(report.sections[0].unresolvedShiftCount).toBe(1);
  });

  it("gives open shifts no hours and counts them as unresolved", () => {
    const report = normalizeNativeAttendanceToUnified(
      [
        nativeRow({
          sessionId: "open",
          status: "active",
          clockOutAt: null,
          grossElapsedSeconds: null,
          netPayableSeconds: null,
        }),
      ],
      OPTS,
    );
    expect(report.sections[0].rows[0].hoursStatus).toBe("open");
    expect(report.grandTotalSeconds).toBe(0);
    expect(report.totalUnresolvedShifts).toBe(1);
  });

  it("excludes voided sessions from rows and totals but counts them", () => {
    const report = normalizeNativeAttendanceToUnified(
      [
        nativeRow({ sessionId: "a", netPayableSeconds: 3600 }),
        nativeRow({
          sessionId: "v",
          status: "voided",
          netPayableSeconds: 36000,
          grossElapsedSeconds: 36000,
        }),
      ],
      OPTS,
    );
    expect(report.sections[0].totalShifts).toBe(1);
    expect(report.grandTotalSeconds).toBe(3600);
    expect(report.excludedVoidedCount).toBe(1);
  });

  it("agrees with the native model's resolved net payable total", () => {
    const rows = [
      nativeRow({ sessionId: "a", netPayableSeconds: 7050 }),
      nativeRow({ sessionId: "b", netPayableSeconds: 12345 }),
      nativeRow({
        sessionId: "c",
        netPayableSeconds: null,
        breakPolicyResolved: false,
        unclassifiedBreakSeconds: 600,
      }),
    ];
    const unified = normalizeNativeAttendanceToUnified(rows, OPTS);
    expect(unified.grandTotalSeconds).toBe(
      summarizeNativeReport(rows).resolvedNetPayableSeconds,
    );
  });

  it("sorts several shifts on one day by clock-in time", () => {
    const report = normalizeNativeAttendanceToUnified(
      [
        nativeRow({
          sessionId: "late",
          clockInAt: "2026-11-02T23:00:00.000Z",
          clockOutAt: "2026-11-03T03:00:00.000Z",
        }),
        nativeRow({ sessionId: "early" }),
      ],
      OPTS,
    );
    expect(report.sections[0].rows.map((r) => r.id)).toEqual([
      "native-early",
      "native-late",
    ]);
  });

  it("keeps an overnight shift on its service date in the location time zone", () => {
    const report = normalizeNativeAttendanceToUnified(
      [
        nativeRow({
          sessionId: "night",
          serviceDate: "2026-11-02",
          clockInAt: "2026-11-03T02:00:00.000Z", // 8:00 PM CST on 11-02
          clockOutAt: "2026-11-03T08:00:00.000Z", // 2:00 AM CST on 11-03
          netPayableSeconds: 21600,
        }),
      ],
      OPTS,
    );
    const row = report.sections[0].rows[0];
    expect(row.businessDate).toBe("2026-11-02");
    expect(row.clockIn).toBe("8:00 PM");
    expect(row.clockOut).toBe("2:00 AM");
  });

  it("keeps the DST fall-back shift's real elapsed seconds", () => {
    // 2026-11-01 fall-back in America/Chicago: 00:30 CDT -> 06:30 CST is 7 real hours.
    const report = normalizeNativeAttendanceToUnified(
      [
        nativeRow({
          sessionId: "dst",
          serviceDate: "2026-11-01",
          clockInAt: "2026-11-01T05:30:00.000Z",
          clockOutAt: "2026-11-01T12:30:00.000Z",
          grossElapsedSeconds: 25200,
          netPayableSeconds: 25200,
        }),
      ],
      OPTS,
    );
    expect(report.grandTotalSeconds).toBe(25200);
    expect(report.sections[0].rows[0].clockIn).toBe("12:30 AM");
    expect(report.sections[0].rows[0].clockOut).toBe("6:30 AM");
  });

  it("flags a truncated read as a partial report", () => {
    expect(
      normalizeNativeAttendanceToUnified([], { ...OPTS, truncated: true })
        .isPartial,
    ).toBe(true);
    expect(normalizeNativeAttendanceToUnified([], OPTS).isPartial).toBe(false);
  });

  it("sums Neon fractional hours as whole seconds without float drift", () => {
    const rows: NeonAttendanceRow[] = [0.1, 0.2, 0.7, 1.33, 2.67].map(
      (h, i) => ({
        id: i + 1,
        userId: 1,
        date: `2026-11-0${i + 1}`,
        clockIn: "2026-11-02T16:00:00.000Z",
        clockOut: "2026-11-02T18:00:00.000Z",
        hoursWorked: h,
        autoClockedOut: false,
      }),
    );
    const report = normalizeNeonAttendanceToUnified(rows, OPTS);
    expect(report.grandTotalSeconds).toBe(18000); // exactly 5.00h
    expect(report.grandTotalHoursDisplay).toBe("5h");
    expect(report.hoursBasis).toBe("Hours as reported by Monks Neon");
  });
});
