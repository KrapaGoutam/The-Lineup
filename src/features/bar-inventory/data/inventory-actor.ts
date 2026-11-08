import "server-only";

import { resolveCurrentActiveContext } from "@/features/context/data/active-context";
import { toVerifiedLocationScope } from "@/features/context/domain/active-context";
import { getEntryUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";

export type InventoryActor = {
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
};

/**
 * Resolves the genuine inventory actor for the authenticated user and route slug.
 * Authorizes against the verified active location via public.inventory_location_authorized.
 */
export async function getInventoryActor(
  restaurantSlug: string,
): Promise<InventoryActor | null> {
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

  // Validate the live SQL session and exact location authority
  const supabase = await createClient();
  const authorized = await supabase.rpc("inventory_location_authorized", {
    p_org: scope.organizationId,
    p_location: scope.locationId,
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
  };
}
