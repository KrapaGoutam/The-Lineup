import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  createGlobalPasscodeLocator,
  createRequestFingerprint,
} from "@/lib/passcode-security";
import {
  rotatePasscodeCredential,
  type RotatePasscodeResult,
} from "./passcode-rotation";

type Admin = SupabaseClient<Database>;
export { PIN_IN_USE } from "../domain/pin-errors";
import {
  PIN_IN_USE,
  isPinCollision,
  type PinFailureCode,
} from "../domain/pin-errors";
export const PIN_RECOVERY =
  "Your PIN update needs administrator reconciliation. Please contact support.";

export function requestPinFingerprint(request: Request) {
  // Deployment MUST overwrite these headers at its trusted ingress. A browser
  // supplied device id would let an attacker reset its own quota.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return createRequestFingerprint(`personal-pin:${ip}`);
}

export async function reservePinAttempt(
  admin: Admin,
  request: Request,
  purpose: "login" | "register" | "enroll",
) {
  const { data, error } = await admin.rpc("reserve_global_pin_attempt", {
    p_fingerprint: requestPinFingerprint(request),
    p_purpose: purpose,
  });
  if (error)
    return {
      response: NextResponse.json(
        { error: "Sign-in service unavailable. Please try again." },
        { status: 503 },
      ),
    };
  if (!data)
    return {
      response: NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": purpose === "register" ? "3600" : "900" },
        },
      ),
    };
  return { attemptId: data };
}

export async function markPinAttemptSucceeded(admin: Admin, attemptId: string) {
  const { error } = await admin
    .from("global_pin_attempts")
    .update({ succeeded: true })
    .eq("id", attemptId);
  if (error)
    throw new Error("Could not record personal PIN authentication outcome.");
}

export async function readPersonalPinAccount(admin: Admin, profileId: string) {
  const { data, error } = await admin
    .from("personal_pin_accounts")
    .select("locator, operation_id, updated_at, synthetic_email")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw new Error("Personal PIN registry unavailable.");
  return data;
}

export async function beginPersonalPinChange(
  admin: Admin,
  profileId: string,
  passcode: string,
  actorProfileId = profileId,
) {
  const { data: identity, error: identityError } =
    await admin.auth.admin.getUserById(profileId);
  if (
    identityError ||
    identity.user?.id !== profileId ||
    !identity.user.email
  ) {
    return {
      ok: false as const,
      error: PIN_RECOVERY,
      code: "database_error" as PinFailureCode,
    };
  }
  const { data, error } = await admin.rpc("begin_personal_pin_change", {
    p_profile_id: profileId,
    p_locator: createGlobalPasscodeLocator(passcode),
    p_actor_profile_id: actorProfileId,
    p_synthetic_email: identity.user.email,
  });
  if (error || !data)
    return {
      ok: false as const,
      error: error?.code === "23505" ? PIN_IN_USE : PIN_RECOVERY,
      code: (error?.code === "23505"
        ? "global_collision"
        : error?.code === "55000"
          ? "reconciliation_required"
          : "database_error") as PinFailureCode,
    };
  return { ok: true as const, operationId: data };
}

export async function finishPersonalPinChange(
  admin: Admin,
  profileId: string,
  operationId: string,
  apply: boolean,
) {
  const { error } = await admin.rpc("finish_personal_pin_change", {
    p_profile_id: profileId,
    p_operation_id: operationId,
    p_apply: apply,
  });
  if (error)
    throw new Error(
      "Personal PIN operation remains blocked for reconciliation.",
    );
}

/** Durable owner reservation surrounds B3's checked Auth/locator compensation.
 * A process crash or uncertain Auth result retains BOTH claims and blocks login.
 * No finally/timeout blindly releases ownership after an uncertain external write.
 */
export async function rotateGlobalPersonalPin(
  admin: Admin,
  input: Parameters<typeof rotatePasscodeCredential>[1] & {
    actorProfileId?: string;
  },
): Promise<RotatePasscodeResult> {
  const claim = await beginPersonalPinChange(
    admin,
    input.profileId,
    input.newPasscode,
    input.actorProfileId,
  );
  if (!claim.ok)
    return {
      ok: false,
      error: claim.error,
      severity: isPinCollision(claim.code) ? "recoverable" : "locked_out",
      code: claim.code,
    };
  try {
    const result = await rotatePasscodeCredential(admin, input);
    if (result.ok || result.severity === "recoverable") {
      await finishPersonalPinChange(
        admin,
        input.profileId,
        claim.operationId,
        result.ok,
      );
    }
    return result;
  } catch {
    return {
      ok: false,
      error: PIN_RECOVERY,
      severity: "locked_out",
      code: "reconciliation_required",
    };
  }
}
