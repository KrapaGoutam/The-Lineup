"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { LocationRole } from "@/features/auth/domain/location-role";
import type { LocationRoleAssignment } from "@/features/auth/domain/location-role";
import { mapLocationRoleRow } from "@/features/auth/domain/location-role";
import type { LocationAssignmentAction } from "@/features/auth/domain/location-assignment";
import { validateLocationAssignmentChanges } from "@/features/auth/domain/location-assignment";
import { listProfileLocationAssignments } from "@/features/auth/data/location-assignment";
import { applyLocationAssignmentChanges } from "@/features/auth/data/location-assignment";
import {
  getLocationById,
  listLocationsByOrganization,
} from "@/features/locations/data/location-reader";
import {
  dedupeAssignments,
  filterAssignmentsToLocations,
  sortRoster,
  type StaffRosterMember,
} from "@/features/locations/domain/staff-assignment";
import {
  verifyLocationAdminAuthority,
  type ActionResult,
} from "@/features/locations/actions/location-admin-actions";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

/**
 * V2-002.004 — Staff Assignment server actions.
 *
 * Every action:
 *  1. verifies a live session and derives the actor from it (never from input),
 *  2. verifies the actor's management authority over the claimed organization,
 *  3. resolves location ↔ organization from trusted data,
 *  4. delegates mutation to the existing atomic RPC
 *     `public.apply_location_assignment_changes`, which remains the final authority.
 * No service-role client is used; reads run under the caller's RLS.
 */

const PAGE_SIZE = 500;
const MAX_PAGES = 20; // hard bound: 10,000 rows

const UNAUTHENTICATED = "Unauthenticated. Please sign in.";
const UNAUTHORIZED =
  "Unauthorized: management authority required for this organization.";

export interface LocationStaffView {
  readonly roster: StaffRosterMember[];
  readonly assignments: LocationRoleAssignment[];
}

export interface EmployeeLocationAssignmentsView {
  readonly member: StaffRosterMember;
  readonly assignments: LocationRoleAssignment[];
}

/** Client-supplied change instruction. Only these fields are ever read. */
export interface StaffLocationChange {
  readonly locationId: string;
  readonly action?: LocationAssignmentAction;
  readonly role?: LocationRole;
}

type AuthContext =
  | { readonly ok: true; readonly userId: string; readonly orgId: string }
  | Extract<ActionResult<never>, { ok: false }>;

async function authorize(
  supabase: SupabaseClient<Database>,
  organizationId: unknown,
): Promise<AuthContext> {
  const orgId = typeof organizationId === "string" ? organizationId.trim() : "";
  if (!orgId) return { ok: false, error: "Organization ID is required." };

  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) {
    return { ok: false, error: sessionCheck.error, sessionInvalid: true };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false, error: UNAUTHENTICATED, sessionInvalid: true };
  }

  const allowed = await verifyLocationAdminAuthority(user.id, orgId, supabase);
  if (!allowed) return { ok: false, error: UNAUTHORIZED, code: "UNAUTHORIZED" };

  return { ok: true, userId: user.id, orgId };
}

function failure(err: unknown, fallback: string): ActionResult<never> {
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

type RosterRpcRow = {
  profile_id: string;
  display_name: string | null;
  roles: readonly string[] | null;
  active: boolean;
};

function mapRosterRow(row: RosterRpcRow): StaffRosterMember {
  return {
    profileId: row.profile_id,
    displayName: row.display_name?.trim() || "Unnamed member",
    organizationRoles: Array.isArray(row.roles) ? [...row.roles] : [],
    membershipActive: Boolean(row.active),
  };
}

/**
 * Bounded, deterministic roster read from real organization memberships via
 * `public.list_organization_staff`.
 *
 * Why an RPC and not a direct `memberships`/`profiles` select: RLS on those
 * tables only shows an organization's rows to its own active members, so an
 * Overall Owner/Manager (who is authorized but has no local membership) would
 * read an empty roster, and inactive members' names would be hidden. The RPC
 * re-checks the actor's authority in the database (same rule as the assignment
 * RPC) and returns only profile_id, display_name, org roles and active flag.
 *
 * Returns active AND inactive members so the UI can distinguish
 * "Not Assigned" from "Organization Membership Inactive". A read error is
 * surfaced (never silently empty).
 */
async function readOrganizationRoster(
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<{ ok: true; roster: StaffRosterMember[] } | { ok: false }> {
  const roster: StaffRosterMember[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase.rpc("list_organization_staff", {
      p_organization_id: organizationId,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (error || !data) return { ok: false };
    for (const row of data as RosterRpcRow[]) roster.push(mapRosterRow(row));
    if (data.length < PAGE_SIZE) break;
  }
  return { ok: true, roster: sortRoster(roster) };
}

/** Single-member lookup through the same authorized RPC (null = not a member). */
async function readOrganizationMember(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  profileId: string,
): Promise<{ ok: true; member: StaffRosterMember | null } | { ok: false }> {
  const { data, error } = await supabase.rpc("list_organization_staff", {
    p_organization_id: organizationId,
    p_profile_id: profileId,
    p_limit: 1,
  });
  if (error || !data) return { ok: false };
  const row = (data as RosterRpcRow[])[0];
  return { ok: true, member: row ? mapRosterRow(row) : null };
}

/**
 * Lists the members of an authorized organization (active and inactive).
 */
export async function listOrganizationStaffAction(
  organizationId: string,
  client?: SupabaseClient<Database>,
): Promise<ActionResult<StaffRosterMember[]>> {
  try {
    const supabase = client ?? (await createClient());
    const auth = await authorize(supabase, organizationId);
    if (!auth.ok) return auth;

    const result = await readOrganizationRoster(supabase, auth.orgId);
    if (!result.ok) {
      return { ok: false, error: "Failed to load organization staff." };
    }
    return { ok: true, data: result.roster };
  } catch (err: unknown) {
    return failure(err, "Failed to load organization staff.");
  }
}

/**
 * Location-centric read: org roster plus explicit assignments at one location.
 * The location must belong to the claimed organization.
 */
export async function getLocationStaffAction(
  organizationId: string,
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<ActionResult<LocationStaffView>> {
  const locId = typeof locationId === "string" ? locationId.trim() : "";
  if (!locId) return { ok: false, error: "Location ID is required." };

  try {
    const supabase = client ?? (await createClient());
    const auth = await authorize(supabase, organizationId);
    if (!auth.ok) return auth;

    const location = await getLocationById(locId, supabase);
    if (!location || location.organizationId !== auth.orgId) {
      return {
        ok: false,
        error:
          "Tenant mismatch: location does not belong to specified organization.",
        code: "TENANT_MISMATCH",
      };
    }

    const rosterResult = await readOrganizationRoster(supabase, auth.orgId);
    if (!rosterResult.ok) {
      return { ok: false, error: "Failed to load organization staff." };
    }

    const assignments: LocationRoleAssignment[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from("location_memberships")
        .select(
          "id, location_id, profile_id, role, active, created_at, updated_at, locations(organization_id)",
        )
        .eq("location_id", locId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error || !data) {
        return { ok: false, error: "Failed to load location staff." };
      }
      for (const row of data) {
        assignments.push(
          mapLocationRoleRow(
            row as unknown as Parameters<typeof mapLocationRoleRow>[0],
          ),
        );
      }
      if (data.length < PAGE_SIZE) break;
    }

    return {
      ok: true,
      data: {
        roster: rosterResult.roster,
        assignments: dedupeAssignments(assignments),
      },
    };
  } catch (err: unknown) {
    return failure(err, "Failed to load location staff.");
  }
}

/**
 * Employee-centric read: one member's explicit assignments, restricted to the
 * administered organization's locations so other organizations' assignments
 * are never returned (no cross-organization leakage).
 */
export async function getEmployeeLocationAssignmentsAction(
  organizationId: string,
  targetProfileId: string,
  client?: SupabaseClient<Database>,
): Promise<ActionResult<EmployeeLocationAssignmentsView>> {
  const profileId =
    typeof targetProfileId === "string" ? targetProfileId.trim() : "";
  if (!profileId) return { ok: false, error: "Employee ID is required." };

  try {
    const supabase = client ?? (await createClient());
    const auth = await authorize(supabase, organizationId);
    if (!auth.ok) return auth;

    const memberResult = await readOrganizationMember(
      supabase,
      auth.orgId,
      profileId,
    );
    if (!memberResult.ok) {
      return { ok: false, error: "Failed to load organization staff." };
    }
    const member = memberResult.member;
    if (!member) {
      return {
        ok: false,
        error: "Employee is not a member of this organization.",
        code: "NOT_ORGANIZATION_MEMBER",
      };
    }

    const orgLocations = await listLocationsByOrganization(
      auth.orgId,
      supabase,
    );
    const locationIds = new Set(orgLocations.map((l) => l.id));
    const all = await listProfileLocationAssignments(profileId, supabase);

    return {
      ok: true,
      data: {
        member,
        assignments: dedupeAssignments(
          filterAssignmentsToLocations(all, locationIds),
        ),
      },
    };
  } catch (err: unknown) {
    return failure(err, "Failed to load employee assignments.");
  }
}

/**
 * Applies one employee's change set through the existing atomic RPC.
 *
 * Client input is limited to {organizationId, targetProfileId, changes[]}; any
 * other property (e.g. actorProfileId, isManager, overallRole) is ignored.
 * Defense-in-depth pre-checks (the RPC remains the final authority):
 *  - every location exists, belongs to the claimed organization and is active;
 *  - the target holds a membership in that organization (read through the
 *    authorized roster RPC, so it also works for Overall administrators), and
 *    an ACTIVE one for assign / update / reactivate (deactivation is permitted
 *    for historical cleanup).
 */
export async function applyStaffLocationChangesAction(
  params: {
    readonly organizationId: string;
    readonly targetProfileId: string;
    readonly changes: readonly StaffLocationChange[];
  },
  client?: SupabaseClient<Database>,
): Promise<ActionResult<LocationRoleAssignment[]>> {
  const profileId =
    typeof params?.targetProfileId === "string"
      ? params.targetProfileId.trim()
      : "";
  if (!profileId) return { ok: false, error: "Employee ID is required." };

  // Whitelist client fields; nothing else is forwarded.
  const requested = Array.isArray(params.changes)
    ? params.changes.map((c) => ({
        locationId: c?.locationId,
        action: c?.action,
        role: c?.role,
      }))
    : params.changes;

  const validation = validateLocationAssignmentChanges(requested);
  if (!validation.success) {
    return { ok: false, error: validation.error, code: validation.code };
  }
  if (validation.changes.length === 0) {
    return { ok: true, data: [] };
  }

  try {
    const supabase = client ?? (await createClient());
    const auth = await authorize(supabase, params.organizationId);
    if (!auth.ok) return auth;

    // Resolve every referenced location from trusted data.
    const orgLocations = await listLocationsByOrganization(
      auth.orgId,
      supabase,
    );
    const byId = new Map(orgLocations.map((l) => [l.id, l]));
    for (const change of validation.changes) {
      const loc = byId.get(change.locationId);
      if (!loc) {
        return {
          ok: false,
          error:
            "Tenant mismatch: location does not belong to specified organization.",
          code: "TENANT_MISMATCH",
        };
      }
      if (!loc.active) {
        return {
          ok: false,
          error: `${loc.name} is inactive and cannot be changed.`,
          code: "LOCATION_INACTIVE",
        };
      }
    }

    // Parent organization membership prerequisite for active assignments.
    const needsActiveMember = validation.changes.some(
      (c) => c.action !== "deactivate",
    );
    const memberResult = await readOrganizationMember(
      supabase,
      auth.orgId,
      profileId,
    );
    if (!memberResult.ok) {
      return { ok: false, error: "Failed to verify organization membership." };
    }
    const membership = memberResult.member;
    if (!membership) {
      return {
        ok: false,
        error: "Employee is not a member of this organization.",
        code: "NOT_ORGANIZATION_MEMBER",
      };
    }
    if (needsActiveMember && !membership.membershipActive) {
      return {
        ok: false,
        error:
          "Employee must have an active organization membership before assignment.",
        code: "MEMBERSHIP_REQUIRED",
      };
    }

    const result = await applyLocationAssignmentChanges(
      profileId,
      validation.changes.map((c) => ({
        locationId: c.locationId,
        action: c.action,
        role: c.role,
        active: c.active,
      })),
      supabase,
    );

    if (!result.success) {
      return { ok: false, error: result.error, code: result.code };
    }
    return { ok: true, data: result.assignments };
  } catch (err: unknown) {
    return failure(err, "Failed to apply assignment changes.");
  }
}
