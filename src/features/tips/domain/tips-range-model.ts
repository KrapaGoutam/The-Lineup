import { z } from "zod";

import {
  addDays,
  describeInterval,
} from "@/features/tips/domain/interval-times";

/**
 * Typed model of `tips_get_range` (V2.0.8). The database decides what each caller may see:
 * managers get every interval (voided ones flagged), the allocations and, on request, the
 * revision trail; staff get only their own days, their own shares and no co-worker
 * identity, no interval total and no audit trail. This module never widens that.
 */

const shareSchema = z.object({
  profile_id: z.string().min(1),
  amount_cents: z.number().int(),
  cash_cents: z.number().int(),
  card_cents: z.number().int(),
});

const intervalSchema = z.object({
  id: z.union([z.string(), z.number()]),
  starts_at: z.string(),
  ends_at: z.string(),
  amount_cents: z.number().int().optional(),
  cash_cents: z.number().int().optional(),
  card_cents: z.number().int().optional(),
  tender_recorded: z.boolean(),
  revision: z.number().int().optional(),
  voided_at: z.string().nullable().optional(),
  void_reason: z.string().nullable().optional(),
  participant_ids: z.array(z.string()).optional(),
  participant_count: z.number().int().optional(),
  shares: z.array(shareSchema),
});

const revisionSchema = z.object({
  id: z.number().int(),
  action: z.string(),
  source: z.string(),
  editor_profile_id: z.string().nullable(),
  reason: z.string().nullable(),
  tip_interval_id: z.number().int().nullable(),
  before_state: z.unknown(),
  after_state: z.unknown(),
  affected_profile_ids: z.array(z.string()),
  created_at: z.string(),
});

const rangeSchema = z.object({
  time_zone: z.string().min(1),
  from: z.string(),
  to: z.string(),
  viewer_level: z.number().int(),
  pools: z.array(
    z.object({
      pool_id: z.number().int(),
      service_date: z.string(),
      status: z.enum(["saved", "finalized"]),
      updated_at: z.string(),
      intervals: z.array(intervalSchema),
      allocations: z.array(shareSchema),
      revisions: z.array(revisionSchema),
    }),
  ),
});

export type TipsShare = {
  profileId: string;
  amountCents: number;
  cashCents: number;
  cardCents: number;
  /** Money whose tender was never recorded (legacy intervals). */
  unclassifiedCents: number;
};

export type TipsInterval = {
  id: string;
  startsAt: string;
  endsAt: string;
  start: string;
  end: string;
  endsNextDay: boolean;
  /** Managers only. */
  amountCents: number | null;
  cashCents: number;
  cardCents: number;
  tenderRecorded: boolean;
  revision: number;
  voided: boolean;
  voidReason: string | null;
  /** Managers only. */
  participantIds: string[];
  participantCount: number;
  shares: TipsShare[];
};

export type TipsRevision = {
  id: number;
  action: string;
  source: "rpc" | "direct";
  editorProfileId: string | null;
  reason: string | null;
  intervalId: number | null;
  before: unknown;
  after: unknown;
  affectedProfileIds: string[];
  at: string;
};

export type TipsDay = {
  poolId: number;
  serviceDate: string;
  /** `finalized` is a locked legacy day; everything else is a saved, editable day. */
  status: "saved" | "finalized";
  updatedAt: string;
  intervals: TipsInterval[];
  allocations: TipsShare[];
  revisions: TipsRevision[];
};

export type TipsRange = {
  timeZone: string;
  from: string;
  to: string;
  isManager: boolean;
  days: TipsDay[];
};

function share(row: z.infer<typeof shareSchema>): TipsShare {
  return {
    profileId: row.profile_id,
    amountCents: row.amount_cents,
    cashCents: row.cash_cents,
    cardCents: row.card_cents,
    unclassifiedCents: row.amount_cents - row.cash_cents - row.card_cents,
  };
}

export function buildTipsRange(raw: unknown): TipsRange | null {
  const parsed = rangeSchema.safeParse(raw);
  if (!parsed.success) return null;
  const range = parsed.data;
  return {
    timeZone: range.time_zone,
    from: range.from,
    to: range.to,
    isManager: range.viewer_level >= 2,
    days: range.pools.map((pool) => ({
      poolId: pool.pool_id,
      serviceDate: pool.service_date,
      status: pool.status,
      updatedAt: pool.updated_at,
      allocations: pool.allocations.map(share),
      revisions: pool.revisions.map((row) => ({
        id: row.id,
        action: row.action,
        source: row.source === "direct" ? "direct" : "rpc",
        editorProfileId: row.editor_profile_id,
        reason: row.reason,
        intervalId: row.tip_interval_id,
        before: row.before_state,
        after: row.after_state,
        affectedProfileIds: row.affected_profile_ids,
        at: row.created_at,
      })),
      intervals: pool.intervals.map((row) => {
        const display = describeInterval(
          row.starts_at,
          row.ends_at,
          range.time_zone,
        );
        return {
          id: String(row.id),
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          ...display,
          amountCents: row.amount_cents ?? null,
          cashCents: row.cash_cents ?? 0,
          cardCents: row.card_cents ?? 0,
          tenderRecorded: row.tender_recorded,
          revision: row.revision ?? 1,
          voided: Boolean(row.voided_at),
          voidReason: row.void_reason ?? null,
          participantIds: row.participant_ids ?? [],
          participantCount:
            row.participant_count ?? row.participant_ids?.length ?? 0,
          shares: row.shares.map(share),
        };
      }),
    })),
  };
}

// ---- Summaries -----------------------------------------------------------------------------

export type MoneyTotals = {
  cashCents: number;
  cardCents: number;
  unclassifiedCents: number;
  totalCents: number;
};

const ZERO: MoneyTotals = {
  cashCents: 0,
  cardCents: 0,
  unclassifiedCents: 0,
  totalCents: 0,
};

function addShare(totals: MoneyTotals, s: TipsShare): MoneyTotals {
  return {
    cashCents: totals.cashCents + s.cashCents,
    cardCents: totals.cardCents + s.cardCents,
    unclassifiedCents: totals.unclassifiedCents + s.unclassifiedCents,
    totalCents: totals.totalCents + s.amountCents,
  };
}

export function sumShares(shares: readonly TipsShare[]): MoneyTotals {
  return shares.reduce(addShare, ZERO);
}

export function liveIntervals(day: TipsDay): TipsInterval[] {
  return day.intervals.filter((interval) => !interval.voided);
}

/**
 * Manager reconciliation of one day: the allocations must account for exactly the money
 * entered on the live intervals, cash and card separately. Returns null for staff payloads
 * (which carry no interval totals).
 */
export function reconcileDay(day: TipsDay): {
  entered: MoneyTotals;
  allocated: MoneyTotals;
  ok: boolean;
} | null {
  const live = liveIntervals(day);
  if (live.some((interval) => interval.amountCents === null)) return null;
  const entered = live.reduce<MoneyTotals>((acc, interval) => {
    const total = interval.amountCents ?? 0;
    return {
      cashCents: acc.cashCents + interval.cashCents,
      cardCents: acc.cardCents + interval.cardCents,
      unclassifiedCents:
        acc.unclassifiedCents + (interval.tenderRecorded ? 0 : total),
      totalCents: acc.totalCents + total,
    };
  }, ZERO);
  const allocated = sumShares(day.allocations);
  return {
    entered,
    allocated,
    ok:
      entered.cashCents === allocated.cashCents &&
      entered.cardCents === allocated.cardCents &&
      entered.totalCents === allocated.totalCents,
  };
}

export type EmployeeTotal = MoneyTotals & { profileId: string; days: number };

/** Per-employee totals across the range, largest first, ties by id. */
export function employeeTotals(days: readonly TipsDay[]): EmployeeTotal[] {
  const byProfile = new Map<string, EmployeeTotal>();
  for (const day of days) {
    for (const a of day.allocations) {
      const current = byProfile.get(a.profileId) ?? {
        ...ZERO,
        profileId: a.profileId,
        days: 0,
      };
      byProfile.set(a.profileId, {
        ...addShare(current, a),
        profileId: a.profileId,
        days: current.days + 1,
      });
    }
  }
  return [...byProfile.values()].sort(
    (a, b) =>
      b.totalCents - a.totalCents || a.profileId.localeCompare(b.profileId),
  );
}

export type PeriodRow = MoneyTotals & {
  key: string;
  label: string;
  days: number;
  people: number;
};

function rollup(
  days: readonly TipsDay[],
  keyOf: (serviceDate: string) => string,
  labelOf: (key: string) => string,
): PeriodRow[] {
  const groups = new Map<string, TipsDay[]>();
  for (const day of days) {
    const key = keyOf(day.serviceDate);
    groups.set(key, [...(groups.get(key) ?? []), day]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => ({
      ...sumShares(group.flatMap((day) => day.allocations)),
      key,
      label: labelOf(key),
      days: group.length,
      people: new Set(
        group.flatMap((day) => day.allocations.map((a) => a.profileId)),
      ).size,
    }));
}

export function dailyRows(days: readonly TipsDay[]): PeriodRow[] {
  return rollup(
    days,
    (date) => date,
    (key) => key,
  );
}

/** Monday-start weeks, keyed by the Monday's date. */
export function weeklyRows(days: readonly TipsDay[]): PeriodRow[] {
  return rollup(
    days,
    (date) => {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      return addDays(date, -((weekday + 6) % 7));
    },
    (key) => `Week of ${key}`,
  );
}

export function monthlyRows(days: readonly TipsDay[]): PeriodRow[] {
  return rollup(
    days,
    (date) => date.slice(0, 7),
    (key) => key,
  );
}
