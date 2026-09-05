import { describe, expect, it } from "vitest";

import {
  createShiftInstances,
  expandDateRange,
  findShiftConflicts,
  type ShiftDefaults,
} from "./shift-planning";

const defaults: ShiftDefaults = {
  morning: { start: "11:00", end: "16:00" },
  evening: { start: "16:00", end: "23:00" },
  full_day: { start: "11:00", end: "23:00" },
};

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
