/**
 * V2-003.005 — the workspace a rendered UI was built for, as an UNTRUSTED
 * consistency assertion.
 *
 * The browser sends this with a protected request so the server can refuse to
 * run it when what the user is LOOKING at (profile, organization, location)
 * disagrees with what the server independently authorizes right now. It is
 * never an identity, role, permission or location selector: the server never
 * uses it as input to a query, only compares it with values it verified itself.
 */

import type { ContextResolutionResult } from "@/features/context/domain/active-context";
import { isUuid } from "@/features/context/domain/context-cookie";

export interface WorkspaceExpectation {
  readonly profileId: string;
  readonly organizationId: string;
  readonly locationId: string;
}

export type WorkspaceExpectationParse =
  | { readonly status: "ok"; readonly expectation: WorkspaceExpectation }
  /** Nothing was supplied (a direct/legacy invocation). */
  | { readonly status: "missing" }
  /** Supplied but not exactly three UUIDs. */
  | { readonly status: "invalid" };

const KEYS = ["profileId", "organizationId", "locationId"] as const;

/** Strict: exactly three UUID strings and nothing else. Case-normalized. */
export function parseWorkspaceExpectation(
  input: unknown,
): WorkspaceExpectationParse {
  if (input === undefined || input === null) return { status: "missing" };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { status: "invalid" };
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== KEYS.length ||
    keys.some((k) => !KEYS.includes(k as never))
  ) {
    return { status: "invalid" };
  }
  if (
    !isUuid(record.profileId) ||
    !isUuid(record.organizationId) ||
    !isUuid(record.locationId)
  ) {
    return { status: "invalid" };
  }
  return {
    status: "ok",
    expectation: {
      profileId: record.profileId.toLowerCase(),
      organizationId: record.organizationId.toLowerCase(),
      locationId: record.locationId.toLowerCase(),
    },
  };
}

/** Does what the user sees equal what the SERVER verified? (all three ids) */
export function workspaceMatches(
  expected: WorkspaceExpectation,
  verified: WorkspaceExpectation,
): boolean {
  return (
    expected.profileId === verified.profileId.toLowerCase() &&
    expected.organizationId === verified.organizationId.toLowerCase() &&
    expected.locationId === verified.locationId.toLowerCase()
  );
}

export type StaleReason =
  /** The persisted/operational location is no longer the one on screen. */
  | "location_changed"
  /** The on-screen location can no longer be operated by this user. */
  | "access_changed"
  /** Another employee is now signed in on this browser. */
  | "different_user";

export type WorkspaceVerdict =
  | { readonly status: "consistent" }
  | {
      readonly status: "stale";
      readonly reason: StaleReason;
      /**
       * The route slug of the context the server NOW operates on, when it
       * resolved one. Built from verified data (never from the assertion) so
       * recovery can go straight to the right organization route.
       */
      readonly organizationSlug?: string;
    }
  | { readonly status: "signed_out" }
  /** Auth/database outage: nothing was verified, so nothing is concluded. */
  | { readonly status: "unavailable" };

/**
 * Pure comparison of a freshly resolved context with the expectation. Only a
 * `resolved` context with identical ids is `consistent`; a transient error is
 * `unavailable` (never "stale"), so an outage cannot lock people out.
 */
export function classifyWorkspaceDrift(
  resolution: ContextResolutionResult,
  expected: WorkspaceExpectation,
): WorkspaceVerdict {
  switch (resolution.status) {
    case "unauthenticated":
      return { status: "signed_out" };
    case "error":
      return { status: "unavailable" };
    case "resolved": {
      const context = resolution.context;
      if (context.profileId.toLowerCase() !== expected.profileId) {
        return { status: "stale", reason: "different_user" };
      }
      return workspaceMatches(expected, {
        profileId: context.profileId,
        organizationId: context.organizationId,
        locationId: context.locationId,
      })
        ? { status: "consistent" }
        : {
            status: "stale",
            reason: "location_changed",
            organizationSlug: context.organizationSlug,
          };
    }
    case "selection_required":
      // The saved location was cleared (or never persisted) and several
      // locations are eligible: the on-screen one is no longer "the" context.
      return { status: "stale", reason: "location_changed" };
    case "no_access":
    case "invalid_context":
      return { status: "stale", reason: "access_changed" };
  }
}

export const STALE_CONTEXT_MESSAGE =
  "Your active location changed. Refresh your workspace before continuing so your actions apply to the correct location.";
