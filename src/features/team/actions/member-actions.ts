"use server";

import { revalidatePath } from "next/cache";

import { isValidDisplayName } from "@/features/auth/domain/registration";
import { writeAuditEvent } from "@/features/team/data/audit-log";
import { guardModule } from "@/features/modules/data/module-enforcement";
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
 * Feature 024. Who may rename whom is enforced entirely by the new
 * `profiles_update_manager` RLS policy (see
 * supabase/migrations/20260908170000_profiles_manager_rename.sql) --
 * this action does not duplicate that check, only validates the name
 * itself (the same `isValidDisplayName` registration already uses) and
 * translates a successful write into an audit_events row. Matches
 * `updateTeamDesignationAction`'s exact shape (team-actions.ts) for
 * consistency between the two sibling personnel actions.
 */
export async function renameTeamMemberAction(input: {
  restaurantSlug: string;
  organizationId: string;
  targetProfileId: string;
  previousDisplayName: string;
  nextDisplayName: string;
}): Promise<ActionResult<null>> {
  const trimmed = input.nextDisplayName.trim();
  if (!isValidDisplayName(trimmed)) {
    return {
      ok: false,
      error: "Enter a name between 2 and 100 characters.",
    };
  }

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  // V2-004.004: Team is an optional module. Passcode reset, deactivation,
  // sign-in and the Settings account-recovery path are platform operations
  // and are intentionally NOT gated here (see ENTRY_POINT_MATRIX.md).
  const blocked = await guardModule({
    module: "team",
    organizationId: input.organizationId,
  });
  if (blocked) return blocked;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  // V2-005.008: Local managers cannot rename organization members.
  // Must hold Overall Owner/Manager or Organization Owner/General Manager.
  const [{ data: orgMembership }, { data: overallRole }] = await Promise.all([
    supabase
      .from("memberships")
      .select("roles")
      .eq("organization_id", input.organizationId)
      .eq("profile_id", user.id)
      .eq("active", true)
      .maybeSingle(),
    supabase
      .from("overall_roles")
      .select("role")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  const isOverallAdmin =
    overallRole?.role === "owner" || overallRole?.role === "manager";
  const orgRoles = (orgMembership?.roles ?? []) as string[];
  const isOrgExecutive =
    orgRoles.includes("owner") || orgRoles.includes("general_manager");

  if (!isOverallAdmin && !isOrgExecutive) {
    return {
      ok: false,
      error: "Only an owner or general manager can rename team members.",
    };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: trimmed })
    .eq("id", input.targetProfileId);

  if (error) {
    return {
      ok: false,
      error: "Unable to rename this person. Please try again.",
    };
  }

  if (user) {
    await writeAuditEvent(supabase, {
      organizationId: input.organizationId,
      actorProfileId: user.id,
      action: "team_member_renamed",
      entityType: "profile",
      entityId: input.targetProfileId,
      beforeState: { display_name: input.previousDisplayName },
      afterState: { display_name: trimmed },
    });
  }

  revalidatePath(`/r/${input.restaurantSlug}`);
  return { ok: true, data: null };
}
