"use server";

import { z } from "zod";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.generated";
import {
  clearKioskDeviceCookie,
  clearKioskSessionCookie,
  getKioskDeviceCookie,
  getKioskSessionCookie,
  setKioskSessionCookie,
  type KioskEmployeeSession,
} from "../data/kiosk-cookie";
import { getKioskDeviceByToken } from "../data/kiosk-device-data";
import { createPasscodeLocator } from "@/lib/passcode-security";
import {
  FINGERPRINT_WINDOW_MINUTES,
  ORGANIZATION_WINDOW_MINUTES,
  RECENT_SUCCESS_EXEMPTION_HOURS,
  organizationCountWindowStart,
  shouldLockFingerprint,
  shouldLockOrganization,
} from "@/features/auth/domain/rate-limit";
import {
  migrateLegacyAuthPassword,
  verifyPasscode,
} from "@/features/auth/data/passcode-verify";
import {
  getActiveAttendanceSession,
  nativeBreakEnd,
  nativeBreakStart,
  nativeClockIn,
  nativeClockOut,
  type ClockOperationResponse,
} from "@/features/attendance/data/native-attendance-data";
import type { AttendanceSessionModel } from "@/features/attendance/domain/attendance-session";
import { listNativeAttendance } from "@/features/attendance/data/native-report-data";
import type { NativeReportRow } from "@/features/attendance/domain/native-report";

export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string; readonly code?: string };

const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{4}$/, "PIN must be exactly 4 digits");

class KioskAttemptAccountingError extends Error {}

/**
 * Creates an isolated client for authenticated employee RPC calls.
 * Does not write cookies or persist tokens to localStorage.
 */
function createEmployeeClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createSupabaseClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

/**
 * Verifies that the kiosk tablet cookie is present and represents an active device.
 */
async function verifyKioskDeviceContext() {
  const token = await getKioskDeviceCookie();
  if (!token) {
    return {
      ok: false as const,
      error: "Device is not paired.",
      code: "device_unpaired",
    };
  }

  const admin = createAdminClient();
  const deviceRes = await getKioskDeviceByToken(admin, token);
  if (!deviceRes.ok || !deviceRes.data) {
    await clearKioskDeviceCookie();
    await clearKioskSessionCookie(admin);
    return {
      ok: false as const,
      error: "Device registration is invalid or revoked.",
      code: "device_revoked",
    };
  }

  if (deviceRes.data.status !== "active") {
    await clearKioskDeviceCookie();
    await clearKioskSessionCookie(admin);
    return {
      ok: false as const,
      error: "This kiosk device has been revoked.",
      code: "device_revoked",
    };
  }

  return { ok: true as const, device: deviceRes.data, admin };
}

export interface AuthenticatePinResponse {
  readonly employee: {
    readonly profileId: string;
    readonly displayName: string;
    readonly organizationId: string;
    readonly locationId: string;
    readonly roles: readonly string[];
  };
  readonly currentSession: AttendanceSessionModel | null;
}

export interface KioskActiveStatusResponse {
  readonly employee: {
    readonly profileId: string;
    readonly displayName: string;
    readonly organizationId: string;
    readonly locationId: string;
  };
  readonly currentSession: AttendanceSessionModel | null;
}

/**
 * Authenticates an employee on a paired kiosk tablet using their 4-digit PIN.
 * Failure accounting guarantees every non-completed authentication records
 * `succeeded: false` to enforce device and organization rate limits.
 */
export async function kioskAuthenticatePinAction(input: {
  readonly pin: string;
}): Promise<ActionResult<AuthenticatePinResponse>> {
  try {
    const deviceCheck = await verifyKioskDeviceContext();
    if (!deviceCheck.ok) {
      return { ok: false, error: deviceCheck.error, code: deviceCheck.code };
    }

    const { device, admin } = deviceCheck;

    const parsedPin = pinSchema.safeParse(input.pin);
    if (!parsedPin.success) {
      return {
        ok: false,
        error: "Please enter a valid 4-digit PIN.",
        code: "invalid_pin_format",
      };
    }

    const pin = parsedPin.data;
    const fingerprint = `kiosk:${device.deviceId}`;

    // Rate limit check: Device-specific lockout (5 failed attempts in 15 mins)
    const fingerprintWindowStart = new Date(
      Date.now() - FINGERPRINT_WINDOW_MINUTES * 60_000,
    ).toISOString();

    const { count: fingerprintFailures, error: fingerprintError } = await admin
      .from("passcode_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", device.organizationId)
      .eq("fingerprint", fingerprint)
      .eq("succeeded", false)
      .gte("attempted_at", fingerprintWindowStart);

    if (fingerprintError) {
      console.error(
        "kioskAuthenticatePinAction fingerprint rate-limit error",
        fingerprintError,
      );
      return {
        ok: false,
        error:
          "Authentication service temporarily unavailable. Please try again.",
        code: "rate_limit_unavailable",
      };
    }

    if (shouldLockFingerprint(fingerprintFailures ?? 0)) {
      return {
        ok: false,
        error:
          "Too many failed attempts on this kiosk. Please try again in 15 minutes.",
        code: "device_lockout",
      };
    }

    // Rate limit check: Organization-wide lockout
    const orgWindowStart = new Date(
      Date.now() - ORGANIZATION_WINDOW_MINUTES * 60_000,
    );
    const recentSuccessCutoff = new Date(
      Date.now() - RECENT_SUCCESS_EXEMPTION_HOURS * 60 * 60_000,
    ).toISOString();

    const [recentSuccessRes, lastResetRes] = await Promise.all([
      admin
        .from("passcode_login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", device.organizationId)
        .eq("fingerprint", fingerprint)
        .eq("succeeded", true)
        .gte("attempted_at", recentSuccessCutoff),
      admin
        .from("passcode_lockout_resets")
        .select("cleared_at")
        .eq("organization_id", device.organizationId)
        .order("cleared_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (recentSuccessRes.error) {
      console.error(
        "kioskAuthenticatePinAction recentSuccess rate-limit error",
        recentSuccessRes.error,
      );
      return {
        ok: false,
        error:
          "Authentication service temporarily unavailable. Please try again.",
        code: "rate_limit_unavailable",
      };
    }

    if (lastResetRes.error) {
      console.error(
        "kioskAuthenticatePinAction lastReset rate-limit error",
        lastResetRes.error,
      );
      return {
        ok: false,
        error:
          "Authentication service temporarily unavailable. Please try again.",
        code: "rate_limit_unavailable",
      };
    }

    const recentSuccessCount = recentSuccessRes.count;
    const lastReset = lastResetRes.data;

    const organizationCountStart = organizationCountWindowStart({
      windowStart: orgWindowStart,
      lastResetAt: lastReset ? new Date(lastReset.cleared_at) : null,
    });

    const { count: organizationFailures, error: orgFailuresError } = await admin
      .from("passcode_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", device.organizationId)
      .eq("succeeded", false)
      .gte("attempted_at", organizationCountStart.toISOString());

    if (orgFailuresError) {
      console.error(
        "kioskAuthenticatePinAction orgFailures rate-limit error",
        orgFailuresError,
      );
      return {
        ok: false,
        error:
          "Authentication service temporarily unavailable. Please try again.",
        code: "rate_limit_unavailable",
      };
    }

    if (
      shouldLockOrganization({
        failureCountInWindow: organizationFailures ?? 0,
        fingerprintSucceededRecently: (recentSuccessCount ?? 0) > 0,
      })
    ) {
      return {
        ok: false,
        error:
          "Too many failed attempts across this restaurant. Ask a manager to clear the lockout or try again shortly.",
        code: "org_lockout",
      };
    }

    const recordFailureAttempt = async () => {
      const { error: insertError } = await admin
        .from("passcode_login_attempts")
        .insert({
          organization_id: device.organizationId,
          fingerprint,
          succeeded: false,
        });
      if (insertError) {
        console.error(
          "kioskAuthenticatePinAction failed to record attempt",
          insertError,
        );
        throw new KioskAttemptAccountingError();
      }
    };

    // Resolve PIN locator against passcode_credentials
    const locator = createPasscodeLocator(device.organizationId, pin);
    const { data: credential } = await admin
      .from("passcode_credentials")
      .select("profile_id, synthetic_email")
      .eq("organization_id", device.organizationId)
      .eq("locator", locator)
      .eq("active", true)
      .maybeSingle();

    if (!credential) {
      // Record failure immediately to enforce rate limiting
      await recordFailureAttempt();
      return { ok: false, error: "PIN not recognized.", code: "invalid_pin" };
    }

    // Verify location attendance mode
    const { data: locationData } = await admin
      .from("locations")
      .select("attendance_mode, active, archived_at")
      .eq("id", device.locationId)
      .single();

    if (
      !locationData ||
      !locationData.active ||
      locationData.archived_at !== null ||
      locationData.attendance_mode !== "internal_the_lineup"
    ) {
      await recordFailureAttempt();
      return {
        ok: false,
        error: "Internal attendance mode is not active for this location.",
        code: "attendance_mode_disabled",
      };
    }

    // Verify employee organization membership is active
    const { data: membership } = await admin
      .from("memberships")
      .select("roles, active")
      .eq("organization_id", device.organizationId)
      .eq("profile_id", credential.profile_id)
      .eq("active", true)
      .maybeSingle();

    if (!membership) {
      await recordFailureAttempt();
      return {
        ok: false,
        error: "Employee account is not active in this restaurant.",
        code: "inactive_member",
      };
    }

    // Verify location assignment (location_memberships)
    const { data: locMembership } = await admin
      .from("location_memberships")
      .select("active")
      .eq("location_id", device.locationId)
      .eq("profile_id", credential.profile_id)
      .eq("active", true)
      .maybeSingle();

    if (!locMembership) {
      await recordFailureAttempt();
      return {
        ok: false,
        error: "Employee is not assigned to this location.",
        code: "not_assigned_to_location",
      };
    }

    // Verify credentials via Supabase Auth without writing session cookies
    const anonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const isolatedAuthClient = createSupabaseClient(anonUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const verification = await verifyPasscode(isolatedAuthClient, {
      syntheticEmail: credential.synthetic_email,
      organizationId: device.organizationId,
      passcode: pin,
    });

    if (!verification.ok) {
      await recordFailureAttempt();
      return {
        ok: false,
        error: "PIN verification failed.",
        code: "invalid_pin",
      };
    }

    if (verification.verifiedVia === "legacy") {
      await migrateLegacyAuthPassword(admin, {
        profileId: credential.profile_id,
        organizationId: device.organizationId,
        passcode: pin,
      });
    }

    // Get an authenticated access token in-memory for this employee
    const { data: signInData, error: signInError } =
      await isolatedAuthClient.auth.signInWithPassword({
        email: credential.synthetic_email,
        password:
          verification.verifiedVia === "legacy"
            ? pin
            : (await import("@/lib/passcode-security")).createAuthPassword(
                device.organizationId,
                pin,
              ),
      });

    if (signInError || !signInData.session) {
      await recordFailureAttempt();
      return {
        ok: false,
        error: "Failed to establish employee session.",
        code: "auth_failed",
      };
    }

    // Only record success after all verification steps and Supabase sign-in succeed
    const { error: successAttemptError } = await admin
      .from("passcode_login_attempts")
      .insert({
        organization_id: device.organizationId,
        fingerprint,
        succeeded: true,
      });
    if (successAttemptError) {
      throw new KioskAttemptAccountingError();
    }

    // Get profile display name
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", credential.profile_id)
      .single();

    const displayName = profile?.display_name || "Employee";

    // Store server-side session (3-minute TTL) with encrypted access token and opaque cookie
    const sessionPayload: Omit<KioskEmployeeSession, "expiresAt"> = {
      profileId: credential.profile_id,
      displayName,
      deviceId: device.deviceId,
      organizationId: device.organizationId,
      locationId: device.locationId,
      accessToken: signInData.session.access_token,
    };
    await setKioskSessionCookie(admin, sessionPayload);

    // Query active attendance session
    const employeeClient = createEmployeeClient(
      signInData.session.access_token,
    );
    const sessionRes = await getActiveAttendanceSession(employeeClient, {
      locationId: device.locationId,
      profileId: credential.profile_id,
    });

    return {
      ok: true,
      data: {
        employee: {
          profileId: credential.profile_id,
          displayName,
          organizationId: device.organizationId,
          locationId: device.locationId,
          roles: membership.roles,
        },
        currentSession: sessionRes.ok ? sessionRes.data : null,
      },
    };
  } catch (err: unknown) {
    if (err instanceof KioskAttemptAccountingError) {
      return {
        ok: false,
        error:
          "Authentication service temporarily unavailable. Please try again.",
        code: "rate_limit_unavailable",
      };
    }
    console.error("kioskAuthenticatePinAction unexpected error", err);
    return {
      ok: false,
      error: "An unexpected error occurred during PIN authentication.",
    };
  }
}

/**
 * Returns the current active session state for the employee on the kiosk.
 * Zero JWT/tokens are ever serialized or returned to the browser.
 */
export async function kioskGetActiveStatusAction(): Promise<
  ActionResult<KioskActiveStatusResponse>
> {
  try {
    const deviceCheck = await verifyKioskDeviceContext();
    if (!deviceCheck.ok) {
      return { ok: false, error: deviceCheck.error, code: deviceCheck.code };
    }

    const session = await getKioskSessionCookie(deviceCheck.admin);
    if (
      !session ||
      session.deviceId !== deviceCheck.device.deviceId ||
      session.locationId !== deviceCheck.device.locationId
    ) {
      await clearKioskSessionCookie(deviceCheck.admin);
      return {
        ok: false,
        error: "No active employee session.",
        code: "session_expired",
      };
    }

    const employeeClient = createEmployeeClient(session.accessToken);
    const sessionRes = await getActiveAttendanceSession(employeeClient, {
      locationId: session.locationId,
      profileId: session.profileId,
    });

    return {
      ok: true,
      data: {
        employee: {
          profileId: session.profileId,
          displayName: session.displayName,
          organizationId: session.organizationId,
          locationId: session.locationId,
        },
        currentSession: sessionRes.ok ? sessionRes.data : null,
      },
    };
  } catch (err: unknown) {
    console.error("kioskGetActiveStatusAction error", err);
    return { ok: false, error: "Failed to fetch attendance status." };
  }
}

/**
 * Executes a clock-in operation for the authenticated kiosk employee.
 */
export async function kioskClockInAction(input?: {
  readonly notes?: string | null;
  readonly idempotencyKey?: string | null;
}): Promise<ActionResult<ClockOperationResponse>> {
  try {
    const deviceCheck = await verifyKioskDeviceContext();
    if (!deviceCheck.ok) {
      return { ok: false, error: deviceCheck.error, code: deviceCheck.code };
    }

    const session = await getKioskSessionCookie(deviceCheck.admin);
    if (
      !session ||
      session.deviceId !== deviceCheck.device.deviceId ||
      session.locationId !== deviceCheck.device.locationId
    ) {
      await clearKioskSessionCookie(deviceCheck.admin);
      return {
        ok: false,
        error: "Session expired. Please re-enter your PIN.",
        code: "session_expired",
      };
    }

    const employeeClient = createEmployeeClient(session.accessToken);
    const res = await nativeClockIn(employeeClient, {
      locationId: session.locationId,
      profileId: session.profileId,
      notes: input?.notes ?? null,
      idempotencyKey: input?.idempotencyKey ?? null,
    });

    if (!res.ok) {
      return { ok: false, error: res.error, code: res.code };
    }

    return { ok: true, data: res.data };
  } catch (err: unknown) {
    console.error("kioskClockInAction unexpected error", err);
    return { ok: false, error: "Failed to clock in." };
  }
}

/**
 * Executes a clock-out operation for the authenticated kiosk employee.
 */
export async function kioskClockOutAction(input?: {
  readonly notes?: string | null;
  readonly idempotencyKey?: string | null;
}): Promise<ActionResult<ClockOperationResponse>> {
  try {
    const deviceCheck = await verifyKioskDeviceContext();
    if (!deviceCheck.ok) {
      return { ok: false, error: deviceCheck.error, code: deviceCheck.code };
    }

    const session = await getKioskSessionCookie(deviceCheck.admin);
    if (
      !session ||
      session.deviceId !== deviceCheck.device.deviceId ||
      session.locationId !== deviceCheck.device.locationId
    ) {
      await clearKioskSessionCookie(deviceCheck.admin);
      return {
        ok: false,
        error: "Session expired. Please re-enter your PIN.",
        code: "session_expired",
      };
    }

    const employeeClient = createEmployeeClient(session.accessToken);
    const res = await nativeClockOut(employeeClient, {
      locationId: session.locationId,
      profileId: session.profileId,
      notes: input?.notes ?? null,
      idempotencyKey: input?.idempotencyKey ?? null,
    });

    if (!res.ok) {
      return { ok: false, error: res.error, code: res.code };
    }

    return { ok: true, data: res.data };
  } catch (err: unknown) {
    console.error("kioskClockOutAction unexpected error", err);
    return { ok: false, error: "Failed to clock out." };
  }
}

/**
 * Starts a break for the authenticated kiosk employee.
 */
export async function kioskBreakStartAction(input?: {
  readonly idempotencyKey?: string | null;
}): Promise<ActionResult<ClockOperationResponse>> {
  try {
    const deviceCheck = await verifyKioskDeviceContext();
    if (!deviceCheck.ok) {
      return { ok: false, error: deviceCheck.error, code: deviceCheck.code };
    }

    const session = await getKioskSessionCookie(deviceCheck.admin);
    if (
      !session ||
      session.deviceId !== deviceCheck.device.deviceId ||
      session.locationId !== deviceCheck.device.locationId
    ) {
      await clearKioskSessionCookie(deviceCheck.admin);
      return {
        ok: false,
        error: "Session expired. Please re-enter your PIN.",
        code: "session_expired",
      };
    }

    const employeeClient = createEmployeeClient(session.accessToken);
    const res = await nativeBreakStart(employeeClient, {
      locationId: session.locationId,
      profileId: session.profileId,
      idempotencyKey: input?.idempotencyKey ?? null,
    });

    if (!res.ok) {
      return { ok: false, error: res.error, code: res.code };
    }

    return { ok: true, data: res.data };
  } catch (err: unknown) {
    console.error("kioskBreakStartAction unexpected error", err);
    return { ok: false, error: "Failed to start break." };
  }
}

/**
 * Ends a break for the authenticated kiosk employee.
 */
export async function kioskBreakEndAction(input?: {
  readonly idempotencyKey?: string | null;
}): Promise<ActionResult<ClockOperationResponse>> {
  try {
    const deviceCheck = await verifyKioskDeviceContext();
    if (!deviceCheck.ok) {
      return { ok: false, error: deviceCheck.error, code: deviceCheck.code };
    }

    const session = await getKioskSessionCookie(deviceCheck.admin);
    if (
      !session ||
      session.deviceId !== deviceCheck.device.deviceId ||
      session.locationId !== deviceCheck.device.locationId
    ) {
      await clearKioskSessionCookie(deviceCheck.admin);
      return {
        ok: false,
        error: "Session expired. Please re-enter your PIN.",
        code: "session_expired",
      };
    }

    const employeeClient = createEmployeeClient(session.accessToken);
    const res = await nativeBreakEnd(employeeClient, {
      locationId: session.locationId,
      profileId: session.profileId,
      idempotencyKey: input?.idempotencyKey ?? null,
    });

    if (!res.ok) {
      return { ok: false, error: res.error, code: res.code };
    }

    return { ok: true, data: res.data };
  } catch (err: unknown) {
    console.error("kioskBreakEndAction unexpected error", err);
    return { ok: false, error: "Failed to end break." };
  }
}

/**
 * Fetches monthly attendance history for the currently authenticated employee ONLY.
 */
export async function kioskGetEmployeeReportAction(input: {
  readonly year: number;
  readonly month: number; // 1-12
}): Promise<ActionResult<{ readonly rows: readonly NativeReportRow[] }>> {
  try {
    const deviceCheck = await verifyKioskDeviceContext();
    if (!deviceCheck.ok) {
      return { ok: false, error: deviceCheck.error, code: deviceCheck.code };
    }

    const session = await getKioskSessionCookie(deviceCheck.admin);
    if (
      !session ||
      session.deviceId !== deviceCheck.device.deviceId ||
      session.locationId !== deviceCheck.device.locationId
    ) {
      await clearKioskSessionCookie(deviceCheck.admin);
      return {
        ok: false,
        error: "Session expired. Please re-enter your PIN.",
        code: "session_expired",
      };
    }

    const year = Math.floor(input.year);
    const month = Math.floor(input.month);
    if (year < 2020 || year > 2100 || month < 1 || month > 12) {
      return { ok: false, error: "Invalid year or month." };
    }

    // Determine start and end date for service_date YYYY-MM-DD
    const paddedMonth = String(month).padStart(2, "0");
    const startDate = `${year}-${paddedMonth}-01`;
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const endDate = `${year}-${paddedMonth}-${String(lastDayOfMonth).padStart(2, "0")}`;

    const employeeClient = createEmployeeClient(session.accessToken);
    const reportRes = await listNativeAttendance(employeeClient, {
      locationId: session.locationId,
      profileId: session.profileId, // Strict filter to this employee only
      startDate,
      endDate,
      timeZone: deviceCheck.device.timeZone,
    });

    if (!reportRes.ok) {
      return { ok: false, error: reportRes.error };
    }

    // Strict defense-in-depth: ensure no foreign profile row is ever included
    const isolatedRows = reportRes.rows.filter(
      (r) => r.profileId === session.profileId,
    );

    return { ok: true, data: { rows: isolatedRows } };
  } catch (err: unknown) {
    console.error("kioskGetEmployeeReportAction unexpected error", err);
    return { ok: false, error: "Failed to fetch attendance history." };
  }
}

/**
 * Clears the active employee session immediately (for Done/Finish button or inactivity timeout).
 */
export async function kioskClearSessionAction(): Promise<
  ActionResult<{ readonly success: true }>
> {
  try {
    const admin = createAdminClient();
    await clearKioskSessionCookie(admin);
    return { ok: true, data: { success: true } };
  } catch (err: unknown) {
    console.error("kioskClearSessionAction error", err);
    return { ok: false, error: "Failed to clear session." };
  }
}
