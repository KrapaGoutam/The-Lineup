import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type {
  LocationRole,
  LocationRoleAssignment,
} from "@/features/auth/domain/location-role";
import {
  evaluateEffectiveLocationRole,
  mapLocationRoleRow,
} from "@/features/auth/domain/location-role";
import { getOrganizationMembership } from "@/features/auth/data/organization-membership";
import { createClient } from "@/lib/supabase/server";

const LOCATION_ROLE_COLUMNS =
  "id, location_id, profile_id, role, active, created_at, updated_at, locations(organization_id)" as const;

/**
 * Server-authoritative reader for a raw (profile, location) role assignment record.
 * Returns null if no record exists, inputs are missing, or on query error.
 * Returns both active and inactive assignments so caller can inspect status.
 */
export async function getLocationRoleAssignment(
  profileId: string,
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<LocationRoleAssignment | null> {
  if (!profileId || !locationId) return null;

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("location_memberships")
      .select(LOCATION_ROLE_COLUMNS)
      .eq("profile_id", profileId)
      .eq("location_id", locationId)
      .maybeSingle();

    if (error || !data) return null;
    return mapLocationRoleRow(
      data as unknown as Parameters<typeof mapLocationRoleRow>[0],
    );
  } catch {
    return null;
  }
}

/**
 * Server-authoritative reader for effective explicit location role.
 * Answers: What explicit role does this scoped user hold at this specific location?
 * Invariants enforced:
 * 1. Location assignment exists and is active (location_memberships.active = true).
 * 2. Parent organization membership exists and is active (memberships.active = true).
 * Fails closed (returns null) if either prerequisite is inactive or missing,
 * or on database error. Does NOT evaluate Overall Roles (deferred to V2-001.006).
 */
export async function getLocationRole(
  profileId: string,
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<LocationRole | null> {
  if (!profileId || !locationId) return null;

  try {
    const supabase = client ?? (await createClient());

    // 1. Fetch location assignment (with joined locations.organization_id)
    const assignment = await getLocationRoleAssignment(
      profileId,
      locationId,
      supabase,
    );
    if (!assignment || !assignment.active) {
      return null;
    }

    let orgId = assignment.organizationId;
    if (!orgId) {
      // Fallback query to resolve location's organization if join didn't populate it
      const { data: locData, error: locError } = await supabase
        .from("locations")
        .select("organization_id")
        .eq("id", locationId)
        .maybeSingle();

      if (locError || !locData) return null;
      orgId = locData.organization_id;
    }

    if (!orgId) {
      return null;
    }

    // 2. Fetch parent organization membership to verify active status
    const orgMembership = await getOrganizationMembership(
      profileId,
      orgId,
      supabase,
    );

    return evaluateEffectiveLocationRole({
      organizationMembership: orgMembership,
      locationMembership: assignment,
    });
  } catch {
    return null;
  }
}

/**
 * Server-authoritative reader returning all location role assignments (active and inactive)
 * for a profile, ordered deterministically by creation time and id.
 */
export async function listLocationRoles(
  profileId: string,
  client?: SupabaseClient<Database>,
): Promise<LocationRoleAssignment[]> {
  if (!profileId) return [];

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("location_memberships")
      .select(LOCATION_ROLE_COLUMNS)
      .eq("profile_id", profileId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error || !data) return [];
    return data.map((row) =>
      mapLocationRoleRow(
        row as unknown as Parameters<typeof mapLocationRoleRow>[0],
      ),
    );
  } catch {
    return [];
  }
}

/**
 * Server-authoritative reader returning only ACTIVE location role assignments for a profile.
 */
export async function listActiveLocationRoles(
  profileId: string,
  client?: SupabaseClient<Database>,
): Promise<LocationRoleAssignment[]> {
  if (!profileId) return [];

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("location_memberships")
      .select(LOCATION_ROLE_COLUMNS)
      .eq("profile_id", profileId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error || !data) return [];
    return data.map((row) =>
      mapLocationRoleRow(
        row as unknown as Parameters<typeof mapLocationRoleRow>[0],
      ),
    );
  } catch {
    return [];
  }
}

/**
 * Returns effective location role for the currently authenticated user at target location.
 * Fails closed (returns null) if unauthenticated or on error.
 */
export async function getCurrentUserLocationRole(
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<LocationRole | null> {
  if (!locationId) return null;

  try {
    const supabase = client ?? (await createClient());
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;
    return getLocationRole(user.id, locationId, supabase);
  } catch {
    return null;
  }
}

/**
 * Returns all active location role assignments for the currently authenticated user.
 * Fails closed (empty array) if unauthenticated or on error.
 */
export async function getCurrentUserLocationRoles(
  client?: SupabaseClient<Database>,
): Promise<LocationRoleAssignment[]> {
  try {
    const supabase = client ?? (await createClient());
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return [];
    return listActiveLocationRoles(user.id, supabase);
  } catch {
    return [];
  }
}

/**
 * Server-authoritative predicate verifying whether a scoped user holds a specific explicit role at a location.
 * Fails closed (returns false) if unassigned, inactive, or on query error.
 */
export async function hasEffectiveLocationRole(
  profileId: string,
  locationId: string,
  requiredRole: LocationRole,
  client?: SupabaseClient<Database>,
): Promise<boolean> {
  if (!profileId || !locationId || !requiredRole) return false;
  const role = await getLocationRole(profileId, locationId, client);
  return role === requiredRole;
}

/**
 * Convenience predicate verifying whether a user holds Manager role at a location.
 */
export async function isLocationManagerRole(
  profileId: string,
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<boolean> {
  return hasEffectiveLocationRole(profileId, locationId, "manager", client);
}

/**
 * Convenience predicate verifying whether a user holds Assistant Manager role at a location.
 */
export async function isLocationAssistantManagerRole(
  profileId: string,
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<boolean> {
  return hasEffectiveLocationRole(
    profileId,
    locationId,
    "assistant_manager",
    client,
  );
}
