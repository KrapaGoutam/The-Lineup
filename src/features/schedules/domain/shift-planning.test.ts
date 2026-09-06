import { describe, expect, it } from "vitest";

import {
  createShiftInstances,
  expandDateRange,
  findShiftConflicts,
  getMonthDates,
  getWeekDates,
  type ShiftDefaults,
} from "./shift-planning";

const defaults: ShiftDefaults = {
  morning: { start: "11:00", end: "16:00" },
  evening: { start: "16:00", end: "23:00" },
  full_day: { start: "11:00", end: "23:00" },
};

describe("getWeekDates", () => {
  it("returns Monday..Sunday for a date that falls mid-week", () => {
    // 2026-09-10 is a Thursday.
    expect(getWeekDates("2026-09-10")).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("treats a Monday as the start of its own week", () => {
    expect(getWeekDates("2026-09-07")[0]).toBe("2026-09-07");
  });

  it("treats a Sunday as the end of its own week, not the start of the next", () => {
    const week = getWeekDates("2026-09-13");
    expect(week[0]).toBe("2026-09-07");
    expect(week[6]).toBe("2026-09-13");
  });

  it("handles a week that crosses a month boundary", () => {
    // 2026-09-30 is a Wednesday; that week runs Sep 28 -> Oct 4.
    expect(getWeekDates("2026-09-30")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });
});

describe("getMonthDates", () => {
  it("returns every date in a 30-day month, starting on the 1st", () => {
    const dates = getMonthDates("2026-09-14");
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe("2026-09-01");
    expect(dates.at(-1)).toBe("2026-09-30");
  });

  it("returns every date in a 28-day February (2026 is not a leap year)", () => {
    const dates = getMonthDates("2026-02-10");
    expect(dates).toHaveLength(28);
    expect(dates.at(-1)).toBe("2026-02-28");
  });

  it("returns every date in a 29-day leap February", () => {
    const dates = getMonthDates("2028-02-10");
    expect(dates).toHaveLength(29);
    expect(dates.at(-1)).toBe("2028-02-29");
  });
});

describe("shift planning", () => {
  it("expands an optional inclusive date range", () => {
    expect(expandDateRange("2026-09-07", "2026-09-09")).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
    ]);
    expect(expandDateRange("2026-09-07")).toEqual(["2026-09-07"]);
  });

  it("uses configured defaults when custom times are omitted", () => {
    expect(
      createShiftInstances({
        fromDate: "2026-09-07",
        shiftKind: "morning",
        defaults,
      })[0],
    ).toMatchObject({
      startLocal: "11:00",
      endLocal: "16:00",
      usesDefaultTime: true,
    });
  });

  it("supports custom overnight shifts", () => {
    expect(
      createShiftInstances({
        fromDate: "2026-09-07",
        shiftKind: "evening",
        customStart: "18:00",
        customEnd: "01:00",
        defaults,
      })[0],
    ).toMatchObject({
      endDate: "2026-09-08",
      usesDefaultTime: false,
    });
  });

  it("identifies overlapping shifts for the same employee", () => {
    const shifts = [
      ...createShiftInstances({
        fromDate: "2026-09-07",
        shiftKind: "morning",
        defaults,
      }),
      ...createShiftInstances({
        fromDate: "2026-09-07",
        shiftKind: "full_day",
        defaults,
      }),
    ].map((shift) => ({ ...shift, employeeId: "mia" }));
    expect(findShiftConflicts(shifts)).toEqual([0, 1]);
  });
});
