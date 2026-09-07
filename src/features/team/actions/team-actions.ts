"use server";

import { revalidatePath } from "next/cache";

import type { Designation } from "@/features/auth/domain/passcode";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      // Feature 017: see requireLiveSession's doc comment.
      sessionInvalid?: true;
    };

/**
 * The inverse of designationForRoles (passcode.ts). `staff` always writes
 * `server`, never `host` -- nothing in this app's delivered UI ever
 * grants `host`, so there is no real member this could accidentally
 * downgrade from.
 */
const ROLES_FOR_DESIGNATION: Record<Designation, string[]> = {
  owner: ["owner"],
  manager: ["general_manager"],
  assistant_manager: ["shift_manager"],
  staff: ["server"],
};

/**
 * Feature 015 Phase E. Who may set whose designation is enforced entirely
 * by the existing `memberships_update_manager` RLS policy (unchanged by
 * this feature, per Feature 014's own spec) -- this action does not
 * duplicate that check, only translates a designation into the `roles`
 * array the policy actually governs. `assignableDesignations`
 * (designations.ts) already keeps an unauthorized option off the client
 * UI; a write that RLS still refuses surfaces as a plain failure here.
 */
export async function updateTeamDesignationAction(input: {
  restaurantSlug: string;
  organizationId: string;
  targetProfileId: string;
  nextDesignation: Designation;
}): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const { error } = await supabase
    .from("memberships")
    .update({ roles: ROLES_FOR_DESIGNATION[input.nextDesignation] })
    .eq("organization_id", input.organizationId)
    .eq("profile_id", input.targetProfileId);

  if (error) {
    return {
      ok: false,
      error: "Unable to update that designation. Please try again.",
    };
  }

  revalidatePath(`/r/${input.restaurantSlug}`);
  return { ok: true, data: null };
}
