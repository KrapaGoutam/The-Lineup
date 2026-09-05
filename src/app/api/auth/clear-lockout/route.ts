import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  restaurantSlug: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(3).max(500),
});

/**
 * Manager/owner-only escape hatch for the organization-wide passcode
 * lockout (Feature 006). Uses the caller's own authenticated session, not
 * the admin client, so the existing RLS policy on `passcode_lockout_resets`
 * is the real enforcement — not an application-layer role check that could
 * drift from it. A non-manager's insert is denied by RLS, not by this route.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A reason of at least 3 characters is required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", parsed.data.restaurantSlug.toLowerCase())
    .maybeSingle();
  if (!organization) {
    return NextResponse.json(
      { error: "Restaurant not found." },
      { status: 404 },
    );
  }

  const { data: reset, error: insertError } = await supabase
    .from("passcode_lockout_resets")
    .insert({
      organization_id: organization.id,
      cleared_by: authData.user.id,
      reason: parsed.data.reason,
    })
    .select("id")
    .single();

  if (insertError || !reset) {
    return NextResponse.json(
      { error: "Unable to clear the lockout." },
      { status: 403 },
    );
  }

  await supabase.from("audit_events").insert({
    organization_id: organization.id,
    actor_profile_id: authData.user.id,
    action: "passcode_lockout_cleared",
    entity_type: "passcode_lockout_resets",
    entity_id: String(reset.id),
    reason: parsed.data.reason,
  });

  return NextResponse.json({ ok: true });
}
