/**
 * V2-003.001 — Active Organization / Location Context Resolution (pure domain).
 *
 * Answers ONE question, deterministically and without I/O:
 *   "Given verified database facts about the authenticated profile and two
 *    UNTRUSTED inputs (route slug, cookie preference), which
 *    (organization, location) pair — if any — may this user operate?"
 *
 * Authority is delegated entirely to the canonical authorization resolver
 * (`resolveUserAccess`, V2-001.006). This module is NOT a second permission
 * engine: it only enumerates candidate (org, location) pairs, asks the
 * canonical resolver about each one, and applies the route/cookie precedence
 * contract below to the pairs the resolver allowed.
 *
 * ── Precedence contract ────────────────────────────────────────────────────
 *  1. The ROUTE slug (when present) is the authoritative organization scope.
 *     It is resolved through trusted organization data, never trusted itself.
 *     A slug that does not resolve to an organization the user can see yields
 *     `no_access` (no tenant enumeration).
 *  2. The COOKIE is only a location *preference inside the scope the route
 *     already fixed*. A cookie that names a different organization than the
 *     route is REJECTED (`invalid_context`) — it is never used to load another
 *     tenant's data under this route and is never silently ignored.
 *  3. Malformed cookies are rejected (`invalid_context`), not ignored.
 *  4. A well-formed cookie whose pair is not (or is no longer) eligible is
 *     STALE and fails closed (`invalid_context`). We never fall back to an
 *     unrelated location.
 *  5. No cookie: exactly ONE eligible location in scope → `resolved`
 *     (bounded legacy compatibility; uniquely eligible, never creation-order).
 *     More than one → `selection_required`. None → `no_access`.
 *  6. Creation order, name order or row order is NEVER used to pick a context.
 *
 * Eligible = location exists + belongs to the organization + active +
 * not archived + valid IANA time zone + canonical resolver `allowed` with
 * `location:access`.
 */

import type { AccessResolution } from "@/features/auth/domain/access-resolver";
import {
  hasCapability,
  resolveUserAccess,
} from "@/features/auth/domain/access-resolver";
import type { OrganizationMembership } from "@/features/auth/domain/organization-membership";
import type { OverallRole } from "@/features/auth/domain/overall-role";
import type { LocationRoleAssignment } from "@/features/auth/domain/location-role";
import type { ActiveContextCookieParseResult } from "@/features/context/domain/context-cookie";
import { isValidIanaTimeZone } from "@/features/locations/domain/location";

// ── Public contract ─────────────────────────────────────────────────────────

export interface ResolvedActiveContext {
  readonly organizationId: string;
  readonly organizationSlug: string;
  readonly organizationName: string;

  readonly locationId: string;
  readonly locationName: string;
  /** Validated IANA time zone of the verified location. */
  readonly timeZone: string;

  /** The server-verified authenticated profile (never client supplied). */
  readonly profileId: string;
  /** Canonical resolver output for exactly this (organization, location). */
  readonly access: AccessResolution;
  /** How the pair was chosen (informational; never authority). */
  readonly selectedBy: "cookie_preference" | "sole_eligible_location";
}

/** Display-safe summary reusable by the V2-003.002 switcher. */
export interface AvailableContextSummary {
  readonly organizationId: string;
  readonly organizationSlug: string;
  readonly organizationName: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly timeZone: string;
}

export const INVALID_CONTEXT_REASONS = [
  "cookie_malformed",
  "cookie_route_organization_mismatch",
  "cookie_organization_unavailable",
  "cookie_location_unavailable",
] as const;
export type InvalidContextReason = (typeof INVALID_CONTEXT_REASONS)[number];

export type ContextResolutionResult =
  | { readonly status: "resolved"; readonly context: ResolvedActiveContext }
  | {
      readonly status: "selection_required";
      readonly availableContexts: readonly AvailableContextSummary[];
    }
  | { readonly status: "unauthenticated" }
  | { readonly status: "no_access" }
  | { readonly status: "invalid_context"; readonly reason: string }
  | { readonly status: "error"; readonly reason: string };

/** Verified organization row (already visible to the caller under RLS). */
export interface ContextOrganizationFact {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

/** Verified location row, including lifecycle columns. */
export interface ContextLocationFact {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly timeZone: string;
  readonly active: boolean;
  readonly archivedAt: string | null;
}

/** Database facts about the authenticated profile. Built server-side only. */
export interface ActiveContextFacts {
  readonly profileId: string;
  readonly overallRole: OverallRole | null;
  /** Candidate organizations (the scope the loader chose to fetch). */
  readonly organizations: readonly ContextOrganizationFact[];
  /** The profile's memberships (active and inactive). */
  readonly organizationMemberships: readonly OrganizationMembership[];
  /** Locations of the candidate organizations (any lifecycle state). */
  readonly locations: readonly ContextLocationFact[];
  /** The profile's location assignments (active and inactive). */
  readonly locationAssignments: readonly LocationRoleAssignment[];
}

/** Untrusted inputs. */
export interface ActiveContextInputs {
  /** Route organization slug (`/` uses the configured default slug). */
  readonly routeSlug?: string | null;
  readonly cookie: ActiveContextCookieParseResult;
}

export interface EligibleContext extends AvailableContextSummary {
  readonly access: AccessResolution;
}

// ── Eligibility ─────────────────────────────────────────────────────────────

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Deterministic, creation-order-independent ordering for display lists. */
function compareContexts(
  a: AvailableContextSummary,
  b: AvailableContextSummary,
): number {
  return (
    compareText(
      a.organizationName.toLowerCase(),
      b.organizationName.toLowerCase(),
    ) ||
    compareText(a.organizationId, b.organizationId) ||
    compareText(a.locationName.toLowerCase(), b.locationName.toLowerCase()) ||
    compareText(a.locationId, b.locationId)
  );
}

/** Lifecycle gate applied BEFORE the canonical resolver is consulted. */
export function isOperableLocation(location: ContextLocationFact): boolean {
  return (
    location.active === true &&
    (location.archivedAt === null || location.archivedAt === undefined) &&
    isValidIanaTimeZone(location.timeZone)
  );
}

/**
 * Enumerates the (organization, location) pairs the canonical resolver allows
 * for this profile, restricted to `organizations`. Sorted deterministically.
 */
export function listEligibleContexts(
  facts: ActiveContextFacts,
  organizations: readonly ContextOrganizationFact[] = facts.organizations,
): EligibleContext[] {
  const eligible: EligibleContext[] = [];

  for (const organization of organizations) {
    const membership =
      facts.organizationMemberships.find(
        (m) => m.organizationId === organization.id,
      ) ?? null;

    for (const location of facts.locations) {
      if (location.organizationId !== organization.id) continue;
      if (!isOperableLocation(location)) continue;

      const assignment =
        facts.locationAssignments.find((a) => a.locationId === location.id) ??
        null;

      const access = resolveUserAccess({
        target: { organizationId: organization.id, locationId: location.id },
        location: {
          id: location.id,
          organizationId: location.organizationId,
          active: location.active,
        },
        overallRole: facts.overallRole,
        organizationMembership: membership,
        locationAssignment: assignment,
      });

      if (!hasCapability(access, "location:access")) continue;

      eligible.push({
        organizationId: organization.id,
        organizationSlug: organization.slug,
        organizationName: organization.name,
        locationId: location.id,
        locationName: location.name,
        timeZone: location.timeZone.trim(),
        access,
      });
    }
  }

  return eligible.sort(compareContexts);
}

function toSummary(context: EligibleContext): AvailableContextSummary {
  return {
    organizationId: context.organizationId,
    organizationSlug: context.organizationSlug,
    organizationName: context.organizationName,
    locationId: context.locationId,
    locationName: context.locationName,
    timeZone: context.timeZone,
  };
}

function toResolved(
  context: EligibleContext,
  profileId: string,
  selectedBy: ResolvedActiveContext["selectedBy"],
): ContextResolutionResult {
  return {
    status: "resolved",
    context: {
      organizationId: context.organizationId,
      organizationSlug: context.organizationSlug,
      organizationName: context.organizationName,
      locationId: context.locationId,
      locationName: context.locationName,
      timeZone: context.timeZone,
      profileId,
      access: context.access,
      selectedBy,
    },
  };
}

// ── Resolution ──────────────────────────────────────────────────────────────

export function normalizeRouteSlug(slug: string | null | undefined): string {
  return (slug ?? "").trim().toLowerCase();
}

/**
 * Pure resolution of the active context from verified facts + untrusted
 * inputs. `unauthenticated` and `error` are produced by the data layer (they
 * are properties of the session / query, not of the facts) and never here.
 */
export function resolveActiveContext(
  facts: ActiveContextFacts,
  inputs: ActiveContextInputs,
): ContextResolutionResult {
  const cookie = inputs.cookie;

  // Precedence 3: a malformed cookie is rejected outright.
  if (cookie.status === "malformed") {
    return { status: "invalid_context", reason: "cookie_malformed" };
  }

  const routeSlug = normalizeRouteSlug(inputs.routeSlug);
  let scope: readonly ContextOrganizationFact[];

  if (routeSlug) {
    // Precedence 1: the route fixes the organization scope.
    const routeOrganization = facts.organizations.find(
      (o) => o.slug === routeSlug,
    );
    if (!routeOrganization) return { status: "no_access" };
    scope = [routeOrganization];

    // Precedence 2: cookie may not point at a different tenant than the route.
    if (
      cookie.status === "present" &&
      cookie.selection.organizationId !== routeOrganization.id
    ) {
      return {
        status: "invalid_context",
        reason: "cookie_route_organization_mismatch",
      };
    }
  } else if (cookie.status === "present") {
    // No route scope: the cookie's organization must itself be a verified,
    // visible candidate. Anything else is stale.
    const cookieOrganization = facts.organizations.find(
      (o) => o.id === cookie.selection.organizationId,
    );
    if (!cookieOrganization) {
      return {
        status: "invalid_context",
        reason: "cookie_organization_unavailable",
      };
    }
    scope = [cookieOrganization];
  } else {
    scope = facts.organizations;
  }

  const eligible = listEligibleContexts(facts, scope);
  if (eligible.length === 0) return { status: "no_access" };

  if (cookie.status === "present") {
    // Precedence 4: the preferred pair must be eligible right now.
    const preferred = eligible.find(
      (e) =>
        e.organizationId === cookie.selection.organizationId &&
        e.locationId === cookie.selection.locationId,
    );
    if (!preferred) {
      return {
        status: "invalid_context",
        reason: "cookie_location_unavailable",
      };
    }
    return toResolved(preferred, facts.profileId, "cookie_preference");
  }

  // Precedence 5/6: unique eligibility only — never first-created.
  if (eligible.length === 1) {
    return toResolved(eligible[0], facts.profileId, "sole_eligible_location");
  }

  return {
    status: "selection_required",
    availableContexts: eligible.map(toSummary),
  };
}

// ── Entry-path scope ────────────────────────────────────────────────────────

/**
 * The single (organization, location) pair every operational initial loader
 * must be given. Narrower than `ResolvedActiveContext` on purpose: loaders
 * need no more than this, and cannot choose another location.
 */
export interface VerifiedLocationScope {
  readonly organizationId: string;
  readonly locationId: string;
  readonly timeZone: string;
}

export function toVerifiedLocationScope(
  context: ResolvedActiveContext,
): VerifiedLocationScope {
  return {
    organizationId: context.organizationId,
    locationId: context.locationId,
    timeZone: context.timeZone,
  };
}
