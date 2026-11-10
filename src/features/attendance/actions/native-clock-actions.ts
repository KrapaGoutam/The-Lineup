"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import {
  nativeBreakEnd,
  nativeBreakStart,
  nativeClockIn,
  nativeClockOut,
  getActiveAttendanceSession,
  type ClockOperationResponse,
} from "../data/native-attendance-data";
import type { AttendanceSessionModel } from "../domain/attendance-session";

export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: string;
      readonly sessionInvalid?: true;
    };

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const locationIdSchema = z
  .string()
  .trim()
  .regex(uuidRegex, "Invalid location ID");
const optionalProfileIdSchema = z
  .string()
  .trim()
  .regex(uuidRegex, "Invalid profile ID")
  .nullable()
  .optional();
const optionalIdempotencySchema = z.string().max(128).nullable().optional();
const optionalNotesSchema = z.string().max(500).nullable().optional();

const clockInputSchema = z.object({
  locationId: locationIdSchema,
  profileId: optionalProfileIdSchema,
  idempotencyKey: optionalIdempotencySchema,
  notes: optionalNotesSchema,
});

const breakInputSchema = z.object({
  locationId: locationIdSchema,
  profileId: optionalProfileIdSchema,
  idempotencyKey: optionalIdempotencySchema,
});

export type ClockActionInput = z.infer<typeof clockInputSchema>;
export type BreakActionInput = z.infer<typeof breakInputSchema>;

/**
 * Server Action: Clock in an employee to native internal attendance.
 */
export async function nativeClockInAction(
  input: ClockActionInput,
): Promise<ActionResult<ClockOperationResponse>> {
  try {
    const supabase = await createClient();
    const invalid = await requireLiveSession(supabase);
    if (invalid) {
      return invalid;
    }

    const parsed = clockInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid input.",
      };
    }

    const result = await nativeClockIn(supabase, {
      locationId: parsed.data.locationId,
      profileId: parsed.data.profileId,
      idempotencyKey: parsed.data.idempotencyKey,
      notes: parsed.data.notes,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath("/attendance");
    return { ok: true, data: result.data };
  } catch (err: unknown) {
    console.error("nativeClockInAction unexpected error", err);
    return { ok: false, error: "Clock-in failed unexpectedly." };
  }
}

/**
 * Server Action: Clock out an employee from native internal attendance.
 */
export async function nativeClockOutAction(
  input: ClockActionInput,
): Promise<ActionResult<ClockOperationResponse>> {
  try {
    const supabase = await createClient();
    const invalid = await requireLiveSession(supabase);
    if (invalid) {
      return invalid;
    }

    const parsed = clockInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid input.",
      };
    }

    const result = await nativeClockOut(supabase, {
      locationId: parsed.data.locationId,
      profileId: parsed.data.profileId,
      idempotencyKey: parsed.data.idempotencyKey,
      notes: parsed.data.notes,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath("/attendance");
    return { ok: true, data: result.data };
  } catch (err: unknown) {
    console.error("nativeClockOutAction unexpected error", err);
    return { ok: false, error: "Clock-out failed unexpectedly." };
  }
}

/**
 * Server Action: Start break on an open attendance session.
 */
export async function nativeBreakStartAction(
  input: BreakActionInput,
): Promise<ActionResult<ClockOperationResponse>> {
  try {
    const supabase = await createClient();
    const invalid = await requireLiveSession(supabase);
    if (invalid) {
      return invalid;
    }

    const parsed = breakInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid input.",
      };
    }

    const result = await nativeBreakStart(supabase, {
      locationId: parsed.data.locationId,
      profileId: parsed.data.profileId,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath("/attendance");
    return { ok: true, data: result.data };
  } catch (err: unknown) {
    console.error("nativeBreakStartAction unexpected error", err);
    return { ok: false, error: "Failed to start break." };
  }
}

/**
 * Server Action: End break on an attendance session.
 */
export async function nativeBreakEndAction(
  input: BreakActionInput,
): Promise<ActionResult<ClockOperationResponse>> {
  try {
    const supabase = await createClient();
    const invalid = await requireLiveSession(supabase);
    if (invalid) {
      return invalid;
    }

    const parsed = breakInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid input.",
      };
    }

    const result = await nativeBreakEnd(supabase, {
      locationId: parsed.data.locationId,
      profileId: parsed.data.profileId,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath("/attendance");
    return { ok: true, data: result.data };
  } catch (err: unknown) {
    console.error("nativeBreakEndAction unexpected error", err);
    return { ok: false, error: "Failed to end break." };
  }
}

/**
 * Server Action: Query an employee's currently active/on_break attendance session.
 */
export async function getActiveAttendanceSessionAction(input: {
  locationId: string;
  profileId: string;
}): Promise<ActionResult<AttendanceSessionModel | null>> {
  try {
    const supabase = await createClient();
    const invalid = await requireLiveSession(supabase);
    if (invalid) {
      return invalid;
    }

    const locationParsed = locationIdSchema.safeParse(input.locationId);
    const profileParsed = z
      .string()
      .trim()
      .regex(uuidRegex, "Invalid profile ID")
      .safeParse(input.profileId);
    if (!locationParsed.success || !profileParsed.success) {
      return { ok: false, error: "Invalid location or profile ID." };
    }

    const result = await getActiveAttendanceSession(supabase, {
      locationId: locationParsed.data,
      profileId: profileParsed.data,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return { ok: true, data: result.data };
  } catch (err: unknown) {
    console.error("getActiveAttendanceSessionAction unexpected error", err);
    return { ok: false, error: "Failed to query active session." };
  }
}
