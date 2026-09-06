import { beforeEach, describe, expect, it, vi } from "vitest";

// This is the case the pure nextPublishedVersion unit tests can't catch on
// their own: it exercises publishScheduleAction itself, through a fake
// Supabase client shaped closely enough to the real query builder (chainable
// filters, and awaitable directly without a terminal call, matching
// supabase-js's PromiseLike builders) that a regression in how the "every
// period for this range" query is built -- wrong table, a filter dropped, an
// await missing -- would show up here, not just in the arithmetic helper.
type PeriodRow = {
  id: number;
  location_id: string;
  starts_on: string;
  ends_on: string;
  status: "draft" | "published";
  published_version: number;
};

function makeFakeSupabase(periods: PeriodRow[]) {
  function from(table: string) {
    if (table !== "schedule_periods") {
      throw new Error(`unexpected table in test fake: ${table}`);
    }
    const filters: Array<(row: PeriodRow) => boolean> = [];
    let mode: "select" | "update" = "select";
    let updatePayload: Partial<PeriodRow> | null = null;
    let orderField: keyof PeriodRow | null = null;
    let orderDescending = false;
    let limitCount: number | null = null;

    function resolveRows() {
      let rows = periods.filter((row) =>
        filters.every((predicate) => predicate(row)),
      );
      if (orderField) {
        const field = orderField;
        rows = [...rows].sort((a, b) => {
          const diff = Number(a[field]) - Number(b[field]);
          return orderDescending ? -diff : diff;
        });
      }
      if (limitCount !== null) rows = rows.slice(0, limitCount);
      return rows;
    }

    async function runTerminal() {
      if (mode === "update") {
        const matches = periods.filter((row) =>
          filters.every((predicate) => predicate(row)),
        );
        for (const row of matches) Object.assign(row, updatePayload);
        return { data: matches, error: null };
      }
      return { data: resolveRows(), error: null };
    }

    const builder = {
      select() {
        mode = "select";
        return builder;
      },
      update(payload: Partial<PeriodRow>) {
        mode = "update";
        updatePayload = payload;
        return builder;
      },
      eq(field: keyof PeriodRow, value: unknown) {
        filters.push((row) => row[field] === value);
        return builder;
      },
      order(field: keyof PeriodRow, opts: { ascending: boolean }) {
        orderField = field;
        orderDescending = !opts.ascending;
        return builder;
      },
      limit(count: number) {
        limitCount = count;
        return builder;
      },
      async maybeSingle() {
        const rows = resolveRows();
        return { data: rows[0] ?? null, error: null };
      },
      // supabase-js's query builders are PromiseLike -- `await` works even
      // when the caller never calls a terminal method (publishScheduleAction
      // does exactly this for the "every period in this range" select).
      then(
        onFulfilled: (value: { data: unknown; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return runTerminal().then(onFulfilled, onRejected);
      },
    };

    return builder;
  }

  return { from };
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let periods: PeriodRow[];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeFakeSupabase(periods),
}));

describe("publishScheduleAction", () => {
  const locationId = "loc-1";
  const startsOn = `${new Date().getFullYear()}-01-01`;
  const endsOn = `${new Date().getFullYear()}-12-31`;

  beforeEach(() => {
    periods = [];
  });

  it("publishes a draft, then publishes a fresh draft for the same range without colliding", async () => {
    const { publishScheduleAction } = await import("./schedule-actions");

    // Step 1: the only period for this location/year -- an unpublished
    // draft, exactly as getOrCreateDraftPeriod first creates one.
    periods.push({
      id: 1,
      location_id: locationId,
      starts_on: startsOn,
      ends_on: endsOn,
      status: "draft",
      published_version: 0,
    });

    const firstResult = await publishScheduleAction({
      restaurantSlug: "the-monks",
      locationId,
      timeZone: "America/Chicago",
    });
    expect(firstResult.ok).toBe(true);
    expect(periods[0]).toMatchObject({
      status: "published",
      published_version: 1,
    });

    // Step 2: more shifts get added -- getOrCreateDraftPeriod finds no
    // draft (period 1 is now published) and forks a brand-new row, also
    // starting at published_version 0, for the SAME (location, starts_on,
    // ends_on). This is the exact state that collided before the fix.
    periods.push({
      id: 2,
      location_id: locationId,
      starts_on: startsOn,
      ends_on: endsOn,
      status: "draft",
      published_version: 0,
    });

    const secondResult = await publishScheduleAction({
      restaurantSlug: "the-monks",
      locationId,
      timeZone: "America/Chicago",
    });

    expect(secondResult.ok).toBe(true);
    // The first period is untouched -- published rows are never rewritten.
    expect(periods[0]).toMatchObject({
      status: "published",
      published_version: 1,
    });
    // The second period publishes at the next version in the sequence, not
    // a repeat of 1.
    expect(periods[1]).toMatchObject({
      status: "published",
      published_version: 2,
    });
  });

  it("fails clearly when there is no draft left to publish", async () => {
    const { publishScheduleAction } = await import("./schedule-actions");

    periods.push({
      id: 1,
      location_id: locationId,
      starts_on: startsOn,
      ends_on: endsOn,
      status: "published",
      published_version: 1,
    });

    const result = await publishScheduleAction({
      restaurantSlug: "the-monks",
      locationId,
      timeZone: "America/Chicago",
    });
    expect(result.ok).toBe(false);
  });
});
