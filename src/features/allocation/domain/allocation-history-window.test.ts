import { describe, expect, it } from "vitest";

import {
  ALLOCATION_HISTORY_DAYS,
  getAllocationHistoryWindow,
  isWithinAllocationHistoryWindow,
  shiftIsoDate,
} from "./allocation-history-window";

describe("shiftIsoDate", () => {
  it("shifts dates forward and backward across normal days", () => {
    expect(shiftIsoDate("2026-11-17", -1)).toBe("2026-11-16");
    expect(shiftIsoDate("2026-11-17", 1)).toBe("2026-11-18");
    expect(shiftIsoDate("2026-11-17", -6)).toBe("2026-11-11");
  });

  it("handles month boundary correctly in non-leap year", () => {
    // 2026 is non-leap (Feb 28 days)
    expect(shiftIsoDate("2026-03-03", -3)).toBe("2026-02-28");
    expect(shiftIsoDate("2026-03-03", -6)).toBe("2026-02-25");
  });

  it("handles month boundary correctly in leap year", () => {
    // 2028 is leap (Feb 29 days)
    expect(shiftIsoDate("2028-03-03", -3)).toBe("2028-02-29");
    expect(shiftIsoDate("2028-03-03", -6)).toBe("2028-02-26");
  });

  it("handles year boundary correctly", () => {
    expect(shiftIsoDate("2027-01-03", -6)).toBe("2026-12-28");
    expect(shiftIsoDate("2026-12-28", 6)).toBe("2027-01-03");
  });
});

describe("getAllocationHistoryWindow", () => {
  it("calculates exact 7-day window for canonical prompt example (Nov 17 -> Nov 11-17)", () => {
    const window = getAllocationHistoryWindow("2026-11-17");
    expect(window.minDate).toBe("2026-11-11");
    expect(window.maxDate).toBe("2026-11-17");
    expect(window.supportedDates).toHaveLength(ALLOCATION_HISTORY_DAYS);
    expect(window.supportedDates).toEqual([
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
    ]);
  });

  it("calculates exact 7-day window over month boundary", () => {
    const window = getAllocationHistoryWindow("2026-03-03");
    expect(window.minDate).toBe("2026-02-25");
    expect(window.maxDate).toBe("2026-03-03");
    expect(window.supportedDates).toHaveLength(7);
    expect(window.supportedDates[0]).toBe("2026-02-25");
    expect(window.supportedDates[6]).toBe("2026-03-03");
  });
});

describe("isWithinAllocationHistoryWindow", () => {
  const today = "2026-11-17";

  it("accepts dates within the 7-day window (Nov 11 to Nov 17)", () => {
    expect(isWithinAllocationHistoryWindow("2026-11-11", today)).toBe(true);
    expect(isWithinAllocationHistoryWindow("2026-11-14", today)).toBe(true);
    expect(isWithinAllocationHistoryWindow("2026-11-17", today)).toBe(true);
  });

  it("rejects dates older than the 7-day window", () => {
    expect(isWithinAllocationHistoryWindow("2026-11-10", today)).toBe(false);
    expect(isWithinAllocationHistoryWindow("2026-11-01", today)).toBe(false);
    expect(isWithinAllocationHistoryWindow("2025-11-17", today)).toBe(false);
  });

  it("rejects future dates", () => {
    expect(isWithinAllocationHistoryWindow("2026-11-18", today)).toBe(false);
    expect(isWithinAllocationHistoryWindow("2026-12-01", today)).toBe(false);
  });
});
