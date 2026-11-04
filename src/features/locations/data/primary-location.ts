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
  const { data } = await supabase
    .from("locations")
    .select("id, time_zone")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
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
