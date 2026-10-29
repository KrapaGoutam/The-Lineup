import { describe, expect, it } from "vitest";
import { countValue, reviewCounts } from "./bulk-count";
import { buildDemoCatalog } from "./demo-catalog";
import { buildInventoryRows } from "./inventory-rows";
import { applyCatalogCommand } from "./catalog-engine";
const ctx = {
  actorName: "Manager",
  now: new Date("2026-10-28T12:00:00Z"),
  newId: () => crypto.randomUUID(),
};
describe("bulk count", () => {
  it.each(["", " "])("blank %j is unchanged", (v) =>
    expect(countValue(v)).toBeNull(),
  );
  it.each(["0", "0.00", ".5", "1.25", "9999999999.99"])("accepts %s", (v) =>
    expect(countValue(v)).toBe(Number(v)),
  );
  it.each(["-1", "1.001", "NaN", "Infinity", "1e2", "1,000", "10000000000"])(
    "rejects %s",
    (v) => expect(() => countValue(v)).toThrow(),
  );
  it("reviews only changes, preserves blanks and explicit zero", () => {
    const rows = buildInventoryRows(buildDemoCatalog());
    const row = rows[0];
    expect(reviewCounts(rows, {})).toEqual([]);
    const changes = reviewCounts(rows, {
      [row.productId]: { onHand: "0", backup: "" },
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      onHand: 0,
      backup: row.backup,
      request: { onHand: 0, backup: null },
    });
  });
  it("stale demo batch and invalid later row leave original state unchanged", () => {
    const state = buildDemoCatalog();
    const rows = buildInventoryRows(state).slice(0, 2);
    const before = structuredClone(state);
    const request = rows.map((r) => ({
      productId: r.productId,
      expectedVersion: r.stockVersion,
      onHand: 10,
      backup: null,
    }));
    const stale = applyCatalogCommand(
      state,
      {
        type: "bulkCount",
        rows: [request[0], { ...request[1], expectedVersion: 999 }],
        reason: "stock_count",
        note: null,
      },
      ctx,
    );
    expect(stale.ok).toBe(false);
    expect(state).toEqual(before);
    const invalid = applyCatalogCommand(
      state,
      {
        type: "bulkCount",
        rows: [request[0], { ...request[1], onHand: -1 }],
        reason: "stock_count",
        note: null,
      },
      ctx,
    );
    expect(invalid.ok).toBe(false);
    expect(state).toEqual(before);
  });
  it("writes normal ledger entries only for changed products", () => {
    const state = buildDemoCatalog();
    const rows = buildInventoryRows(state).slice(0, 2);
    const result = applyCatalogCommand(
      state,
      {
        type: "bulkCount",
        rows: rows.map((r, i) => ({
          productId: r.productId,
          expectedVersion: r.stockVersion,
          onHand: i === 0 ? r.onHand + 1 : r.onHand,
          backup: null,
        })),
        reason: "stock_count",
        note: "weekly",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.ledger?.length).toBe((state.ledger?.length ?? 0) + 1);
    expect(result.state.ledger?.at(-1)).toMatchObject({
      reason: "stock_count",
      source: "count",
      note: "weekly",
      actorName: "Manager",
    });
  });
});
