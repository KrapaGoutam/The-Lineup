import {
  addDays,
  describeInterval,
  resolveIntervalInstants,
} from "@/features/tips/domain/interval-times";
import {
  assertTenderAmounts,
  splitTenders,
} from "@/features/tips/domain/tender-split";
import type { TipsApi } from "@/features/tips/domain/tips-api";
import type {
  TipsDay,
  TipsInterval,
  TipsRevision,
  TipsShare,
} from "@/features/tips/domain/tips-range-model";

type StoredInterval = {
  id: number;
  startsAt: string;
  endsAt: string;
  cashCents: number;
  cardCents: number;
  participantIds: string[];
  revision: number;
  voidedAt: string | null;
  voidReason: string | null;
};
type StoredDay = {
  poolId: number;
  intervals: StoredInterval[];
  revisions: TipsRevision[];
  updatedAt: string;
};

/** The demo data, shared by every signed-in demo user (state survives switching users). */
export type DemoTipsStore = {
  days: Map<string, StoredDay>;
  next: { pool: number; interval: number; revision: number };
};

export function createDemoTipsStore(): DemoTipsStore {
  return { days: new Map(), next: { pool: 1, interval: 1, revision: 1 } };
}

/**
 * Demo-mode `TipsApi`: an in-memory store that follows the same rules as the database
 * (integer-cent tender split, no overlap, reason required to change, optimistic revision,
 * soft void, audit trail) so the demo behaves like the product. Nothing here is ever used
 * in real mode.
 */
export function createDemoTipsApi(options: {
  store: DemoTipsStore;
  timeZone: string;
  viewerId: string;
  isManager: boolean;
  pullClockedIn: () => Promise<string[]>;
}): TipsApi {
  const { days, next } = options.store;

  function day(date: string): StoredDay {
    let current = days.get(date);
    if (!current) {
      current = {
        poolId: next.pool++,
        intervals: [],
        revisions: [],
        updatedAt: new Date().toISOString(),
      };
      days.set(date, current);
    }
    return current;
  }

  const live = (d: StoredDay) => d.intervals.filter((i) => !i.voidedAt);

  function sharesOf(i: StoredInterval) {
    return splitTenders({
      cashCents: i.cashCents,
      cardCents: i.cardCents,
      participantIds: i.participantIds,
    }).shares.map<TipsShare>((s) => ({
      profileId: s.participantId,
      amountCents: s.totalCents,
      cashCents: s.cashCents,
      cardCents: s.cardCents,
      unclassifiedCents: 0,
    }));
  }

  function allocations(d: StoredDay): TipsShare[] {
    const byProfile = new Map<string, TipsShare>();
    for (const i of live(d)) {
      for (const s of sharesOf(i)) {
        const cur = byProfile.get(s.profileId);
        byProfile.set(s.profileId, {
          profileId: s.profileId,
          amountCents: (cur?.amountCents ?? 0) + s.amountCents,
          cashCents: (cur?.cashCents ?? 0) + s.cashCents,
          cardCents: (cur?.cardCents ?? 0) + s.cardCents,
          unclassifiedCents: 0,
        });
      }
    }
    return [...byProfile.values()].sort((a, b) =>
      a.profileId.localeCompare(b.profileId),
    );
  }

  function toInterval(i: StoredInterval): TipsInterval {
    const display = describeInterval(i.startsAt, i.endsAt, options.timeZone);
    const total = i.cashCents + i.cardCents;
    const all = sharesOf(i);
    return {
      id: String(i.id),
      startsAt: i.startsAt,
      endsAt: i.endsAt,
      ...display,
      amountCents: options.isManager ? total : null,
      cashCents: i.cashCents,
      cardCents: i.cardCents,
      tenderRecorded: true,
      revision: i.revision,
      voided: Boolean(i.voidedAt),
      voidReason: i.voidReason,
      participantIds: options.isManager ? [...i.participantIds].sort() : [],
      participantCount: i.participantIds.length,
      shares: options.isManager
        ? all
        : all.filter((s) => s.profileId === options.viewerId),
    };
  }

  function toDay(
    date: string,
    d: StoredDay,
    includeRevisions: boolean,
  ): TipsDay {
    const all = allocations(d);
    return {
      poolId: d.poolId,
      serviceDate: date,
      status: "saved",
      updatedAt: d.updatedAt,
      intervals: options.isManager
        ? d.intervals.map(toInterval)
        : live(d)
            .filter((i) => i.participantIds.includes(options.viewerId))
            .map(toInterval),
      allocations: options.isManager
        ? all
        : all.filter((s) => s.profileId === options.viewerId),
      revisions: options.isManager && includeRevisions ? d.revisions : [],
    };
  }

  function record(
    d: StoredDay,
    action: string,
    intervalId: number,
    reason: string | null,
    before: unknown,
    after: unknown,
    affected: string[],
  ) {
    d.updatedAt = new Date().toISOString();
    d.revisions.push({
      id: next.revision++,
      action,
      source: "rpc",
      editorProfileId: options.viewerId,
      reason,
      intervalId,
      before,
      after,
      affectedProfileIds: affected,
      at: d.updatedAt,
    });
  }

  const snapshot = (i: StoredInterval) => ({
    interval: {
      starts_at: i.startsAt,
      ends_at: i.endsAt,
      cash_cents: i.cashCents,
      card_cents: i.cardCents,
      amount_cents: i.cashCents + i.cardCents,
      participant_ids: [...i.participantIds].sort(),
      void_reason: i.voidReason,
    },
  });

  const fail = (error: string, conflict = false) =>
    ({
      ok: false,
      error,
      ...(conflict ? { conflict: true as const } : {}),
    }) as const;

  return {
    async saveInterval(values) {
      if (!options.isManager)
        return fail("Only an owner, manager or assistant manager can do that.");
      try {
        assertTenderAmounts(values.cashCents, values.cardCents);
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Invalid amount.");
      }
      const people = [...new Set(values.participantIds)];
      if (people.length === 0) return fail("Choose at least one participant.");
      let instants;
      try {
        instants = resolveIntervalInstants({
          serviceDate: values.serviceDate,
          start: values.start,
          end: values.end,
          timeZone: options.timeZone,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Invalid interval.");
      }
      const d = day(values.serviceDate);
      const startsAt = instants.startsAt.toISOString();
      const endsAt = instants.endsAt.toISOString();
      const existing = values.intervalId
        ? d.intervals.find((i) => String(i.id) === values.intervalId)
        : undefined;
      if (values.intervalId) {
        if (!existing) return fail("Tip interval not found for this day.");
        if (existing.voidedAt)
          return fail("A voided interval cannot be edited.");
        if ((values.reason ?? "").trim().length < 3) {
          return fail(
            "Enter a short reason for the change (at least 3 characters).",
          );
        }
        if (values.expectedRevision !== existing.revision) {
          return fail(
            "This interval was changed by someone else. Reload and try again.",
            true,
          );
        }
      }
      const overlaps = live(d).some(
        (i) =>
          i.id !== existing?.id && i.startsAt < endsAt && startsAt < i.endsAt,
      );
      if (overlaps) return fail("Tip intervals cannot overlap.");

      if (existing) {
        const before = snapshot(existing);
        existing.startsAt = startsAt;
        existing.endsAt = endsAt;
        existing.cashCents = values.cashCents;
        existing.cardCents = values.cardCents;
        const was = existing.participantIds;
        existing.participantIds = people;
        existing.revision += 1;
        record(
          d,
          "interval_updated",
          existing.id,
          values.reason!.trim(),
          before,
          snapshot(existing),
          [...new Set([...was, ...people])],
        );
        return {
          ok: true,
          data: {
            intervalId: existing.id,
            tipPoolId: d.poolId,
            revision: existing.revision,
          },
        };
      }
      const created: StoredInterval = {
        id: next.interval++,
        startsAt,
        endsAt,
        cashCents: values.cashCents,
        cardCents: values.cardCents,
        participantIds: people,
        revision: 1,
        voidedAt: null,
        voidReason: null,
      };
      d.intervals.push(created);
      d.intervals.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      record(
        d,
        "interval_created",
        created.id,
        null,
        { interval: null },
        snapshot(created),
        people,
      );
      return {
        ok: true,
        data: { intervalId: created.id, tipPoolId: d.poolId, revision: 1 },
      };
    },

    async voidInterval(values) {
      if (!options.isManager)
        return fail("Only an owner, manager or assistant manager can do that.");
      const reason = values.reason.trim();
      if (reason.length < 3)
        return fail("Enter a short reason (3 to 500 characters).");
      for (const d of days.values()) {
        const target = d.intervals.find(
          (i) => String(i.id) === values.intervalId,
        );
        if (!target) continue;
        if (target.voidedAt) return fail("This interval is already voided.");
        if (target.revision !== values.expectedRevision) {
          return fail(
            "This interval was changed by someone else. Reload and try again.",
            true,
          );
        }
        const before = snapshot(target);
        target.voidedAt = new Date().toISOString();
        target.voidReason = reason;
        target.revision += 1;
        record(
          d,
          "interval_voided",
          target.id,
          reason,
          before,
          snapshot(target),
          target.participantIds,
        );
        return { ok: true, data: null };
      }
      return fail("Tip interval not found for this location.");
    },

    async recalculate() {
      // Allocations are always derived from the saved intervals in the demo store.
      return { ok: true, data: { changed: false } };
    },

    async loadRange({ from, to, includeRevisions }) {
      const out: TipsDay[] = [];
      for (let date = from; date <= to; date = addDays(date, 1)) {
        const d = days.get(date);
        if (!d) continue;
        const built = toDay(date, d, includeRevisions);
        if (options.isManager || built.allocations.length > 0) out.push(built);
      }
      return {
        ok: true,
        data: {
          range: {
            timeZone: options.timeZone,
            from,
            to,
            isManager: options.isManager,
            days: out,
          },
        },
      };
    },

    async pullClockedIn() {
      return { ok: true, data: await options.pullClockedIn() };
    },

    async reopenLegacy() {
      return { ok: true, data: null };
    },
  };
}
