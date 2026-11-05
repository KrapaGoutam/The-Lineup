import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  IDS,
  addAssignment,
  addMembership,
  baseDb,
  createFakeSupabase,
  type FakeDb,
} from "@/features/context/testing/fake-supabase";

/**
 * DEV preview login hotfix — what the entry path decides AFTER a successful
 * passcode sign-in. Real resolver + loader + canonical access resolver; only
 * the client, cookie store and operational loaders are doubled.
 */

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.client,
}));
vi.mock("@/features/context/data/context-cookie-reader", () => ({
  readActiveContextCookieValue: async () => null,
}));
const loaders = vi.hoisted(() => ({
  schedule: vi.fn(),
  tips: vi.fn(),
  allocation: vi.fn(),
}));
vi.mock("@/features/schedules/data/schedule-data", () => ({
  getScheduleContext: loaders.schedule,
}));
vi.mock("@/features/tips/data/tips-data", () => ({
  getTipsContext: loaders.tips,
}));
vi.mock("@/features/allocation/data/allocation-data", () => ({
  getAllocationContext: loaders.allocation,
}));

import { loadPageData } from "./page-data";

const SLUG = "the-monks";

describe("post-login access outcomes", () => {
  let db: FakeDb;
  const as = (userId: string | null) => {
    state.client = createFakeSupabase({ userId, db }).client;
  };
  const noOperationalData = () => {
    expect(loaders.schedule).not.toHaveBeenCalled();
    expect(loaders.tips).not.toHaveBeenCalled();
    expect(loaders.allocation).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dev.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const fn of Object.values(loaders))
      fn.mockReset().mockResolvedValue({});
    db = baseDb();
    db.profiles.push(
      { id: IDS.jack, display_name: "Owner" },
      { id: IDS.sam, display_name: "Manager" },
      { id: IDS.tom, display_name: "Server" },
      { id: IDS.jerry, display_name: "Nobody" },
    );
    // Monks has exactly one location (Webster) in the base fixture.
    addMembership(db, IDS.jack, IDS.orgMonks, ["owner"]);
    addAssignment(db, IDS.jack, IDS.locWebster, "manager");
    addMembership(db, IDS.sam, IDS.orgMonks, ["general_manager"]);
    addAssignment(db, IDS.sam, IDS.locWebster, "manager");
    addMembership(db, IDS.tom, IDS.orgMonks, ["server"]);
    addAssignment(db, IDS.tom, IDS.locWebster, "staff");
    addMembership(db, IDS.jerry, IDS.orgMonks, ["server"]); // member, NO assignment
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("LOGIN-FIX-01: an active member with one eligible location resolves and loads the workspace", async () => {
    as(IDS.tom);
    const data = await loadPageData(SLUG);
    expect(data.contextStatus).toBe("resolved");
    expect(data.initialUser).not.toBeNull();
    expect(data.activeContext?.locationId).toBe(IDS.locWebster);
  });

  it("LOGIN-FIX-02: a member with zero assignments is an authenticated no_access — no workspace, no user, no automatic assignment", async () => {
    as(IDS.jerry);
    const data = await loadPageData(SLUG);
    expect(data.contextStatus).toBe("no_access");
    expect(data.initialUser).toBeNull();
    expect(data.activeContext).toBeNull();
    expect(data.redirectTo).toBeNull();
    noOperationalData();
    expect(
      db.location_memberships.filter((r) => r.profile_id === IDS.jerry),
    ).toHaveLength(0);
  });

  it("LOGIN-FIX-02: the same applies to the global `/` entry", async () => {
    as(IDS.jerry);
    const data = await loadPageData(SLUG, undefined, { globalEntry: true });
    expect(data.contextStatus).toBe("no_access");
    expect(data.redirectTo).toBeNull();
    noOperationalData();
  });

  it("an unauthenticated request stays `unauthenticated` (passcode login), distinct from no_access", async () => {
    as(null);
    expect((await loadPageData(SLUG)).contextStatus).toBe("unauthenticated");
  });

  it("LOGIN-FIX-03: a later authorized assignment lets the same user in on the next request", async () => {
    as(IDS.jerry);
    expect((await loadPageData(SLUG)).contextStatus).toBe("no_access");
    addAssignment(db, IDS.jerry, IDS.locWebster, "staff");
    const data = await loadPageData(SLUG);
    expect(data.contextStatus).toBe("resolved");
    expect(data.activeContext?.locationId).toBe(IDS.locWebster);
  });

  it("LOGIN-FIX-05: a revoked assignment denies on the next request, no stale workspace", async () => {
    as(IDS.tom);
    expect((await loadPageData(SLUG)).contextStatus).toBe("resolved");
    for (const row of db.location_memberships) {
      if (row.profile_id === IDS.tom) row.active = false;
    }
    loaders.schedule.mockClear();
    const data = await loadPageData(SLUG);
    expect(data.contextStatus).toBe("no_access");
    expect(data.initialUser).toBeNull();
    expect(loaders.schedule).not.toHaveBeenCalled();
  });

  it("LOGIN-FIX-06: an inactive organization membership gets no location access", async () => {
    for (const row of db.memberships) {
      if (row.profile_id === IDS.tom) row.active = false;
    }
    as(IDS.tom);
    const data = await loadPageData(SLUG);
    expect(data.contextStatus).toBe("no_access");
    noOperationalData();
  });

  it("LOGIN-FIX-07: organization roles are preserved — owner/manager keep manager capabilities, staff does not gain them", async () => {
    const { resolveCurrentActiveContext } = await import(
      "@/features/context/data/active-context"
    );
    const caps = async (id: string) => {
      state.client = createFakeSupabase({ userId: id, db }).client;
      const r = await resolveCurrentActiveContext({
        routeSlug: SLUG,
        cookieValue: null,
      });
      if (r.status !== "resolved") throw new Error(r.status);
      return r.context.access.capabilities;
    };
    const owner = await caps(IDS.jack);
    const manager = await caps(IDS.sam);
    const staff = await caps(IDS.tom);
    expect(owner).toContain("location:manage");
    expect(manager).toContain("location:manage");
    expect(staff).not.toContain("location:manage");
    // the organization roles were not touched by resolution
    expect(
      db.memberships.find((m) => m.profile_id === IDS.jack)?.roles,
    ).toEqual(["owner"]);
    expect(db.memberships.find((m) => m.profile_id === IDS.tom)?.roles).toEqual(
      ["server"],
    );
  });

  it("LOGIN-FIX-08: switching accounts yields only the second account's workspace", async () => {
    as(IDS.sam);
    const a = await loadPageData(SLUG);
    as(IDS.jerry);
    const b = await loadPageData(SLUG);
    expect(a.initialUser?.profileId).toBe(IDS.sam);
    expect(b.initialUser).toBeNull();
    expect(b.contextStatus).toBe("no_access");
  });

  it("LOGIN-FIX-09: several eligible locations still require an explicit choice (no arbitrary pick)", async () => {
    db.locations.push({
      id: IDS.locMonksSecond,
      organization_id: IDS.orgMonks,
      name: "Katy",
      time_zone: "America/Chicago",
      active: true,
      archived_at: null,
      created_at: "2026-02-01T00:00:00Z",
    });
    addAssignment(db, IDS.tom, IDS.locMonksSecond, "staff");
    as(IDS.tom);
    const data = await loadPageData(SLUG);
    expect(data.contextStatus).toBe("selection_required");
    noOperationalData();
  });
});
