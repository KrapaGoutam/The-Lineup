import "server-only";

import { resolveCurrentActiveContext } from "@/features/context/data/active-context";
import type { ContextResolutionResult } from "@/features/context/domain/active-context";
import {
  classifyWorkspaceDrift,
  parseWorkspaceExpectation,
  workspaceMatches,
} from "@/features/context/domain/workspace-expectation";
import type { WorkspaceVerdict } from "@/features/context/domain/workspace-expectation";
import { getPrimaryLocation } from "@/features/locations/data/primary-location";

/**
 * V2-003.005 — server-side request-context consistency (the PRIMARY defense
 * against a stale tab writing to another location; BroadcastChannel and the
 * stale-workspace UI are UX on top of this).
 *
 * The caller (a protected Server Action) passes the expectation it received
 * from the browser as `unknown` plus the identity IT verified itself. Nothing
 * the browser sent is used to choose a location, role or query: the verified
 * operational location comes only from `getPrimaryLocation` (verified session,
 * persisted cookie or sole eligible location, canonical resolver) and the
 * request proceeds only if all three ids agree with what the user was looking
 * at. The VERIFIED location is what the caller must hand to the database.
 */

export type ExpectationOutcome =
  | {
      readonly ok: true;
      readonly location: { readonly id: string; readonly time_zone: string };
    }
  /** Missing/malformed expectation: a direct or legacy invocation. */
  | { readonly ok: false; readonly code: "invalid" }
  /** Valid expectation that the server could not confirm. */
  | { readonly ok: false; readonly code: "stale" };

interface ExpectationDeps {
  /** Test seam; defaults to the real verified-location resolver. */
  readonly resolveLocation?: typeof getPrimaryLocation;
}

export async function assertWorkspaceExpectation(
  raw: unknown,
  caller: { readonly profileId: string; readonly organizationId: string },
  deps: ExpectationDeps = {},
): Promise<ExpectationOutcome> {
  const parsed = parseWorkspaceExpectation(raw);
  if (parsed.status !== "ok") return { ok: false, code: "invalid" };
  const expected = parsed.expectation;

  // Identity and tenant are cheap to refuse before touching the database.
  if (
    expected.profileId !== caller.profileId.toLowerCase() ||
    expected.organizationId !== caller.organizationId.toLowerCase()
  ) {
    return { ok: false, code: "stale" };
  }

  const location = await (deps.resolveLocation ?? getPrimaryLocation)(
    caller.organizationId,
  );
  // `null` = no verifiable operational location right now (revoked, inactive,
  // archived, cross-organization cookie, ambiguous, outage): never a
  // substitute, always a refusal.
  if (!location) return { ok: false, code: "stale" };

  if (
    !workspaceMatches(expected, {
      profileId: caller.profileId,
      organizationId: caller.organizationId,
      locationId: location.id,
    })
  ) {
    return { ok: false, code: "stale" };
  }
  return { ok: true, location };
}

interface VerifyDeps {
  readonly resolve?: () => Promise<ContextResolutionResult>;
}

/**
 * Read-only: does the context the server would operate on RIGHT NOW equal the
 * one the tab is showing? Writes nothing (no cookie), so a received broadcast
 * or a focus event can never change the persisted context.
 */
export async function verifyWorkspaceContext(
  raw: unknown,
  deps: VerifyDeps = {},
): Promise<WorkspaceVerdict> {
  const parsed = parseWorkspaceExpectation(raw);
  // A malformed assertion proves nothing about the tab: draw no conclusion.
  if (parsed.status !== "ok") return { status: "unavailable" };
  const resolution = await (
    deps.resolve ?? (() => resolveCurrentActiveContext({ routeSlug: null }))
  )();
  return classifyWorkspaceDrift(resolution, parsed.expectation);
}
