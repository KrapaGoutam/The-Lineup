import { describe, expect, it } from "vitest";

import { zonedWallTimeFromInstant, zonedWallTimeToInstant } from "./timezone";

// US DST dates for 2026, computed independently of the implementation
// (2026-01-01 is a Thursday, giving 2026-03-01 as a Sunday and
// 2026-11-01 as a Sunday too -- 245 days apart, divisible by 7): the
// 2nd Sunday of March (2026-03-08, "spring forward" 2:00 AM -> 3:00 AM)
// and the 1st Sunday of November (2026-11-01, "fall back" 2:00 AM ->
// 1:00 AM).

describe("zonedWallTimeToInstant", () => {
  it("converts a plain winter (standard time) wall time correctly", () => {
    const instant = zonedWallTimeToInstant({
      date: "2026-01-15",
      time: "11:00",
      timeZone: "America/Chicago",
    });
    // CST is UTC-6 in January.
    expect(instant.toISOString()).toBe("2026-01-15T17:00:00.000Z");
  });

  it("uses the offset for the given date, not whatever the offset happens to be right now -- summer wall time converts differently than winter", () => {
    const instant = zonedWallTimeToInstant({
      date: "2026-07-15",
      time: "11:00",
      timeZone: "America/Chicago",
    });
    // CDT is UTC-5 in July.
    expect(instant.toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });

  it("resolves a spring-forward gap (a wall time that never existed) deterministically, without throwing", () => {
    // 2026-03-08 02:30 local never happened -- clocks jumped from 2:00 to
    // 3:00 that morning. Policy: resolve to the instant already past the
    // gap, shifted forward by the gap's size (so 02:30 -> 03:30 CDT).
    const instant = zonedWallTimeToInstant({
      date: "2026-03-08",
      time: "02:30",
      timeZone: "America/Chicago",
    });
    expect(instant.toISOString()).toBe("2026-03-08T08:30:00.000Z");
    // Confirms it actually lands after the gap, at 3:30 AM CDT (UTC-5).
    expect(zonedWallTimeFromInstant(instant, "America/Chicago")).toEqual({
      date: "2026-03-08",
      time: "03:30",
    });
  });

  it("resolves a fall-back overlap (a wall time that happened twice) to its first, earlier occurrence", () => {
    // 2026-11-01 01:30 local happened twice -- once at 1:30 AM CDT
    // (before the fallback) and again an hour later at 1:30 AM CST.
    // Policy: prefer the earlier (first) occurrence.
    const instant = zonedWallTimeToInstant({
      date: "2026-11-01",
      time: "01:30",
      timeZone: "America/Chicago",
    });
    // The first occurrence is under CDT (UTC-5): 01:30 + 5h = 06:30 UTC.
    // (The second, later occurrence under CST would be 07:30 UTC.)
    expect(instant.toISOString()).toBe("2026-11-01T06:30:00.000Z");
    expect(zonedWallTimeFromInstant(instant, "America/Chicago")).toEqual({
      date: "2026-11-01",
      time: "01:30",
    });
  });

  it("an overnight shift crossing the spring-forward night loses exactly the skipped hour, not a naive 8 hours", () => {
    const start = zonedWallTimeToInstant({
      date: "2026-03-07",
      time: "23:00",
      timeZone: "America/Chicago",
    });
    const end = zonedWallTimeToInstant({
      date: "2026-03-08",
      time: "07:00",
      timeZone: "America/Chicago",
    });
    const durationHours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);
    expect(durationHours).toBe(7);
  });

  it("an overnight shift crossing the fall-back night gains exactly the repeated hour, not a naive 8 hours", () => {
    const start = zonedWallTimeToInstant({
      date: "2026-10-31",
      time: "23:00",
      timeZone: "America/Chicago",
    });
    const end = zonedWallTimeToInstant({
      date: "2026-11-01",
      time: "07:00",
      timeZone: "America/Chicago",
    });
    const durationHours = (end.getTime() - start.getTime()) / (60 * 60 * 1000);
    expect(durationHours).toBe(9);
  });

  it("round-trips a plain instant back to the same wall time it was built from", () => {
    const instant = zonedWallTimeToInstant({
      date: "2026-09-10",
      time: "16:45",
      timeZone: "America/Chicago",
    });
    expect(zonedWallTimeFromInstant(instant, "America/Chicago")).toEqual({
      date: "2026-09-10",
      time: "16:45",
    });
  });

  it("handles a non-DST-observing zone the same as any other", () => {
    const instant = zonedWallTimeToInstant({
      date: "2026-06-01",
      time: "09:00",
      timeZone: "UTC",
    });
    expect(instant.toISOString()).toBe("2026-06-01T09:00:00.000Z");
  });
});
