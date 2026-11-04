import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type {
  DayOperatingHours,
  Location,
  LocationSummary,
} from "@/features/locations/domain/location";
import {
  mapLocationRow,
  mapOperatingHoursRow,
} from "@/features/locations/domain/location";
import { createClient } from "@/lib/supabase/server";

const LOCATION_COLUMNS =
  "id, organization_id, name, time_zone, address, cover_weight, active, opening_local, closing_local, created_at, updated_at" as const;

/**
 * Server-authoritative reader for a location by its stable UUID.
 * Returns null if ID is empty, location is not found, or access is denied by RLS.
 */
export async function getLocationById(
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<Location | null> {
  if (!locationId || typeof locationId !== "string" || !locationId.trim()) {
    return null;
  }

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("locations")
      .select(LOCATION_COLUMNS)
      .eq("id", locationId.trim())
      .maybeSingle();

    if (error || !data) return null;
    return mapLocationRow(data);
  } catch {
    return null;
  }
}

/**
 * Server-authoritative reader returning all locations belonging to an organization.
 * Supports multi-location organizations without single-location truncation.
 */
export async function listLocationsByOrganization(
  organizationId: string,
  client?: SupabaseClient<Database>,
): Promise<Location[]> {
  if (
    !organizationId ||
    typeof organizationId !== "string" ||
    !organizationId.trim()
  ) {
    return [];
  }

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("locations")
      .select(LOCATION_COLUMNS)
      .eq("organization_id", organizationId.trim())
      .order("name", { ascending: true });

    if (error || !data) return [];
    return data.map(mapLocationRow);
  } catch {
    return [];
  }
}

/**
 * Server-authoritative reader returning only active locations for an organization.
 */
export async function listActiveLocationsByOrganization(
  organizationId: string,
  client?: SupabaseClient<Database>,
): Promise<Location[]> {
  if (
    !organizationId ||
    typeof organizationId !== "string" ||
    !organizationId.trim()
  ) {
    return [];
  }

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("locations")
      .select(LOCATION_COLUMNS)
      .eq("organization_id", organizationId.trim())
      .eq("active", true)
      .order("name", { ascending: true });

    if (error || !data) return [];
    return data.map(mapLocationRow);
  } catch {
    return [];
  }
}

/**
 * Server-authoritative reader returning locations accessible to the current authenticated caller
 * within the specified organization.
 * Overall roles and Org Owner/GM have access to all organization locations;
 * standard staff have access only to explicitly assigned active locations.
 */
export async function getCurrentUserAccessibleLocations(
  organizationId: string,
  client?: SupabaseClient<Database>,
): Promise<LocationSummary[]> {
  if (
    !organizationId ||
    typeof organizationId !== "string" ||
    !organizationId.trim()
  ) {
    return [];
  }

  try {
    const supabase = client ?? (await createClient());
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return [];

    // Check if user has overall roles
    const { data: overallRole } = await supabase
      .from("overall_roles")
      .select("role")
      .eq("profile_id", user.id)
      .maybeSingle();

    const isOverallPrivileged =
      overallRole?.role === "owner" ||
      overallRole?.role === "manager" ||
      overallRole?.role === "assistant_manager";

    // Check if user is organization Owner or General Manager
    const { data: orgMembership } = await supabase
      .from("memberships")
      .select("roles, active")
      .eq("organization_id", organizationId.trim())
      .eq("profile_id", user.id)
      .eq("active", true)
      .maybeSingle();

    const isOrgManagement =
      orgMembership?.active &&
      (orgMembership.roles.includes("owner") ||
        orgMembership.roles.includes("general_manager"));

    if (isOverallPrivileged || isOrgManagement) {
      const activeLocs = await listActiveLocationsByOrganization(
        organizationId.trim(),
        supabase,
      );
      return activeLocs.map((loc) => ({
        id: loc.id,
        organizationId: loc.organizationId,
        name: loc.name,
        timeZone: loc.timeZone,
        active: loc.active,
        coverWeight: loc.coverWeight,
        openingLocal: loc.openingLocal,
        closingLocal: loc.closingLocal,
      }));
    }

    // For standard staff, query explicit active location assignments
    const { data: memberships, error: memError } = await supabase
      .from("location_memberships")
      .select(
        "location_id, active, locations!inner(id, organization_id, name, time_zone, active, cover_weight, opening_local, closing_local)",
      )
      .eq("profile_id", user.id)
      .eq("active", true)
      .eq("locations.organization_id", organizationId.trim())
      .eq("locations.active", true);

    if (memError || !memberships) return [];

    return memberships.map((m) => {
      const loc = m.locations as unknown as {
        id: string;
        organization_id: string;
        name: string;
        time_zone: string;
        active: boolean;
        cover_weight: number;
        opening_local: string;
        closing_local: string;
      };
      return {
        id: loc.id,
        organizationId: loc.organization_id,
        name: loc.name,
        timeZone: loc.time_zone,
        active: loc.active,
        coverWeight: loc.cover_weight,
        openingLocal: loc.opening_local,
        closingLocal: loc.closing_local,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Server-authoritative reader for a location's weekly operating hours.
 */
export async function getLocationOperatingHours(
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<DayOperatingHours[]> {
  if (!locationId || typeof locationId !== "string" || !locationId.trim()) {
    return [];
  }

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("operating_hours")
      .select(
        "id, organization_id, location_id, day_of_week, opening_local, closing_local, closed, created_at, updated_at",
      )
      .eq("location_id", locationId.trim())
      .order("day_of_week", { ascending: true });

    if (error || !data) return [];
    return data.map(mapOperatingHoursRow);
  } catch {
    return [];
  }
}
