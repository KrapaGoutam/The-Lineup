import "server-only";

import type { SignedInUser } from "@/components/login-screen";
import { resolveCurrentActiveContext } from "@/features/context/data/active-context";
import { getEntryUser } from "@/lib/current-user";

/**
 * V2-006 — identity for the NATIVE attendance actions.
 *
 * Authority comes from the canonical active-context resolver (the same one Payroll's
 * actor uses): it decides, server-side and for this exact organization slug, whether the
 * caller has any access at all (an active membership, or an Overall role). Only then is the
 * display user hydrated with `getEntryUser`.
 *
 * Why this exists instead of changing `getCurrentUser`: `getCurrentUser(slug)` requires an
 * ACTIVE MEMBERSHIP in the slug's organization and is relied on by service-role account
 * routes (passcode reset, member deactivate/reactivate, account recovery). Letting it accept
 * an Overall role without a membership would let an Overall administrator drive those
 * routes in every organization. It is therefore deliberately left strict, and the attendance
 * actions that must serve Overall administrators use this resolver instead.
 *
 * This grants nothing by itself: reading or changing attendance is still decided by RLS and
 * the database functions for the verified location.
 */
export async function getAttendanceEntryUser(
  restaurantSlug: string,
): Promise<SignedInUser | null> {
  const result = await resolveCurrentActiveContext({
    routeSlug: restaurantSlug,
  });
  if (result.status !== "resolved" || !result.context.access.allowed) {
    return null;
  }
  const user = await getEntryUser(result.context);
  if (!user || user.profileId !== result.context.profileId) return null;
  return user;
}
