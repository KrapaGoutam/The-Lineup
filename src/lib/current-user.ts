import "server-only";

import type { SignedInUser } from "@/components/login-screen";
import { getOverallRole } from "@/features/auth/data/overall-role";
import type { OverallRole } from "@/features/auth/domain/overall-role";
import {
  designationForRoles,
  designationToRole,
} from "@/features/auth/domain/passcode";
import type { Designation } from "@/features/auth/domain/passcode";
import type { ResolvedActiveContext } from "@/features/context/domain/active-context";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser(
  restaurantSlug: string,
): Promise<SignedInUser | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;

  const { data: organization } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", restaurantSlug)
    .maybeSingle();
  if (!organization) return null;

  const [{ data: profile }, { data: membership }, overallRole] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", authData.user.id)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select("roles")
        .eq("organization_id", organization.id)
        .eq("profile_id", authData.user.id)
        .eq("active", true)
        .maybeSingle(),
      getOverallRole(authData.user.id, supabase),
    ]);

  if (!profile || (!membership && !overallRole)) return null;
  const designation = entryDesignation({
    membershipRoles: membership?.roles ?? null,
    overallRole,
  });
  return {
    profileId: authData.user.id,
    name: profile.display_name,
    role: designationToRole(designation),
    designation,
    organizationId: organization.id,
  };
}

const DESIGNATION_RANK: Record<Designation, number> = {
  staff: 1,
  assistant_manager: 2,
  manager: 3,
  owner: 4,
};

/**
 * Display designation for an entry user: the higher of their active
 * organization-membership designation and (when present) their Overall role.
 * With an organization membership and no Overall role this is exactly
 * `designationForRoles(roles)` -- the pre-V2-003 behavior.
 */
export function entryDesignation(input: {
  membershipRoles: readonly string[] | null;
  overallRole: OverallRole | null;
}): Designation {
  const fromMembership: Designation = input.membershipRoles
    ? designationForRoles([...input.membershipRoles])
    : "staff";
  const fromOverall: Designation | null = input.overallRole;
  if (!fromOverall) return fromMembership;
  return DESIGNATION_RANK[fromOverall] > DESIGNATION_RANK[fromMembership]
    ? fromOverall
    : fromMembership;
}

/**
 * V2-003.001 — entry-user hydration for an ALREADY VERIFIED active context.
 *
 * Unlike `getCurrentUser`, this does not require a local organization
 * membership: authority was established by `resolveCurrentActiveContext`
 * (canonical resolver), so an Overall administrator with no membership row is
 * hydrated correctly. It only reads display facts (name, role label); it
 * grants nothing. `getCurrentUser` is unchanged and still used by passcode and
 * module server actions until V2-005.
 */
export async function getEntryUser(
  context: Pick<ResolvedActiveContext, "profileId" | "organizationId">,
): Promise<SignedInUser | null> {
  const supabase = await createClient();

  const [{ data: profile }, { data: membership }, overallRole] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", context.profileId)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select("roles")
        .eq("organization_id", context.organizationId)
        .eq("profile_id", context.profileId)
        .eq("active", true)
        .maybeSingle(),
      getOverallRole(context.profileId, supabase),
    ]);

  if (!profile) return null;

  const designation = entryDesignation({
    membershipRoles: membership?.roles ?? null,
    overallRole,
  });
  return {
    profileId: context.profileId,
    name: profile.display_name,
    role: designationToRole(designation),
    designation,
    organizationId: context.organizationId,
  };
}
