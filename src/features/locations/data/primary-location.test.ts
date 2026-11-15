import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: 0,
  eligible: { status: "ok", contexts: [] } as unknown,
  eligibleCalls: 0,
  referer: null as string | null,
  cookie: null as string | null,
  resolved: null as unknown,
  resolveArgs: [] as unknown[],
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "app.test",
      ...(state.referer ? { referer: state.referer } : {}),
    }),
}));

vi.mock("@/features/context/data/context-cookie-reader", () => ({
  readActiveContextCookieValue: async () => state.cookie,
}));

vi.mock("@/features/context/data/active-context", () => ({
  resolveCurrentActiveContext: async (options: unknown) => {
    state.resolveArgs.push(options);
    return state.resolved;
  },
  listCurrentEligibleContexts: async () => {
    state.eligibleCalls += 1;
    return state.eligible;
  },
}));

// The legacy "oldest location" query must never run any more (V2-003.003).
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    state.calls += 1;
    throw new Error("getPrimaryLocation must not query locations directly");
  },
}));

const ctx = (organizationId: string, locationId: string) => ({
  organizationId,
  organizationSlug: "slug",
  organizationName: "Org",
  locationId,
  locationName: "Loc",
  timeZone: "America/Chicago",
});

import { getPrimaryLocation, locationForLoader } from "./primary-location";

describe("locationForLoader (V2-003.001)", () => {
  beforeEach(() => {
    state.calls = 0;
    state.eligible = { status: "ok", contexts: [] };
    state.eligibleCalls = 0;
    state.referer = null;
    state.cookie = null;
    state.resolved = null;
    state.resolveArgs = [];
  });

  it("CTX-19: with a verified scope it uses exactly that location and time zone and never queries a primary location", async () => {
    const location = await locationForLoader("org-1", {
      organizationId: "org-1",
      locationId: "loc-verified",
      timeZone: "America/Chicago",
    });
    expect(location).toEqual({
      id: "loc-verified",
      time_zone: "America/Chicago",
    });
    expect(state.calls).toBe(0);
  });

  it("CTX-18: a scope for a different organization fails safe (null) instead of substituting another location", async () => {
    const location = await locationForLoader("org-2", {
      organizationId: "org-1",
      locationId: "loc-verified",
      timeZone: "America/Chicago",
    });
    expect(location).toBeNull();
    expect(state.calls).toBe(0);
  });

  it("AUTO-19: with no Referer and exactly one verified eligible location, a legacy caller uses it", async () => {
    state.eligible = {
      status: "ok",
      contexts: [ctx("org-1", "loc-only"), ctx("org-2", "loc-other-org")],
    };
    expect(await locationForLoader("org-1")).toEqual({
      id: "loc-only",
      time_zone: "America/Chicago",
    });
    expect(state.calls).toBe(0);
  });

  it("AUTO-19: with no Referer and several eligible locations, it fails closed instead of choosing the oldest", async () => {
    state.eligible = {
      status: "ok",
      contexts: [ctx("org-1", "loc-a"), ctx("org-1", "loc-b")],
    };
    expect(await getPrimaryLocation("org-1")).toBeNull();
    expect(state.calls).toBe(0);
  });

  it("AUTO-19: no eligible location, a failed list or a signed-out caller all fail closed", async () => {
    for (const eligible of [
      { status: "ok", contexts: [ctx("org-2", "loc-x")] },
      { status: "error", reason: "locations_query_failed" },
      { status: "unauthenticated" },
    ]) {
      state.eligible = eligible;
      expect(await getPrimaryLocation("org-1")).toBeNull();
    }
    expect(state.calls).toBe(0);
  });

  describe("persisted-context follow-ups (V2-003.004)", () => {
    const ORG = "11111111-1111-4111-8111-111111111111";
    const OTHER_ORG = "33333333-3333-4333-8333-333333333333";
    const LOC_A = "21111111-1111-4111-8111-111111111111";
    const LOC_B = "22222222-2222-4222-8222-222222222222";
    const cookieFor = (o: string, l: string) => JSON.stringify({ v: 1, o, l });
    const resolved = (organizationId: string, locationId: string) => ({
      status: "resolved",
      context: {
        organizationId,
        organizationSlug: "the-monks",
        locationId,
        timeZone: "America/Chicago",
      },
    });

    it("PERSIST-27: with NO Referer the validated persisted location is used", async () => {
      state.cookie = cookieFor(ORG, LOC_B);
      state.resolved = resolved(ORG, LOC_B);
      expect(await getPrimaryLocation(ORG)).toEqual({
        id: LOC_B,
        time_zone: "America/Chicago",
      });
      expect(state.calls).toBe(0);
      expect(state.resolveArgs[0]).toMatchObject({ routeSlug: null });
      expect(state.eligibleCalls).toBe(0);
    });

    it("PERSIST-28: an unverifiable (stale/revoked/invalid) persisted context is a safe denial, never a substitute", async () => {
      state.cookie = cookieFor(ORG, LOC_B);
      state.eligible = { status: "ok", contexts: [ctx(ORG, LOC_A)] };
      for (const resolution of [
        { status: "invalid_context", reason: "cookie_location_unavailable" },
        { status: "no_access" },
        { status: "unauthenticated" },
        { status: "error", reason: "locations_query_failed" },
      ]) {
        state.resolved = resolution;
        expect(await getPrimaryLocation(ORG)).toBeNull();
      }
      // never falls back to the (valid) other eligible location
      expect(state.eligibleCalls).toBe(0);
    });

    it("PERSIST-22: a malformed cookie is denied before any resolution", async () => {
      state.cookie = "not-json";
      state.eligible = { status: "ok", contexts: [ctx(ORG, LOC_A)] };
      expect(await getPrimaryLocation(ORG)).toBeNull();
      expect(state.resolveArgs).toHaveLength(0);
      expect(state.eligibleCalls).toBe(0);
    });

    it("PERSIST-29: a persisted context for another organization cannot operate this one", async () => {
      state.cookie = cookieFor(OTHER_ORG, LOC_B);
      state.resolved = resolved(OTHER_ORG, LOC_B);
      expect(await getPrimaryLocation(ORG)).toBeNull();
      // and a resolver answer that disagrees with the cookie pair is refused
      state.cookie = cookieFor(ORG, LOC_A);
      state.resolved = resolved(ORG, LOC_B);
      expect(await getPrimaryLocation(ORG)).toBeNull();
    });

    it("PERSIST-20: a Referer naming a DIFFERENT location than the verified context fails closed", async () => {
      state.cookie = cookieFor(ORG, LOC_A);
      state.resolved = resolved(ORG, LOC_A);
      state.referer = `https://app.test/r/the-monks?location=${LOC_B}`;
      expect(await getPrimaryLocation(ORG)).toBeNull();
      // a Referer for a different organization route also fails closed
      state.referer = `https://app.test/r/liquor-tap?location=${LOC_A}`;
      expect(await getPrimaryLocation(ORG)).toBeNull();
      // malformed / repeated / unreadable Referer selections fail closed
      for (const referer of [
        "https://app.test/r/the-monks?location=nope",
        `https://app.test/r/the-monks?location=${LOC_A}&location=${LOC_A}`,
        `https://app.test/r/%E0%A4%A?location=${LOC_A}`,
      ]) {
        state.referer = referer;
        expect(await getPrimaryLocation(ORG)).toBeNull();
      }
    });

    it("the Referer only ever agrees; it can never select a location (matching, missing, cross-origin, non-workspace)", async () => {
      state.cookie = cookieFor(ORG, LOC_A);
      state.resolved = resolved(ORG, LOC_A);
      for (const referer of [
        `https://app.test/r/the-monks?location=${LOC_A}`,
        null,
        "https://app.test/r/the-monks",
        `https://evil.test/r/the-monks?location=${LOC_B}`,
        `https://app.test/other?location=${LOC_B}`,
      ]) {
        state.referer = referer;
        expect(await getPrimaryLocation(ORG)).toEqual({
          id: LOC_A,
          time_zone: "America/Chicago",
        });
      }
    });

    it("PERSIST-25/26: with no cookie only a single verified eligible location in the organization is used", async () => {
      state.eligible = {
        status: "ok",
        contexts: [ctx(ORG, LOC_A), ctx(OTHER_ORG, LOC_B)],
      };
      expect(await getPrimaryLocation(ORG)).toEqual({
        id: LOC_A,
        time_zone: "America/Chicago",
      });
      state.eligible = {
        status: "ok",
        contexts: [ctx(ORG, LOC_A), ctx(ORG, LOC_B)],
      };
      expect(await getPrimaryLocation(ORG)).toBeNull();
    });

    it("with no cookie, an explicit Referer location that is not the sole verified one fails closed", async () => {
      state.eligible = { status: "ok", contexts: [ctx(ORG, LOC_A)] };
      state.referer = `https://app.test/r/slug?location=${LOC_B}`;
      expect(await getPrimaryLocation(ORG)).toBeNull();
    });
  });
});
