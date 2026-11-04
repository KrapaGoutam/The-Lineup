import "server-only";

import type { VerifiedLocationScope } from "@/features/context/domain/active-context";
import { createClient } from "@/lib/supabase/server";

/**
 * LEGACY single-location bootstrap helper — NOT a context boundary.
 *
 * Returns the organization's oldest location by creation date. It does NOT
 * verify that the location is active, un-archived, assigned to the caller, or
 * the user's selected context, so it must never be used to establish what a
 * multi-location user may operate. It is retained ONLY for compatible
 * legacy/direct-call paths (module server actions and follow-up reads) whose
 * full location scoping belongs to V2-005.
 *
 * The application-ENTRY data path (`loadPageData`) never calls this: it
 * resolves a verified context (V2-003.001) and passes that exact location
 * into every initial loader via `locationForLoader`.
 */
export async function getPrimaryLocation(organizationId: string) {
  const supabase = await createClient();
  const eligible = () =>
    supabase
      .from("locations")
      .select("id, time_zone")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .limit(1);

  // Never pick an unassigned location for a caller who has assignments in this
  // organization: restrict to their own active assignments, and fail closed
  // (null) when none of them is an active, un-archived location.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: assigned, error } = await supabase
      .from("location_memberships")
      .select("location_id, locations!inner(organization_id)")
      .eq("profile_id", user.id)
      .eq("active", true)
      .eq("locations.organization_id", organizationId);
    if (error) return null;
    const assignedIds = (assigned ?? []).map((row) => row.location_id);
    if (assignedIds.length > 0) {
      const { data } = await eligible().in("id", assignedIds).maybeSingle();
      return data;
    }
  }

  // No assignments (Overall roles, legacy org-level members): oldest
  // active, un-archived location, unchanged otherwise.
  const { data } = await eligible().maybeSingle();
  return data;
}

export type LoaderLocation = { id: string; time_zone: string };

/**
 * Single choke point for "which location does this loader use?".
 *
 *  - With a verified scope (entry path): uses EXACTLY that location and time
 *    zone, and fails safe (null) if the scope belongs to a different
 *    organization than the one being loaded. It never substitutes another
 *    location.
 *  - Without one (legacy direct callers only): falls back to
 *    `getPrimaryLocation`, preserving existing behavior until V2-005.
 */
export async function locationForLoader(
  organizationId: string,
  scope?: VerifiedLocationScope,
): Promise<LoaderLocation | null> {
  if (scope) {
    if (scope.organizationId !== organizationId) return null;
    return { id: scope.locationId, time_zone: scope.timeZone };
  }
  return getPrimaryLocation(organizationId);
}
