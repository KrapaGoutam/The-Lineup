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

  it("handles zero-cent intervals without error and allocates 0 cents to all participants", () => {
    const result = calculateTipSplits([
      {
        id: "zero",
        start: "11:00",
        end: "14:00",
        amountCents: 0,
        participantIds: ["a", "b", "c"],
      },
    ]);
    expect(result.totalCents).toBe(0);
    expect(result.totals).toEqual([
      { participantId: "a", amountCents: 0 },
      { participantId: "b", amountCents: 0 },
      { participantId: "c", amountCents: 0 },
    ]);
  });

  it("preserves exact cent conservation: sum of individual allocations equals amountCents for any split", () => {
    // 10007 cents across 6 participants: 10007 = 1667 * 6 - 5 -> 1667 * 5 + 1668 * 1
    const participants = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const interval = allocateTipInterval({
      id: "prime",
      start: "12:00",
      end: "16:00",
      amountCents: 10007,
      participantIds: participants,
    });
    const sumAllocations = interval.allocations.reduce(
      (sum, a) => sum + a.amountCents,
      0,
    );
    expect(sumAllocations).toBe(10007);
    expect(interval.allocations.map((a) => a.amountCents)).toEqual([
      1668, 1668, 1668, 1668, 1668, 1667,
    ]);
  });

  it("deduplicates redundant participant IDs within an interval", () => {
    const result = allocateTipInterval({
      id: "dup",
      start: "10:00",
      end: "12:00",
      amountCents: 100,
      participantIds: ["b", "a", "b", "a"],
    });
    expect(result.participantIds).toEqual(["a", "b"]);
    expect(result.allocations).toEqual([
      { participantId: "a", amountCents: 50 },
      { participantId: "b", amountCents: 50 },
    ]);
  });

  it("supports overnight non-overlapping intervals correctly", () => {
    const result = calculateTipSplits([
      {
        id: "night",
        start: "20:00",
        end: "02:00",
        amountCents: 600,
        participantIds: ["a", "b"],
      },
      {
        id: "dawn",
        start: "02:00",
        end: "08:00",
        amountCents: 400,
        participantIds: ["b", "c"],
      },
    ]);
    expect(result.totalCents).toBe(1000);
    expect(result.totals).toEqual([
      { participantId: "a", amountCents: 300 },
      { participantId: "b", amountCents: 500 },
      { participantId: "c", amountCents: 200 },
    ]);
  });

  it("throws when participantIds is empty or contains only non-unique empty values", () => {
    expect(() =>
      allocateTipInterval({
        id: "empty",
        start: "10:00",
        end: "12:00",
        amountCents: 500,
        participantIds: [],
      }),
    ).toThrow("Choose at least one participant.");
  });

  it("throws when amountCents is negative or non-integer", () => {
    expect(() =>
      allocateTipInterval({
        id: "neg",
        start: "10:00",
        end: "12:00",
        amountCents: -100,
        participantIds: ["a"],
      }),
    ).toThrow("Tip amount must be a non-negative number of cents.");

    expect(() =>
      allocateTipInterval({
        id: "float",
        start: "10:00",
        end: "12:00",
        amountCents: 12.5,
        participantIds: ["a"],
      }),
    ).toThrow("Tip amount must be a non-negative number of cents.");
  });

  it("throws when start time equals end time", () => {
    expect(() =>
      allocateTipInterval({
        id: "same",
        start: "14:00",
        end: "14:00",
        amountCents: 500,
        participantIds: ["a"],
      }),
    ).toThrow("Tip interval start and end must be different.");
  });
});
