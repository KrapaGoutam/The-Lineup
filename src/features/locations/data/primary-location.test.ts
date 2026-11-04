import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      state.calls += 1;
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
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

import { locationForLoader } from "./primary-location";

describe("locationForLoader (V2-003.001)", () => {
  beforeEach(() => {
    state.calls = 0;
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
});
