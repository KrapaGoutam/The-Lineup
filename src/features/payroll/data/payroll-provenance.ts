import "server-only";

import { listActiveLocationMemberships } from "@/features/auth/data/location-access";
import type { createClient } from "@/lib/supabase/server";

type TypedSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type EmployeeLocationProvenance =
  | { status: "single_location"; locationId: string }
  | { status: "multi_location"; locationIds: string[] }
  | { status: "unassigned" };

/**
 * Resolves the physical restaurant location assignment for an employee
 * (identified by neonUserId) within a given organization.
 *
 * Attendance records alone do not possess location provenance.
 * Location provenance is established strictly by:
 *   1. Identity link: attendance_identity_links (organization_id, neon_user_id) -> profile_id
 *   2. Active assignment: location_memberships (profile_id, active = true)
 *
 * Classifications:
 *   - single_location: exactly one active location assignment in this organization.
 *   - multi_location: multiple active location assignments in this organization.
 *   - unassigned: no linked profile or zero active location assignments.
 */
export async function resolveEmployeeLocationProvenance(
  supabase: TypedSupabaseClient,
  organizationId: string,
  neonUserId: number,
): Promise<EmployeeLocationProvenance> {
  const { data: link, error: linkError } = await supabase
    .from("attendance_identity_links")
    .select("profile_id")
    .eq("organization_id", organizationId)
    .eq("neon_user_id", neonUserId)
    .maybeSingle();

  if (linkError || !link || !link.profile_id) {
    return { status: "unassigned" };
  }

  const memberships = await listActiveLocationMemberships(
    link.profile_id,
    supabase,
  );
  const orgMemberships = memberships.filter(
    (m) => m.active && m.organizationId === organizationId,
  );

  if (orgMemberships.length === 0) {
    return { status: "unassigned" };
  }
  if (orgMemberships.length === 1) {
    return {
      status: "single_location",
      locationId: orgMemberships[0].locationId,
    };
  }
  return {
    status: "multi_location",
    locationIds: orgMemberships.map((m) => m.locationId),
  };
}
