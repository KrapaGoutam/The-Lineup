import { describe, expect, it } from "vitest";

import {
  expandRecurringDates,
  parseWeekdayList,
  parseWeekdayToken,
  WEEKDAY_TOKENS,
} from "./recurring-shifts";

describe("WEEKDAY_TOKENS", () => {
  it("is Sun-first, matching Date.getUTCDay()'s own 0=Sun convention", () => {
    expect(WEEKDAY_TOKENS).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });
});

describe("parseWeekdayToken", () => {
  it("resolves every valid token to its 0-6 index", () => {
    expect(parseWeekdayToken("Sun")).toBe(0);
    expect(parseWeekdayToken("Mon")).toBe(1);
    expect(parseWeekdayToken("Tue")).toBe(2);
    expect(parseWeekdayToken("Wed")).toBe(3);
    expect(parseWeekdayToken("Thu")).toBe(4);
    expect(parseWeekdayToken("Fri")).toBe(5);
    expect(parseWeekdayToken("Sat")).toBe(6);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(parseWeekdayToken("mon")).toBe(1);
    expect(parseWeekdayToken("WED")).toBe(3);
    expect(parseWeekdayToken("  Fri ")).toBe(5);
  });

  it("throws a row-usable message on an unknown token", () => {
    expect(() => parseWeekdayToken("Funday")).toThrow(/Unknown day "Funday"/);
  });
});

describe("parseWeekdayList", () => {
  it("splits on semicolons", () => {
    expect(parseWeekdayList("Mon;Wed;Fri")).toEqual([1, 3, 5]);
  });

  it("splits on commas", () => {
    expect(parseWeekdayList("Mon,Wed,Fri")).toEqual([1, 3, 5]);
  });

  it("accepts a mix of separators and stray whitespace", () => {
    expect(parseWeekdayList(" Mon; Wed ,Fri")).toEqual([1, 3, 5]);
  });

  it("deduplicates and sorts", () => {
    expect(parseWeekdayList("Wed;Mon;Mon;Wed")).toEqual([1, 3]);
  });

  it("throws on an empty string", () => {
    expect(() => parseWeekdayList("")).toThrow(/Select at least one day/);
  });

  it("throws on an unknown token anywhere in the list", () => {
    expect(() => parseWeekdayList("Mon;Funday")).toThrow(/Unknown day/);
  });
});

describe("expandRecurringDates", () => {
  it("filters a plain range down to the selected weekday", () => {
    // 2026-09-08 is a Tuesday -- verified against a real Date computation.
    expect(
      expandRecurringDates({
        fromDate: "2026-09-07",
        toDate: "2026-09-13",
        daysOfWeek: [2], // Tue
      }),
    ).toEqual(["2026-09-08"]);
  });

  it("crosses a month boundary correctly", () => {
    // 2026-08-30 is a Sunday; the only Sunday in this range, which spans
    // into September.
    expect(
      expandRecurringDates({
        fromDate: "2026-08-30",
        toDate: "2026-09-02",
        daysOfWeek: [0], // Sun
      }),
    ).toEqual(["2026-08-30"]);
  });

  it("handles a leap-year February correctly", () => {
    // 2028-02-29 is a Tuesday (2028 is a leap year) -- the only Tuesday
    // in this range.
    expect(
      expandRecurringDates({
        fromDate: "2028-02-27",
        toDate: "2028-03-01",
        daysOfWeek: [2], // Tue
      }),
    ).toEqual(["2028-02-29"]);
  });

  it("includes the correct date across a spring-forward DST transition (America/Chicago, 2026-03-08)", () => {
    // Pure date-only math -- no timezone involved here at all, but the
    // spec explicitly calls out DST transitions, so this is asserted
    // directly rather than assumed safe.
    expect(
      expandRecurringDates({
        fromDate: "2026-03-06",
        toDate: "2026-03-10",
        daysOfWeek: [0], // Sun
      }),
    ).toEqual(["2026-03-08"]);
  });

  it("includes the correct date across a fall-back DST transition (America/Chicago, 2026-11-01)", () => {
    expect(
      expandRecurringDates({
        fromDate: "2026-10-30",
        toDate: "2026-11-03",
        daysOfWeek: [0], // Sun
      }),
    ).toEqual(["2026-11-01"]);
  });

  it("supports multiple selected weekdays in one call", () => {
    // Tue 2026-09-08 and Thu 2026-09-10 within a full week.
    expect(
      expandRecurringDates({
        fromDate: "2026-09-07",
        toDate: "2026-09-13",
        daysOfWeek: [2, 4], // Tue, Thu
      }),
    ).toEqual(["2026-09-08", "2026-09-10"]);
  });

  it("returns an empty list when nothing in the range matches", () => {
    expect(
      expandRecurringDates({
        fromDate: "2026-09-08", // Tue
        toDate: "2026-09-08",
        daysOfWeek: [0], // Sun
      }),
    ).toEqual([]);
  });

  it("still enforces expandDateRange's own 62-day cap, not a separate one", () => {
    expect(() =>
      expandRecurringDates({
        fromDate: "2026-01-01",
        toDate: "2026-12-31",
        daysOfWeek: [0],
      }),
    ).toThrow(/cannot exceed 62 days/);
  });
});
