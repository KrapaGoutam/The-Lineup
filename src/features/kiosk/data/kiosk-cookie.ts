import "server-only";

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  decryptAccessToken,
  encryptAccessToken,
  generateSessionToken,
  hashSessionToken,
  signSessionToken,
  verifySessionToken,
} from "./kiosk-crypto";

export {
  signSessionToken,
  verifySessionToken,
  encryptAccessToken,
  decryptAccessToken,
  getKioskSessionSecret,
} from "./kiosk-crypto";

export const KIOSK_DEVICE_COOKIE = "lineup_kiosk_device";
export const KIOSK_SESSION_COOKIE = "lineup_kiosk_session";

export interface KioskEmployeeSession {
  readonly profileId: string;
  readonly displayName: string;
  readonly deviceId: string;
  readonly organizationId: string;
  readonly locationId: string;
  readonly accessToken: string;
  readonly expiresAt: number; // Unix timestamp in ms
}

/**
 * Reads the device bearer token from cookies.
 */
export async function getKioskDeviceCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(KIOSK_DEVICE_COOKIE)?.value?.trim() || null;
}

/**
 * Sets the long-lived device credential cookie (1 year).
 */
export async function setKioskDeviceCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(KIOSK_DEVICE_COOKIE, token.trim(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}

/**
 * Clears the device credential cookie.
 */
export async function clearKioskDeviceCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(KIOSK_DEVICE_COOKIE);
}

/**
 * Creates a server-side ephemeral employee session (3-minute TTL).
 * Stores the encrypted access token in PostgreSQL table `kiosk_sessions`.
 * Sets an opaque HMAC-signed session cookie in the browser.
 * Zero JWT/tokens are ever exposed to browser JavaScript or client cookies.
 */
export async function setKioskSessionCookie(
  admin: SupabaseClient<Database>,
  session: Omit<KioskEmployeeSession, "expiresAt">,
): Promise<void> {
  const sessionToken = generateSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const encryptedToken = encryptAccessToken(session.accessToken);
  const expiresAtMs = Date.now() + 3 * 60_000;
  const expiresAtIso = new Date(expiresAtMs).toISOString();

  // Purge any existing sessions for this device
  await admin.from("kiosk_sessions").delete().eq("device_id", session.deviceId);

  // Persist session server-side with encrypted JWT
  const { error } = await admin.from("kiosk_sessions").insert({
    session_token_hash: tokenHash,
    device_id: session.deviceId,
    organization_id: session.organizationId,
    location_id: session.locationId,
    profile_id: session.profileId,
    display_name: session.displayName,
    encrypted_access_token: encryptedToken,
    expires_at: expiresAtIso,
  });

  if (error) {
    console.error("setKioskSessionCookie insert error", error);
    throw new Error("Failed to persist server session.");
  }

  // Set signed opaque cookie in browser
  const signedCookieValue = signSessionToken(sessionToken);
  const cookieStore = await cookies();
  cookieStore.set(KIOSK_SESSION_COOKIE, signedCookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 180, // 3 minutes
  });
}

/**
 * Reads and verifies the current active employee kiosk session.
 * Looks up the session row in PostgreSQL by token hash, confirms expiration,
 * and decrypts the in-memory access token.
 */
export async function getKioskSessionCookie(
  admin: SupabaseClient<Database>,
): Promise<KioskEmployeeSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(KIOSK_SESSION_COOKIE)?.value?.trim();
  if (!raw) return null;

  const rawToken = verifySessionToken(raw);
  if (!rawToken) {
    // Cookie signature was tampered or invalid -> purge cookie
    await clearKioskSessionCookie(admin);
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);

  const { data, error } = await admin
    .from("kiosk_sessions")
    .select(
      "device_id, organization_id, location_id, profile_id, display_name, encrypted_access_token, expires_at",
    )
    .eq("session_token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    await clearKioskSessionCookie(admin);
    return null;
  }

  const decryptedToken = decryptAccessToken(data.encrypted_access_token);
  if (!decryptedToken) {
    await clearKioskSessionCookie(admin);
    return null;
  }

  return {
    profileId: data.profile_id,
    displayName: data.display_name,
    deviceId: data.device_id,
    organizationId: data.organization_id,
    locationId: data.location_id,
    accessToken: decryptedToken,
    expiresAt: new Date(data.expires_at).getTime(),
  };
}

/**
 * Immediately purges the employee kiosk session both from server database
 * and browser cookies.
 */
export async function clearKioskSessionCookie(
  admin?: SupabaseClient<Database>,
): Promise<void> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(KIOSK_SESSION_COOKIE)?.value?.trim();
    if (raw && admin) {
      const rawToken = verifySessionToken(raw);
      if (rawToken) {
        const tokenHash = hashSessionToken(rawToken);
        await admin
          .from("kiosk_sessions")
          .delete()
          .eq("session_token_hash", tokenHash);
      }
    }
    cookieStore.delete(KIOSK_SESSION_COOKIE);
  } catch {
    // Ignore errors during cookie deletion
  }
}
