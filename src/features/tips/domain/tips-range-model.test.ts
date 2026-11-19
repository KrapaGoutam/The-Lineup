import { describe, expect, it } from "vitest";

import {
  buildTipsRange,
  dailyRows,
  employeeTotals,
  monthlyRows,
  reconcileDay,
  weeklyRows,
} from "@/features/tips/domain/tips-range-model";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

const shareRow = (
  profile_id: string,
  amount: number,
  cash: number,
  card: number,
) => ({
  profile_id,
  amount_cents: amount,
  cash_cents: cash,
  card_cents: card,
});

function managerPayload() {
  return {
    time_zone: "America/Chicago",
    from: "2026-11-16",
    to: "2026-11-22",
    viewer_level: 3,
    pools: [
      {
        pool_id: 1,
        service_date: "2026-11-16",
        status: "saved",
        updated_at: "2026-11-17T01:00:00Z",
        intervals: [
          {
            id: "10",
            starts_at: "2026-11-16T23:00:00Z",
            ends_at: "2026-11-17T01:00:00Z",
            amount_cents: 1001,
            cash_cents: 501,
            card_cents: 500,
            tender_recorded: true,
            revision: 2,
            voided_at: null,
            void_reason: null,
            participant_ids: [A, B],
            shares: [shareRow(A, 501, 251, 250), shareRow(B, 500, 250, 250)],
          },
          {
            id: "11",
            starts_at: "2026-11-16T20:00:00Z",
            ends_at: "2026-11-16T21:00:00Z",
            amount_cents: 999,
            cash_cents: 999,
            card_cents: 0,
            tender_recorded: true,
            revision: 3,
            voided_at: "2026-11-17T02:00:00Z",
            void_reason: "wrong day",
            participant_ids: [A],
            shares: [shareRow(A, 999, 999, 0)],
          },
        ],
        allocations: [shareRow(A, 501, 251, 250), shareRow(B, 500, 250, 250)],
        revisions: [],
      },
      {
        pool_id: 2,
        service_date: "2026-11-23",
        status: "finalized",
        updated_at: "2026-11-24T01:00:00Z",
        intervals: [
          {
            id: "12",
            starts_at: "2026-11-23T18:00:00Z",
            ends_at: "2026-11-23T20:00:00Z",
            amount_cents: 1000,
            cash_cents: 0,
            card_cents: 0,
            tender_recorded: false,
            revision: 1,
            participant_ids: [A],
            shares: [shareRow(A, 1000, 0, 0)],
          },
        ],
        allocations: [shareRow(A, 1000, 0, 0)],
        revisions: [],
      },
    ],
  };
}

describe("buildTipsRange", () => {
  it("parses the manager payload and converts instants to the location's wall time", () => {
    const range = buildTipsRange(managerPayload())!;
    expect(range.isManager).toBe(true);
    const first = range.days[0].intervals[0];
    expect(first.start).toBe("17:00");
    expect(first.end).toBe("19:00");
    expect(first.endsNextDay).toBe(false);
    expect(range.days[0].intervals[1].voided).toBe(true);
    expect(range.days[1].status).toBe("finalized");
    expect(range.days[0].allocations[0].unclassifiedCents).toBe(0);
    expect(range.days[1].allocations[0].unclassifiedCents).toBe(1000);
  });

  it("parses a staff payload without totals or co-worker ids", () => {
    const range = buildTipsRange({
      time_zone: "America/Chicago",
      from: "2026-11-16",
      to: "2026-11-16",
      viewer_level: 1,
      pools: [
        {
          pool_id: 1,
          service_date: "2026-11-16",
          status: "saved",
          updated_at: "2026-11-17T01:00:00Z",
          intervals: [
            {
              id: "10",
              starts_at: "2026-11-16T23:00:00Z",
              ends_at: "2026-11-17T01:00:00Z",
              tender_recorded: true,
              participant_count: 3,
              shares: [shareRow(A, 500, 250, 250)],
            },
          ],
          allocations: [shareRow(A, 500, 250, 250)],
          revisions: [],
        },
      ],
    })!;
    expect(range.isManager).toBe(false);
    expect(range.days[0].intervals[0].amountCents).toBeNull();
    expect(range.days[0].intervals[0].participantIds).toEqual([]);
    expect(range.days[0].intervals[0].participantCount).toBe(3);
    expect(reconcileDay(range.days[0])).toBeNull();
  });

  it("returns null for anything malformed (fail closed)", () => {
    expect(buildTipsRange(null)).toBeNull();
    expect(buildTipsRange({ pools: "x" })).toBeNull();
    const bad = managerPayload();
    (bad.pools[0] as { status: string }).status = "estimating";
    expect(buildTipsRange(bad)).toBeNull();
  });
});

describe("summaries", () => {
  const range = buildTipsRange(managerPayload())!;

  it("reconciles a day on live intervals only (a voided interval does not count)", () => {
    const r = reconcileDay(range.days[0])!;
    expect(r.ok).toBe(true);
    expect(r.entered.totalCents).toBe(1001);
    expect(r.entered.cashCents).toBe(501);
    expect(r.entered.cardCents).toBe(500);
  });

  it("flags a day whose allocations do not match the entered money", () => {
    const broken = structuredClone(range.days[0]);
    broken.allocations[0].amountCents += 1;
    expect(reconcileDay(broken)!.ok).toBe(false);
  });

  it("a legacy interval still reconciles in total and reports its money as tender not recorded", () => {
    const r = reconcileDay(range.days[1])!;
    expect(r.ok).toBe(true);
    expect(r.entered.totalCents).toBe(1000);
    expect(r.entered.unclassifiedCents).toBe(1000);
    expect(r.entered.cashCents + r.entered.cardCents).toBe(0);
  });

  it("per-employee totals across the range, largest first", () => {
    const totals = employeeTotals(range.days);
    expect(totals.map((t) => [t.profileId, t.totalCents, t.days])).toEqual([
      [A, 1501, 2],
      [B, 500, 1],
    ]);
    expect(totals[0].unclassifiedCents).toBe(1000);
  });

  it("daily, weekly (Monday) and monthly roll-ups", () => {
    expect(dailyRows(range.days).map((r) => [r.key, r.totalCents])).toEqual([
      ["2026-11-16", 1001],
      ["2026-11-23", 1000],
    ]);
    expect(
      weeklyRows(range.days).map((r) => [r.key, r.totalCents, r.people]),
    ).toEqual([
      ["2026-11-16", 1001, 2],
      ["2026-11-23", 1000, 1],
    ]);
    expect(
      monthlyRows(range.days).map((r) => [r.key, r.totalCents, r.days]),
    ).toEqual([["2026-11", 2001, 2]]);
  });
});
