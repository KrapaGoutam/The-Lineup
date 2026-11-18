import { describe, expect, it } from "vitest";

import { mapAttendanceRow } from "@/features/attendance/data/attendance-data";
import { formatBusinessTime } from "@/lib/date-time";
import { zonedWallTimeFromInstant } from "@/lib/timezone";

import {
  EXTERNAL_NEON_SOURCE_TIME_ZONE,
  neonWallTimeToInstantIso,
} from "./neon-timestamp";

// Every expectation below is an explicit fixture in an explicit zone. None of
// them may depend on the machine running the suite -- CI is checked under
// several process time zones (TZ=UTC, America/Chicago, Asia/Tokyo).

const CHICAGO = EXTERNAL_NEON_SOURCE_TIME_ZONE;

describe("neonWallTimeToInstantIso", () => {
  it("is America/Chicago", () => {
    expect(CHICAGO).toBe("America/Chicago");
  });

  it("reported case: a stored 10:59 renders as 10:59 AM Central, not 4:59 AM", () => {
    // Standard time (CST, UTC-6) -- the 2026-11-17 observation.
    const iso = neonWallTimeToInstantIso("2026-11-17 10:59:00")!;
    expect(iso).toBe("2026-11-17T16:59:00.000Z");
    expect(formatBusinessTime(iso, CHICAGO)).toBe("10:59 AM");
    expect(zonedWallTimeFromInstant(new Date(iso), CHICAGO).time).toBe("10:59");
  });

  it("daylight time (CDT, UTC-5) resolves with its own offset, not a fixed +6", () => {
    const iso = neonWallTimeToInstantIso("2026-07-17 10:59:00")!;
    expect(iso).toBe("2026-07-17T15:59:00.000Z");
    expect(formatBusinessTime(iso, CHICAGO)).toBe("10:59 AM");
  });

  it("keeps seconds and fractional seconds", () => {
    expect(neonWallTimeToInstantIso("2026-11-17 10:59:30.5")).toBe(
      "2026-11-17T16:59:30.500Z",
    );
    expect(neonWallTimeToInstantIso("2026-11-17 10:59:30.123456")).toBe(
      "2026-11-17T16:59:30.123Z",
    );
  });

  it("passes null through (open shift has no clock-out)", () => {
    expect(neonWallTimeToInstantIso(null)).toBeNull();
  });

  it("spring-forward: times either side of the 02:00->03:00 jump", () => {
    // 2026-03-08. 01:59 CST = 07:59Z; 03:00 CDT = 08:00Z.
    expect(neonWallTimeToInstantIso("2026-03-08 01:59:00")).toBe(
      "2026-03-08T07:59:00.000Z",
    );
    expect(neonWallTimeToInstantIso("2026-03-08 03:00:00")).toBe(
      "2026-03-08T08:00:00.000Z",
    );
    // A wall time inside the skipped hour never existed: resolves past the gap.
    const gap = neonWallTimeToInstantIso("2026-03-08 02:30:00")!;
    expect(gap).toBe("2026-03-08T08:30:00.000Z");
    expect(formatBusinessTime(gap, CHICAGO)).toBe("3:30 AM");
  });

  it("fall-back: the repeated 01:00-02:00 hour resolves to the first occurrence", () => {
    // 2026-11-01. 01:30 happens twice; the source cannot say which, so the
    // documented policy (first occurrence, CDT) applies.
    expect(neonWallTimeToInstantIso("2026-11-01 01:30:00")).toBe(
      "2026-11-01T06:30:00.000Z",
    );
    // Unambiguous neighbours are exact.
    expect(neonWallTimeToInstantIso("2026-11-01 00:59:00")).toBe(
      "2026-11-01T05:59:00.000Z",
    );
    expect(neonWallTimeToInstantIso("2026-11-01 02:00:00")).toBe(
      "2026-11-01T08:00:00.000Z",
    );
  });

  it("is independent of the process time zone (no Date-parsing of the wall time)", () => {
    // The old driver behaviour made this process-dependent. The result must
    // equal an independent computation using only Intl in the target zone.
    const iso = neonWallTimeToInstantIso("2026-11-17 10:59:00")!;
    const rendered = new Intl.DateTimeFormat("en-US", {
      timeZone: CHICAGO,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
    expect(rendered).toBe("10:59");
  });

  it("rejects malformed, impossible, already-zoned and infinite input instead of guessing", () => {
    for (const bad of [
      "",
      "garbage",
      "infinity",
      "2026-02-31 10:00:00",
      "2026-11-17 25:00:00",
      "2026-11-17 10:60:00",
      // An already-localized / instant value must never be converted twice.
      "2026-11-17T16:59:00Z",
      "2026-11-17T10:59:00-06:00",
    ]) {
      expect(() => neonWallTimeToInstantIso(bad), bad).toThrow(
        /Unrecognized Neon attendance timestamp/,
      );
    }
  });
});

describe("mapAttendanceRow (external Monks provider)", () => {
  const base = {
    id: 1,
    user_id: 7,
    date: "2026-11-17",
    hours_worked: "5.5",
    auto_clocked_out: false,
  };

  it("maps clock_in/out text to instants and preserves date, hours and flags verbatim", () => {
    const row = mapAttendanceRow({
      ...base,
      clock_in_local: "2026-11-17 10:59:00",
      clock_out_local: "2026-11-17 16:29:00",
    });
    expect(row).toEqual({
      id: 1,
      userId: 7,
      date: "2026-11-17", // business date is never re-derived or shifted
      clockIn: "2026-11-17T16:59:00.000Z",
      clockOut: "2026-11-17T22:29:00.000Z",
      hoursWorked: 5.5,
      autoClockedOut: false,
    });
    // Duration from the underlying instants agrees with the source's hours.
    const hours =
      (Date.parse(row.clockOut!) - Date.parse(row.clockIn!)) / 3_600_000;
    expect(hours).toBeCloseTo(row.hoursWorked!, 5);
  });

  it("overnight shift: business date stays on the clock-in day; duration is correct", () => {
    const row = mapAttendanceRow({
      ...base,
      date: "2026-11-16",
      hours_worked: 4.5,
      clock_in_local: "2026-11-16 22:00:00",
      clock_out_local: "2026-11-17 02:30:00",
    });
    expect(row.date).toBe("2026-11-16");
    expect(zonedWallTimeFromInstant(new Date(row.clockIn!), CHICAGO)).toEqual({
      date: "2026-11-16",
      time: "22:00",
    });
    expect(zonedWallTimeFromInstant(new Date(row.clockOut!), CHICAGO)).toEqual({
      date: "2026-11-17",
      time: "02:30",
    });
    expect(
      (Date.parse(row.clockOut!) - Date.parse(row.clockIn!)) / 3_600_000,
    ).toBe(4.5);
  });

  it("historical (summer) and recent (winter) records use the same convention", () => {
    const summer = mapAttendanceRow({
      ...base,
      date: "2026-06-10",
      clock_in_local: "2026-06-10 10:59:00",
      clock_out_local: null,
    });
    const winter = mapAttendanceRow({
      ...base,
      clock_in_local: "2026-11-17 10:59:00",
      clock_out_local: null,
    });
    for (const row of [summer, winter]) {
      expect(formatBusinessTime(row.clockIn!, CHICAGO)).toBe("10:59 AM");
      expect(row.clockOut).toBeNull();
    }
  });

  it("attendance (24h) and printable (12h) renderers agree for the same row", () => {
    const row = mapAttendanceRow({
      ...base,
      clock_in_local: "2026-11-17 16:05:00",
      clock_out_local: null,
    });
    expect(zonedWallTimeFromInstant(new Date(row.clockIn!), CHICAGO).time).toBe(
      "16:05",
    );
    expect(formatBusinessTime(row.clockIn!, CHICAGO)).toBe("4:05 PM");
  });

  it("a malformed source value surfaces as an error, not a silently wrong time", () => {
    expect(() =>
      mapAttendanceRow({
        ...base,
        clock_in_local: "not-a-timestamp",
        clock_out_local: null,
      }),
    ).toThrow();
  });
});
