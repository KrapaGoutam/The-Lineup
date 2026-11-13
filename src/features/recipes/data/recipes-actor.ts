import "server-only";

import { resolveCurrentActiveContext } from "@/features/context/data/active-context";
import { toVerifiedLocationScope } from "@/features/context/domain/active-context";
import { getEntryUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

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
  /**
   * Reads: may this person see archived/inactive recipes? (Unchanged: sharing the book with
   * location managers is intended.) Do NOT use this to authorize a write.
   */
  isManager: boolean;
  /**
   * Writes (E-1 / D-10): the database's organization-level decision from
   * public.catalog_authorized. A location-role-only manager has it only while the
   * organization has one active location. Fails closed on any error.
   */
  canManageCatalog: boolean;
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
  // Typed against the generated schema (see inventory-actor.ts): argument-name
  // drift would deny every user at runtime and no mock-based test would notice.
  const args = {
    p_organization_id: scope.organizationId,
  } satisfies Database["public"]["Functions"]["recipes_org_authorized"]["Args"];
  const authorized = await supabase.rpc("recipes_org_authorized", args);
  if (authorized.error || authorized.data !== true) return null;

  // The database owns the shared-catalog write decision and recomputes the organization's
  // active-location count on every call; never derive it from the role or a cached flag.
  const catalogArgs = {
    p_organization_id: scope.organizationId,
  } satisfies Database["public"]["Functions"]["catalog_authorized"]["Args"];
  const catalog = await supabase.rpc("catalog_authorized", catalogArgs);

  return {
    canManageCatalog: !catalog.error && catalog.data === true,
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
