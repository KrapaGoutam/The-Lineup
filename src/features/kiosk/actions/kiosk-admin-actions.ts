"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import {
  createKioskPairingCode,
  listKioskDevicesForLocation,
  reassignKioskDevice,
  renameKioskDevice,
  revokeKioskDevice,
} from "../data/kiosk-device-data";
import type { KioskDevice, KioskPairingResult } from "../domain/kiosk-device";

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
const deviceIdSchema = z.string().trim().regex(uuidRegex, "Invalid device ID");
const deviceNameSchema = z
  .string()
  .trim()
  .min(1, "Name required")
  .max(100, "Name too long");

/**
 * Lists all kiosk devices for a location (Manager only).
 */
export async function listKioskDevicesAction(input: {
  readonly locationId: string;
}): Promise<ActionResult<readonly KioskDevice[]>> {
  try {
    const supabase = await createClient();
    const invalid = await requireLiveSession(supabase);
    if (invalid) return invalid;

    const parsed = locationIdSchema.safeParse(input.locationId);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid location ID.",
      };
    }

    const res = await listKioskDevicesForLocation(supabase, parsed.data);
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    return { ok: true, data: res.data };
  } catch (err: unknown) {
    console.error("listKioskDevicesAction unexpected error", err);
    return { ok: false, error: "Failed to list kiosk devices." };
  }
}

/**
 * Generates a short-lived pairing code for a tablet at this location (Manager only).
 */
export async function generateKioskPairingCodeAction(input: {
  readonly locationId: string;
  readonly deviceName: string;
}): Promise<ActionResult<KioskPairingResult>> {
  try {
    const supabase = await createClient();
    const invalid = await requireLiveSession(supabase);
    if (invalid) return invalid;

    const locationParsed = locationIdSchema.safeParse(input.locationId);
    const nameParsed = deviceNameSchema.safeParse(input.deviceName);
    if (!locationParsed.success || !nameParsed.success) {
      return { ok: false, error: "Invalid location or device name." };
    }

    const res = await createKioskPairingCode(supabase, {
      locationId: locationParsed.data,
      deviceName: nameParsed.data,
    });

    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    revalidatePath("/settings");
    return { ok: true, data: res.data };
  } catch (err: unknown) {
    console.error("generateKioskPairingCodeAction unexpected error", err);
    return { ok: false, error: "Failed to generate pairing code." };
  }
}

/**
 * Renames a kiosk device (Manager only).
 */
export async function renameKioskDeviceAction(input: {
  readonly deviceId: string;
  readonly name: string;
}): Promise<
  ActionResult<{ readonly deviceId: string; readonly name: string }>
> {
  try {
    const supabase = await createClient();
    const invalid = await requireLiveSession(supabase);
    if (invalid) return invalid;

    const deviceParsed = deviceIdSchema.safeParse(input.deviceId);
    const nameParsed = deviceNameSchema.safeParse(input.name);
    if (!deviceParsed.success || !nameParsed.success) {
      return { ok: false, error: "Invalid device ID or name." };
    }

    const res = await renameKioskDevice(supabase, {
      deviceId: deviceParsed.data,
      name: nameParsed.data,
    });

    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    revalidatePath("/settings");
    return { ok: true, data: res.data };
  } catch (err: unknown) {
    console.error("renameKioskDeviceAction unexpected error", err);
    return { ok: false, error: "Failed to rename device." };
  }
}

/**
 * Reassigns a kiosk device to a new location in the organization (Manager only).
 */
export async function reassignKioskDeviceAction(input: {
  readonly deviceId: string;
  readonly newLocationId: string;
}): Promise<
  ActionResult<{ readonly deviceId: string; readonly locationId: string }>
> {
  try {
    const supabase = await createClient();
    const invalid = await requireLiveSession(supabase);
    if (invalid) return invalid;

    const deviceParsed = deviceIdSchema.safeParse(input.deviceId);
    const locParsed = locationIdSchema.safeParse(input.newLocationId);
    if (!deviceParsed.success || !locParsed.success) {
      return { ok: false, error: "Invalid device or location ID." };
    }

    const res = await reassignKioskDevice(supabase, {
      deviceId: deviceParsed.data,
      newLocationId: locParsed.data,
    });

    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    revalidatePath("/settings");
    return { ok: true, data: res.data };
  } catch (err: unknown) {
    console.error("reassignKioskDeviceAction unexpected error", err);
    return { ok: false, error: "Failed to reassign device." };
  }
}

/**
 * Revokes a kiosk device's credentials (Manager only).
 */
export async function revokeKioskDeviceAction(input: {
  readonly deviceId: string;
  readonly reason?: string;
}): Promise<
  ActionResult<{ readonly deviceId: string; readonly status: "revoked" }>
> {
  try {
    const supabase = await createClient();
    const invalid = await requireLiveSession(supabase);
    if (invalid) return invalid;

    const deviceParsed = deviceIdSchema.safeParse(input.deviceId);
    if (!deviceParsed.success) {
      return { ok: false, error: "Invalid device ID." };
    }

    const reason = input.reason?.trim();
    if (!reason || reason.length < 3) {
      return {
        ok: false,
        error: "Revocation reason must be at least 3 characters.",
      };
    }

    const res = await revokeKioskDevice(supabase, {
      deviceId: deviceParsed.data,
      reason,
    });

    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    revalidatePath("/settings");
    return { ok: true, data: res.data };
  } catch (err: unknown) {
    console.error("revokeKioskDeviceAction unexpected error", err);
    return { ok: false, error: "Failed to revoke device." };
  }
}
