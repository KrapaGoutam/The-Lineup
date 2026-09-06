import "server-only";

import type { SignedInUser } from "@/components/login-screen";
import {
  designationForRoles,
  normalizeDatabaseRole,
} from "@/features/auth/domain/passcode";
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

  const [{ data: profile }, { data: membership }] = await Promise.all([
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
  ]);

  if (!profile || !membership) return null;
  return {
    profileId: authData.user.id,
    name: profile.display_name,
    role: normalizeDatabaseRole(membership.roles),
    designation: designationForRoles(membership.roles),
    organizationId: organization.id,
  };
}
