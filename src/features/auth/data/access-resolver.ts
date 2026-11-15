import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type {
  AccessResolution,
  TargetContext,
  VerifiedLocationInfo,
} from "@/features/auth/domain/access-resolver";
import { resolveUserAccess } from "@/features/auth/domain/access-resolver";
import { getOverallRole } from "@/features/auth/data/overall-role";
import { getOrganizationMembership } from "@/features/auth/data/organization-membership";
import { getLocationRoleAssignment } from "@/features/auth/data/location-role";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-authoritative data loader resolving effective access for the currently authenticated user.
 *
 * Enforces:
 * 1. Authenticates current caller via supabase.auth.getUser() (never trusts client claims).
 * 2. Fetches trusted database-backed overall roles, organization memberships, and location assignments.
 * 3. Verifies location existence, active status, and tenant integrity (locations.organization_id === target.organizationId).
 * 4. Passes verified facts to the pure domain resolver `resolveUserAccess`.
 * 5. Fails closed on unauthenticated caller, query error, missing context, or tenant mismatch.
 */
export async function resolveCurrentUserAccess(
  context: TargetContext,
  client?: SupabaseClient<Database>,
): Promise<AccessResolution> {
  const orgId = (context?.organizationId ?? "").trim();
  if (!orgId) {
    return {
      allowed: false,
      effectiveLevel: null,
      applicableSources: [],
      capabilities: [],
      denialReason: "INVALID_TARGET",
    };
  }

  try {
    const supabase = client ?? (await createClient());

    // 1. Authenticate caller
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        allowed: false,
        effectiveLevel: null,
        applicableSources: [],
        capabilities: [],
        denialReason: "UNAUTHENTICATED",
      };
    }

    return resolveAccessForProfileInternal(user.id, context, supabase);
  } catch {
    return {
      allowed: false,
      effectiveLevel: null,
      applicableSources: [],
      capabilities: [],
      denialReason: "QUERY_ERROR",
    };
  }
}

/**
 * Privileged cross-user access inspection variant.
 * Strictly verifies caller identity and administrative authorization before inspecting target profile.
 * - Same user inspecting self: permitted.
 * - Different user: caller MUST hold Overall Owner, Overall Manager, or Organization Owner/GM in target organization.
 * Fails closed with UNAUTHORIZED_INSPECTION or UNAUTHENTICATED otherwise.
 */
export async function resolveUserAccessForProfile(
  profileId: string,
  context: TargetContext,
  client?: SupabaseClient<Database>,
): Promise<AccessResolution> {
  const targetProfileId = (profileId ?? "").trim();
  const orgId = (context?.organizationId ?? "").trim();

  if (!targetProfileId || !orgId) {
    return {
      allowed: false,
      effectiveLevel: null,
      applicableSources: [],
      capabilities: [],
      denialReason: "INVALID_TARGET",
    };
  }

  try {
    const supabase = client ?? (await createClient());

    // 1. Authenticate calling actor
    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !caller) {
      return {
        allowed: false,
        effectiveLevel: null,
        applicableSources: [],
        capabilities: [],
        denialReason: "UNAUTHENTICATED",
      };
    }

    // 2. If inspecting self, proceed directly
    if (caller.id === targetProfileId) {
      return resolveAccessForProfileInternal(
        targetProfileId,
        context,
        supabase,
      );
    }

    // 3. If inspecting another subject, verify caller administration privileges
    const callerOverall = await getOverallRole(caller.id, supabase);
    const isCallerOverallAdmin =
      callerOverall === "owner" || callerOverall === "manager";

    if (!isCallerOverallAdmin) {
      // Check caller's organization membership
      const callerOrgMembership = await getOrganizationMembership(
        caller.id,
        orgId,
        supabase,
      );

      const hasOrgAdminRole =
        callerOrgMembership?.active &&
        callerOrgMembership.roles.some(
          (r) => r === "owner" || r === "general_manager",
        );

      if (!hasOrgAdminRole) {
        return {
          allowed: false,
          effectiveLevel: null,
          applicableSources: [],
          capabilities: [],
          denialReason: "UNAUTHORIZED_INSPECTION",
        };
      }
    }

    return resolveAccessForProfileInternal(targetProfileId, context, supabase);
  } catch {
    return {
      allowed: false,
      effectiveLevel: null,
      applicableSources: [],
      capabilities: [],
      denialReason: "QUERY_ERROR",
    };
  }
}

/**
 * Internal helper to query trusted records and invoke the pure domain resolver.
 */
async function resolveAccessForProfileInternal(
  profileId: string,
  context: TargetContext,
  supabase: SupabaseClient<Database>,
): Promise<AccessResolution> {
  const orgId = context.organizationId.trim();
  const locId = (context.locationId ?? "").trim();

  // 1. Fetch location info if location requested
  let locationInfo: VerifiedLocationInfo | null = null;
  if (locId) {
    const { data: locData, error: locError } = await supabase
      .from("locations")
      .select("id, organization_id, active")
      .eq("id", locId)
      .maybeSingle();

    if (locError) {
      return {
        allowed: false,
        effectiveLevel: null,
        applicableSources: [],
        capabilities: [],
        denialReason: "QUERY_ERROR",
      };
    }

    if (locData) {
      locationInfo = {
        id: locData.id,
        organizationId: locData.organization_id,
        active: Boolean(locData.active),
      };
    }
  }

  // 2. Fetch Overall Role
  const overallRole = await getOverallRole(profileId, supabase);

  // 3. Fetch Organization Membership
  const organizationMembership = await getOrganizationMembership(
    profileId,
    orgId,
    supabase,
  );

  // 4. Fetch Location Assignment if locationId requested
  let locationAssignment = null;
  if (locId) {
    locationAssignment = await getLocationRoleAssignment(
      profileId,
      locId,
      supabase,
    );
  }

  // 5. Evaluate pure domain resolution
  return resolveUserAccess({
    target: { organizationId: orgId, locationId: locId || null },
    location: locationInfo,
    overallRole,
    organizationMembership,
    locationAssignment,
  });
}
