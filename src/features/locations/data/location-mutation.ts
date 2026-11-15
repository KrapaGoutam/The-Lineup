import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type {
  DayOperatingHours,
  Location,
  LocationAddress,
} from "@/features/locations/domain/location";
import {
  isValidIanaTimeZone,
  isValidLocalTimeString,
  isValidLocationName,
  mapLocationRow,
  normalizeLocationAddress,
  normalizeLocationName,
  validateDayOperatingHours,
  validateLocationAddress,
} from "@/features/locations/domain/location";
import { createClient } from "@/lib/supabase/server";

export interface ProvisionLocationParams {
  readonly organizationId: string;
  readonly name: string;
  readonly timeZone?: string;
  readonly address?: LocationAddress;
  readonly coverWeight?: number;
  readonly openingLocal?: string;
  readonly closingLocal?: string;
}

export interface UpdateLocationParams {
  readonly locationId: string;
  readonly name?: string;
  readonly timeZone?: string;
  readonly address?: LocationAddress;
  readonly coverWeight?: number;
  readonly openingLocal?: string;
  readonly closingLocal?: string;
}

export interface UpdateOperatingHoursParams {
  readonly locationId: string;
  readonly organizationId: string;
  readonly operatingHours: readonly DayOperatingHours[];
}

export type MutationResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string; readonly code?: string };

/**
 * Server-authoritative mutation to provision a new location under an existing organization.
 * Enforces management authority, IANA time zone validation, address structure, and name uniqueness.
 */
export async function provisionNewLocation(
  params: ProvisionLocationParams,
  client?: SupabaseClient<Database>,
): Promise<MutationResult<Location>> {
  if (
    !params.organizationId ||
    typeof params.organizationId !== "string" ||
    !params.organizationId.trim()
  ) {
    return {
      success: false,
      error: "Valid organization ID is required.",
      code: "INVALID_ORGANIZATION_ID",
    };
  }

  const name = normalizeLocationName(params.name);
  if (!isValidLocationName(name)) {
    return {
      success: false,
      error: "Location name must be between 1 and 120 characters.",
      code: "INVALID_NAME",
    };
  }

  const timeZone = params.timeZone?.trim() || "UTC";
  if (!isValidIanaTimeZone(timeZone)) {
    return {
      success: false,
      error: `Invalid or ambiguous IANA time zone: '${timeZone}'.`,
      code: "INVALID_TIME_ZONE",
    };
  }

  const address = normalizeLocationAddress(params.address);
  const addressValidation = validateLocationAddress(address);
  if (!addressValidation.valid) {
    return {
      success: false,
      error: addressValidation.errors.join("; "),
      code: "INVALID_ADDRESS",
    };
  }

  const coverWeight =
    params.coverWeight !== undefined ? Number(params.coverWeight) : 0.25;
  if (Number.isNaN(coverWeight) || coverWeight < 0 || coverWeight > 10) {
    return {
      success: false,
      error: "Cover weight must be a number between 0 and 10.",
      code: "INVALID_COVER_WEIGHT",
    };
  }

  const openingLocal = params.openingLocal?.trim() || "11:00";
  const closingLocal = params.closingLocal?.trim() || "23:00";
  if (
    !isValidLocalTimeString(openingLocal) ||
    !isValidLocalTimeString(closingLocal)
  ) {
    return {
      success: false,
      error: "Opening and closing local times must be valid 24h times (HH:mm).",
      code: "INVALID_TIMES",
    };
  }

  if (openingLocal === closingLocal) {
    return {
      success: false,
      error: "Opening and closing times cannot be identical.",
      code: "IDENTICAL_TIMES",
    };
  }

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase.rpc("provision_location", {
      p_organization_id: params.organizationId.trim(),
      p_name: name,
      p_time_zone: timeZone,
      p_address:
        address as unknown as Database["public"]["Tables"]["locations"]["Insert"]["address"],
      p_cover_weight: coverWeight,
      p_opening_local: openingLocal,
      p_closing_local: closingLocal,
    });

    if (error || !data) {
      return {
        success: false,
        error: error?.message || "Failed to provision location.",
        code: error?.code,
      };
    }

    return {
      success: true,
      data: mapLocationRow(
        data as unknown as Parameters<typeof mapLocationRow>[0],
      ),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Unknown error during provisioning.",
    };
  }
}

/**
 * Server-authoritative mutation to update permitted location metadata.
 * Prohibits changing id, organization_id, created_at, or lifecycle active flag via metadata patch.
 */
export async function updateLocationMetadata(
  params: UpdateLocationParams,
  client?: SupabaseClient<Database>,
): Promise<MutationResult<Location>> {
  if (
    !params.locationId ||
    typeof params.locationId !== "string" ||
    !params.locationId.trim()
  ) {
    return {
      success: false,
      error: "Location ID is required.",
      code: "INVALID_LOCATION_ID",
    };
  }

  try {
    const supabase = client ?? (await createClient());

    // 1. Fetch current location row
    const { data: current, error: fetchError } = await supabase
      .from("locations")
      .select(
        "id, organization_id, name, time_zone, address, cover_weight, active, archived_at, opening_local, closing_local, attendance_mode, created_at, updated_at",
      )
      .eq("id", params.locationId.trim())
      .maybeSingle();

    if (fetchError || !current) {
      return {
        success: false,
        error: "Location not found or access denied.",
        code: "NOT_FOUND",
      };
    }

    // 2. Prepare and validate update fields
    const updates: Database["public"]["Tables"]["locations"]["Update"] = {};

    if (params.name !== undefined) {
      const name = normalizeLocationName(params.name);
      if (!isValidLocationName(name)) {
        return {
          success: false,
          error: "Location name must be between 1 and 120 characters.",
          code: "INVALID_NAME",
        };
      }
      updates.name = name;
    }

    if (params.timeZone !== undefined) {
      const timeZone = params.timeZone.trim();
      if (!isValidIanaTimeZone(timeZone)) {
        return {
          success: false,
          error: `Invalid or ambiguous IANA time zone: '${timeZone}'.`,
          code: "INVALID_TIME_ZONE",
        };
      }
      updates.time_zone = timeZone;
    }

    if (params.address !== undefined) {
      const mergedAddress = {
        ...(typeof current.address === "object" && current.address !== null
          ? (current.address as Record<string, unknown>)
          : {}),
        ...params.address,
      };
      const validation = validateLocationAddress(mergedAddress);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join("; "),
          code: "INVALID_ADDRESS",
        };
      }
      updates.address = normalizeLocationAddress(
        mergedAddress as LocationAddress,
      ) as unknown as Database["public"]["Tables"]["locations"]["Update"]["address"];
    }

    if (params.coverWeight !== undefined) {
      const weight = Number(params.coverWeight);
      if (Number.isNaN(weight) || weight < 0 || weight > 10) {
        return {
          success: false,
          error: "Cover weight must be a number between 0 and 10.",
          code: "INVALID_COVER_WEIGHT",
        };
      }
      updates.cover_weight = weight;
    }

    if (params.openingLocal !== undefined) {
      const op = params.openingLocal.trim();
      if (!isValidLocalTimeString(op)) {
        return {
          success: false,
          error: "Opening time must be a valid 24h time format (HH:mm).",
          code: "INVALID_OPENING_TIME",
        };
      }
      updates.opening_local = op;
    }

    if (params.closingLocal !== undefined) {
      const cl = params.closingLocal.trim();
      if (!isValidLocalTimeString(cl)) {
        return {
          success: false,
          error: "Closing time must be a valid 24h time format (HH:mm).",
          code: "INVALID_CLOSING_TIME",
        };
      }
      updates.closing_local = cl;
    }

    const effectiveOpening =
      (updates.opening_local as string | undefined) ?? current.opening_local;
    const effectiveClosing =
      (updates.closing_local as string | undefined) ?? current.closing_local;
    if (effectiveOpening === effectiveClosing) {
      return {
        success: false,
        error: "Opening and closing times cannot be identical.",
        code: "IDENTICAL_TIMES",
      };
    }

    if (Object.keys(updates).length === 0) {
      return {
        success: true,
        data: mapLocationRow(current),
      };
    }

    // 3. Persist update
    const { data: updated, error: updateError } = await supabase
      .from("locations")
      .update(updates)
      .eq("id", params.locationId.trim())
      .select(
        "id, organization_id, name, time_zone, address, cover_weight, active, archived_at, opening_local, closing_local, attendance_mode, created_at, updated_at",
      )
      .single();

    if (updateError || !updated) {
      return {
        success: false,
        error: updateError?.message || "Failed to update location metadata.",
        code: updateError?.code,
      };
    }

    return {
      success: true,
      data: mapLocationRow(updated),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Unknown error during location update.",
    };
  }
}

/**
 * Server-authoritative mutation to upsert weekly operating hours for a location.
 * Validates weekday bounds (0–6), local time strings, and closed vs open semantics.
 */
export async function updateLocationOperatingHours(
  params: UpdateOperatingHoursParams,
  client?: SupabaseClient<Database>,
): Promise<MutationResult<DayOperatingHours[]>> {
  if (
    !params.locationId ||
    !params.organizationId ||
    !Array.isArray(params.operatingHours)
  ) {
    return {
      success: false,
      error:
        "Location ID, organization ID, and operating hours array are required.",
      code: "INVALID_INPUT",
    };
  }

  // Validate each day's entry
  for (const day of params.operatingHours) {
    const val = validateDayOperatingHours(day);
    if (!val.valid) {
      return {
        success: false,
        error: `Day ${day.dayOfWeek} error: ${val.errors.join("; ")}`,
        code: "INVALID_OPERATING_HOURS",
      };
    }
  }

  try {
    const supabase = client ?? (await createClient());

    const rowsToUpsert = params.operatingHours.map((d) => ({
      organization_id: params.organizationId.trim(),
      location_id: params.locationId.trim(),
      day_of_week: d.dayOfWeek,
      opening_local: d.closed ? null : d.openingLocal,
      closing_local: d.closed ? null : d.closingLocal,
      closed: d.closed,
    }));

    const { data, error } = await supabase
      .from("operating_hours")
      .upsert(rowsToUpsert, { onConflict: "location_id,day_of_week" })
      .select(
        "id, organization_id, location_id, day_of_week, opening_local, closing_local, closed, created_at, updated_at",
      );

    if (error || !data) {
      return {
        success: false,
        error: error?.message || "Failed to upsert operating hours.",
        code: error?.code,
      };
    }

    return {
      success: true,
      data: data.map((r) => ({
        dayOfWeek: r.day_of_week,
        openingLocal: r.opening_local,
        closingLocal: r.closing_local,
        closed: r.closed,
        isOvernight:
          !r.closed && r.opening_local && r.closing_local
            ? r.closing_local < r.opening_local
            : false,
      })),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Unknown error during operating hours update.",
    };
  }
}
