import { describe, expect, it } from "vitest";

import {
  classifySessionState,
  crossesLocalMidnight,
  formatLocalTime,
  openElapsedSeconds,
  summarizeNativeReport,
  timeZoneAbbreviation,
  type NativeReportRow,
} from "./native-report";

function row(overrides: Partial<NativeReportRow> = {}): NativeReportRow {
  return {
    sessionId: "s1",
    profileId: "p1",
    employeeName: "Ada",
    locationId: "l1",
    serviceDate: "2026-11-09",
    status: "completed",
    clockInAt: "2026-11-09T15:00:00Z",
    clockOutAt: "2026-11-09T23:00:00Z",
    grossElapsedSeconds: 28800,
    totalBreakSeconds: 0,
    paidBreakSeconds: 0,
    unpaidBreakSeconds: 0,
    unclassifiedBreakSeconds: 0,
    openBreakCount: 0,
    breakCount: 0,
    breakPolicyResolved: true,
    netPayableSeconds: 28800,
    version: 1,
    correctionCount: 0,
    lastCorrectedAt: null,
    source: "internal_the_lineup",
    timeZone: "America/Chicago",
    ...overrides,
  };
}

describe("classifySessionState", () => {
  it("flags an open session from a previous service date, without closing it", () => {
    expect(
      classifySessionState(
        { status: "active", serviceDate: "2026-11-08" },
        "2026-11-09",
      ),
    ).toBe("open_across_midnight");
    expect(
      classifySessionState(
        { status: "on_break", serviceDate: "2026-11-09" },
        "2026-11-09",
      ),
    ).toBe("open");
    expect(
      classifySessionState(
        { status: "completed", serviceDate: "2026-11-01" },
        "2026-11-09",
      ),
    ).toBe("completed");
    expect(
      classifySessionState(
        { status: "voided", serviceDate: "2026-11-09" },
        "2026-11-09",
      ),
    ).toBe("voided");
  });
});

describe("openElapsedSeconds", () => {
  it("is null for closed sessions and elapsed seconds for open ones", () => {
    const now = Date.parse("2026-11-09T17:00:00Z");
    expect(openElapsedSeconds(row({ status: "completed" }), now)).toBeNull();
    expect(
      openElapsedSeconds(row({ status: "active", clockOutAt: null }), now),
    ).toBe(2 * 3600);
  });
});

describe("summarizeNativeReport", () => {
  it("keeps unresolved sessions out of payable time and counts them", () => {
    const totals = summarizeNativeReport([
      row({ sessionId: "a" }),
      row({
        sessionId: "b",
        grossElapsedSeconds: 14400,
        totalBreakSeconds: 1800,
        unclassifiedBreakSeconds: 1800,
        breakPolicyResolved: false,
        netPayableSeconds: null,
      }),
      row({
        sessionId: "c",
        grossElapsedSeconds: 10000,
        totalBreakSeconds: 1000,
        unpaidBreakSeconds: 1000,
        netPayableSeconds: 9000,
        correctionCount: 2,
      }),
    ]);
    expect(totals.closedSessionCount).toBe(3);
    expect(totals.grossSeconds).toBe(28800 + 14400 + 10000);
    expect(totals.resolvedNetPayableSeconds).toBe(28800 + 9000);
    expect(totals.resolvedSessionCount).toBe(2);
    expect(totals.unresolvedSessionCount).toBe(1);
    expect(totals.unclassifiedBreakSeconds).toBe(1800);
    expect(totals.correctedSessionCount).toBe(1);
  });

  it("excludes open and voided sessions from time totals but still counts them", () => {
    const totals = summarizeNativeReport([
      row({
        status: "active",
        clockOutAt: null,
        grossElapsedSeconds: null,
        netPayableSeconds: null,
      }),
      row({ status: "voided", correctionCount: 1 }),
      row(),
    ]);
    expect(totals.openSessionCount).toBe(1);
    expect(totals.voidedSessionCount).toBe(1);
    expect(totals.closedSessionCount).toBe(1);
    expect(totals.grossSeconds).toBe(28800);
    expect(totals.sessionCount).toBe(3);
    expect(totals.correctedSessionCount).toBe(1);
  });

  it("returns zeros for an empty report", () => {
    expect(summarizeNativeReport([]).sessionCount).toBe(0);
    expect(summarizeNativeReport([]).resolvedNetPayableSeconds).toBe(0);
  });
});

describe("time zone display", () => {
  it("renders times in the LOCATION's zone, not the viewer's", () => {
    // 15:00Z is 9:00 AM CST (UTC-6) in Chicago in November.
    expect(formatLocalTime("2026-11-09T15:00:00Z", "America/Chicago")).toBe(
      "9:00 AM",
    );
    expect(formatLocalTime("2026-11-09T15:00:00Z", "Pacific/Kiritimati")).toBe(
      "5:00 AM",
    );
    expect(formatLocalTime(null, "America/Chicago")).toBe("—");
    expect(formatLocalTime("garbage", "America/Chicago")).toBe("—");
  });

  it("distinguishes the two 1:30 AM wall times at the fall-back transition", () => {
    // US fall-back 2026-11-01: 06:30Z is 1:30 AM CDT, 07:30Z is 1:30 AM CST.
    expect(formatLocalTime("2026-11-01T06:30:00Z", "America/Chicago")).toBe(
      "1:30 AM",
    );
    expect(formatLocalTime("2026-11-01T07:30:00Z", "America/Chicago")).toBe(
      "1:30 AM",
    );
    expect(
      timeZoneAbbreviation("2026-11-01T06:30:00Z", "America/Chicago"),
    ).toMatch(/CDT/);
    expect(
      timeZoneAbbreviation("2026-11-01T07:30:00Z", "America/Chicago"),
    ).toMatch(/CST/);
  });

  it("detects an overnight shift by local calendar date", () => {
    // 22:00 CST Nov 9 -> 03:00 CST Nov 10
    expect(
      crossesLocalMidnight(
        "2026-11-10T04:00:00Z",
        "2026-11-10T09:00:00Z",
        "America/Chicago",
      ),
    ).toBe(true);
    expect(
      crossesLocalMidnight(
        "2026-11-09T15:00:00Z",
        "2026-11-09T23:00:00Z",
        "America/Chicago",
      ),
    ).toBe(false);
    expect(
      crossesLocalMidnight("2026-11-09T15:00:00Z", null, "America/Chicago"),
    ).toBe(false);
  });
});
