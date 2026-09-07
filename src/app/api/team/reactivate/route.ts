import { NextResponse } from "next/server";

import { reactivateMember } from "@/features/auth/data/member-deactivation";
import { designationForRoles } from "@/features/auth/domain/passcode";
import { canDeactivateMember } from "@/features/team/domain/designations";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

type ReactivateBody = {
  restaurantSlug?: string;
  targetProfileId?: string;
  reason?: string;
};

/**
 * Feature 017. The exact symmetric reverse of deactivate/route.ts --
 * same three writes, opposite direction, same authorization bar. Picks
 * a deactivated member back up under their existing profile and
 * passcode rather than requiring a new registration, so their prior
 * shift/tip/audit history stays attributed to the same person.
 */
export async function POST(request: Request) {
  let body: ReactivateBody;
  try {
    body = (await request.json()) as ReactivateBody;
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
      { error: "You can't reactivate your own account." },
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
  if (targetMembership.active) {
    return NextResponse.json(
      { error: "That person is already active." },
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
      { error: "You are not able to reactivate this person." },
      { status: 403 },
    );
  }

  const result = await reactivateMember(admin, {
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
    action: "member_reactivated",
    entity_type: "membership",
    entity_id: targetProfileId,
    reason,
  });

  return NextResponse.json({ ok: true });
}
