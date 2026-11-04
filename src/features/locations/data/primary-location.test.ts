import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: 0,
  eligible: { status: "ok", contexts: [] } as unknown,
  eligibleCalls: 0,
  referer: null as string | null,
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

  describe("selected-location follow-ups (V2-003.002)", () => {
    const LOC_B = "22222222-2222-4222-8222-222222222222";
    const resolvedB = {
      status: "resolved",
      context: {
        organizationId: "org-1",
        locationId: LOC_B,
        timeZone: "America/Chicago",
      },
    };

    it("SW-OPS-01: a verified ?location= referer makes follow-ups use that SAME location, not the oldest assigned one", async () => {
      state.referer = `https://app.test/r/the-monks?location=${LOC_B}`;
      state.resolved = resolvedB;
      const location = await getPrimaryLocation("org-1");
      expect(location).toEqual({ id: LOC_B, time_zone: "America/Chicago" });
      expect(state.calls).toBe(0);
      expect(state.resolveArgs[0]).toMatchObject({
        routeSlug: "the-monks",
        explicitSelection: { status: "present", locationId: LOC_B },
      });
    });

    it("SW-OPS-02: an unverifiable selection is a safe denial (null), never a substitute location", async () => {
      state.referer = `https://app.test/r/the-monks?location=${LOC_B}`;
      state.resolved = {
        status: "invalid_context",
        reason: "selection_location_unavailable",
      };
      expect(await getPrimaryLocation("org-1")).toBeNull();
      expect(state.calls).toBe(0);
    });

    it("SW-OPS-03: a selection that resolves to a different organization is denied", async () => {
      state.referer = `https://app.test/r/the-monks?location=${LOC_B}`;
      state.resolved = resolvedB;
      expect(await getPrimaryLocation("org-2")).toBeNull();
    });

    it("SW-OPS-04: malformed or repeated location params fail closed", async () => {
      state.resolved = {
        status: "invalid_context",
        reason: "selection_malformed",
      };
      state.referer = "https://app.test/r/the-monks?location=nope";
      expect(await getPrimaryLocation("org-1")).toBeNull();
      state.referer = `https://app.test/r/the-monks?location=${LOC_B}&location=${LOC_B}`;
      expect(await getPrimaryLocation("org-1")).toBeNull();
      expect(state.resolveArgs[1]).toMatchObject({
        explicitSelection: { status: "malformed" },
      });
    });

    it("SW-OPS-05: no selection, a cross-origin referer, or a non-/r/ page never trusts the Referer; only the unique verified location is used", async () => {
      state.eligible = {
        status: "ok",
        contexts: [ctx("org-1", "loc-only")],
      };
      for (const referer of [
        null,
        "https://app.test/r/the-monks",
        `https://evil.test/r/the-monks?location=${LOC_B}`,
        `https://app.test/other?location=${LOC_B}`,
      ]) {
        state.referer = referer;
        expect(await getPrimaryLocation("org-1")).toEqual({
          id: "loc-only",
          time_zone: "America/Chicago",
        });
      }
      expect(state.resolveArgs).toHaveLength(0);
      expect(state.eligibleCalls).toBe(4);
    });
  });
});
