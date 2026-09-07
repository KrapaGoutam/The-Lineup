import { describe, expect, it } from "vitest";

import {
  buildPayrollLedgerLines,
  computeBalanceCents,
  computeGrossCents,
  isFullyPaid,
  monthDateRange,
  normalizePeriodMonth,
  previousPeriodMonth,
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

describe("previousPeriodMonth", () => {
  it("returns the prior calendar month for any day within a month", () => {
    expect(previousPeriodMonth("2026-08-17")).toBe("2026-07-01");
    expect(previousPeriodMonth("2026-08-01")).toBe("2026-07-01");
    expect(previousPeriodMonth("2026-08-31")).toBe("2026-07-01");
  });

  it("rolls January back to December of the prior year", () => {
    expect(previousPeriodMonth("2026-01-15")).toBe("2025-12-01");
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

describe("computeBalanceCents", () => {
  it("the spec's own worked sequence: $1000 generated, -$400, then -$500", () => {
    const gross = 100000;
    let confirmed = 0;
    expect(
      computeBalanceCents({
        grossCents: gross,
        confirmedPaymentsCents: confirmed,
        adjustmentsCents: 0,
      }),
    ).toBe(100000);

    confirmed += 40000;
    expect(
      computeBalanceCents({
        grossCents: gross,
        confirmedPaymentsCents: confirmed,
        adjustmentsCents: 0,
      }),
    ).toBe(60000);

    confirmed += 50000;
    expect(
      computeBalanceCents({
        grossCents: gross,
        confirmedPaymentsCents: confirmed,
        adjustmentsCents: 0,
      }),
    ).toBe(10000);
  });

  it("a wrong confirmed payment corrected by an offsetting adjustment: $400 -> net $40 via a -$360 adjustment", () => {
    // Generated $1000; a confirmed $400 payment was recorded but should
    // have been $40. The confirmed payment is frozen (can't be edited or
    // deleted) -- the fix is a -$360 adjustment, never touching the
    // payment itself.
    const balanceBeforeAdjustment = computeBalanceCents({
      grossCents: 100000,
      confirmedPaymentsCents: 40000,
      adjustmentsCents: 0,
    });
    expect(balanceBeforeAdjustment).toBe(60000); // $600 owed, as if $400 were correct

    const balanceAfterAdjustment = computeBalanceCents({
      grossCents: 100000,
      confirmedPaymentsCents: 40000,
      adjustmentsCents: -36000, // the offsetting -$360 adjustment
    });
    // Net effect: $1000 - $400 - (-$360) = $960 -- i.e. as if only $40 had
    // been paid ($1000 - $40 = $960). The $400 payment and the -$360
    // adjustment both stay on the ledger; neither is edited or removed.
    expect(balanceAfterAdjustment).toBe(96000);
  });

  it("adjustments can move balance in either direction", () => {
    expect(
      computeBalanceCents({
        grossCents: 100000,
        confirmedPaymentsCents: 0,
        adjustmentsCents: 5000, // a positive adjustment reduces what's owed further
      }),
    ).toBe(95000);
    expect(
      computeBalanceCents({
        grossCents: 100000,
        confirmedPaymentsCents: 0,
        adjustmentsCents: -5000, // a negative adjustment increases what's owed
      }),
    ).toBe(105000);
  });

  it("balance can go negative (overpaid) -- not clamped to zero", () => {
    expect(
      computeBalanceCents({
        grossCents: 10000,
        confirmedPaymentsCents: 15000,
        adjustmentsCents: 0,
      }),
    ).toBe(-5000);
  });
});

describe("isFullyPaid", () => {
  it("is true at exactly zero and below, false above zero", () => {
    expect(isFullyPaid(0)).toBe(true);
    expect(isFullyPaid(-100)).toBe(true);
    expect(isFullyPaid(1)).toBe(false);
    expect(isFullyPaid(100000)).toBe(false);
  });
});

describe("buildPayrollLedgerLines", () => {
  it("the spec's own worked sequence: $1000 generated, -$400 (Sep 1), -$500 (Sep 2)", () => {
    const lines = buildPayrollLedgerLines({
      grossCents: 100000,
      periodMonth: "2026-08-01",
      confirmedPayments: [
        { paymentDate: "2026-09-01", amountCents: 40000, comment: null },
        { paymentDate: "2026-09-02", amountCents: 50000, comment: null },
      ],
      adjustments: [],
    });
    expect(lines).toEqual([
      {
        date: "2026-08-01",
        description: "Payroll generated",
        amountCents: 100000,
        runningBalanceCents: 100000,
      },
      {
        date: "2026-09-01",
        description: "Payment",
        amountCents: -40000,
        runningBalanceCents: 60000,
      },
      {
        date: "2026-09-02",
        description: "Payment",
        amountCents: -50000,
        runningBalanceCents: 10000,
      },
    ]);
  });

  it("a wrong confirmed payment corrected by an offsetting adjustment: running balance ends at $960, both entries present", () => {
    const lines = buildPayrollLedgerLines({
      grossCents: 100000,
      periodMonth: "2026-08-01",
      confirmedPayments: [
        {
          paymentDate: "2026-09-01",
          amountCents: 40000,
          comment: "Should have been $40",
        },
      ],
      adjustments: [
        {
          createdAt: "2026-09-05T12:00:00.000Z",
          deltaCents: -36000,
          reason: "Confirmed $400 payment should have been $40",
        },
      ],
    });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      description: "Payroll generated",
      runningBalanceCents: 100000,
    });
    expect(lines[1]).toMatchObject({
      description: "Payment — Should have been $40",
      amountCents: -40000,
      runningBalanceCents: 60000,
    });
    expect(lines[2]).toMatchObject({
      description: "Adjustment — Confirmed $400 payment should have been $40",
      amountCents: 36000, // the negative delta increases what's owed
      runningBalanceCents: 96000,
    });
  });

  it("sorts payments and adjustments chronologically regardless of insertion order", () => {
    const lines = buildPayrollLedgerLines({
      grossCents: 10000,
      periodMonth: "2026-08-01",
      confirmedPayments: [
        { paymentDate: "2026-09-10", amountCents: 1000, comment: null },
        { paymentDate: "2026-09-02", amountCents: 2000, comment: null },
      ],
      adjustments: [],
    });
    expect(lines.map((line) => line.date)).toEqual([
      "2026-08-01",
      "2026-09-02",
      "2026-09-10",
    ]);
  });

  it("with nothing but the generated line, the running balance equals gross", () => {
    const lines = buildPayrollLedgerLines({
      grossCents: 50000,
      periodMonth: "2026-08-01",
      confirmedPayments: [],
      adjustments: [],
    });
    expect(lines).toEqual([
      {
        date: "2026-08-01",
        description: "Payroll generated",
        amountCents: 50000,
        runningBalanceCents: 50000,
      },
    ]);
  });
});
