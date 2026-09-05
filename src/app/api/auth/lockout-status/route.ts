import { NextResponse } from "next/server";

import { normalizeDatabaseRole } from "@/features/auth/domain/passcode";
import {
  ORGANIZATION_MAX_FAILURES,
  ORGANIZATION_WINDOW_MINUTES,
  organizationCountWindowStart,
} from "@/features/auth/domain/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Lets an already-signed-in manager/owner see whether the organization-wide
 * passcode lockout (Feature 006) is currently active, so the "Clear login
 * lockout" banner only shows when it matters. `passcode_login_attempts` has
 * no browser-role grants, so this reads via the admin client — but only
 * after confirming the caller is an authenticated manager of that
 * organization through their own RLS-respecting session.
 */
export async function GET(request: Request) {
  const restaurantSlug = new URL(request.url).searchParams
    .get("restaurantSlug")
    ?.trim()
    .toLowerCase();
  if (!restaurantSlug) {
    return NextResponse.json(
      { error: "Missing restaurantSlug." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ active: false });
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", restaurantSlug)
    .maybeSingle();
  if (!organization) {
    return NextResponse.json({ active: false });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("roles")
    .eq("organization_id", organization.id)
    .eq("profile_id", authData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (!membership || normalizeDatabaseRole(membership.roles) === "server") {
    return NextResponse.json({ active: false });
  }

  const admin = createAdminClient();
  const orgWindowStart = new Date(
    Date.now() - ORGANIZATION_WINDOW_MINUTES * 60_000,
  );
  const { data: lastReset } = await admin
    .from("passcode_lockout_resets")
    .select("cleared_at")
    .eq("organization_id", organization.id)
    .order("cleared_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  return NextResponse.json({
    active: (organizationFailures ?? 0) >= ORGANIZATION_MAX_FAILURES,
  });
}
