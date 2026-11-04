import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_rethrow } from "next/navigation";

import type { OrganizationMembership } from "@/features/auth/domain/organization-membership";
import { mapMembershipRow } from "@/features/auth/domain/organization-membership";
import { normalizeOverallRole } from "@/features/auth/domain/overall-role";
import type { OverallRole } from "@/features/auth/domain/overall-role";
import { isLocationRole } from "@/features/auth/domain/location-role";
import type { LocationRoleAssignment } from "@/features/auth/domain/location-role";
import { readActiveContextCookieValue } from "@/features/context/data/context-cookie-reader";
import type {
  ActiveContextFacts,
  ContextLocationFact,
  ContextOrganizationFact,
  ContextResolutionResult,
} from "@/features/context/domain/active-context";
import {
  normalizeRouteSlug,
  resolveActiveContext,
} from "@/features/context/domain/active-context";
import {
  isUuid,
  parseActiveContextCookie,
} from "@/features/context/domain/context-cookie";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

/**
 * V2-003.001 — Server-authoritative active-context loader.
 *
 * Boundary rules:
 *  - Identity comes ONLY from `supabase.auth.getUser()` (verified with the
 *    Auth server). No client-supplied profile id, no unverified JWT parsing.
 *  - Uses the ordinary request-scoped (RLS-bound) Supabase client. No
 *    service-role/privileged client is ever used here.
 *  - Every query's error is surfaced as `{ status: "error" }`. A failed query
 *    is NEVER collapsed into an empty-but-successful result, which is why the
 *    legacy readers (they swallow errors into `[]`/`null`) are not used to
 *    gather facts; the same domain mappers and the canonical pure resolver are.
 *  - Route slug and cookie are untrusted inputs validated in the pure domain
 *    function (see `resolveActiveContext` for the precedence contract).
 */

export interface ResolveActiveContextOptions {
  /** Route organization slug (`/` supplies the configured default). */
  readonly routeSlug?: string | null;
  /**
   * Raw cookie value. `undefined` → read the request's cookie store;
   * `null` → explicitly no cookie (used by tests / non-request callers).
   */
  readonly cookieValue?: string | null;
  readonly client?: SupabaseClient<Database>;
}

const ORGANIZATION_COLUMNS = "id, name, slug" as const;
const LOCATION_COLUMNS =
  "id, organization_id, name, time_zone, active, archived_at" as const;
const MEMBERSHIP_COLUMNS =
  "id, organization_id, profile_id, roles, active, created_at" as const;
const LOCATION_ASSIGNMENT_COLUMNS =
  "id, location_id, profile_id, role, active, created_at, updated_at, locations(organization_id)" as const;

type QueryFailure = { readonly failed: string };

function failed(step: string, error: unknown): QueryFailure {
  // Server log only; the reason handed to callers carries no database detail.
  console.error(`resolveActiveContext: ${step}`, error);
  return { failed: `${step}_query_failed` };
}

function isFailure(value: unknown): value is QueryFailure {
  return typeof value === "object" && value !== null && "failed" in value;
}

async function loadOverallRole(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<OverallRole | null | QueryFailure> {
  const { data, error } = await supabase
    .from("overall_roles")
    .select("role")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) return failed("overall_role", error);
  // An unrecognised stored value normalises to null → no baseline authority.
  return data?.role ? normalizeOverallRole(data.role) : null;
}

async function loadMemberships(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<OrganizationMembership[] | QueryFailure> {
  const { data, error } = await supabase
    .from("memberships")
    .select(MEMBERSHIP_COLUMNS)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) return failed("memberships", error);
  return (data ?? []).map(mapMembershipRow);
}

async function loadCandidateOrganizations(
  supabase: SupabaseClient<Database>,
  scope:
    | { kind: "slug"; slug: string }
    | { kind: "id"; id: string }
    | { kind: "all"; overall: boolean; activeOrganizationIds: string[] },
): Promise<ContextOrganizationFact[] | QueryFailure> {
  if (scope.kind === "slug") {
    const { data, error } = await supabase
      .from("organizations")
      .select(ORGANIZATION_COLUMNS)
      .eq("slug", scope.slug)
      .maybeSingle();
    if (error) return failed("organization_by_slug", error);
    return data ? [data] : [];
  }

  if (scope.kind === "id") {
    const { data, error } = await supabase
      .from("organizations")
      .select(ORGANIZATION_COLUMNS)
      .eq("id", scope.id)
      .maybeSingle();
    if (error) return failed("organization_by_id", error);
    return data ? [data] : [];
  }

  // All accessible organizations: Overall holders see every tenant (no
  // synthetic memberships); scoped users only their ACTIVE memberships.
  if (!scope.overall && scope.activeOrganizationIds.length === 0) return [];
  const query = supabase.from("organizations").select(ORGANIZATION_COLUMNS);
  const { data, error } = await (scope.overall
    ? query
    : query.in("id", scope.activeOrganizationIds));
  if (error) return failed("organizations", error);
  return data ?? [];
}

async function loadLocations(
  supabase: SupabaseClient<Database>,
  organizationIds: string[],
): Promise<ContextLocationFact[] | QueryFailure> {
  if (organizationIds.length === 0) return [];
  const { data, error } = await supabase
    .from("locations")
    .select(LOCATION_COLUMNS)
    .in("organization_id", organizationIds);
  if (error) return failed("locations", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    timeZone: row.time_zone,
    active: Boolean(row.active),
    archivedAt: row.archived_at ?? null,
  }));
}

async function loadLocationAssignments(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<LocationRoleAssignment[] | QueryFailure> {
  const { data, error } = await supabase
    .from("location_memberships")
    .select(LOCATION_ASSIGNMENT_COLUMNS)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) return failed("location_assignments", error);

  const assignments: LocationRoleAssignment[] = [];
  for (const row of data ?? []) {
    // Fail closed on an unrecognised stored role: the legacy mapper would
    // coerce it to "staff"; here the assignment simply grants nothing.
    if (!isLocationRole(row.role)) continue;
    const nested = row.locations as unknown as {
      organization_id?: string;
    } | null;
    assignments.push({
      id: row.id,
      locationId: row.location_id,
      profileId: row.profile_id,
      organizationId: nested?.organization_id,
      role: row.role,
      active: Boolean(row.active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  return assignments;
}

/**
 * Resolves the active (organization, location) context for the CURRENTLY
 * authenticated user. Never throws.
 */
export async function resolveCurrentActiveContext(
  options: ResolveActiveContextOptions = {},
): Promise<ContextResolutionResult> {
  try {
    const supabase = options.client ?? (await createClient());

    // 1. Authenticate. Expired / revoked / missing sessions fail closed.
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      const status = (authError as { status?: number } | null)?.status ?? 0;
      const name = (authError as { name?: string } | null)?.name ?? "";
      // A transient auth-server outage is an error, not "signed out".
      if (status >= 500 || name === "AuthRetryableFetchError") {
        return { status: "error", reason: "auth_service_unavailable" };
      }
      return { status: "unauthenticated" };
    }
    const profileId = user.id;

    // 2. Untrusted inputs.
    const rawCookie =
      options.cookieValue === undefined
        ? await readActiveContextCookieValue()
        : options.cookieValue;
    const cookie = parseActiveContextCookie(rawCookie);
    const routeSlug = normalizeRouteSlug(options.routeSlug);

    // A malformed cookie is rejected before any tenant data is touched.
    if (cookie.status === "malformed") {
      return { status: "invalid_context", reason: "cookie_malformed" };
    }

    // 3. Verified facts about the profile.
    const [overallRole, memberships] = await Promise.all([
      loadOverallRole(supabase, profileId),
      loadMemberships(supabase, profileId),
    ]);
    if (isFailure(overallRole)) {
      return { status: "error", reason: overallRole.failed };
    }
    if (isFailure(memberships)) {
      return { status: "error", reason: memberships.failed };
    }

    // 4. Candidate organizations (scope chosen by the untrusted-input
    //    precedence; every row is still RLS-filtered and re-validated by the
    //    canonical resolver).
    const organizations = await loadCandidateOrganizations(
      supabase,
      routeSlug
        ? { kind: "slug", slug: routeSlug }
        : cookie.status === "present" && isUuid(cookie.selection.organizationId)
          ? { kind: "id", id: cookie.selection.organizationId }
          : {
              kind: "all",
              overall: overallRole !== null,
              activeOrganizationIds: memberships
                .filter((m) => m.active)
                .map((m) => m.organizationId),
            },
    );
    if (isFailure(organizations)) {
      return { status: "error", reason: organizations.failed };
    }

    const [locations, locationAssignments] = await Promise.all([
      loadLocations(
        supabase,
        organizations.map((o) => o.id),
      ),
      loadLocationAssignments(supabase, profileId),
    ]);
    if (isFailure(locations)) {
      return { status: "error", reason: locations.failed };
    }
    if (isFailure(locationAssignments)) {
      return { status: "error", reason: locationAssignments.failed };
    }

    const facts: ActiveContextFacts = {
      profileId,
      overallRole,
      organizations,
      organizationMemberships: memberships,
      locations,
      locationAssignments,
    };

    // 5. Pure, canonical-resolver-backed decision.
    return resolveActiveContext(facts, { routeSlug, cookie });
  } catch (error) {
    // `createClient()`/`cookies()` throw a framework signal at request time
    // that Next must see (dynamic rendering); never convert it to "error".
    unstable_rethrow(error);
    console.error("resolveCurrentActiveContext", error);
    return { status: "error", reason: "context_resolution_failed" };
  }
}
