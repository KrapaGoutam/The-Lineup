import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * V2-005.004 Batch A closeout. The Schedule roster is read through the
 * location-scoped `schedule_location_roster` RPC. When that RPC is denied or
 * fails, the loader must fail closed (no organization-wide fallback) AND tell
 * the UI the roster is unavailable, so a backend/authorization failure is never
 * indistinguishable from an authorized but empty workforce.
 */

const state = vi.hoisted(() => ({
  rosterResult: { data: [] as unknown[] | null, error: null as unknown },
  eqs: [] as Array<{ table: string; column: string; value: unknown }>,
  rosterCalls: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => {
      state.rosterCalls += 1;
      return state.rosterResult;
    },
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "gte", "lte", "in", "order", "limit"]) {
        builder[method] = () => builder;
      }
      builder.eq = (column: string, value: unknown) => {
        state.eqs.push({ table, column, value });
        return builder;
      };
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
      return builder;
    },
  }),
}));

const organizationWideRoster = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@/features/team/data/roster", () => ({
  getOrganizationRoster: organizationWideRoster,
}));

import {
  getScheduleContext,
  getWeekScheduleData,
} from "@/features/schedules/data/schedule-data";

const SCOPE = {
  organizationId: "org-1",
  locationId: "loc-a",
  timeZone: "America/Chicago",
};

describe("Schedule roster failure is distinguishable from an empty workforce", () => {
  beforeEach(() => {
    state.eqs.length = 0;
    state.rosterCalls = 0;
    organizationWideRoster.mockClear();
  });

  it("flags rosterUnavailable and never falls back to an organization-wide roster when the RPC is denied", async () => {
    state.rosterResult = {
      data: null,
      error: { code: "42501", message: "You do not have access" },
    };
    const ctx = await getScheduleContext("org-1", SCOPE);
    expect(ctx?.team).toEqual([]);
    expect(ctx?.rosterUnavailable).toBe(true);
    expect(organizationWideRoster).not.toHaveBeenCalled();
  });

  it("does not flag an authorized but empty roster as unavailable", async () => {
    state.rosterResult = { data: [], error: null };
    const ctx = await getScheduleContext("org-1", SCOPE);
    expect(ctx?.team).toEqual([]);
    expect(ctx?.rosterUnavailable).toBe(false);
  });

  it("maps eligible and historical (ineligible) workforce rows", async () => {
    state.rosterResult = {
      data: [
        {
          profile_id: "p-1",
          display_name: "Ana Active",
          roles: ["server"],
          active: true,
          eligible: true,
        },
        {
          profile_id: "p-2",
          display_name: "Hal Historic",
          roles: ["server"],
          active: false,
          eligible: false,
        },
      ],
      error: null,
    };
    const ctx = await getScheduleContext("org-1", SCOPE);
    expect(ctx?.rosterUnavailable).toBe(false);
    expect(ctx?.team.map((m) => [m.id, m.active, m.eligible])).toEqual([
      ["p-1", true, true],
      ["p-2", false, false],
    ]);
  });
});

describe("week navigation is bound to the verified location", () => {
  beforeEach(() => {
    state.eqs.length = 0;
  });

  it("filters shifts by the location it is given and has no primary-location fallback", async () => {
    await getWeekScheduleData("org-1", "2026-11-02", {
      id: "loc-a",
      time_zone: "America/Chicago",
    });
    const shiftEqs = state.eqs.filter((e) => e.table === "shifts");
    expect(shiftEqs).toContainEqual({
      table: "shifts",
      column: "location_id",
      value: "loc-a",
    });
    // A call without a location must not type-check (no silent primary-location fallback).
    // Compile-time assertion only; this function is never invoked.
    const withoutLocation = () =>
      // @ts-expect-error the verified location is required
      getWeekScheduleData("org-1", "2026-11-02");
    expect(typeof withoutLocation).toBe("function");
  });
});
