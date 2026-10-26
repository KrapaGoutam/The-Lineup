import { describe, expect, it } from "vitest";

import status from "../../../../tests/fixtures/bar-inventory/status-vectors.json";
import {
  ADJUSTMENT_REASONS,
  effectiveWarning,
  evaluateStock,
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
