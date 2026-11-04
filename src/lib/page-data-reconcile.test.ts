import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { serializeActiveContextCookie } from "@/features/context/domain/context-cookie";
import {
  IDS,
  addAssignment,
  addMembership,
  baseDb,
  createFakeSupabase,
  type FakeDb,
} from "@/features/context/testing/fake-supabase";

/**
 * V2-003.004 — URL / persisted-cookie reconciliation flag at the entry
 * boundary. Real resolver + loader; only the client, cookie store and
 * operational loaders are doubled (same harness as the 003.003 test).
 */

const state = vi.hoisted(() => ({
  client: null as unknown,
  cookie: null as string | null,
  cookieReads: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.client,
}));
vi.mock("@/features/context/data/context-cookie-reader", () => ({
  readActiveContextCookieValue: async () => {
    state.cookieReads += 1;
    return state.cookie;
  },
}));
vi.mock("@/features/schedules/data/schedule-data", () => ({
  getScheduleContext: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/features/tips/data/tips-data", () => ({
  getTipsContext: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/features/allocation/data/allocation-data", () => ({
  getAllocationContext: vi.fn().mockResolvedValue({}),
}));

import { loadPageData } from "./page-data";

const KATY = "55555555-5555-4555-8555-555555555555";
const pick = (locationId: string) =>
  ({ status: "present", locationId }) as const;
const cookie = (o: string, l: string) =>
  serializeActiveContextCookie({ organizationId: o, locationId: l });

describe("deep-link / persisted-context reconciliation (V2-003.004)", () => {
  let db: FakeDb;
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dev.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.cookie = null;
    state.cookieReads = 0;
    db = baseDb();
    db.locations.push({
      id: KATY,
      organization_id: IDS.orgMonks,
      name: "Katy",
      time_zone: "America/Chicago",
      active: true,
      archived_at: null,
      created_at: "2026-02-01T00:00:00Z",
    });
    db.profiles.push(
      { id: IDS.jack, display_name: "Jack" },
      { id: IDS.jerry, display_name: "Jerry" },
    );
    // Jack: Monks (Webster + Katy) and Liquor Tap (NASA).
    addMembership(db, IDS.jack, IDS.orgMonks, ["server"]);
    addMembership(db, IDS.jack, IDS.orgLiquorTap, ["server"]);
    addAssignment(db, IDS.jack, IDS.locWebster, "staff");
    addAssignment(db, IDS.jack, KATY, "staff");
    addAssignment(db, IDS.jack, IDS.locNasa, "staff");
    // Jerry: a single context.
    addMembership(db, IDS.jerry, IDS.orgMonks, ["server"]);
    addAssignment(db, IDS.jerry, IDS.locWebster, "staff");
    state.client = createFakeSupabase({ userId: IDS.jack, db }).client;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const useUser = (userId: string) => {
    state.client = createFakeSupabase({ userId, db }).client;
  };

  it("PERSIST-19: an explicit location that matches the persisted cookie needs no reconciliation", async () => {
    state.cookie = cookie(IDS.orgMonks, KATY);
    const data = await loadPageData("the-monks", pick(KATY));
    expect(data.contextStatus).toBe("resolved");
    expect(data.contextReconcile).toBeNull();
  });

  it("PERSIST-20: an explicit location DIFFERENT from the cookie is displayed but flagged so operations stay closed until it is persisted", async () => {
    state.cookie = cookie(IDS.orgMonks, IDS.locWebster);
    const data = await loadPageData("the-monks", pick(KATY));
    expect(data.contextStatus).toBe("resolved");
    expect(data.activeContext).toMatchObject({
      locationId: KATY,
      selectedBy: "explicit_selection",
    });
    expect(data.contextReconcile).toEqual({
      organizationId: IDS.orgMonks,
      organizationSlug: "the-monks",
      locationId: KATY,
    });
  });

  it("a cookie for another organization or a malformed cookie is flagged (explicit selection supersedes it, but must be persisted)", async () => {
    for (const value of [
      cookie(IDS.orgLiquorTap, IDS.locNasa),
      "not-json",
      cookie(IDS.orgMonks, "99999999-9999-4999-8999-999999999999"),
    ]) {
      state.cookie = value;
      const data = await loadPageData("the-monks", pick(KATY));
      expect(data.contextStatus).toBe("resolved");
      expect(data.contextReconcile).toMatchObject({ locationId: KATY });
    }
  });

  it("no cookie + explicit location in an organization with several eligible locations is flagged", async () => {
    const data = await loadPageData("the-monks", pick(KATY));
    expect(data.contextReconcile).toMatchObject({ locationId: KATY });
  });

  it("PERSIST-26/31: single-context users never need a cookie — no flag for a sole eligible location, with or without an explicit location", async () => {
    useUser(IDS.jerry);
    const implicit = await loadPageData("the-monks");
    expect(implicit.activeContext?.selectedBy).toBe("sole_eligible_location");
    expect(implicit.contextReconcile).toBeNull();
    const explicit = await loadPageData("the-monks", pick(IDS.locWebster));
    expect(explicit.activeContext?.selectedBy).toBe("explicit_selection");
    expect(explicit.contextReconcile).toBeNull();
  });

  it("PERSIST-14: a valid cookie preference needs no flag; the persisted pair is what loads", async () => {
    state.cookie = cookie(IDS.orgMonks, KATY);
    const data = await loadPageData("the-monks");
    expect(data.activeContext).toMatchObject({
      locationId: KATY,
      selectedBy: "cookie_preference",
    });
    expect(data.contextReconcile).toBeNull();
  });

  it("invalid / unauthorized states never carry a reconcile target (no workspace to reconcile)", async () => {
    state.cookie = cookie(IDS.orgMonks, "99999999-9999-4999-8999-999999999999");
    const stale = await loadPageData("the-monks");
    expect(stale.contextStatus).toBe("invalid_context");
    expect(stale.contextReconcile).toBeNull();
    // explicit selection of a location the user cannot access
    const forbidden = await loadPageData("the-monks", pick(IDS.locLeagueCity));
    expect(forbidden.contextStatus).toBe("invalid_context");
    expect(forbidden.contextReconcile).toBeNull();
  });

  it("PERSIST-34: demo mode never consults the context cookie or hosted data", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const data = await loadPageData("the-monks", pick(KATY));
    expect(data.contextStatus).toBe("demo");
    expect(data.contextReconcile).toBeNull();
    expect(state.cookieReads).toBe(0);
  });
});
