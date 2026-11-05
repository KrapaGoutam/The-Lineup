import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The real resolver chain is exercised by the hosted-DEV suite; here the
// verified-location resolver and context resolver are the seams.
vi.mock("@/features/locations/data/primary-location", () => ({
  getPrimaryLocation: vi.fn(),
}));
vi.mock("@/features/context/data/active-context", () => ({
  resolveCurrentActiveContext: vi.fn(),
}));

import type { ContextResolutionResult } from "@/features/context/domain/active-context";

import {
  assertWorkspaceExpectation,
  verifyWorkspaceContext,
} from "./workspace-expectation";

const P = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const O = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const O2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const caller = { profileId: P, organizationId: O };
const expectA = { profileId: P, organizationId: O, locationId: A };
const loc = (id: string) => async () => ({ id, time_zone: "America/Chicago" });

describe("assertWorkspaceExpectation (server consistency contract)", () => {
  it("expected A + verified A -> ok, and returns the VERIFIED location", async () => {
    const result = await assertWorkspaceExpectation(expectA, caller, {
      resolveLocation: loc(A),
    });
    expect(result).toEqual({
      ok: true,
      location: { id: A, time_zone: "America/Chicago" },
    });
  });

  it("MT-12: expected A + verified B -> stale (nothing substituted)", async () => {
    expect(
      await assertWorkspaceExpectation(expectA, caller, {
        resolveLocation: loc(B),
      }),
    ).toEqual({ ok: false, code: "stale" });
  });

  it("no verifiable operational location (revoked, ambiguous, outage) -> stale, never a fallback", async () => {
    expect(
      await assertWorkspaceExpectation(expectA, caller, {
        resolveLocation: async () => null,
      }),
    ).toEqual({ ok: false, code: "stale" });
  });

  it("MT-15: expected organization differs from the caller's -> stale WITHOUT resolving a location", async () => {
    const resolveLocation = vi.fn(loc(A));
    expect(
      await assertWorkspaceExpectation(
        { ...expectA, organizationId: O2 },
        caller,
        { resolveLocation },
      ),
    ).toEqual({ ok: false, code: "stale" });
    expect(resolveLocation).not.toHaveBeenCalled();
  });

  it("MT-18: a different signed-in employee -> stale WITHOUT resolving a location", async () => {
    const resolveLocation = vi.fn(loc(A));
    expect(
      await assertWorkspaceExpectation({ ...expectA, profileId: B }, caller, {
        resolveLocation,
      }),
    ).toEqual({ ok: false, code: "stale" });
    expect(resolveLocation).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["malformed", { profileId: P }],
    ["extra keys", { ...expectA, admin: true }],
    ["garbage", "A"],
  ])(
    "MT-13: a %s expectation is rejected as invalid and never reaches the resolver",
    async (_n, raw) => {
      const resolveLocation = vi.fn(loc(A));
      expect(
        await assertWorkspaceExpectation(raw, caller, { resolveLocation }),
      ).toEqual({ ok: false, code: "invalid" });
      expect(resolveLocation).not.toHaveBeenCalled();
    },
  );

  it("MT-13: a forged expectation naming the location the user WANTS cannot grant it", async () => {
    // The attacker is persisted at A but asserts B: the verified A is not B.
    expect(
      await assertWorkspaceExpectation({ ...expectA, locationId: B }, caller, {
        resolveLocation: loc(A),
      }),
    ).toEqual({ ok: false, code: "stale" });
  });
});

describe("verifyWorkspaceContext (read-only)", () => {
  const resolved = (locationId: string): ContextResolutionResult => ({
    status: "resolved",
    context: {
      profileId: P,
      organizationId: O,
      organizationSlug: "s",
      organizationName: "O",
      locationId,
      locationName: "L",
      timeZone: "America/Chicago",
      selectedBy: "cookie_preference",
      access: {} as never,
    },
  });

  it("consistent when the server resolves the same context", async () => {
    expect(
      await verifyWorkspaceContext(expectA, {
        resolve: async () => resolved(A),
      }),
    ).toEqual({ status: "consistent" });
  });
  it("stale when the persisted context moved", async () => {
    expect(
      await verifyWorkspaceContext(expectA, {
        resolve: async () => resolved(B),
      }),
    ).toEqual({ status: "stale", reason: "location_changed" });
  });
  it("a malformed assertion concludes nothing and does not even resolve", async () => {
    const resolve = vi.fn(async () => resolved(A));
    expect(await verifyWorkspaceContext({ nope: 1 }, { resolve })).toEqual({
      status: "unavailable",
    });
    expect(resolve).not.toHaveBeenCalled();
  });
});
