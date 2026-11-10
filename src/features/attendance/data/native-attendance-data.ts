import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type {
  AttendanceSessionModel,
  AttendanceSessionStatus,
} from "../domain/attendance-session";

export type NativeAttendanceResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: string;
      readonly code?:
        | "unauthorized"
        | "not_found"
        | "already_open"
        | "invalid_transition"
        | "unexpected";
    };

export interface ClockOperationResponse {
  readonly success: boolean;
  readonly idempotent: boolean;
  readonly sessionId: string;
  readonly eventId: number;
  readonly status: AttendanceSessionStatus;
  readonly clockInAt?: string | null;
  readonly clockOutAt?: string | null;
  readonly breakStartAt?: string | null;
  readonly totalWorkedSeconds?: number | null;
  readonly totalBreakSeconds?: number | null;
  readonly serviceDate?: string | null;
}

export interface NativeClockInParams {
  readonly locationId: string;
  readonly profileId?: string | null;
  readonly idempotencyKey?: string | null;
  readonly notes?: string | null;
}

export async function nativeClockIn(
  supabase: SupabaseClient<Database>,
  params: NativeClockInParams,
): Promise<NativeAttendanceResult<ClockOperationResponse>> {
  try {
    const { data, error } = await supabase.rpc("attendance_clock_in", {
      p_location_id: params.locationId,
      p_profile_id: params.profileId ?? undefined,
      p_idempotency_key: params.idempotencyKey ?? undefined,
      p_notes: params.notes ?? undefined,
    });

    if (error) {
      console.error("nativeClockIn error", error);
      if (error.code === "42501") {
        return { ok: false, error: error.message, code: "unauthorized" };
      }
      if (error.code === "23505") {
        return { ok: false, error: error.message, code: "already_open" };
      }
      if (error.code === "P0002") {
        return { ok: false, error: error.message, code: "not_found" };
      }
      return {
        ok: false,
        error: error.message || "Clock-in failed.",
        code: "unexpected",
      };
    }

    const res = data as unknown as ClockOperationResponse;
    return { ok: true, data: res };
  } catch (err: unknown) {
    console.error("nativeClockIn unexpected error", err);
    return {
      ok: false,
      error: "Unexpected error during clock-in.",
      code: "unexpected",
    };
  }
}

export interface NativeClockOutParams {
  readonly locationId: string;
  readonly profileId?: string | null;
  readonly idempotencyKey?: string | null;
  readonly notes?: string | null;
}

export async function nativeClockOut(
  supabase: SupabaseClient<Database>,
  params: NativeClockOutParams,
): Promise<NativeAttendanceResult<ClockOperationResponse>> {
  try {
    const { data, error } = await supabase.rpc("attendance_clock_out", {
      p_location_id: params.locationId,
      p_profile_id: params.profileId ?? undefined,
      p_idempotency_key: params.idempotencyKey ?? undefined,
      p_notes: params.notes ?? undefined,
    });

    if (error) {
      console.error("nativeClockOut error", error);
      if (error.code === "42501") {
        return { ok: false, error: error.message, code: "unauthorized" };
      }
      if (error.code === "P0002") {
        return { ok: false, error: error.message, code: "not_found" };
      }
      return {
        ok: false,
        error: error.message || "Clock-out failed.",
        code: "unexpected",
      };
    }

    const res = data as unknown as ClockOperationResponse;
    return { ok: true, data: res };
  } catch (err: unknown) {
    console.error("nativeClockOut unexpected error", err);
    return {
      ok: false,
      error: "Unexpected error during clock-out.",
      code: "unexpected",
    };
  }
}

export interface NativeBreakParams {
  readonly locationId: string;
  readonly profileId?: string | null;
  readonly idempotencyKey?: string | null;
}

export async function nativeBreakStart(
  supabase: SupabaseClient<Database>,
  params: NativeBreakParams,
): Promise<NativeAttendanceResult<ClockOperationResponse>> {
  try {
    const { data, error } = await supabase.rpc("attendance_break_start", {
      p_location_id: params.locationId,
      p_profile_id: params.profileId ?? undefined,
      p_idempotency_key: params.idempotencyKey ?? undefined,
    });

    if (error) {
      console.error("nativeBreakStart error", error);
      if (error.code === "42501") {
        return { ok: false, error: error.message, code: "unauthorized" };
      }
      if (error.code === "22023") {
        return { ok: false, error: error.message, code: "invalid_transition" };
      }
      if (error.code === "P0002") {
        return { ok: false, error: error.message, code: "not_found" };
      }
      return {
        ok: false,
        error: error.message || "Failed to start break.",
        code: "unexpected",
      };
    }

    const res = data as unknown as ClockOperationResponse;
    return { ok: true, data: res };
  } catch (err: unknown) {
    console.error("nativeBreakStart unexpected error", err);
    return {
      ok: false,
      error: "Unexpected error starting break.",
      code: "unexpected",
    };
  }
}

export async function nativeBreakEnd(
  supabase: SupabaseClient<Database>,
  params: NativeBreakParams,
): Promise<NativeAttendanceResult<ClockOperationResponse>> {
  try {
    const { data, error } = await supabase.rpc("attendance_break_end", {
      p_location_id: params.locationId,
      p_profile_id: params.profileId ?? undefined,
      p_idempotency_key: params.idempotencyKey ?? undefined,
    });

    if (error) {
      console.error("nativeBreakEnd error", error);
      if (error.code === "42501") {
        return { ok: false, error: error.message, code: "unauthorized" };
      }
      if (error.code === "22023") {
        return { ok: false, error: error.message, code: "invalid_transition" };
      }
      if (error.code === "P0002") {
        return { ok: false, error: error.message, code: "not_found" };
      }
      return {
        ok: false,
        error: error.message || "Failed to end break.",
        code: "unexpected",
      };
    }

    const res = data as unknown as ClockOperationResponse;
    return { ok: true, data: res };
  } catch (err: unknown) {
    console.error("nativeBreakEnd unexpected error", err);
    return {
      ok: false,
      error: "Unexpected error ending break.",
      code: "unexpected",
    };
  }
}

/**
 * Reads the currently active or on_break session for an employee at a location, if any.
 */
export async function getActiveAttendanceSession(
  supabase: SupabaseClient<Database>,
  params: { locationId: string; profileId: string },
): Promise<NativeAttendanceResult<AttendanceSessionModel | null>> {
  try {
    const { data, error } = await supabase
      .from("attendance_sessions")
      .select("*")
      .eq("location_id", params.locationId)
      .eq("profile_id", params.profileId)
      .in("status", ["active", "on_break"])
      .maybeSingle();

    if (error) {
      console.error("getActiveAttendanceSession error", error);
      return {
        ok: false,
        error: "Unable to query active attendance session.",
        code: error.code === "42501" ? "unauthorized" : "unexpected",
      };
    }

    if (!data) {
      return { ok: true, data: null };
    }

    return {
      ok: true,
      data: {
        id: data.id,
        organizationId: data.organization_id,
        locationId: data.location_id,
        profileId: data.profile_id,
        serviceDate: data.service_date,
        status: data.status,
        clockInAt: data.clock_in_at,
        clockOutAt: data.clock_out_at,
        totalBreakSeconds: data.total_break_seconds,
        totalWorkedSeconds: data.total_worked_seconds,
        createdBy: data.created_by,
        updatedBy: data.updated_by,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    };
  } catch (err: unknown) {
    console.error("getActiveAttendanceSession unexpected error", err);
    return {
      ok: false,
      error: "Unexpected error checking active attendance session.",
      code: "unexpected",
    };
  }
}
