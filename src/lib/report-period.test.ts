import { describe, expect, it } from "vitest";

import {
  attendanceStatementTitle,
  classifyReportPeriod,
  formatReportDate,
  formatReportPeriodLabel,
  inclusiveDayCount,
  monthBounds,
  shiftMonth,
} from "./report-period";

describe("formatReportPeriodLabel — the year is always identified (C0.1)", () => {
  it("labels a whole month with month and year", () => {
    expect(formatReportPeriodLabel("2026-11-01", "2026-11-30")).toBe(
      "November 2026",
    );
    expect(formatReportPeriodLabel("2024-02-01", "2024-02-29")).toBe(
      "February 2024",
    );
  });

  it("labels a single day with its year", () => {
    expect(formatReportPeriodLabel("2026-11-30", "2026-11-30")).toBe(
      "Mon, Nov 30, 2026",
    );
  });

  it("labels a same-month partial range with the year (previously omitted)", () => {
    expect(formatReportPeriodLabel("2026-11-01", "2026-11-15")).toBe(
      "Sun, Nov 1 – Sun, Nov 15, 2026",
    );
  });

  it("labels a range across two months in one year with the year once", () => {
    expect(formatReportPeriodLabel("2026-10-15", "2026-11-14")).toBe(
      "Thu, Oct 15 – Sat, Nov 14, 2026",
    );
  });

  it("labels a cross-year range with BOTH years", () => {
    expect(formatReportPeriodLabel("2025-12-31", "2026-01-01")).toBe(
      "Wed, Dec 31, 2025 – Thu, Jan 1, 2026",
    );
    expect(formatReportPeriodLabel("2025-12-01", "2026-01-31")).toBe(
      "Mon, Dec 1, 2025 – Sat, Jan 31, 2026",
    );
  });

  it("does not call a full multi-month span a month", () => {
    expect(formatReportPeriodLabel("2026-11-01", "2026-12-31")).toContain(
      "2026",
    );
    expect(classifyReportPeriod("2026-11-01", "2026-12-31")).toBe("custom");
  });

  it("never shifts with the process time zone (pure calendar arithmetic)", () => {
    expect(formatReportDate("2026-03-08")).toBe("Sun, Mar 8, 2026"); // US DST start
    expect(formatReportDate("2026-11-01")).toBe("Sun, Nov 1, 2026"); // US DST end
  });

  it("falls back to the raw text for malformed input instead of inventing a date", () => {
    expect(formatReportPeriodLabel("2026-13-40", "2026-11-30")).toBe(
      "2026-13-40 – 2026-11-30",
    );
    expect(formatReportDate("not-a-date")).toBe("not-a-date");
    expect(formatReportDate("2026-02-30")).toBe("2026-02-30");
  });
});

describe("classifyReportPeriod / title", () => {
  it("classifies day, month and custom ranges", () => {
    expect(classifyReportPeriod("2026-11-05", "2026-11-05")).toBe("day");
    expect(classifyReportPeriod("2026-11-01", "2026-11-30")).toBe("month");
    expect(classifyReportPeriod("2026-02-01", "2026-02-28")).toBe("month");
    expect(classifyReportPeriod("2024-02-01", "2024-02-29")).toBe("month");
    expect(classifyReportPeriod("2026-11-02", "2026-11-30")).toBe("custom");
    expect(classifyReportPeriod("2026-11-01", "2026-11-29")).toBe("custom");
    expect(classifyReportPeriod("garbage", "2026-11-29")).toBe("custom");
  });

  it("only a whole month is titled 'Monthly' (custom ranges are not mislabelled)", () => {
    expect(attendanceStatementTitle("month")).toBe(
      "Monthly Staff Attendance Timesheet",
    );
    expect(attendanceStatementTitle("custom")).toBe(
      "Staff Attendance Statement",
    );
    expect(attendanceStatementTitle("day")).toBe("Staff Attendance Statement");
  });
});

describe("month helpers", () => {
  it("computes whole-month bounds including leap February and December", () => {
    expect(monthBounds("2024-02-10")).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
    expect(monthBounds("2026-12-31")).toEqual({
      start: "2026-12-01",
      end: "2026-12-31",
    });
    expect(monthBounds("nope")).toBeNull();
  });

  it("shifts across year boundaries", () => {
    expect(shiftMonth("2026-01-15", -1)).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    });
    expect(shiftMonth("2026-12-15", 1)).toEqual({
      start: "2027-01-01",
      end: "2027-01-31",
    });
  });

  it("counts inclusive days and rejects reversed ranges", () => {
    expect(inclusiveDayCount("2026-11-01", "2026-11-30")).toBe(30);
    expect(inclusiveDayCount("2026-11-01", "2026-11-01")).toBe(1);
    expect(inclusiveDayCount("2026-11-02", "2026-11-01")).toBeNull();
    expect(inclusiveDayCount("2025-12-31", "2026-01-01")).toBe(2);
  });
});

describe("formatPeriodMonth", () => {
  it("labels a payroll accounting month with its year", async () => {
    const { formatPeriodMonth } = await import("./report-period");
    expect(formatPeriodMonth("2026-11-01")).toBe("November 2026");
    expect(formatPeriodMonth("2026-01-01")).toBe("January 2026");
    expect(formatPeriodMonth("garbage")).toBe("garbage");
  });
});

describe("monthsInRange (single source for the payroll months a report reads AND displays)", () => {
  it("lists every touched month, across a year boundary", async () => {
    const { monthsInRange } = await import("./report-period");
    expect(monthsInRange("2026-11-15", "2026-11-20")).toEqual(["2026-11-01"]);
    expect(monthsInRange("2025-12-15", "2026-01-15")).toEqual([
      "2025-12-01",
      "2026-01-01",
    ]);
    expect(monthsInRange("2026-01-31", "2026-04-01")).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
    expect(monthsInRange("bad", "2026-01-01")).toEqual([]);
  });
});

describe("pickReportingTimeZone", () => {
  it("is the most common zone, ties alphabetical, never 'whichever branch is first'", async () => {
    const { pickReportingTimeZone } = await import("./report-period");
    expect(
      pickReportingTimeZone([
        "Asia/Tokyo",
        "America/Chicago",
        "America/Chicago",
      ]),
    ).toBe("America/Chicago");
    expect(pickReportingTimeZone(["Asia/Tokyo", "America/Chicago"])).toBe(
      "America/Chicago",
    );
    expect(pickReportingTimeZone(["Asia/Tokyo"])).toBe("Asia/Tokyo");
    expect(pickReportingTimeZone([])).toBe("America/Chicago");
  });
});
