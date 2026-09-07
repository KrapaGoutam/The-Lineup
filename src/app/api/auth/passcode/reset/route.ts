import { NextResponse } from "next/server";

import { rotatePasscodeCredential } from "@/features/auth/data/passcode-rotation";
import {
  designationForRoles,
  isValidPasscode,
} from "@/features/auth/domain/passcode";
import { canChangeDesignation } from "@/features/team/domain/designations";
import { getCurrentUser } from "@/lib/current-user";
import { generateRandomPasscode } from "@/lib/passcode-security";
import { createAdminClient } from "@/lib/supabase/admin";

type ResetBody = {
  restaurantSlug?: string;
  targetProfileId?: string;
  newPasscode?: string;
  reason?: string;
};

/**
 * Feature 016. Manager/owner-initiated passcode reset -- no knowledge of
 * the old passcode required. Authorization reuses `canChangeDesignation`
 * directly rather than re-deriving the same `memberships_update_manager`
 * hierarchy a third time: per explicit direction, resetting someone's
 * credential is at least as sensitive as changing their designation, so
 * it uses the identical actor/target rule (owner unrestricted; a Manager
 * can act on anyone whose current designation isn't Owner or Manager; an
 * Assistant Manager can act on no one).
 */
export async function POST(request: Request) {
  let body: ResetBody;
  try {
    body = (await request.json()) as ResetBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const slug = body.restaurantSlug?.trim().toLowerCase();
  const targetProfileId = body.targetProfileId?.trim();
  const reason = body.reason?.trim() ?? "";
  const requestedPasscode = body.newPasscode?.trim();

  if (!slug || !targetProfileId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (reason.length < 3 || reason.length > 500) {
    return NextResponse.json(
      { error: "Enter a short reason (at least 3 characters)." },
      { status: 400 },
    );
  }
  if (requestedPasscode && !isValidPasscode(requestedPasscode)) {
    return NextResponse.json(
      { error: "The new passcode must be exactly 4 digits." },
      { status: 400 },
    );
  }

  const actor = await getCurrentUser(slug);
  if (!actor) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: targetMembership } = await admin
    .from("memberships")
    .select("roles")
    .eq("organization_id", actor.organizationId)
    .eq("profile_id", targetProfileId)
    .eq("active", true)
    .maybeSingle();
  if (!targetMembership) {
    return NextResponse.json(
      { error: "That person is not an active member of this organization." },
      { status: 404 },
    );
  }

  const targetDesignation = designationForRoles(targetMembership.roles ?? []);
  const allowed = canChangeDesignation({
    actorDesignation: actor.designation,
    targetCurrentDesignation: targetDesignation,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "You are not able to reset this person's passcode." },
      { status: 403 },
    );
  }

  const newPasscode = requestedPasscode ?? generateRandomPasscode();

  const result = await rotatePasscodeCredential(admin, {
    organizationId: actor.organizationId,
    profileId: targetProfileId,
    newPasscode,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, severity: result.severity },
      { status: 500 },
    );
  }

  await admin.from("audit_events").insert({
    organization_id: actor.organizationId,
    actor_profile_id: actor.profileId,
    action: "passcode_reset",
    entity_type: "passcode_credential",
    entity_id: targetProfileId,
    reason,
  });

  return NextResponse.json({ ok: true, passcode: newPasscode });
}
