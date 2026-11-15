"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type {
  DayOperatingHours,
  Location,
  LocationAddress,
} from "@/features/locations/domain/location";
import {
  getLocationById,
  getLocationOperatingHours,
  listLocationsByOrganization,
} from "@/features/locations/data/location-reader";
import {
  provisionNewLocation,
  updateLocationMetadata,
  updateLocationOperatingHours,
} from "@/features/locations/data/location-mutation";
import { getOverallRole } from "@/features/auth/data/overall-role";
import { getOrganizationMembership } from "@/features/auth/data/organization-membership";
import { listUserOrganizations } from "@/features/organizations/data/organization-reader";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: string;
      readonly code?: string;
      readonly sessionInvalid?: true;
    };

export interface AdministrableOrganization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly role: string;
}

export interface LocationAdminContext {
  readonly canAdministerLocations: boolean;
  readonly isOverallAdmin: boolean;
  readonly organizations: readonly AdministrableOrganization[];
}

/**
 * Checks if the specified profile has administrative management authority over a target organization.
 * Permitted actors: Overall Owner, Overall Manager, or active Org Owner / General Manager.
 * Denied actors: Overall Assistant Manager (alone), Staff, or members of another organization.
 */
export async function verifyLocationAdminAuthority(
  profileId: string,
  organizationId: string,
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  if (!profileId || !organizationId) return false;

  const overall = await getOverallRole(profileId, supabase);
  if (overall === "owner" || overall === "manager") {
    return true;
  }

  const membership = await getOrganizationMembership(
    profileId,
    organizationId,
    supabase,
  );
  if (
    membership?.active &&
    membership.roles.some((r) => r === "owner" || r === "general_manager")
  ) {
    return true;
  }

  return false;
}

/**
 * Server action resolving whether the current authenticated user can administer locations,
 * and returning the list of organizations they are authorized to manage.
 */
export async function getLocationAdminContextAction(
  client?: SupabaseClient<Database>,
): Promise<ActionResult<LocationAdminContext>> {
  try {
    const supabase = client ?? (await createClient());
    const sessionCheck = await requireLiveSession(supabase);
    if (sessionCheck) {
      return {
        ok: false,
        error: sessionCheck.error,
        sessionInvalid: true,
      };
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        ok: false,
        error: "Unauthenticated. Please sign in.",
        sessionInvalid: true,
      };
    }

    const overall = await getOverallRole(user.id, supabase);
    const isOverallAdmin = overall === "owner" || overall === "manager";

    if (isOverallAdmin) {
      const allOrgs = await listUserOrganizations(user.id, supabase);
      return {
        ok: true,
        data: {
          canAdministerLocations: true,
          isOverallAdmin: true,
          organizations: allOrgs.map((org) => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            role: overall ?? "owner",
          })),
        },
      };
    }

    // Check organization-scoped management memberships (Owner or General Manager)
    const { data: memberships, error: memError } = await supabase
      .from("memberships")
      .select(
        "organization_id, roles, active, organizations!inner(id, name, slug)",
      )
      .eq("profile_id", user.id)
      .eq("active", true);

    if (memError || !memberships || memberships.length === 0) {
      return {
        ok: true,
        data: {
          canAdministerLocations: false,
          isOverallAdmin: false,
          organizations: [],
        },
      };
    }

    const eligibleOrgs: AdministrableOrganization[] = [];
    for (const m of memberships) {
      const roles = Array.isArray(m.roles) ? m.roles : [];
      if (roles.includes("owner") || roles.includes("general_manager")) {
        const orgInfo = m.organizations as unknown as {
          id: string;
          name: string;
          slug: string;
        };
        if (orgInfo) {
          eligibleOrgs.push({
            id: orgInfo.id,
            name: orgInfo.name,
            slug: orgInfo.slug,
            role: roles.includes("owner") ? "owner" : "general_manager",
          });
        }
      }
    }

    return {
      ok: true,
      data: {
        canAdministerLocations: eligibleOrgs.length > 0,
        isOverallAdmin: false,
        organizations: eligibleOrgs,
      },
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to resolve location administration context.",
    };
  }
}

/**
 * Server action to list all locations belonging to an authorized organization.
 */
export async function listLocationsForAdminAction(
  organizationId: string,
  client?: SupabaseClient<Database>,
): Promise<ActionResult<Location[]>> {
  if (!organizationId?.trim()) {
    return { ok: false, error: "Organization ID is required." };
  }

  try {
    const supabase = client ?? (await createClient());
    const sessionCheck = await requireLiveSession(supabase);
    if (sessionCheck) {
      return {
        ok: false,
        error: sessionCheck.error,
        sessionInvalid: true,
      };
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        ok: false,
        error: "Unauthenticated. Please sign in.",
        sessionInvalid: true,
      };
    }

    const authorized = await verifyLocationAdminAuthority(
      user.id,
      organizationId.trim(),
      supabase,
    );

    if (!authorized) {
      return {
        ok: false,
        error:
          "Unauthorized: management authority required for this organization.",
      };
    }

    const locations = await listLocationsByOrganization(
      organizationId.trim(),
      supabase,
    );

    return { ok: true, data: locations };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load locations.",
    };
  }
}

/**
 * Server action to provision a new location.
 */
export async function provisionLocationAction(
  params: {
    readonly organizationId: string;
    readonly name: string;
    readonly timeZone?: string;
    readonly address?: LocationAddress;
    readonly coverWeight?: number;
    readonly openingLocal?: string;
    readonly closingLocal?: string;
  },
  client?: SupabaseClient<Database>,
): Promise<ActionResult<Location>> {
  if (!params.organizationId?.trim()) {
    return { ok: false, error: "Organization ID is required." };
  }

  try {
    const supabase = client ?? (await createClient());
    const sessionCheck = await requireLiveSession(supabase);
    if (sessionCheck) {
      return {
        ok: false,
        error: sessionCheck.error,
        sessionInvalid: true,
      };
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        ok: false,
        error: "Unauthenticated. Please sign in.",
        sessionInvalid: true,
      };
    }

    const authorized = await verifyLocationAdminAuthority(
      user.id,
      params.organizationId.trim(),
      supabase,
    );

    if (!authorized) {
      return {
        ok: false,
        error:
          "Unauthorized: management authority required to create locations.",
      };
    }

    const result = await provisionNewLocation(params, supabase);
    if (!result.success) {
      return {
        ok: false,
        error: result.error,
        code: result.code,
      };
    }

    return { ok: true, data: result.data };
  } catch (err: unknown) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to provision new location.",
    };
  }
}

/**
 * Server action to update permitted location details and metadata.
 */
export async function updateLocationDetailsAction(
  params: {
    readonly locationId: string;
    readonly organizationId: string;
    readonly name?: string;
    readonly timeZone?: string;
    readonly address?: LocationAddress;
    readonly coverWeight?: number;
    readonly openingLocal?: string;
    readonly closingLocal?: string;
  },
  client?: SupabaseClient<Database>,
): Promise<ActionResult<Location>> {
  if (!params.locationId?.trim() || !params.organizationId?.trim()) {
    return {
      ok: false,
      error: "Location ID and Organization ID are required.",
    };
  }

  try {
    const supabase = client ?? (await createClient());
    const sessionCheck = await requireLiveSession(supabase);
    if (sessionCheck) {
      return {
        ok: false,
        error: sessionCheck.error,
        sessionInvalid: true,
      };
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        ok: false,
        error: "Unauthenticated. Please sign in.",
        sessionInvalid: true,
      };
    }

    // 1. Verify caller has admin authority over the claimed organization
    const authorized = await verifyLocationAdminAuthority(
      user.id,
      params.organizationId.trim(),
      supabase,
    );

    if (!authorized) {
      return {
        ok: false,
        error:
          "Unauthorized: management authority required for this organization.",
      };
    }

    // 2. Cross-organization defense: verify location actually belongs to this organization
    const existing = await getLocationById(params.locationId.trim(), supabase);
    if (!existing) {
      return { ok: false, error: "Location not found or access denied." };
    }

    if (existing.organizationId !== params.organizationId.trim()) {
      return {
        ok: false,
        error:
          "Tenant mismatch: location does not belong to specified organization.",
      };
    }

    // 3. Delegate to server-authoritative mutation
    const result = await updateLocationMetadata(
      {
        locationId: params.locationId,
        name: params.name,
        timeZone: params.timeZone,
        address: params.address,
        coverWeight: params.coverWeight,
        openingLocal: params.openingLocal,
        closingLocal: params.closingLocal,
      },
      supabase,
    );

    if (!result.success) {
      return {
        ok: false,
        error: result.error,
        code: result.code,
      };
    }

    return { ok: true, data: result.data };
  } catch (err: unknown) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to update location details.",
    };
  }
}

/**
 * Server action to fetch a location's weekly operating hours.
 */
export async function getLocationOperatingHoursAction(
  locationId: string,
  organizationId: string,
  client?: SupabaseClient<Database>,
): Promise<ActionResult<DayOperatingHours[]>> {
  if (!locationId?.trim() || !organizationId?.trim()) {
    return {
      ok: false,
      error: "Location ID and Organization ID are required.",
    };
  }

  try {
    const supabase = client ?? (await createClient());
    const sessionCheck = await requireLiveSession(supabase);
    if (sessionCheck) {
      return {
        ok: false,
        error: sessionCheck.error,
        sessionInvalid: true,
      };
    }

    // Verify location ownership
    const existing = await getLocationById(locationId.trim(), supabase);
    if (!existing || existing.organizationId !== organizationId.trim()) {
      return {
        ok: false,
        error:
          "Location not found or does not belong to specified organization.",
      };
    }

    const hours = await getLocationOperatingHours(locationId.trim(), supabase);
    return { ok: true, data: hours };
  } catch (err: unknown) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Failed to fetch operating hours.",
    };
  }
}

/**
 * Server action to update a location's weekly operating hours.
 */
export async function updateLocationOperatingHoursAction(
  params: {
    readonly locationId: string;
    readonly organizationId: string;
    readonly operatingHours: readonly DayOperatingHours[];
  },
  client?: SupabaseClient<Database>,
): Promise<ActionResult<DayOperatingHours[]>> {
  if (!params.locationId?.trim() || !params.organizationId?.trim()) {
    return {
      ok: false,
      error: "Location ID and Organization ID are required.",
    };
  }

  try {
    const supabase = client ?? (await createClient());
    const sessionCheck = await requireLiveSession(supabase);
    if (sessionCheck) {
      return {
        ok: false,
        error: sessionCheck.error,
        sessionInvalid: true,
      };
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        ok: false,
        error: "Unauthenticated. Please sign in.",
        sessionInvalid: true,
      };
    }

    const authorized = await verifyLocationAdminAuthority(
      user.id,
      params.organizationId.trim(),
      supabase,
    );

    if (!authorized) {
      return {
        ok: false,
        error:
          "Unauthorized: management authority required to update operating hours.",
      };
    }

    const existing = await getLocationById(params.locationId.trim(), supabase);
    if (!existing || existing.organizationId !== params.organizationId.trim()) {
      return {
        ok: false,
        error:
          "Tenant mismatch: location does not belong to specified organization.",
      };
    }

    const result = await updateLocationOperatingHours(
      {
        locationId: params.locationId,
        organizationId: params.organizationId,
        operatingHours: params.operatingHours,
      },
      supabase,
    );

    if (!result.success) {
      return {
        ok: false,
        error: result.error,
        code: result.code,
      };
    }

    return { ok: true, data: result.data };
  } catch (err: unknown) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to update operating hours.",
    };
  }
}
