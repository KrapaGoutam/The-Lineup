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

  // Feature 029. Reconciliation 2's "the engine consumes only explicitly
  // passed in-memory arrays" as an actual regression test, not just a
  // comment -- mutating the very array/objects handed to
  // calculateTipSplits, or the source data a caller (like "Pull
  // clocked-in team") derived them from, *after* the call must never
  // reach back into an already-returned split.
  it("is unaffected by mutating its input array or participant list after returning", () => {
    const participantIds = ["a", "b"];
    const intervals = [
      {
        id: "one",
        start: "11:00",
        end: "13:00",
        amountCents: 1000,
        participantIds,
      },
    ];
    const first = calculateTipSplits(intervals);

    // Mutate the exact array/object references just handed in -- a
    // caller pushing a new interval, or later editing the participant
    // list an earlier "pull" produced.
    intervals.push({
      id: "two",
      start: "14:00",
      end: "15:00",
      amountCents: 500,
      participantIds: ["c"],
    });
    participantIds.push("d");

    const second = calculateTipSplits(intervals);

    expect(first.intervals).toHaveLength(1);
    expect(first.totalCents).toBe(1000);
    expect(first.totals).toEqual([
      { participantId: "a", amountCents: 500 },
      { participantId: "b", amountCents: 500 },
    ]);
    // The second, later call sees the mutation -- proving the first
    // result's stability wasn't just an artifact of nothing having
    // changed yet.
    expect(second.intervals).toHaveLength(2);
    expect(second.totalCents).toBe(1500);
  });
});
