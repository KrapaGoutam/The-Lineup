import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildItemAnalytics,
  fastestMoving,
  frequentlyHittingCutoff,
  presetWindow,
  slowestMoving,
} from "./analytics";
import { buildDemoCatalog } from "./demo-catalog";
import { buildInventoryRows } from "./inventory-rows";

const TZ = "America/New_York";
const NOW = new Date("2026-10-27T16:00:00Z");

describe("the demo catalog's back-dated history", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const build = () => {
    const state = buildDemoCatalog();
    const items = buildItemAnalytics(
      state.ledger ?? [],
      buildInventoryRows(state),
      {
        window: presetWindow(30, TZ, NOW),
        includeObserved: true,
        includeShrink: false,
        timeZone: TZ,
        now: NOW,
      },
    );
    return {
      state,
      items,
      by: (name: string) => items.find((i) => i.item === name)!,
    };
  };

  it("every chain ends exactly at the product's current counts", () => {
    const { state } = build();
    for (const stock of state.stock) {
      const last = (state.ledger ?? [])
        .filter((e) => e.productId === stock.productId)
        .at(-1)!;
      expect([last.newOnHand, last.newBackup]).toEqual([
        stock.onHand,
        stock.backup,
      ]);
    }
  });

  it("each entry continues from the one before it and ids follow time", () => {
    const ledger = build().state.ledger ?? [];
    expect(ledger.map((e) => Number(e.id))).toEqual(
      ledger.map((_, i) => i + 1),
    );
    const times = ledger.map((e) => e.at);
    expect(times).toEqual([...times].sort());
    for (const id of new Set(ledger.map((e) => e.productId))) {
      const chain = ledger.filter((e) => e.productId === id);
      chain.slice(1).forEach((e, i) => {
        expect([e.prevOnHand, e.prevBackup]).toEqual([
          chain[i].newOnHand,
          chain[i].newBackup,
        ]);
      });
    }
  });

  it("Tito's: 12 units over 30 days = 0.4/day, 2.8/week, hit its cutoff twice", () => {
    const tito = build().by("Tito's Handmade Vodka");
    expect(tito).toMatchObject({
      depletion: 12,
      perDay: 0.4,
      perWeek: 2.8,
      cutoffHits: 2,
      chronic: true,
      restockQuantity: 10,
      restockCount: 1,
      daysToCutoffText: "At or below cutoff",
    });
  });

  it("Modelo is the fastest mover and is about to run out", () => {
    const { items, by } = build();
    expect(fastestMoving(items)[0].item).toBe("Modelo Especial");
    expect(by("Modelo Especial")).toMatchObject({
      perDay: 1.5,
      daysToCutoffText: "0–1 days",
    });
  });

  it("Casamigos is slow, with a range rather than a decimal", () => {
    const casa = build().by("Casamigos Blanco");
    expect(casa.perDay).toBeCloseTo(5 / 30, 3);
    expect(casa.daysToCutoffText).toBe("17–30 days");
  });

  it("Gin has too little history: no rate, no estimate, and no cutoff to reach", () => {
    expect(build().by("House Rail Gin")).toMatchObject({
      perDay: null,
      evidence: "Not enough history",
      daysToCutoffText: "No cutoff set",
    });
  });

  it("rankings and the chronic list read from it", () => {
    const { items } = build();
    expect(fastestMoving(items).map((i) => i.item)).toEqual([
      "Modelo Especial",
      "Tito's Handmade Vodka",
      "Casamigos Blanco",
    ]);
    expect(slowestMoving(items)[0].item).toBe("Casamigos Blanco");
    expect(frequentlyHittingCutoff(items).map((i) => i.item)).toEqual([
      "Tito's Handmade Vodka",
    ]);
  });
});
