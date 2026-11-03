import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { LocationAccess } from "@/features/auth/domain/location-access";
import {
  hasEffectiveLocationAccess,
  mapLocationMembershipRow,
} from "@/features/auth/domain/location-access";
import { getOrganizationMembership } from "@/features/auth/data/organization-membership";
import { createClient } from "@/lib/supabase/server";

const LOCATION_MEMBERSHIP_COLUMNS =
  "id, location_id, profile_id, role, active, created_at, updated_at, locations(organization_id)" as const;

/**
 * Server-authoritative reader for a specific (profile, location) assignment pair.
 * Returns null if no record exists, inputs are missing, or on error.
 * Returns both active and inactive assignments so caller can inspect status.
 */
export async function getLocationMembership(
  profileId: string,
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<LocationAccess | null> {
  if (!profileId || !locationId) return null;

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("location_memberships")
      .select(LOCATION_MEMBERSHIP_COLUMNS)
      .eq("profile_id", profileId)
      .eq("location_id", locationId)
      .maybeSingle();

    if (error || !data) return null;
    return mapLocationMembershipRow(
      data as unknown as Parameters<typeof mapLocationMembershipRow>[0],
    );
  } catch {
    return null;
  }
}

/**
 * Server-authoritative reader returning all location assignments (active and inactive)
 * for a profile, ordered deterministically by creation time and id.
 * Multi-location users are supported without single-location truncation (.limit(1) is avoided).
 */
export async function listLocationMemberships(
  profileId: string,
  client?: SupabaseClient<Database>,
): Promise<LocationAccess[]> {
  if (!profileId) return [];

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("location_memberships")
      .select(LOCATION_MEMBERSHIP_COLUMNS)
      .eq("profile_id", profileId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error || !data) return [];
    return data.map((row) =>
      mapLocationMembershipRow(
        row as unknown as Parameters<typeof mapLocationMembershipRow>[0],
      ),
    );
  } catch {
    return [];
  }
}

/**
 * Server-authoritative reader returning only ACTIVE location assignments for a profile.
 * Multi-location users are supported without single-location truncation (.limit(1) is avoided).
 */
export async function listActiveLocationMemberships(
  profileId: string,
  client?: SupabaseClient<Database>,
): Promise<LocationAccess[]> {
  if (!profileId) return [];

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("location_memberships")
      .select(LOCATION_MEMBERSHIP_COLUMNS)
      .eq("profile_id", profileId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error || !data) return [];
    return data.map((row) =>
      mapLocationMembershipRow(
        row as unknown as Parameters<typeof mapLocationMembershipRow>[0],
      ),
    );
  } catch {
    return [];
  }
}

/**
 * Narrow server-authoritative evaluator for effective scoped location access.
 * Answers: Does scoped user X have effective active access to location Y?
 * Enforces:
 * 1. Explicit active location assignment exists for (profileId, locationId).
 * 2. Active organization membership exists for the organization owning locationId.
 * Fails closed (returns false) if either is inactive/missing, or on database error.
 */
export async function hasActiveLocationAccess(
  profileId: string,
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<boolean> {
  if (!profileId || !locationId) return false;

  try {
    const supabase = client ?? (await createClient());

    // 1. Fetch location assignment (with joined locations.organization_id)
    const assignment = await getLocationMembership(
      profileId,
      locationId,
      supabase,
    );
    if (!assignment || !assignment.active) {
      return false;
    }

    let orgId = assignment.organizationId;
    if (!orgId) {
      // Fallback query to resolve location's organization if join didn't populate it
      const { data: locData, error: locError } = await supabase
        .from("locations")
        .select("organization_id")
        .eq("id", locationId)
        .maybeSingle();

      if (locError || !locData) return false;
      orgId = locData.organization_id;
    }

    if (!orgId) {
      return false;
    }

    // 2. Fetch parent organization membership to verify active prerequisite
    const orgMembership = await getOrganizationMembership(
      profileId,
      orgId,
      supabase,
    );

    return hasEffectiveLocationAccess({
      organizationMembership: orgMembership,
      locationAssignment: assignment,
    });
  } catch {
    return false;
  }
}

/**
 * Returns all location assignments (active and inactive) for the currently authenticated user.
 * Fails closed (empty array) when unauthenticated or on error.
 */
export async function getCurrentUserLocationMemberships(
  client?: SupabaseClient<Database>,
): Promise<LocationAccess[]> {
  try {
    const supabase = client ?? (await createClient());
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return [];
    return listLocationMemberships(user.id, supabase);
  } catch {
    return [];
  }
}

/**
 * Returns only ACTIVE location assignments for the currently authenticated user.
 * Fails closed (empty array) when unauthenticated or on error.
 */
export async function getCurrentUserActiveLocationMemberships(
  client?: SupabaseClient<Database>,
): Promise<LocationAccess[]> {
  try {
    const supabase = client ?? (await createClient());
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return [];
    return listActiveLocationMemberships(user.id, supabase);
  } catch {
    return [];
  }
}

/**
 * Verifies whether the currently authenticated user has effective active access to a location.
 * Fails closed (false) when unauthenticated, inputs invalid, or on error.
 */
export async function currentUserHasLocationAccess(
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<boolean> {
  if (!locationId) return false;

  try {
    const supabase = client ?? (await createClient());
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return false;
    return hasActiveLocationAccess(user.id, locationId, supabase);
  } catch {
    return false;
  }
}
