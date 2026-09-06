import { NextResponse } from "next/server";

import {
  designationForRoles,
  isValidPasscode,
  normalizeDatabaseRole,
} from "@/features/auth/domain/passcode";
import {
  FINGERPRINT_WINDOW_MINUTES,
  ORGANIZATION_WINDOW_MINUTES,
  RECENT_SUCCESS_EXEMPTION_HOURS,
  organizationCountWindowStart,
  shouldLockFingerprint,
  shouldLockOrganization,
} from "@/features/auth/domain/rate-limit";
import {
  createPasscodeLocator,
  createRequestFingerprint,
} from "@/lib/passcode-security";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type LoginBody = { restaurantSlug?: string; passcode?: string };

function clientFingerprint(request: Request) {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return createRequestFingerprint(
    forwarded || request.headers.get("x-real-ip") || "unknown",
  );
}

export async function POST(request: Request) {
  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const slug = body.restaurantSlug?.trim().toLowerCase();
  const passcode = body.passcode?.trim() ?? "";
  if (!slug || !isValidPasscode(passcode)) {
    return NextResponse.json(
      { error: "Enter a valid 6–8 digit passcode." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: organization } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!organization) {
    return NextResponse.json(
      { error: "Passcode not recognized." },
      { status: 401 },
    );
  }

  const fingerprint = clientFingerprint(request);

  const fingerprintWindowStart = new Date(
    Date.now() - FINGERPRINT_WINDOW_MINUTES * 60_000,
  ).toISOString();
  const { count: fingerprintFailures } = await admin
    .from("passcode_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization.id)
    .eq("fingerprint", fingerprint)
    .eq("succeeded", false)
    .gte("attempted_at", fingerprintWindowStart);

  if (shouldLockFingerprint(fingerprintFailures ?? 0)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  // Organization-wide check: degrades instead of denying. A fingerprint
  // that has succeeded here recently is exempt, and a manager already
  // signed in can clear the lock — see docs/features/006-four-digit-passcodes.md.
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
        .eq("organization_id", organization.id)
        .eq("fingerprint", fingerprint)
        .eq("succeeded", true)
        .gte("attempted_at", recentSuccessCutoff),
      admin
        .from("passcode_lockout_resets")
        .select("cleared_at")
        .eq("organization_id", organization.id)
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
    .eq("organization_id", organization.id)
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

  const locator = createPasscodeLocator(organization.id, passcode);
  const { data: credential } = await admin
    .from("passcode_credentials")
    .select("profile_id, synthetic_email")
    .eq("organization_id", organization.id)
    .eq("locator", locator)
    .eq("active", true)
    .maybeSingle();

  await admin.from("passcode_login_attempts").insert({
    organization_id: organization.id,
    fingerprint,
    succeeded: Boolean(credential),
  });

  if (!credential) {
    return NextResponse.json(
      { error: "Passcode not recognized." },
      { status: 401 },
    );
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: credential.synthetic_email,
    password: passcode,
  });
  if (signInError) {
    return NextResponse.json(
      { error: "Passcode not recognized." },
      { status: 401 },
    );
  }

  const [{ data: profile }, { data: membership }] = await Promise.all([
    admin
      .from("profiles")
      .select("display_name")
      .eq("id", credential.profile_id)
      .single(),
    admin
      .from("memberships")
      .select("roles")
      .eq("organization_id", organization.id)
      .eq("profile_id", credential.profile_id)
      .eq("active", true)
      .single(),
  ]);

  if (!profile || !membership) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "This account is not active." },
      { status: 403 },
    );
  }

  return NextResponse.json({
    user: {
      profileId: credential.profile_id,
      name: profile.display_name,
      role: normalizeDatabaseRole(membership.roles),
      designation: designationForRoles(membership.roles),
      organizationId: organization.id,
    },
  });
}
