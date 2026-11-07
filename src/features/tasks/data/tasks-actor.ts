import "server-only";

import { resolveCurrentActiveContext } from "@/features/context/data/active-context";
import { toVerifiedLocationScope } from "@/features/context/domain/active-context";
import { getEntryUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";

/** Canonical authority can hydrate a genuine actor without workforce affiliation. */
export async function getTasksActor(restaurantSlug: string) {
  const result = await resolveCurrentActiveContext({
    routeSlug: restaurantSlug,
  });
  if (
    result.status !== "resolved" ||
    !result.context.access.allowed ||
    !result.context.access.capabilities.includes("location:operate") ||
    !result.context.access.effectiveLevel
  )
    return null;

  const user = await getEntryUser(result.context);
  if (!user || user.profileId !== result.context.profileId) return null;
  const scope = toVerifiedLocationScope(result.context);
  // A Preview on the unmigrated DEV schema must refuse before old Tasks RPCs.
  // This read also validates the live SQL session and exact location authority.
  const supabase = await createClient();
  const authorized = await supabase.rpc("tasks_location_authorized", {
    p_organization_id: scope.organizationId,
    p_location_id: scope.locationId,
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
