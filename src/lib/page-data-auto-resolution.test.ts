import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// V2-004.004: staged enforcement (legacy behaviour) for entry-loader tests.
vi.mock("@/features/modules/data/module-enforcement", () => ({
  readModuleEnforcementMode: vi.fn(async () => ({
    status: "ok",
    mode: "staged",
    source: "database",
  })),
}));

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
 * V2-003.003 — single-context auto resolution at the entry boundary. Only the
 * Supabase client, cookie store and operational loaders are doubled; the
 * resolver, canonical access resolver and redirect builder run for real.
 */

const state = vi.hoisted(() => ({
  client: null as unknown,
  cookie: null as string | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.client,
}));
vi.mock("@/features/context/data/context-cookie-reader", () => ({
  readActiveContextCookieValue: async () => state.cookie,
}));

const getScheduleContext = vi.hoisted(() => vi.fn());
const getTipsContext = vi.hoisted(() => vi.fn());
const getAllocationContext = vi.hoisted(() => vi.fn());
vi.mock("@/features/schedules/data/schedule-data", () => ({
  getScheduleContext,
}));
vi.mock("@/features/tips/data/tips-data", () => ({ getTipsContext }));
vi.mock("@/features/allocation/data/allocation-data", () => ({
  getAllocationContext,
}));

import { loadPageData } from "./page-data";

const GLOBAL = { globalEntry: true } as const;
const LIQUOR_NASA = `/r/liquor-tap?location=${IDS.locNasa}`;

describe("single-context auto resolution (V2-003.003)", () => {
  let db: FakeDb;
  const useUser = (userId: string | null) => {
    state.client = createFakeSupabase({ userId, db }).client;
  };

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dev.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    state.cookie = null;
    getScheduleContext.mockReset().mockResolvedValue({});
    getTipsContext.mockReset().mockResolvedValue({});
    getAllocationContext.mockReset().mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});

    db = baseDb();
    db.profiles.push(
      { id: IDS.jerry, display_name: "Jerry" },
      { id: IDS.tom, display_name: "Tom" },
      { id: IDS.jack, display_name: "Jack" },
      { id: IDS.sam, display_name: "Sam" },
      { id: IDS.overallOwner, display_name: "Olivia" },
      { id: IDS.orgOwnerLiquor, display_name: "Oscar" },
    );
    addMembership(db, IDS.jerry, IDS.orgMonks, ["server"]);
    addAssignment(db, IDS.jerry, IDS.locWebster, "staff");
    addMembership(db, IDS.tom, IDS.orgLiquorTap, ["server"]);
    addAssignment(db, IDS.tom, IDS.locNasa, "staff");
    addAssignment(db, IDS.tom, IDS.locLeagueCity, "staff");
    addMembership(db, IDS.jack, IDS.orgMonks, ["server"]);
    addMembership(db, IDS.jack, IDS.orgLiquorTap, ["server"]);
    addAssignment(db, IDS.jack, IDS.locWebster, "staff");
    addAssignment(db, IDS.jack, IDS.locNasa, "staff");
    // Sam: one organization (Liquor Tap), one eligible location (NASA).
    addMembership(db, IDS.sam, IDS.orgLiquorTap, ["server"]);
    addAssignment(db, IDS.sam, IDS.locNasa, "staff");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const noLoad = () => {
    expect(getScheduleContext).not.toHaveBeenCalled();
    expect(getTipsContext).not.toHaveBeenCalled();
    expect(getAllocationContext).not.toHaveBeenCalled();
  };

  it("AUTO-01/13/20: a unique eligible pair resolves with no picker and one verified location for every loader", async () => {
    useUser(IDS.jerry);
    const data = await loadPageData("the-monks", undefined, GLOBAL);
    expect(data.contextStatus).toBe("resolved");
    expect(data.redirectTo).toBeNull();
    expect(data.activeContext).toMatchObject({
      organizationName: "Monks",
      locationName: "Webster",
      selectedBy: "sole_eligible_location",
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
  });

  it("AUTO-02: two accessible locations are never silently defaulted", async () => {
    useUser(IDS.tom);
    const data = await loadPageData("liquor-tap");
    expect(data.contextStatus).toBe("selection_required");
    expect(data.activeContext).toBeNull();
    noLoad();
  });

  it("AUTO-03: several organizations never default to a tenant; `/` stays in the default scope with no redirect", async () => {
    useUser(IDS.jack);
    const route = await loadPageData("the-monks", undefined, GLOBAL);
    expect(route.contextStatus).toBe("resolved"); // explicit default tenant, unique Monks location
    expect(route.redirectTo).toBeNull();
    // A user with several orgs and NO access in the default tenant is not redirected.
    db.memberships = db.memberships.filter(
      (m) => !(m.profile_id === IDS.jack && m.organization_id === IDS.orgMonks),
    );
    db.location_memberships = db.location_memberships.filter(
      (a) => !(a.profile_id === IDS.jack && a.location_id === IDS.locWebster),
    );
    addMembership(db, IDS.jack, IDS.orgMonks, ["server"], false);
    const jackNoMonks = await loadPageData("the-monks", undefined, GLOBAL);
    expect(jackNoMonks.redirectTo).toBe(LIQUOR_NASA);
  });

  it("AUTO-04: an inactive or archived branch is excluded, so the single remaining eligible branch auto-resolves", async () => {
    addAssignment(db, IDS.sam, IDS.locOldKemah, "staff"); // inactive location
    addAssignment(db, IDS.sam, IDS.locArchived, "staff"); // archived location
    useUser(IDS.sam);
    const data = await loadPageData("liquor-tap");
    expect(data.contextStatus).toBe("resolved");
    expect(data.activeContext?.locationId).toBe(IDS.locNasa);
  });

  it("AUTO-05: a revoked location assignment denies operational access (no previous workspace)", async () => {
    db.location_memberships = db.location_memberships.filter(
      (a) => a.profile_id !== IDS.sam,
    );
    addAssignment(db, IDS.sam, IDS.locNasa, "staff", false);
    useUser(IDS.sam);
    const data = await loadPageData("liquor-tap", undefined, GLOBAL);
    expect(data.contextStatus).toBe("no_access");
    expect(data.redirectTo).toBeNull();
    expect(data.initialUser).toBeNull();
    noLoad();
  });

  it("AUTO-06: a revoked organization membership denies access", async () => {
    db.memberships = db.memberships.filter((m) => m.profile_id !== IDS.sam);
    addMembership(db, IDS.sam, IDS.orgLiquorTap, ["server"], false);
    useUser(IDS.sam);
    const data = await loadPageData("liquor-tap", undefined, GLOBAL);
    expect(data.contextStatus).toBe("no_access");
    expect(data.redirectTo).toBeNull();
    noLoad();
  });

  it("AUTO-08: an Overall role with several eligible contexts is never auto-selected", async () => {
    addOverall(db, IDS.overallOwner, "owner");
    useUser(IDS.overallOwner);
    const data = await loadPageData("liquor-tap", undefined, GLOBAL);
    expect(data.contextStatus).toBe("selection_required");
    expect(data.redirectTo).toBeNull();
    noLoad();
  });

  it("AUTO-09: Org Owner without a location assignment does not gain operational authority", async () => {
    addMembership(db, IDS.orgOwnerLiquor, IDS.orgLiquorTap, ["owner"]);
    useUser(IDS.orgOwnerLiquor);
    const data = await loadPageData("liquor-tap", undefined, GLOBAL);
    expect(data.contextStatus).toBe("no_access");
    expect(data.redirectTo).toBeNull();
    noLoad();
  });

  it("AUTO-10: a valid explicit selection is respected", async () => {
    useUser(IDS.tom);
    const data = await loadPageData("liquor-tap", {
      status: "present",
      locationId: IDS.locLeagueCity,
    });
    expect(data.activeContext).toMatchObject({
      locationId: IDS.locLeagueCity,
      selectedBy: "explicit_selection",
    });
  });

  it("AUTO-11: an unauthorized explicit selection fails closed even when only one context is eligible", async () => {
    useUser(IDS.sam);
    const data = await loadPageData("liquor-tap", {
      status: "present",
      locationId: IDS.locLeagueCity,
    });
    expect(data.contextStatus).toBe("invalid_context");
    expect(data.activeContext).toBeNull();
    noLoad();
  });

  it("AUTO-12: a malformed or stale cookie is rejected, never replaced by the sole eligible context", async () => {
    useUser(IDS.sam);
    state.cookie = "garbage";
    const malformed = await loadPageData("liquor-tap", undefined, GLOBAL);
    expect(malformed).toMatchObject({
      contextStatus: "invalid_context",
      contextReason: "cookie_malformed",
      redirectTo: null,
    });
    state.cookie = serializeActiveContextCookie({
      organizationId: IDS.orgLiquorTap,
      locationId: IDS.locLeagueCity,
    });
    const stale = await loadPageData("liquor-tap", undefined, GLOBAL);
    expect(stale.contextStatus).toBe("invalid_context");
    noLoad();
  });

  it("AUTO-16: `/` redirects a single-context user of ANOTHER organization to their own canonical route, built from verified data", async () => {
    useUser(IDS.sam);
    const data = await loadPageData("the-monks", undefined, GLOBAL);
    expect(data.redirectTo).toBe(LIQUOR_NASA);
    expect(data.initialUser).toBeNull();
    noLoad(); // no data from the unrelated default tenant, none before redirect
  });

  it("AUTO-16: the default-tenant route itself never redirects (no loop) and `/r/<slug>` never redirects", async () => {
    useUser(IDS.sam);
    expect((await loadPageData("liquor-tap")).redirectTo).toBeNull();
    // Following the redirect lands on a resolved page, not another redirect.
    const landed = await loadPageData("liquor-tap", {
      status: "present",
      locationId: IDS.locNasa,
    });
    expect(landed.contextStatus).toBe("resolved");
    expect(landed.redirectTo).toBeNull();
    // A non-global entry with no access in the slug's tenant is not redirected.
    expect((await loadPageData("the-monks")).redirectTo).toBeNull();
  });

  it("AUTO-17: a multi-context user without default-tenant access is not redirected (no arbitrary tenant)", async () => {
    db.memberships = db.memberships.filter((m) => m.profile_id !== IDS.jack);
    addMembership(db, IDS.jack, IDS.orgLiquorTap, ["server"]);
    addAssignment(db, IDS.jack, IDS.locLeagueCity, "staff");
    useUser(IDS.jack);
    const data = await loadPageData("the-monks", undefined, GLOBAL);
    expect(data.contextStatus).toBe("no_access");
    expect(data.redirectTo).toBeNull();
  });

  it("AUTO-15: a signed-out request has no workspace and is never redirected", async () => {
    useUser(null);
    const data = await loadPageData("the-monks", undefined, GLOBAL);
    expect(data.contextStatus).toBe("unauthenticated");
    expect(data.redirectTo).toBeNull();
    noLoad();
  });

  it("AUTO-14: refresh re-verifies from the database each time (a later revocation takes effect)", async () => {
    useUser(IDS.sam);
    expect((await loadPageData("liquor-tap")).contextStatus).toBe("resolved");
    db.location_memberships = db.location_memberships.filter(
      (a) => a.profile_id !== IDS.sam,
    );
    expect((await loadPageData("liquor-tap")).contextStatus).toBe("no_access");
  });

  it("AUTO-18: demo mode is unchanged and never redirects", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    useUser(IDS.sam);
    const data = await loadPageData("the-monks", undefined, GLOBAL);
    expect(data).toMatchObject({ contextStatus: "demo", redirectTo: null });
  });
});
