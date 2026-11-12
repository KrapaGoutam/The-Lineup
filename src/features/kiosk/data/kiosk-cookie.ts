import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

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

function getSessionSecret(): string {
  const secret =
    process.env.APP_PIN_PEPPER ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "insecure-fallback-secret-for-tests-only-min-32-chars";
  return secret;
}

/**
 * Signs a KioskEmployeeSession object into an authenticated token.
 */
export function signKioskSession(session: KioskEmployeeSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHmac("sha256", getSessionSecret())
    .update(`kiosk-session:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Verifies and parses an authenticated KioskEmployeeSession token.
 * Returns null if the token is tampered, malformed, or expired.
 */
export function verifyKioskSession(token: string): KioskEmployeeSession | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expectedSignature = createHmac("sha256", getSessionSecret())
      .update(`kiosk-session:${payload}`)
      .digest("base64url");

    if (
      signature.length !== expectedSignature.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
    ) {
      return null;
    }

    const json = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as KioskEmployeeSession;
    if (
      !json ||
      typeof json.expiresAt !== "number" ||
      json.expiresAt < Date.now()
    ) {
      return null;
    }

    return json;
  } catch {
    return null;
  }
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
 * Reads and verifies the current active employee kiosk session.
 */
export async function getKioskSessionCookie(): Promise<KioskEmployeeSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(KIOSK_SESSION_COOKIE)?.value?.trim();
  if (!raw) return null;
  return verifyKioskSession(raw);
}

/**
 * Sets a short-lived employee kiosk session cookie (3 minutes).
 */
export async function setKioskSessionCookie(
  session: KioskEmployeeSession,
): Promise<void> {
  const cookieStore = await cookies();
  const token = signKioskSession(session);
  cookieStore.set(KIOSK_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 180, // 3 minutes
  });
}

/**
 * Immediately purges the employee kiosk session cookie.
 */
export async function clearKioskSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(KIOSK_SESSION_COOKIE);
}
