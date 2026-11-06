import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  IDS,
  addAssignment,
  addMembership,
  addOverall,
  baseDb,
  createFakeSupabase,
  type FakeDb,
} from "@/features/context/testing/fake-supabase";
import { serializeActiveContextCookie } from "@/features/context/domain/context-cookie";

/**
 * V2-003.001 — entry-boundary integration. Only the Supabase client, the
 * request cookie store and the three operational loaders (spied, so we can
 * assert WHAT they were given) are doubled. The active-context resolver, the
 * canonical access resolver and entry-user hydration run for real against an
 * in-memory database that applies the RLS read rules.
 */

const state = vi.hoisted(() => ({
  client: null as unknown,
  cookie: null as string | null,
  createClientCalls: 0,
  cookieReads: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    state.createClientCalls += 1;
    return state.client;
  },
}));

vi.mock("@/features/context/data/context-cookie-reader", () => ({
  readActiveContextCookieValue: async () => {
    state.cookieReads += 1;
    return state.cookie;
  },
}));

const getScheduleContext = vi.hoisted(() => vi.fn());
const getTipsContext = vi.hoisted(() => vi.fn());
const getAllocationContext = vi.hoisted(() => vi.fn());
const readLocationModuleConfigs = vi.hoisted(() => vi.fn());
vi.mock("@/features/modules/data/module-config-reader", () => ({
  readLocationModuleConfigs,
}));

vi.mock("@/features/schedules/data/schedule-data", () => ({
  getScheduleContext,
}));
vi.mock("@/features/tips/data/tips-data", () => ({ getTipsContext }));
vi.mock("@/features/allocation/data/allocation-data", () => ({
  getAllocationContext,
}));

import { loadPageData } from "./page-data";

function useUser(db: FakeDb, userId: string | null) {
  state.client = createFakeSupabase({ userId, db }).client;
}

describe("loadPageData (V2-003.001 entry boundary)", () => {
  let db: FakeDb;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dev.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    state.cookie = null;
    state.createClientCalls = 0;
    state.cookieReads = 0;
    getScheduleContext.mockReset().mockResolvedValue({ marker: "schedule" });
    readLocationModuleConfigs.mockReset().mockResolvedValue({
      status: "ok",
      locationId: IDS.locWebster,
      lifecycle: "active",
      configs: new Map(),
    });
    getTipsContext.mockReset().mockResolvedValue({ marker: "tips" });
    getAllocationContext
      .mockReset()
      .mockResolvedValue({ marker: "allocation" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    db = baseDb();
    db.profiles.push(
      { id: IDS.jerry, display_name: "Jerry" },
      { id: IDS.tom, display_name: "Tom" },
      { id: IDS.jack, display_name: "Jack" },
      { id: IDS.overallOwner, display_name: "Olivia" },
      { id: IDS.orgOwnerLiquor, display_name: "Oscar" },
    );
    addMembership(db, IDS.jerry, IDS.orgMonks, ["server"]);
    addAssignment(db, IDS.jerry, IDS.locWebster, "staff");
    addMembership(db, IDS.tom, IDS.orgLiquorTap, ["server"]);
    addAssignment(db, IDS.tom, IDS.locNasa, "staff");
    addAssignment(db, IDS.tom, IDS.locLeagueCity, "staff");
    addMembership(db, IDS.jack, IDS.orgMonks, ["server"]);
    addMembership(db, IDS.jack, IDS.orgLiquorTap, ["owner"]);
    addAssignment(db, IDS.jack, IDS.locWebster, "staff");
    addAssignment(db, IDS.jack, IDS.locNasa, "manager");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function expectNoOperationalLoad() {
    expect(readLocationModuleConfigs).not.toHaveBeenCalled();
    expect(getScheduleContext).not.toHaveBeenCalled();
    expect(getTipsContext).not.toHaveBeenCalled();
    expect(getAllocationContext).not.toHaveBeenCalled();
  }

  it("CTX-19: schedule, tips and allocation all receive the SAME verified (organization, location, time zone)", async () => {
    useUser(db, IDS.jerry);
    const data = await loadPageData("the-monks");

    expect(data.contextStatus).toBe("resolved");
    expect(readLocationModuleConfigs).toHaveBeenCalledWith(IDS.locWebster);
    expect(data.moduleNavigation).toEqual({
      identity: {
        profileId: IDS.jerry,
        organizationId: IDS.orgMonks,
        locationId: IDS.locWebster,
      },
      result: {
        status: "ok",
        locationId: IDS.locWebster,
        lifecycle: "active",
        configs: [],
      },
    });
    const scope = {
      organizationId: IDS.orgMonks,
      locationId: IDS.locWebster,
      timeZone: "America/Chicago",
    };
    expect(getScheduleContext).toHaveBeenCalledWith(IDS.orgMonks, scope);
    expect(getTipsContext).toHaveBeenCalledWith(IDS.orgMonks, scope);
    expect(getAllocationContext).toHaveBeenCalledWith(
      IDS.orgMonks,
      undefined,
      scope,
    );
    expect(data.scheduleContext).toEqual({ marker: "schedule" });
    expect(data.tipsContext).toEqual({ marker: "tips" });
    expect(data.allocationContext).toEqual({ marker: "allocation" });
    expect(data.activeContext).toMatchObject({
      organizationName: "Monks",
      locationId: IDS.locWebster,
      locationName: "Webster",
      timeZone: "America/Chicago",
    });
  });

  it("CTX-19: with a cookie selection in a multi-location org, every loader gets the cookie's location (not the oldest)", async () => {
    useUser(db, IDS.tom);
    state.cookie = serializeActiveContextCookie({
      organizationId: IDS.orgLiquorTap,
      locationId: IDS.locLeagueCity,
    });
    const data = await loadPageData("liquor-tap");

    expect(data.contextStatus).toBe("resolved");
    const scopes = [
      getScheduleContext.mock.calls[0][1],
      getTipsContext.mock.calls[0][1],
      getAllocationContext.mock.calls[0][2],
    ];
    for (const scope of scopes) {
      expect(scope).toEqual({
        organizationId: IDS.orgLiquorTap,
        locationId: IDS.locLeagueCity,
        timeZone: "America/Chicago",
      });
    }
  });

  it("CTX-18: a multi-location user without a selection loads NO operational data and gets no first-location guess", async () => {
    useUser(db, IDS.tom);
    const data = await loadPageData("liquor-tap");

    expect(data.contextStatus).toBe("selection_required");
    expect(data.availableContexts.map((c) => c.locationName)).toEqual([
      "League City",
      "NASA",
    ]);
    expect(data.initialUser).toBeNull();
    expect(data.scheduleContext).toBeNull();
    expect(data.tipsContext).toBeNull();
    expect(data.allocationContext).toBeNull();
    expectNoOperationalLoad();
  });

  it("CTX-14/15/16: invalid cookie states load NO operational data", async () => {
    useUser(db, IDS.jack);
    const cases: Array<[string, string]> = [
      ["garbage", "cookie_malformed"],
      [
        serializeActiveContextCookie({
          organizationId: IDS.orgLiquorTap,
          locationId: IDS.locNasa,
        }),
        "cookie_route_organization_mismatch",
      ],
      [
        serializeActiveContextCookie({
          organizationId: IDS.orgMonks,
          locationId: IDS.locLeagueCity,
        }),
        "cookie_location_unavailable",
      ],
    ];
    for (const [cookie, reason] of cases) {
      state.cookie = cookie;
      const data = await loadPageData("the-monks");
      expect(data.contextStatus).toBe("invalid_context");
      expect(data.contextReason).toBe(reason);
      expect(data.initialUser).toBeNull();
      expectNoOperationalLoad();
    }
  });

  it("CTX-01: an unauthenticated request hydrates nothing (signed-out presentation)", async () => {
    useUser(db, null);
    const data = await loadPageData("the-monks");
    expect(data.contextStatus).toBe("unauthenticated");
    expect(data.initialUser).toBeNull();
    expectNoOperationalLoad();
  });

  it("CTX-20: a database failure yields an error state, never empty operational data", async () => {
    state.client = createFakeSupabase({
      userId: IDS.jerry,
      db,
      tableErrors: { locations: { message: "boom" } },
    }).client;
    const data = await loadPageData("the-monks");
    expect(data.contextStatus).toBe("error");
    expect(data.contextReason).toBe("locations_query_failed");
    expectNoOperationalLoad();
  });

  it("NAV: a failed configuration read remains distinct from an empty successful snapshot", async () => {
    useUser(db, IDS.jerry);
    readLocationModuleConfigs.mockResolvedValue({
      status: "unavailable",
      reason: "database_error",
    });
    const data = await loadPageData("the-monks");
    expect(data.contextStatus).toBe("resolved");
    expect(data.moduleNavigation?.result).toEqual({
      status: "unavailable",
      reason: "database_error",
    });
  });

  it("CTX-22: the legacy `/r/<slug>` route for an organization the user cannot access is safe (no data, signed-out presentation)", async () => {
    useUser(db, IDS.jerry);
    const data = await loadPageData("liquor-tap");
    expect(data.contextStatus).toBe("no_access");
    expect(data.initialUser).toBeNull();
    expectNoOperationalLoad();
  });

  it("CTX-22: the legacy single-location user keeps working with no cookie (unique eligibility)", async () => {
    useUser(db, IDS.jerry);
    const data = await loadPageData("the-monks");
    expect(data.contextStatus).toBe("resolved");
    expect(data.initialUser).toMatchObject({
      profileId: IDS.jerry,
      name: "Jerry",
      role: "server",
      designation: "staff",
      organizationId: IDS.orgMonks,
    });
  });

  it("CTX-08: an Overall Owner with no organization membership is hydrated (getCurrentUser would have rejected them)", async () => {
    addOverall(db, IDS.overallOwner, "owner");
    useUser(db, IDS.overallOwner);
    const data = await loadPageData("the-monks");
    expect(data.contextStatus).toBe("resolved");
    expect(data.initialUser).toMatchObject({
      profileId: IDS.overallOwner,
      name: "Olivia",
      role: "owner",
      designation: "owner",
      organizationId: IDS.orgMonks,
    });
    expect(getScheduleContext).toHaveBeenCalledTimes(1);
  });

  it("role display is unchanged for an existing member (Jack: owner at Liquor Tap via cookie, assigned NASA manager)", async () => {
    useUser(db, IDS.jack);
    state.cookie = serializeActiveContextCookie({
      organizationId: IDS.orgLiquorTap,
      locationId: IDS.locNasa,
    });
    const data = await loadPageData("liquor-tap");
    expect(data.initialUser).toMatchObject({
      role: "owner",
      designation: "owner",
    });
  });

  describe("CTX-21: demo mode stays isolated", () => {
    it("NEXT_PUBLIC_DEMO_MODE=true: no hosted call, no cookie read, no resolver", async () => {
      vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
      useUser(db, IDS.jerry);
      state.cookie = "garbage";
      const data = await loadPageData("the-monks");
      expect(data).toMatchObject({
        demoMode: true,
        contextStatus: "demo",
        initialUser: null,
        activeContext: null,
      });
      expect(state.createClientCalls).toBe(0);
      expect(state.cookieReads).toBe(0);
      expectNoOperationalLoad();
    });

    it("missing Supabase configuration is demo mode too", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
      const data = await loadPageData("the-monks");
      expect(data.contextStatus).toBe("demo");
      expect(state.createClientCalls).toBe(0);
      expectNoOperationalLoad();
    });
  });
});
