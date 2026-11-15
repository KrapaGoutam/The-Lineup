import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  resolveAttendanceMode,
  toDbAttendanceMode,
  type AttendanceMode,
} from "../domain/attendance-mode";

export type AttendanceModeDataResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: string;
      readonly code?:
        | "not_found"
        | "unauthorized"
        | "conflict"
        | "archived"
        | "open_sessions"
        | "invalid_input"
        | "unexpected";
    };

export interface LocationAttendanceModeRecord {
  readonly locationId: string;
  readonly organizationId: string;
  readonly mode: AttendanceMode;
  readonly isConfigured: boolean;
  readonly updatedAt: string;
  readonly timeZone: string;
}

/**
 * Reads the attendance mode configuration for a specific location.
 * Tenant-scoped via RLS on locations.
 */
export async function getLocationAttendanceMode(
  supabase: SupabaseClient<Database>,
  locationId: string,
): Promise<AttendanceModeDataResult<LocationAttendanceModeRecord>> {
  try {
    const { data, error } = await supabase
      .from("locations")
      .select("id, organization_id, attendance_mode, updated_at, time_zone")
      .eq("id", locationId)
      .maybeSingle();

    if (error) {
      console.error("getLocationAttendanceMode error", error);
      return {
        ok: false,
        error: "Unable to read location attendance mode.",
        code: error.code === "42501" ? "unauthorized" : "unexpected",
      };
    }

    if (!data) {
      return {
        ok: false,
        error: "Location not found or access denied.",
        code: "not_found",
      };
    }

    const resolved = resolveAttendanceMode(data.attendance_mode);

    return {
      ok: true,
      data: {
        locationId: data.id,
        organizationId: data.organization_id,
        mode: resolved.mode,
        isConfigured: resolved.isConfigured,
        updatedAt: data.updated_at,
        timeZone: data.time_zone,
      },
    };
  } catch (err: unknown) {
    console.error("getLocationAttendanceMode unexpected error", err);
    return {
      ok: false,
      error: "Unexpected error reading location attendance mode.",
      code: "unexpected",
    };
  }
}

export interface SetLocationAttendanceModeParams {
  readonly locationId: string;
  readonly mode: AttendanceMode;
  readonly expectedUpdatedAt?: string | null;
  readonly reason?: string | null;
}

/**
 * Mutates location attendance mode through the atomic database RPC.
 * Auditable and concurrency safe.
 */
export async function setLocationAttendanceMode(
  supabase: SupabaseClient<Database>,
  params: SetLocationAttendanceModeParams,
): Promise<AttendanceModeDataResult<LocationAttendanceModeRecord>> {
  try {
    const dbMode = toDbAttendanceMode(params.mode);

    const { data, error } = await supabase.rpc("set_location_attendance_mode", {
      p_location_id: params.locationId,
      p_mode: dbMode,
      p_expected_updated_at: params.expectedUpdatedAt ?? undefined,
      p_reason: params.reason ?? undefined,
    });

    if (error) {
      console.error("setLocationAttendanceMode error", error);
      if (error.code === "42501") {
        return {
          ok: false,
          error: "Unauthorized to configure attendance mode for this location.",
          code: "unauthorized",
        };
      }
      if (error.code === "55000") {
        if (/open attendance sessions/i.test(error.message ?? "")) {
          return {
            ok: false,
            error:
              "Close all open attendance sessions before leaving internal attendance mode.",
            code: "open_sessions",
          };
        }
        return {
          ok: false,
          error:
            "Cannot configure attendance mode on archived or inactive location.",
          code: "archived",
        };
      }
      if (error.code === "22023") {
        return {
          ok: false,
          error: "Reason must be between 3 and 500 characters.",
          code: "invalid_input",
        };
      }
      if (error.code === "P0004") {
        return {
          ok: false,
          error:
            "Configuration conflict: location was modified by another operation.",
          code: "conflict",
        };
      }
      if (error.code === "P0002") {
        return {
          ok: false,
          error: "Location not found.",
          code: "not_found",
        };
      }
      return {
        ok: false,
        error: error.message || "Failed to update attendance mode.",
        code: "unexpected",
      };
    }

    if (!data) {
      return {
        ok: false,
        error: "No data returned from attendance mode configuration.",
        code: "unexpected",
      };
    }

    const resolved = resolveAttendanceMode(data.attendance_mode);

    return {
      ok: true,
      data: {
        locationId: data.id,
        organizationId: data.organization_id,
        mode: resolved.mode,
        isConfigured: resolved.isConfigured,
        updatedAt: data.updated_at,
        timeZone: data.time_zone,
      },
    };
  } catch (err: unknown) {
    console.error("setLocationAttendanceMode unexpected error", err);
    return {
      ok: false,
      error: "Unexpected error updating location attendance mode.",
      code: "unexpected",
    };
  }
}
