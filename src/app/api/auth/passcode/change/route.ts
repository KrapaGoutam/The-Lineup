import { NextResponse } from "next/server";

import { isValidPasscode } from "@/features/auth/domain/passcode";
import {
  FINGERPRINT_WINDOW_MINUTES,
  ORGANIZATION_WINDOW_MINUTES,
  RECENT_SUCCESS_EXEMPTION_HOURS,
  organizationCountWindowStart,
  shouldLockFingerprint,
  shouldLockOrganization,
} from "@/features/auth/domain/rate-limit";
import { rotatePasscodeCredential } from "@/features/auth/data/passcode-rotation";
import { getCurrentUser } from "@/lib/current-user";
import { createRequestFingerprint } from "@/lib/passcode-security";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ChangeBody = {
  restaurantSlug?: string;
  currentPasscode?: string;
  newPasscode?: string;
};

function clientFingerprint(request: Request) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return createRequestFingerprint(
    forwarded || request.headers.get("x-real-ip") || "unknown",
  );
}

/**
 * Feature 016. Self-service passcode change: any signed-in role, after
 * confirming the current passcode. The confirmation step re-uses the
 * exact per-fingerprint/per-organization rate limiting Feature 006 built
 * for login (a wrong "current passcode" guess is recorded and counted
 * exactly like a failed login attempt) -- an already-open, unattended
 * session on a shared host-stand device shouldn't be a free way to probe
 * the real passcode.
 */
export async function POST(request: Request) {
  let body: ChangeBody;
  try {
    body = (await request.json()) as ChangeBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const slug = body.restaurantSlug?.trim().toLowerCase();
  const currentPasscode = body.currentPasscode?.trim() ?? "";
  const newPasscode = body.newPasscode?.trim() ?? "";
  if (
    !slug ||
    !isValidPasscode(currentPasscode) ||
    !isValidPasscode(newPasscode)
  ) {
    return NextResponse.json(
      { error: "Enter your current passcode and a new 4-digit passcode." },
      { status: 400 },
    );
  }
  if (currentPasscode === newPasscode) {
    return NextResponse.json(
      { error: "Choose a passcode different from your current one." },
      { status: 400 },
    );
  }

  const currentUser = await getCurrentUser(slug);
  if (!currentUser) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const admin = createAdminClient();
  const fingerprint = clientFingerprint(request);

  const fingerprintWindowStart = new Date(
    Date.now() - FINGERPRINT_WINDOW_MINUTES * 60_000,
  ).toISOString();
  const { count: fingerprintFailures } = await admin
    .from("passcode_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", currentUser.organizationId)
    .eq("fingerprint", fingerprint)
    .eq("succeeded", false)
    .gte("attempted_at", fingerprintWindowStart);

  if (shouldLockFingerprint(fingerprintFailures ?? 0)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const orgWindowStart = new Date(
    Date.now() - ORGANIZATION_WINDOW_MINUTES * 60_000,
  );
  const recentSuccessCutoff = new Date(
    Date.now() - RECENT_SUCCESS_EXEMPTION_HOURS * 60 * 60_000,
  ).toISOString();

  const [{ count: recentSuccessCount }, { data: lastReset }] =
    await Promise.all([
      admin
        .from("passcode_login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", currentUser.organizationId)
        .eq("fingerprint", fingerprint)
        .eq("succeeded", true)
        .gte("attempted_at", recentSuccessCutoff),
      admin
        .from("passcode_lockout_resets")
        .select("cleared_at")
        .eq("organization_id", currentUser.organizationId)
        .order("cleared_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const organizationCountStart = organizationCountWindowStart({
    windowStart: orgWindowStart,
    lastResetAt: lastReset ? new Date(lastReset.cleared_at) : null,
  });
  const { count: organizationFailures } = await admin
    .from("passcode_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", currentUser.organizationId)
    .eq("succeeded", false)
    .gte("attempted_at", organizationCountStart.toISOString());

  if (
    shouldLockOrganization({
      failureCountInWindow: organizationFailures ?? 0,
      fingerprintSucceededRecently: (recentSuccessCount ?? 0) > 0,
    })
  ) {
    return NextResponse.json(
      {
        error:
          "Too many failed attempts across this restaurant right now. Ask a manager who's already signed in to clear the lockout, or try again shortly.",
        code: "org_lockout",
      },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const { data: credential } = await admin
    .from("passcode_credentials")
    .select("synthetic_email")
    .eq("organization_id", currentUser.organizationId)
    .eq("profile_id", currentUser.profileId)
    .maybeSingle();
  if (!credential) {
    return NextResponse.json(
      { error: "Could not find your passcode credential." },
      { status: 404 },
    );
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: credential.synthetic_email,
    password: currentPasscode,
  });

  await admin.from("passcode_login_attempts").insert({
    organization_id: currentUser.organizationId,
    fingerprint,
    succeeded: !verifyError,
  });

  if (verifyError) {
    return NextResponse.json(
      { error: "Current passcode not recognized." },
      { status: 401 },
    );
  }

  const result = await rotatePasscodeCredential(admin, {
    organizationId: currentUser.organizationId,
    profileId: currentUser.profileId,
    newPasscode,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, severity: result.severity },
      { status: 500 },
    );
  }

  await admin.from("audit_events").insert({
    organization_id: currentUser.organizationId,
    actor_profile_id: currentUser.profileId,
    action: "passcode_changed",
    entity_type: "passcode_credential",
    entity_id: currentUser.profileId,
  });

  return NextResponse.json({ ok: true });
}
