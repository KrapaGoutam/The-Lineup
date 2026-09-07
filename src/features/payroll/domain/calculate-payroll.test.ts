import { describe, expect, it } from "vitest";

import {
  computeGrossCents,
  monthDateRange,
  normalizePeriodMonth,
  resolveEffectiveRateCents,
} from "./calculate-payroll";

describe("computeGrossCents", () => {
  it.each([
    // [hoursSnapshot, rateCentsSnapshot, expectedGrossCents]
    [100, 1000, 100000], // Anil, August, 100 hrs x $10 = $1000 -- the spec's own example
    [86.5, 1200, 103800],
    [0, 1500, 0],
    [1, 0, 0],
    // Deliberately drift-prone: a repeating decimal that would accumulate
    // error under repeated float operations, asserted against the exact
    // hand-computed cent value a single Math.round produces.
    [33.333333, 1000, 33333],
    [7.1, 950, 6745],
    [7.15, 950, 6793], // 7.15 * 950 = 6792.5 -> rounds up
    [7.25, 950, 6888], // 7.25 * 950 = 6887.5 -> rounds up (round-half-up in this direction)
    [40.1, 2575, 103258], // 40.1 * 2575 = 103257.5 -> rounds up
  ])(
    "%d hours at %d cents/hr produces exactly %d cents",
    (hours, rateCents, expected) => {
      expect(computeGrossCents(hours, rateCents)).toBe(expected);
    },
  );

  it("never produces a non-integer result", () => {
    for (const [hours, rate] of [
      [1.1, 333],
      [2.7, 777],
      [99.99, 1099],
    ]) {
      expect(Number.isInteger(computeGrossCents(hours, rate))).toBe(true);
    }
  });
});

describe("resolveEffectiveRateCents", () => {
  it("prefers a per-person override over the organization default", () => {
    expect(
      resolveEffectiveRateCents({
        overrideRateCents: 1200,
        defaultRateCents: 1000,
      }),
    ).toBe(1200);
  });

  it("falls back to the organization default when there is no override", () => {
    expect(
      resolveEffectiveRateCents({
        overrideRateCents: null,
        defaultRateCents: 1000,
      }),
    ).toBe(1000);
  });

  it("returns null when neither an override nor a default exists", () => {
    expect(
      resolveEffectiveRateCents({
        overrideRateCents: null,
        defaultRateCents: null,
      }),
    ).toBeNull();
  });

  it("a zero override is a real rate, not treated as absent", () => {
    expect(
      resolveEffectiveRateCents({
        overrideRateCents: 0,
        defaultRateCents: 1000,
      }),
    ).toBe(0);
  });
});

describe("normalizePeriodMonth", () => {
  it("normalizes any day within a month to the 1st", () => {
    expect(normalizePeriodMonth("2026-08-17")).toBe("2026-08-01");
    expect(normalizePeriodMonth("2026-08-01")).toBe("2026-08-01");
    expect(normalizePeriodMonth("2026-08-31")).toBe("2026-08-01");
  });
});

describe("monthDateRange", () => {
  it("returns the full first-to-last day range for a month", () => {
    expect(monthDateRange("2026-08-01")).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    });
  });

  it("handles February in a non-leap and a leap year", () => {
    expect(monthDateRange("2026-02-01")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
    expect(monthDateRange("2028-02-01")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
  });

  it("rolls December over into the correct year boundary", () => {
    expect(monthDateRange("2026-12-01")).toEqual({
      start: "2026-12-01",
      end: "2026-12-31",
    });
  });
});
