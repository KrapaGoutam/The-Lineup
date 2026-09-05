import { describe, expect, it } from "vitest";

import {
  allocateTipInterval,
  calculateTipSplits,
  dollarsToCents,
} from "./calculate-tip-splits";

describe("tip splitting", () => {
  it("reproduces the approved multi-interval example", () => {
    const result = calculateTipSplits([
      {
        id: "one",
        start: "11:00",
        end: "13:00",
        amountCents: 900,
        participantIds: ["a", "b", "c"],
      },
      {
        id: "two",
        start: "13:00",
        end: "23:00",
        amountCents: 800,
        participantIds: ["a", "b", "c", "d"],
      },
    ]);
    expect(result.totals).toEqual([
      { participantId: "a", amountCents: 500 },
      { participantId: "b", amountCents: 500 },
      { participantId: "c", amountCents: 500 },
      { participantId: "d", amountCents: 200 },
    ]);
    expect(result.totalCents).toBe(1700);
  });

  it("assigns remainder cents deterministically", () => {
    expect(
      allocateTipInterval({
        id: "remainder",
        start: "10:00",
        end: "11:00",
        amountCents: 10,
        participantIds: ["c", "a", "b"],
      }).allocations,
    ).toEqual([
      { participantId: "a", amountCents: 4 },
      { participantId: "b", amountCents: 3 },
      { participantId: "c", amountCents: 3 },
    ]);
  });

  it("parses dollars exactly to cents", () => {
    expect(dollarsToCents("17")).toBe(1700);
    expect(dollarsToCents("17.05")).toBe(1705);
    expect(() => dollarsToCents("17.005")).toThrow();
  });

  it("rejects overlapping intervals", () => {
    expect(() =>
      calculateTipSplits([
        {
          id: "one",
          start: "11:00",
          end: "13:00",
          amountCents: 900,
          participantIds: ["a"],
        },
        {
          id: "two",
          start: "12:30",
          end: "15:00",
          amountCents: 800,
          participantIds: ["a", "b"],
        },
      ]),
    ).toThrow("cannot overlap");
  });
});
