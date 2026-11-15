import "server-only";

import { resolveCurrentActiveContext } from "@/features/context/data/active-context";
import { getEntryUser } from "@/lib/current-user";
import { designationToRole } from "@/features/auth/domain/passcode";

/** Allocation-only identity hydration after canonical authorization, never affiliation. */
export async function getAllocationActor(restaurantSlug: string) {
  const result = await resolveCurrentActiveContext({
    routeSlug: restaurantSlug,
  });
  if (result.status === "unauthenticated") return null;
  if (
    result.status !== "resolved" ||
    !result.context.access.allowed ||
    !result.context.access.capabilities.includes("location:operate") ||
    !result.context.access.effectiveLevel
  ) {
    return { contextStale: true as const };
  }

  const user = await getEntryUser(result.context);
  if (!user || user.profileId !== result.context.profileId) return null;
  const designation = result.context.access.effectiveLevel;
  return {
    ...user,
    designation,
    role: designationToRole(designation),
  };
}
