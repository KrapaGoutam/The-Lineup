"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { attendanceModeSchema } from "../domain/attendance-mode";
import {
  getLocationAttendanceMode,
  setLocationAttendanceMode,
  type LocationAttendanceModeRecord,
} from "../data/attendance-mode-data";

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

const setModeInputSchema = z.object({
  locationId: locationIdSchema,
  mode: attendanceModeSchema,
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
  reason: z
    .string()
    .trim()
    .min(3, "Reason must be at least 3 characters.")
    .max(500)
    .nullable()
    .optional(),
});

export type SetAttendanceModeInput = z.infer<typeof setModeInputSchema>;

/**
 * Server Action: Read the attendance mode for a location.
 * Requires authenticated session and membership/assignment at the location.
 */
export async function getLocationAttendanceModeAction(
  locationId: string,
): Promise<ActionResult<LocationAttendanceModeRecord>> {
  try {
    const supabase = await createClient();
    const invalid = await requireLiveSession(supabase);
    if (invalid) {
      return invalid;
    }

    const parsed = locationIdSchema.safeParse(locationId);
    if (!parsed.success) {
      return { ok: false, error: "Invalid location ID." };
    }

    const result = await getLocationAttendanceMode(supabase, parsed.data);

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    return { ok: true, data: result.data };
  } catch (err: unknown) {
    console.error("getLocationAttendanceModeAction unexpected error", err);
    return { ok: false, error: "Failed to read location attendance mode." };
  }
}

/**
 * Server Action: Update the attendance mode for a location.
 * Restricted to administrators (Overall Owner/Manager, Org Owner/GM).
 * Auditable and protected against concurrent modification.
 */
export async function setLocationAttendanceModeAction(
  input: SetAttendanceModeInput,
): Promise<ActionResult<LocationAttendanceModeRecord>> {
  try {
    const supabase = await createClient();
    const invalid = await requireLiveSession(supabase);
    if (invalid) {
      return invalid;
    }

    const parsed = setModeInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid input parameters.",
      };
    }

    const result = await setLocationAttendanceMode(supabase, {
      locationId: parsed.data.locationId,
      mode: parsed.data.mode,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
      reason: parsed.data.reason,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath("/settings");
    revalidatePath("/attendance");

    return { ok: true, data: result.data };
  } catch (err: unknown) {
    console.error("setLocationAttendanceModeAction unexpected error", err);
    return { ok: false, error: "Failed to update location attendance mode." };
  }
}
