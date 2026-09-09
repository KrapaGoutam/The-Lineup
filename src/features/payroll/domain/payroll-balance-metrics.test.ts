import { describe, expect, it } from "vitest";

import {
  computeOverallBalanceOwedCents,
  computeOwedForMonth,
  derivePeriodStatus,
  findOldestOpenPeriod,
  groupPeriodsByPerson,
  type PayrollPeriodWithBalance,
} from "./payroll-balance-metrics";

function period(
  overrides: Partial<PayrollPeriodWithBalance>,
): PayrollPeriodWithBalance {
  return {
    id: 1,
    neonUserId: 1,
    periodMonth: "2026-08-01",
    hoursSnapshot: 100,
    rateCentsSnapshot: 1000,
    grossCents: 100000,
    status: "locked",
    balanceCents: 0,
    ...overrides,
  };
}

describe("computeOverallBalanceOwedCents", () => {
  it("sums positive balances across periods", () => {
    expect(
      computeOverallBalanceOwedCents([
        { balanceCents: 5000 },
        { balanceCents: 3000 },
      ]),
    ).toBe(8000);
  });

  it("clamps a negative (overpaid) period to zero before summing -- never offsets what's owed elsewhere", () => {
    expect(
      computeOverallBalanceOwedCents([
        { balanceCents: -2000 },
        { balanceCents: 5000 },
      ]),
    ).toBe(5000);
  });

  it("returns zero for no periods", () => {
    expect(computeOverallBalanceOwedCents([])).toBe(0);
  });
});

describe("computeOwedForMonth", () => {
  it("sums only the matching month's clamped balances", () => {
    expect(
      computeOwedForMonth(
        [
          { periodMonth: "2026-08-01", balanceCents: 4000 },
          { periodMonth: "2026-09-01", balanceCents: 6000 },
          { periodMonth: "2026-08-01", balanceCents: 1000 },
        ],
        "2026-08-01",
      ),
    ).toBe(5000);
  });

  it("is a different figure than gross generated -- a fully-paid period contributes zero, not its gross", () => {
    expect(
      computeOwedForMonth(
        [{ periodMonth: "2026-08-01", balanceCents: 0 }],
        "2026-08-01",
      ),
    ).toBe(0);
  });

  it("returns zero when no period matches the month", () => {
    expect(
      computeOwedForMonth(
        [{ periodMonth: "2026-08-01", balanceCents: 4000 }],
        "2026-09-01",
      ),
    ).toBe(0);
  });
});

describe("findOldestOpenPeriod", () => {
  it("finds the chronologically earliest period with a positive balance, regardless of input order", () => {
    expect(
      findOldestOpenPeriod([
        { periodMonth: "2026-09-01", neonUserId: 1, balanceCents: 1000 },
        { periodMonth: "2026-07-01", neonUserId: 2, balanceCents: 2000 },
        { periodMonth: "2026-08-01", neonUserId: 3, balanceCents: 3000 },
      ]),
    ).toEqual({ periodMonth: "2026-07-01", neonUserId: 2, balanceCents: 2000 });
  });

  it("skips fully-paid and overpaid periods -- balanceCents <= 0 is never 'open'", () => {
    expect(
      findOldestOpenPeriod([
        { periodMonth: "2026-06-01", neonUserId: 1, balanceCents: 0 },
        { periodMonth: "2026-07-01", neonUserId: 2, balanceCents: -500 },
        { periodMonth: "2026-08-01", neonUserId: 3, balanceCents: 1000 },
      ]),
    ).toEqual({ periodMonth: "2026-08-01", neonUserId: 3, balanceCents: 1000 });
  });

  it("returns null when every period is settled", () => {
    expect(
      findOldestOpenPeriod([
        { periodMonth: "2026-06-01", neonUserId: 1, balanceCents: 0 },
      ]),
    ).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(findOldestOpenPeriod([])).toBeNull();
  });

  it("on a tie, keeps the first one encountered in input order", () => {
    expect(
      findOldestOpenPeriod([
        { periodMonth: "2026-07-01", neonUserId: 1, balanceCents: 1000 },
        { periodMonth: "2026-07-01", neonUserId: 2, balanceCents: 2000 },
      ]),
    ).toEqual({ periodMonth: "2026-07-01", neonUserId: 1, balanceCents: 1000 });
  });
});

describe("derivePeriodStatus", () => {
  it("is 'paid' only once locked AND fully settled", () => {
    expect(derivePeriodStatus({ status: "locked", balanceCents: 0 })).toBe(
      "paid",
    );
    expect(derivePeriodStatus({ status: "locked", balanceCents: -100 })).toBe(
      "paid",
    );
  });

  it("stays 'locked' when locked but still owed", () => {
    expect(derivePeriodStatus({ status: "locked", balanceCents: 5000 })).toBe(
      "locked",
    );
  });

  it("is never 'paid' while still draft, even if the balance happens to already be zero -- nothing about it is final yet", () => {
    expect(derivePeriodStatus({ status: "draft", balanceCents: 0 })).toBe(
      "draft",
    );
  });
});

describe("groupPeriodsByPerson", () => {
  it("groups by neonUserId, sorts each person's periods chronologically, and sums their total balance unclamped", () => {
    const groups = groupPeriodsByPerson([
      period({ neonUserId: 2, periodMonth: "2026-09-01", balanceCents: 3000 }),
      period({ neonUserId: 1, periodMonth: "2026-09-01", balanceCents: 5000 }),
      period({ neonUserId: 1, periodMonth: "2026-07-01", balanceCents: -1000 }),
    ]);

    expect(groups).toHaveLength(2);
    // Groups ordered by neonUserId ascending.
    expect(groups[0].neonUserId).toBe(1);
    expect(groups[1].neonUserId).toBe(2);
    // This person's own periods sorted oldest-first.
    expect(groups[0].periods.map((p) => p.periodMonth)).toEqual([
      "2026-07-01",
      "2026-09-01",
    ]);
    // Unclamped -- an overpaid month CAN offset an owed one for the same person.
    expect(groups[0].totalBalanceCents).toBe(4000);
    expect(groups[0].openPeriodCount).toBe(1);
  });

  it("returns an empty array for no periods", () => {
    expect(groupPeriodsByPerson([])).toEqual([]);
  });
});
