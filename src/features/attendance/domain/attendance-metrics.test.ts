import { describe, expect, it } from "vitest";

import {
  calendarWeekday,
  computeAttendanceSummary,
  dayOfMonth,
  daysInMonth,
} from "./attendance-metrics";

describe("calendarWeekday", () => {
  it("returns the correct weekday for a known date", () => {
    // 2026-09-02 is a Wednesday -- matches the mockup's own row 1
    // (design-system-reference.html section 2e: "Sep 02 / Wed").
    expect(calendarWeekday("2026-09-02")).toBe("Wed");
  });

  it("crosses a month boundary correctly", () => {
    // 2026-08-31 (Mon) -> 2026-09-01 (Tue).
    expect(calendarWeekday("2026-08-31")).toBe("Mon");
    expect(calendarWeekday("2026-09-01")).toBe("Tue");
  });

  it("crosses a year boundary correctly", () => {
    // 2026-12-31 (Thu) -> 2027-01-01 (Fri).
    expect(calendarWeekday("2026-12-31")).toBe("Thu");
    expect(calendarWeekday("2027-01-01")).toBe("Fri");
  });

  it("handles the last day of a leap-year February", () => {
    // 2028 is a leap year -- Feb 29 exists and is a Tuesday.
    expect(calendarWeekday("2028-02-29")).toBe("Tue");
  });

  it("never shifts with the host's own time zone", () => {
    // Parsed as UTC noon and rendered in UTC -- this assertion is only
    // meaningful because it doesn't depend on wherever the test runner
    // itself is configured, unlike routing through zonedWallTimeFromInstant
    // would. Regression guard against ever reintroducing that dependency.
    expect(calendarWeekday("2026-09-13")).toBe("Sun");
  });
});

describe("dayOfMonth", () => {
  it("returns the zero-padded day", () => {
    expect(dayOfMonth("2026-09-02")).toBe("02");
    expect(dayOfMonth("2026-09-30")).toBe("30");
  });
});

describe("daysInMonth", () => {
  it("returns 30 for September", () => {
    expect(daysInMonth(2026, 9)).toBe(30);
  });

  it("returns 31 for a 31-day month", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
  });

  it("returns 29 for February in a leap year", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  it("returns 28 for February in a non-leap year", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it("returns 31 for December, without rolling into next year", () => {
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("computeAttendanceSummary", () => {
  it("computes exact days worked, total hours, and average for a normal set", () => {
    expect(
      computeAttendanceSummary([
        { hoursWorked: 8 },
        { hoursWorked: 8.4 },
        { hoursWorked: 8.3 },
      ]),
    ).toEqual({
      daysWorked: 3,
      totalHours: 24.7,
      avgPerDay: 24.7 / 3,
      excludedRowCount: 0,
    });
  });

  it("excludes a null hoursWorked row from days worked, total, and average alike", () => {
    expect(
      computeAttendanceSummary([
        { hoursWorked: 8 },
        { hoursWorked: null }, // e.g. an open shift, never clocked out
        { hoursWorked: 8 },
      ]),
    ).toEqual({
      daysWorked: 2,
      totalHours: 16,
      avgPerDay: 8,
      excludedRowCount: 1,
    });
  });

  it("never divides by zero on an all-null row set", () => {
    expect(
      computeAttendanceSummary([{ hoursWorked: null }, { hoursWorked: null }]),
    ).toEqual({
      daysWorked: 0,
      totalHours: 0,
      avgPerDay: 0,
      excludedRowCount: 2,
    });
  });

  it("returns all zeros for an empty row set", () => {
    expect(computeAttendanceSummary([])).toEqual({
      daysWorked: 0,
      totalHours: 0,
      avgPerDay: 0,
      excludedRowCount: 0,
    });
  });
});
