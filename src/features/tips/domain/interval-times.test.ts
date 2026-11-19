import { describe, expect, it } from "vitest";

import {
  addDays,
  describeInterval,
  resolveIntervalInstants,
} from "@/features/tips/domain/interval-times";

const CHICAGO = "America/Chicago";
const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;

describe("addDays", () => {
  it("rolls over month, year and leap day without the machine zone", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("rejects a malformed date", () => {
    expect(() => addDays("11/18/2026", 1)).toThrow();
  });
});

describe("resolveIntervalInstants", () => {
  it("a same-day interval ends on the service date", () => {
    const r = resolveIntervalInstants({
      serviceDate: "2026-11-18",
      start: "11:00",
      end: "13:00",
      timeZone: CHICAGO,
    });
    expect(r.crossesMidnight).toBe(false);
    expect(hours(r.startsAt, r.endsAt)).toBe(2);
    expect(r.startsAt.toISOString()).toBe("2026-11-18T17:00:00.000Z");
  });

  it("a cross-midnight interval ends on the NEXT calendar day", () => {
    const r = resolveIntervalInstants({
      serviceDate: "2026-11-18",
      start: "23:00",
      end: "01:30",
      timeZone: CHICAGO,
    });
    expect(r.crossesMidnight).toBe(true);
    expect(hours(r.startsAt, r.endsAt)).toBe(2.5);
    expect(r.endsAt.toISOString()).toBe("2026-11-19T07:30:00.000Z");
  });

  it("cross-midnight on the last day of a year and of a month", () => {
    const year = resolveIntervalInstants({
      serviceDate: "2026-12-31",
      start: "22:00",
      end: "02:00",
      timeZone: CHICAGO,
    });
    expect(hours(year.startsAt, year.endsAt)).toBe(4);
    expect(year.endsAt.toISOString()).toBe("2027-01-01T08:00:00.000Z");
  });

  it("spring-forward (2026-03-08): the REAL elapsed time is stored, not the wall-clock difference", () => {
    const r = resolveIntervalInstants({
      serviceDate: "2026-03-08",
      start: "01:00",
      end: "04:00",
      timeZone: CHICAGO,
    });
    expect(hours(r.startsAt, r.endsAt)).toBe(2);
  });

  it("an interval that starts inside the skipped hour moves forward past the gap (02:30 does not exist; it becomes 03:30)", () => {
    const r = resolveIntervalInstants({
      serviceDate: "2026-03-08",
      start: "02:30",
      end: "04:00",
      timeZone: CHICAGO,
    });
    expect(hours(r.startsAt, r.endsAt)).toBe(0.5);
  });

  it("fall-back (2026-11-01): the repeated hour takes the first occurrence", () => {
    const r = resolveIntervalInstants({
      serviceDate: "2026-11-01",
      start: "01:30",
      end: "02:30",
      timeZone: CHICAGO,
    });
    expect(hours(r.startsAt, r.endsAt)).toBe(2);
  });

  it("a cross-midnight interval over the fall-back night", () => {
    const r = resolveIntervalInstants({
      serviceDate: "2026-10-31",
      start: "23:00",
      end: "03:00",
      timeZone: CHICAGO,
    });
    expect(hours(r.startsAt, r.endsAt)).toBe(5);
  });

  it("does not depend on the machine's time zone (a Tokyo location)", () => {
    const r = resolveIntervalInstants({
      serviceDate: "2026-11-18",
      start: "23:00",
      end: "01:00",
      timeZone: "Asia/Tokyo",
    });
    expect(r.startsAt.toISOString()).toBe("2026-11-18T14:00:00.000Z");
    expect(hours(r.startsAt, r.endsAt)).toBe(2);
  });

  it.each([
    ["11:00", "11:00", "different"],
    ["9:00", "10:00", "HH:mm"],
    ["25:00", "10:00", "HH:mm"],
    ["10:00", "10:60", "HH:mm"],
  ])("rejects %s–%s", (start, end, message) => {
    expect(() =>
      resolveIntervalInstants({
        serviceDate: "2026-11-18",
        start,
        end,
        timeZone: CHICAGO,
      }),
    ).toThrow(message);
  });
});

describe("describeInterval", () => {
  it("round-trips wall times and flags a next-day end", () => {
    const r = resolveIntervalInstants({
      serviceDate: "2026-11-18",
      start: "23:00",
      end: "01:30",
      timeZone: CHICAGO,
    });
    expect(
      describeInterval(
        r.startsAt.toISOString(),
        r.endsAt.toISOString(),
        CHICAGO,
      ),
    ).toEqual({ start: "23:00", end: "01:30", endsNextDay: true });
    const same = resolveIntervalInstants({
      serviceDate: "2026-11-18",
      start: "11:00",
      end: "13:00",
      timeZone: CHICAGO,
    });
    expect(
      describeInterval(
        same.startsAt.toISOString(),
        same.endsAt.toISOString(),
        CHICAGO,
      ).endsNextDay,
    ).toBe(false);
  });
});
