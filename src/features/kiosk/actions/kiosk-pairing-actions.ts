"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clearKioskDeviceCookie,
  clearKioskSessionCookie,
  getKioskDeviceCookie,
  setKioskDeviceCookie,
} from "../data/kiosk-cookie";
import {
  consumeKioskPairingCode,
  getKioskDeviceByToken,
} from "../data/kiosk-device-data";
import {
  isValidPairingCodeFormat,
  normalizePairingCode,
  type KioskActiveContext,
} from "../domain/kiosk-device";

export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string; readonly code?: string };

const pairingCodeSchema = z
  .string()
  .trim()
  .refine(
    isValidPairingCodeFormat,
    "Pairing code must be 6 alphanumeric characters",
  );

/**
 * Pairs an unregistered kiosk tablet using a 6-character manager-issued pairing code.
 */
export async function pairKioskDeviceAction(input: {
  readonly pairingCode: string;
}): Promise<ActionResult<KioskActiveContext>> {
  try {
    const parsed = pairingCodeSchema.safeParse(input.pairingCode);
    if (!parsed.success) {
      return {
        ok: false,
        error:
          parsed.error.issues[0]?.message || "Invalid pairing code format.",
      };
    }

    let clientIdentifier = "kiosk-tablet";
    try {
      const headerList = await headers();
      const ip =
        headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        headerList.get("x-real-ip");
      if (ip) {
        clientIdentifier = `ip:${ip}`;
      }
    } catch {
      // In tests or non-request contexts
    }

    const admin = createAdminClient();
    const res = await consumeKioskPairingCode(admin, {
      pairingCode: normalizePairingCode(parsed.data),
      clientIdentifier,
    });

    if (!res.ok) {
      return { ok: false, error: res.error, code: res.code };
    }

    // Securely persist device bearer token in HttpOnly cookie
    await setKioskDeviceCookie(res.data.token);
    // Clear any leftover employee session
    await clearKioskSessionCookie(admin);

    return { ok: true, data: res.data.context };
  } catch (err: unknown) {
    console.error("pairKioskDeviceAction unexpected error", err);
    return { ok: false, error: "Failed to pair device." };
  }
}

/**
 * Checks the current device registration status from its persistent cookie.
 */
export async function getKioskDeviceStatusAction(): Promise<
  ActionResult<{
    readonly paired: boolean;
    readonly context: KioskActiveContext | null;
  }>
> {
  try {
    const token = await getKioskDeviceCookie();
    if (!token) {
      return { ok: true, data: { paired: false, context: null } };
    }

    const admin = createAdminClient();
    const res = await getKioskDeviceByToken(admin, token);
    if (!res.ok || !res.data) {
      // Device token invalid, revoked, or location archived -> clear stale cookie
      await clearKioskDeviceCookie();
      await clearKioskSessionCookie(admin);
      return { ok: true, data: { paired: false, context: null } };
    }

    return { ok: true, data: { paired: true, context: res.data } };
  } catch (err: unknown) {
    console.error("getKioskDeviceStatusAction unexpected error", err);
    return { ok: false, error: "Failed to check kiosk device status." };
  }
}

/**
 * Unpairs the current device from this browser/tablet by clearing local credentials.
 */
export async function unpairKioskDeviceAction(): Promise<
  ActionResult<{ readonly success: true }>
> {
  try {
    const admin = createAdminClient();
    await clearKioskDeviceCookie();
    await clearKioskSessionCookie(admin);
    return { ok: true, data: { success: true } };
  } catch (err: unknown) {
    console.error("unpairKioskDeviceAction unexpected error", err);
    return { ok: false, error: "Failed to unpair device." };
  }
}
