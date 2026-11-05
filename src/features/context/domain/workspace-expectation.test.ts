import { describe, expect, it } from "vitest";

import type { ContextResolutionResult } from "@/features/context/domain/active-context";
import {
  classifyWorkspaceDrift,
  parseWorkspaceExpectation,
  workspaceMatches,
} from "@/features/context/domain/workspace-expectation";

const P = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const O = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const expected = { profileId: P, organizationId: O, locationId: A };

function resolved(over: {
  profileId?: string;
  organizationId?: string;
  locationId?: string;
}): ContextResolutionResult {
  return {
    status: "resolved",
    context: {
      profileId: over.profileId ?? P,
      organizationId: over.organizationId ?? O,
      organizationSlug: "slug",
      organizationName: "Org",
      locationId: over.locationId ?? A,
      locationName: "Loc",
      timeZone: "America/Chicago",
      selectedBy: "cookie_preference",
      // The comparison never reads access; a stub keeps the fixture honest
      // about what the classifier depends on.
      access: {} as never,
    },
  };
}

describe("parseWorkspaceExpectation (MT strict assertion schema)", () => {
  it("accepts exactly three UUIDs and lower-cases them", () => {
    const parsed = parseWorkspaceExpectation({
      profileId: P.toUpperCase(),
      organizationId: O,
      locationId: A,
    });
    expect(parsed).toEqual({ status: "ok", expectation: expected });
  });

  it.each([undefined, null])("treats %s as missing", (value) => {
    expect(parseWorkspaceExpectation(value)).toEqual({ status: "missing" });
  });

  it.each([
    ["a string", "x"],
    ["an array", [P, O, A]],
    ["a number", 7],
    ["an empty object", {}],
    ["a missing key", { profileId: P, organizationId: O }],
    ["a non-uuid id", { profileId: P, organizationId: O, locationId: "1" }],
    ["a numeric id", { profileId: P, organizationId: O, locationId: 1 }],
    [
      "an extra key (no smuggled fields)",
      { profileId: P, organizationId: O, locationId: A, role: "owner" },
    ],
    [
      "a nested value",
      { profileId: P, organizationId: O, locationId: { id: A } },
    ],
  ])("rejects %s", (_name, value) => {
    expect(parseWorkspaceExpectation(value)).toEqual({ status: "invalid" });
  });
});

describe("workspaceMatches", () => {
  it("requires profile, organization AND location to agree", () => {
    expect(workspaceMatches(expected, expected)).toBe(true);
    expect(workspaceMatches(expected, { ...expected, locationId: B })).toBe(
      false,
    );
    expect(workspaceMatches(expected, { ...expected, organizationId: B })).toBe(
      false,
    );
    expect(workspaceMatches(expected, { ...expected, profileId: B })).toBe(
      false,
    );
  });
  it("is case-insensitive on the verified side", () => {
    expect(
      workspaceMatches(expected, {
        profileId: P.toUpperCase(),
        organizationId: O.toUpperCase(),
        locationId: A.toUpperCase(),
      }),
    ).toBe(true);
  });
});

describe("classifyWorkspaceDrift", () => {
  it("MT-01: the same verified context is consistent", () => {
    expect(classifyWorkspaceDrift(resolved({}), expected)).toEqual({
      status: "consistent",
    });
  });
  it("MT-02: the persisted location moved to B -> stale (location_changed)", () => {
    expect(
      classifyWorkspaceDrift(resolved({ locationId: B }), expected),
    ).toEqual({ status: "stale", reason: "location_changed" });
  });
  it("MT-15: another organization -> stale", () => {
    expect(
      classifyWorkspaceDrift(resolved({ organizationId: B }), expected),
    ).toEqual({ status: "stale", reason: "location_changed" });
  });
  it("MT-18: a different employee is signed in -> different_user, even at the same location", () => {
    expect(
      classifyWorkspaceDrift(resolved({ profileId: B }), expected),
    ).toEqual({ status: "stale", reason: "different_user" });
  });
  it("MT-17: no session -> signed_out", () => {
    expect(
      classifyWorkspaceDrift({ status: "unauthenticated" }, expected),
    ).toEqual({ status: "signed_out" });
  });
  it("MT-14: revoked / inactive / invalid -> access_changed", () => {
    for (const status of ["no_access", "invalid_context"] as const) {
      const resolution: ContextResolutionResult =
        status === "no_access"
          ? { status }
          : { status, reason: "cookie_location_unavailable" };
      expect(classifyWorkspaceDrift(resolution, expected)).toEqual({
        status: "stale",
        reason: "access_changed",
      });
    }
  });
  it("a cleared preference with several eligible locations is stale", () => {
    expect(
      classifyWorkspaceDrift(
        { status: "selection_required", availableContexts: [] },
        expected,
      ),
    ).toEqual({ status: "stale", reason: "location_changed" });
  });
  it("an auth/database outage concludes NOTHING (never stale, never consistent)", () => {
    expect(
      classifyWorkspaceDrift(
        { status: "error", reason: "auth_service_unavailable" },
        expected,
      ),
    ).toEqual({ status: "unavailable" });
  });
});
