import { describe, expect, it } from "vitest";

import { allocateTipInterval } from "@/features/tips/domain/calculate-tip-splits";
import {
  assertTenderAmounts,
  describeRemainder,
  isReconciled,
  splitTenders,
} from "@/features/tips/domain/tender-split";

// Same worked examples as supabase/tests/database/0091_editable_tips.test.sql, which pins
// the SQL (`private.tips_interval_shares`) to these exact numbers.
describe("splitTenders — parity with the database", () => {
  it("$10.01 cash + $5.00 card among three: remainders are deterministic", () => {
    const split = splitTenders({
      cashCents: 1001,
      cardCents: 500,
      participantIds: ["c", "a", "b"],
    });
    expect(split.shares.map((s) => s.participantId)).toEqual(["a", "b", "c"]);
    expect(split.shares.map((s) => s.totalCents)).toEqual([501, 500, 500]);
    expect(split.shares.map((s) => s.cashCents)).toEqual([334, 334, 333]);
    expect(split.shares.map((s) => s.cardCents)).toEqual([167, 166, 167]);
    expect(isReconciled(split)).toBe(true);
  });

  it("1¢ cash + 1¢ card among two: each person receives exactly 1¢ in total", () => {
    const split = splitTenders({
      cashCents: 1,
      cardCents: 1,
      participantIds: ["a", "b"],
    });
    expect(split.shares.map((s) => s.cashCents)).toEqual([1, 0]);
    expect(split.shares.map((s) => s.cardCents)).toEqual([0, 1]);
    expect(split.shares.map((s) => s.totalCents)).toEqual([1, 1]);
  });

  it("de-duplicates participants (a person can never be paid twice)", () => {
    const split = splitTenders({
      cashCents: 100,
      cardCents: 0,
      participantIds: ["a", "a", "b"],
    });
    expect(split.shares).toHaveLength(2);
    expect(split.totalCents).toBe(100);
  });
});

describe("splitTenders — financial invariants", () => {
  // Small deterministic PRNG so a failure is reproducible.
  function prng(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  it("never loses or duplicates a cent, never goes negative, and keeps the legacy total split (20k random cases)", () => {
    const next = prng(20261119);
    for (let i = 0; i < 20_000; i += 1) {
      const people = 1 + Math.floor(next() * 12);
      const cash = Math.floor(next() * (next() < 0.2 ? 5 : 100_000));
      const card = Math.floor(next() * (next() < 0.2 ? 5 : 100_000));
      if (cash + card === 0) continue;
      const ids = Array.from({ length: people }, (_, n) => `p${n}`);
      const split = splitTenders({
        cashCents: cash,
        cardCents: card,
        participantIds: ids,
      });
      expect(isReconciled(split)).toBe(true);
      const legacy = allocateTipInterval({
        id: "x",
        start: "10:00",
        end: "11:00",
        amountCents: cash + card,
        participantIds: ids,
      }).allocations;
      expect(split.shares.map((s) => s.totalCents)).toEqual(
        legacy.map((a) => a.amountCents),
      );
      // Everyone is within one cent of everyone else, per tender and in total.
      for (const pick of [
        (s: (typeof split.shares)[number]) => s.totalCents,
        (s: (typeof split.shares)[number]) => s.cashCents,
      ]) {
        const values = split.shares.map(pick);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(
          1,
        );
      }
    }
  });

  it("discloses the remainder and who received the extra cents", () => {
    const split = splitTenders({
      cashCents: 1001,
      cardCents: 500,
      participantIds: ["a", "b", "c"],
    });
    expect(split.remainder.totalRemainderCents).toBe(0 + (1501 % 3));
    expect(split.remainder.totalRemainderRecipients).toEqual(["a"]);
    expect(split.remainder.cashRemainderRecipients).toEqual(["a", "b"]);
    expect(describeRemainder(split, (id) => id.toUpperCase())).toContain("A");
    expect(
      describeRemainder(
        splitTenders({
          cashCents: 300,
          cardCents: 0,
          participantIds: ["a", "b", "c"],
        }),
        (id) => id,
      ),
    ).toBeNull();
  });
});

describe("amount validation", () => {
  it.each([
    [-1, 5],
    [5, -1],
    [1.5, 0],
    [Number.NaN, 5],
    [10_000_001, 0],
    [0, 0],
  ])("rejects cash %s / card %s", (cash, card) => {
    expect(() => assertTenderAmounts(cash, card)).toThrow();
  });

  it("rejects an empty or oversized participant list", () => {
    expect(() =>
      splitTenders({ cashCents: 1, cardCents: 0, participantIds: [] }),
    ).toThrow("at least one participant");
    expect(() =>
      splitTenders({
        cashCents: 1000,
        cardCents: 0,
        participantIds: Array.from({ length: 201 }, (_, n) => `p${n}`),
      }),
    ).toThrow("Too many");
  });
});
