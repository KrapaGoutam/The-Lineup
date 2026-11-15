import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { OrganizationMembership } from "@/features/auth/domain/organization-membership";
import { mapMembershipRow } from "@/features/auth/domain/organization-membership";
import { createClient } from "@/lib/supabase/server";

const MEMBERSHIP_COLUMNS =
  "id, organization_id, profile_id, roles, active, created_at" as const;

/**
 * Server-authoritative reader for a specific (profile, organization) membership pair.
 * Returns null if no record exists, inputs are missing, or on database error.
 * Returns both active and inactive memberships so caller can inspect status.
 */
export async function getOrganizationMembership(
  profileId: string,
  organizationId: string,
  client?: SupabaseClient<Database>,
): Promise<OrganizationMembership | null> {
  if (!profileId || !organizationId) return null;

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("memberships")
      .select(MEMBERSHIP_COLUMNS)
      .eq("profile_id", profileId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error || !data) return null;
    return mapMembershipRow(data);
  } catch {
    return null;
  }
}

/**
 * Server-authoritative reader returning all organization memberships (active and inactive)
 * for a profile, ordered deterministically by creation time and id.
 */
export async function listOrganizationMemberships(
  profileId: string,
  client?: SupabaseClient<Database>,
): Promise<OrganizationMembership[]> {
  if (!profileId) return [];

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("memberships")
      .select(MEMBERSHIP_COLUMNS)
      .eq("profile_id", profileId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error || !data) return [];
    return data.map(mapMembershipRow);
  } catch {
    return [];
  }
}

/**
 * Server-authoritative reader returning only ACTIVE organization memberships for a profile.
 * Supports multi-organization users without single-org truncation (`limit(1)` is explicitly avoided).
 */
export async function listActiveOrganizationMemberships(
  profileId: string,
  client?: SupabaseClient<Database>,
): Promise<OrganizationMembership[]> {
  if (!profileId) return [];

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("memberships")
      .select(MEMBERSHIP_COLUMNS)
      .eq("profile_id", profileId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error || !data) return [];
    return data.map(mapMembershipRow);
  } catch {
    return [];
  }
}

/**
 * Returns all organization memberships (active and inactive) for the currently authenticated user.
 * Fails closed (empty array) when unauthenticated or on error.
 */
export async function getCurrentUserOrganizationMemberships(
  client?: SupabaseClient<Database>,
): Promise<OrganizationMembership[]> {
  try {
    const supabase = client ?? (await createClient());
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return [];
    return listOrganizationMemberships(user.id, supabase);
  } catch {
    return [];
  }
}

/**
 * Returns only ACTIVE organization memberships for the currently authenticated user.
 * Fails closed (empty array) when unauthenticated or on error.
 */
export async function getCurrentUserActiveOrganizationMemberships(
  client?: SupabaseClient<Database>,
): Promise<OrganizationMembership[]> {
  try {
    const supabase = client ?? (await createClient());
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return [];
    return listActiveOrganizationMemberships(user.id, supabase);
  } catch {
    return [];
  }
}
