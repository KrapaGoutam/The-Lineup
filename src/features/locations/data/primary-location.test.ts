import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: 0,
  user: null as { id: string } | null,
  assigned: [] as { location_id: string }[],
  inFilter: null as string[] | null,
  filters: [] as string[],
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
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      state.calls += 1;
      if (table === "location_memberships") {
        const assignments: Record<string, unknown> = {
          select: () => assignments,
          eq: () => assignments,
          then: (resolve: (v: unknown) => void) =>
            resolve({ data: state.assigned, error: null }),
        };
        return assignments;
      }
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          state.filters.push(`${column}=${String(value)}`);
          return builder;
        },
        is: (column: string) => {
          state.filters.push(`${column} is null`);
          return builder;
        },
        in: (_column: string, ids: string[]) => {
          state.inFilter = ids;
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({
          data: { id: "legacy-oldest", time_zone: "America/New_York" },
        }),
      };
      return builder;
    },
  }),
}));

import { getPrimaryLocation, locationForLoader } from "./primary-location";

describe("locationForLoader (V2-003.001)", () => {
  beforeEach(() => {
    state.calls = 0;
    state.user = null;
    state.assigned = [];
    state.inFilter = null;
    state.filters = [];
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

  it("legacy direct callers (no scope) keep the existing primary-location behavior", async () => {
    const location = await locationForLoader("org-1");
    expect(location).toEqual({
      id: "legacy-oldest",
      time_zone: "America/New_York",
    });
    expect(state.calls).toBe(1);
  });

  it("getPrimaryLocation only considers active, un-archived locations", async () => {
    await getPrimaryLocation("org-1");
    expect(state.filters).toContain("active=true");
    expect(state.filters).toContain("archived_at is null");
  });

  it("getPrimaryLocation restricts a caller with assignments to those locations", async () => {
    state.user = { id: "user-1" };
    state.assigned = [{ location_id: "loc-b" }];
    await getPrimaryLocation("org-1");
    expect(state.inFilter).toEqual(["loc-b"]);
  });

  it("getPrimaryLocation does not restrict a caller without assignments", async () => {
    state.user = { id: "user-1" };
    await getPrimaryLocation("org-1");
    expect(state.inFilter).toBeNull();
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

    it("SW-OPS-05: no selection, a cross-origin referer, or a non-/r/ page keeps the legacy path", async () => {
      for (const referer of [
        null,
        "https://app.test/r/the-monks",
        `https://evil.test/r/the-monks?location=${LOC_B}`,
        `https://app.test/other?location=${LOC_B}`,
      ]) {
        state.referer = referer;
        expect(await getPrimaryLocation("org-1")).toEqual({
          id: "legacy-oldest",
          time_zone: "America/New_York",
        });
      }
      expect(state.resolveArgs).toHaveLength(0);
    });
  });
});
