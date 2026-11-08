import "server-only";

import { resolveCurrentActiveContext } from "@/features/context/data/active-context";
import { toVerifiedLocationScope } from "@/features/context/domain/active-context";
import { getEntryUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";

export type PayrollActor = {
  organizationId: string;
  scope: ReturnType<typeof toVerifiedLocationScope>;
  viewer: {
    profileId: string;
    name: string;
    designation: string;
  };
  isOrgManager: boolean;
  isLocationManager: boolean;
  canManage: boolean;
};

/**
 * Resolves the genuine payroll actor for the authenticated user and route slug.
 * Hybrid model:
 *   - Overall/Org managers can manage payroll org-wide.
 *   - Location managers can manage payroll within their verified active location.
 *   - Regular staff can access only their own verified attendance links and personal statements.
 */
export async function getPayrollActor(
  restaurantSlug: string,
): Promise<PayrollActor | null> {
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
  const authorized = await supabase.rpc("payroll_location_authorized", {
    p_organization_id: scope.organizationId,
    p_location_id: scope.locationId,
  });
  if (authorized.error || authorized.data !== true) return null;

  const effectiveLevel = result.context.access.effectiveLevel;
  const isOrgManager =
    result.context.access.capabilities.includes("org:admin") ||
    result.context.access.capabilities.includes("overall:owner") ||
    result.context.access.capabilities.includes("overall:manage");

  const isLocationManager =
    isOrgManager ||
    result.context.access.capabilities.includes("location:manage") ||
    result.context.access.capabilities.includes("location:assistant_manage") ||
    effectiveLevel === "owner" ||
    effectiveLevel === "manager" ||
    effectiveLevel === "assistant_manager";

  const canManage = isOrgManager || isLocationManager;

  return {
    organizationId: result.context.organizationId,
    scope,
    viewer: {
      profileId: user.profileId,
      name: user.name,
      designation: effectiveLevel,
    },
    isOrgManager,
    isLocationManager,
    canManage,
  };
}
