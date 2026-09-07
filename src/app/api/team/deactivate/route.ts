import { NextResponse } from "next/server";

import { deactivateMember } from "@/features/auth/data/member-deactivation";
import { designationForRoles } from "@/features/auth/domain/passcode";
import { canDeactivateMember } from "@/features/team/domain/designations";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

type DeactivateBody = {
  restaurantSlug?: string;
  targetProfileId?: string;
  reason?: string;
};

/**
 * Feature 017. Owner/manager-initiated deactivation -- blocks a member's
 * future sign-ins, blocks every RLS-gated data operation immediately
 * (even from an already-open session, confirmed live: memberships.active
 * is what private.has_org_role actually checks), and invalidates any
 * already-issued Supabase Auth session token for that person. See
 * docs/features/017-member-deactivation.md for the full design.
 *
 * Authorization reuses canDeactivateMember directly (mirrors
 * canChangeDesignation, the same bar Feature 016 already reuses for
 * reset, plus an unconditional self-target refusal this action alone
 * needs) rather than re-deriving it a third time.
 */
export async function POST(request: Request) {
  let body: DeactivateBody;
  try {
    body = (await request.json()) as DeactivateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const slug = body.restaurantSlug?.trim().toLowerCase();
  const targetProfileId = body.targetProfileId?.trim();
  const reason = body.reason?.trim() ?? "";

  if (!slug || !targetProfileId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (reason.length < 3 || reason.length > 500) {
    return NextResponse.json(
      { error: "Enter a short reason (at least 3 characters)." },
      { status: 400 },
    );
  }

  const actor = await getCurrentUser(slug);
  if (!actor) {
    return NextResponse.json(
      { error: "Not signed in.", sessionInvalid: true },
      { status: 401 },
    );
  }

  if (actor.profileId === targetProfileId) {
    return NextResponse.json(
      { error: "You can't deactivate your own account." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { data: targetMembership } = await admin
    .from("memberships")
    .select("roles, active")
    .eq("organization_id", actor.organizationId)
    .eq("profile_id", targetProfileId)
    .maybeSingle();
  if (!targetMembership) {
    return NextResponse.json(
      { error: "That person is not a member of this organization." },
      { status: 404 },
    );
  }
  if (!targetMembership.active) {
    return NextResponse.json(
      { error: "That person is already deactivated." },
      { status: 409 },
    );
  }

  const targetDesignation = designationForRoles(targetMembership.roles ?? []);
  const allowed = canDeactivateMember({
    actorProfileId: actor.profileId,
    actorDesignation: actor.designation,
    targetProfileId,
    targetCurrentDesignation: targetDesignation,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "You are not able to deactivate this person." },
      { status: 403 },
    );
  }

  const result = await deactivateMember(admin, {
    organizationId: actor.organizationId,
    profileId: targetProfileId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, writes: result.writes },
      { status: 500 },
    );
  }

  await admin.from("audit_events").insert({
    organization_id: actor.organizationId,
    actor_profile_id: actor.profileId,
    action: "member_deactivated",
    entity_type: "membership",
    entity_id: targetProfileId,
    reason,
  });

  return NextResponse.json({ ok: true });
}
