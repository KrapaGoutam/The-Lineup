"use server";

import { getCurrentUser } from "@/lib/current-user";
import { getOrganizationRoster } from "@/features/team/data/roster";
import { canChangeDesignation } from "@/features/team/domain/designations";

/** Account recovery is organization-authorized and does not require an active operational location. */
export async function loadAccountRecoveryAction(restaurantSlug: string) {
  try {
    const user = await getCurrentUser(restaurantSlug);
    if (!user) return { ok: false as const };
    const team =
      user.designation === "owner" || user.designation === "manager"
        ? (await getOrganizationRoster(user.organizationId)).filter(
            (member) =>
              member.active !== false &&
              canChangeDesignation({
                actorDesignation: user.designation,
                targetCurrentDesignation: member.designation,
              }),
          )
        : [];
    return { ok: true as const, user, team };
  } catch {
    return { ok: false as const };
  }
}
