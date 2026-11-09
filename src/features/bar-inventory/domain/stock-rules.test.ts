import { describe, expect, it } from "vitest";

import status from "../../../../tests/fixtures/bar-inventory/status-vectors.json";
import {
  ADJUSTMENT_REASONS,
  effectiveWarning,
  evaluateStock,
  parseQuantityInput,
  sourceForReason,
  statusRank,
  toCents,
  totalAvailable,
} from "./stock-rules";

describe("stock rules mirror the shared golden vectors", () => {
  it.each(status.vectors)("$id", ({ input, expected }) => {
    const result = evaluateStock(
      {
        onHand: input.on_hand,
        backup: input.backup,
        cutoff: input.cutoff,
        warning: input.warning,
        par: input.par,
      },
      { archived: input.archived },
    );
    expect({
      total: result.total,
      effective_warning: result.effectiveWarning,
      status: result.status,
      suggested_order: result.suggestedOrder,
      order_needed: result.orderNeeded,
    }).toEqual(expected);
  });
});

describe("exact quantity arithmetic", () => {
  it("adds in cents, not floating point", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(totalAvailable(0.1, 0.2)).toBe(0.3);
  });

  it("rejects more than two decimals and non-numbers", () => {
    expect(() => toCents(1.234)).toThrow(/two decimal/);
    expect(() => toCents(Number.NaN)).toThrow();
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => toCents(99_999_999_999)).toThrow(/too large/);
    expect(toCents(1.25)).toBe(125);
  });
});

describe("fraction and decimal quantity parsing", () => {
  it.each([
    ["0", 0],
    ["0.5", 0.5],
    ["0.75", 0.75],
    ["1/2", 0.5],
    ["3/4", 0.75],
    ["1/4", 0.25],
    ["1 1/2", 1.5],
    ["2", 2],
    ["2.25", 2.25],
    ["2 1/4", 2.25],
    ["3 3/4", 3.75],
    [".5", 0.5],
    ["  1 1/2  ", 1.5],
  ])("parses valid input %j -> %s", (input, expected) => {
    const res = parseQuantityInput(input);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toBe(expected);
      expect(res.cents).toBe(Math.round(expected * 100));
    }
  });

  it.each([
    ["1/8", /fraction cannot be represented/i],
    ["3/8", /fraction cannot be represented/i],
    ["1/3", /fraction cannot be represented/i],
    ["2/3", /fraction cannot be represented/i],
    ["1/6", /fraction cannot be represented/i],
    ["1 1/8", /fraction cannot be represented/i],
  ])(
    "rejects nonrepresentable fraction %j without silent rounding",
    (input, pattern) => {
      const res = parseQuantityInput(input);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(pattern);
      }
    },
  );

  it.each([
    ["-1", /cannot be negative/i],
    ["-1/2", /cannot be negative/i],
    ["-0.5", /cannot be negative/i],
    ["1/0", /division by zero/i],
    ["abc", /not a number/i],
    ["5.", /not a number/i],
    ["1,200", /thousand/i],
    ["1 200", /thousand/i],
    ["1.234", /at most two decimal/i],
  ])("rejects invalid input %j with clear message", (input, pattern) => {
    const res = parseQuantityInput(input);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(pattern);
    }
  });

  it("handles blank input with allowBlank option", () => {
    expect(parseQuantityInput("", { allowBlank: true })).toEqual({
      ok: true,
      value: null,
      cents: null,
    });
    expect(parseQuantityInput("   ", { allowBlank: true })).toEqual({
      ok: true,
      value: null,
      cents: null,
    });
    expect(parseQuantityInput("", { allowBlank: false }).ok).toBe(false);
  });
});

describe("warning fallback", () => {
  it.each([
    [0, 1],
    [1, 2],
    [4, 5],
    [6, 8],
    [8, 10],
    [20, 25],
    [0.5, 1.5],
  ])("cutoff %s -> warning %s", (cutoff, expected) => {
    expect(effectiveWarning(cutoff, null)).toBe(expected);
  });

  it("uses an explicit warning and returns null without a cutoff", () => {
    expect(effectiveWarning(4, 9)).toBe(9);
    expect(effectiveWarning(null, null)).toBeNull();
  });
});

describe("ordering and reasons", () => {
  it("ranks critical before low before the rest", () => {
    const order = (["healthy", "low", "critical", "no_cutoff"] as const)
      .slice()
      .sort((a, b) => statusRank(a) - statusRank(b));
    expect(order).toEqual(["critical", "low", "healthy", "no_cutoff"]);
  });

  it("lists the nine approved reasons and derives the ledger source", () => {
    expect(ADJUSTMENT_REASONS).toHaveLength(9);
    expect(sourceForReason("stock_count")).toBe("count");
    expect(sourceForReason("delivery_restock")).toBe("delivery");
    expect(sourceForReason("usage")).toBe("manual_edit");
  });
});
