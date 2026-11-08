import "server-only";

import { resolveCurrentActiveContext } from "@/features/context/data/active-context";
import { toVerifiedLocationScope } from "@/features/context/domain/active-context";
import { getEntryUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";

export type RecipesActor = {
  organizationId: string;
  scope: {
    organizationId: string;
    locationId: string;
    locationName?: string;
    timeZone?: string;
  };
  viewer: {
    profileId: string;
    name: string;
    designation: string;
  };
  isManager: boolean;
};

const MANAGER_ROLES = new Set([
  "owner",
  "general_manager",
  "assistant_manager",
  "manager",
  "shift_manager",
]);

/**
 * Resolves the genuine recipes actor for the authenticated user and route slug.
 * Recipes is an organization-wide catalog: authorization is verified at the organization
 * level via public.recipes_org_authorized, while the active location is preserved for
 * module gating (guardModule).
 */
export async function getRecipesActor(
  restaurantSlug: string,
): Promise<RecipesActor | null> {
  const result = await resolveCurrentActiveContext({
    routeSlug: restaurantSlug,
  });
  if (
    result.status !== "resolved" ||
    !result.context.access.allowed ||
    !result.context.access.effectiveLevel
  ) {
    return null;
  }

  const user = await getEntryUser(result.context);
  if (!user || user.profileId !== result.context.profileId) return null;
  const scope = toVerifiedLocationScope(result.context);

  // Validate the live SQL session and organization-wide recipe access
  const supabase = await createClient();
  const authorized = await supabase.rpc("recipes_org_authorized", {
    p_org: scope.organizationId,
  });
  if (authorized.error || authorized.data !== true) return null;

  return {
    organizationId: result.context.organizationId,
    scope,
    viewer: {
      profileId: user.profileId,
      name: user.name,
      designation: result.context.access.effectiveLevel,
    },
    isManager: MANAGER_ROLES.has(result.context.access.effectiveLevel),
  };
}
