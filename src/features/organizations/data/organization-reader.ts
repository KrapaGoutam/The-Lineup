import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type {
  Organization,
  UserOrganizationSummary,
} from "@/features/organizations/domain/organization";
import { mapOrganizationRow } from "@/features/organizations/domain/organization";
import { createClient } from "@/lib/supabase/server";

const ORGANIZATION_COLUMNS =
  "id, name, slug, created_by, settings, created_at, updated_at" as const;

/**
 * Server-authoritative reader for an organization by its stable UUID.
 * Returns null if ID is empty, organization is not found, or access is denied by RLS.
 */
export async function getOrganizationById(
  organizationId: string,
  client?: SupabaseClient<Database>,
): Promise<Organization | null> {
  if (
    !organizationId ||
    typeof organizationId !== "string" ||
    !organizationId.trim()
  ) {
    return null;
  }

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("organizations")
      .select(ORGANIZATION_COLUMNS)
      .eq("id", organizationId.trim())
      .maybeSingle();

    if (error || !data) return null;
    return mapOrganizationRow(data);
  } catch {
    return null;
  }
}

/**
 * Server-authoritative reader for an organization by its unique slug.
 * Returns null if slug is empty, not found, or access is denied by RLS.
 */
export async function getOrganizationBySlug(
  slug: string,
  client?: SupabaseClient<Database>,
): Promise<Organization | null> {
  if (!slug || typeof slug !== "string" || !slug.trim()) {
    return null;
  }

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("organizations")
      .select(ORGANIZATION_COLUMNS)
      .eq("slug", slug.trim().toLowerCase())
      .maybeSingle();

    if (error || !data) return null;
    return mapOrganizationRow(data);
  } catch {
    return null;
  }
}

/**
 * Server-authoritative reader returning all organizations accessible to a specific profile.
 * Multi-org support: Jack belonging to Monks and Liquor Tap receives both.
 * Overall Role holders (Owner, Manager, Assistant Manager) resolve all organizations without synthetic memberships.
 * Scoped users receive only organizations where they hold an active membership.
 * Deterministically sorted by created_at and name.
 */
export async function listUserOrganizations(
  profileId: string,
  client?: SupabaseClient<Database>,
): Promise<Organization[]> {
  if (!profileId || typeof profileId !== "string" || !profileId.trim()) {
    return [];
  }

  try {
    const supabase = client ?? (await createClient());

    // 1. Check if user holds an active Overall Role
    const { data: overallRoleData } = await supabase
      .from("overall_roles")
      .select("role")
      .eq("profile_id", profileId.trim())
      .maybeSingle();

    if (overallRoleData) {
      // Overall Role holder has global tenant visibility
      const { data: allOrgs, error: allOrgsError } = await supabase
        .from("organizations")
        .select(ORGANIZATION_COLUMNS)
        .order("created_at", { ascending: true })
        .order("name", { ascending: true });

      if (allOrgsError || !allOrgs) return [];
      return allOrgs.map(mapOrganizationRow);
    }

    // 2. Scoped user: query active memberships
    const { data: activeMemberships, error: memberError } = await supabase
      .from("memberships")
      .select("organization_id")
      .eq("profile_id", profileId.trim())
      .eq("active", true);

    if (memberError || !activeMemberships || activeMemberships.length === 0) {
      return [];
    }

    const orgIds = activeMemberships.map((m) => m.organization_id);

    const { data: orgs, error: orgsError } = await supabase
      .from("organizations")
      .select(ORGANIZATION_COLUMNS)
      .in("id", orgIds)
      .order("created_at", { ascending: true })
      .order("name", { ascending: true });

    if (orgsError || !orgs) return [];
    return orgs.map(mapOrganizationRow);
  } catch {
    return [];
  }
}

/**
 * Returns all organizations accessible to the currently authenticated user.
 * Fails closed (empty array) if unauthenticated or on error.
 */
export async function getCurrentUserOrganizations(
  client?: SupabaseClient<Database>,
): Promise<Organization[]> {
  try {
    const supabase = client ?? (await createClient());
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return [];
    return listUserOrganizations(user.id, supabase);
  } catch {
    return [];
  }
}

/**
 * Returns lightweight organization summaries for a profile, useful for navigation and context resolution.
 */
export async function getUserOrganizationSummaries(
  profileId: string,
  client?: SupabaseClient<Database>,
): Promise<UserOrganizationSummary[]> {
  if (!profileId || typeof profileId !== "string" || !profileId.trim()) {
    return [];
  }

  try {
    const supabase = client ?? (await createClient());

    // 1. Check Overall Role
    const { data: overallRoleData } = await supabase
      .from("overall_roles")
      .select("role")
      .eq("profile_id", profileId.trim())
      .maybeSingle();

    const isOverall = Boolean(overallRoleData);

    // 2. Fetch memberships
    const { data: memberships } = await supabase
      .from("memberships")
      .select("organization_id, roles, active")
      .eq("profile_id", profileId.trim())
      .eq("active", true);

    const membershipMap = new Map<string, string>();
    if (memberships) {
      for (const m of memberships) {
        membershipMap.set(
          m.organization_id,
          Array.isArray(m.roles) && m.roles.length > 0
            ? String(m.roles[0])
            : "member",
        );
      }
    }

    // 3. Fetch accessible organizations
    const orgs = await listUserOrganizations(profileId, supabase);

    return orgs.map((org) => ({
      organizationId: org.id,
      name: org.name,
      slug: org.slug,
      role: isOverall
        ? (overallRoleData?.role ?? "owner")
        : (membershipMap.get(org.id) ?? "member"),
      isOverallAuthorized: isOverall,
    }));
  } catch {
    return [];
  }
}
