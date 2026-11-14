import { NextResponse } from "next/server";

import { getOverallRole } from "@/features/auth/data/overall-role";
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
 * Feature 016 & V2-009 B3: Manager/owner-initiated passcode reset.
 *
 * Authority preservation:
 * - A single-organization manager/owner can ONLY reset strictly single-organization members.
 * - Multi-organization members (or members holding an Overall role) require an Overall Owner
 *   (or self-change via /api/auth/passcode/change) to reset their passcode.
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
    return NextResponse.json(
      { error: "Not signed in.", sessionInvalid: true },
      { status: 401 },
    );
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

  // Check if target is a multi-org member or holds an Overall role
  const [
    { data: otherTargetMemberships },
    targetOverallRole,
    actorOverallRole,
  ] = await Promise.all([
    admin
      .from("memberships")
      .select("organization_id")
      .eq("profile_id", targetProfileId)
      .neq("organization_id", actor.organizationId),
    getOverallRole(targetProfileId, admin),
    getOverallRole(actor.profileId, admin),
  ]);

  const isMultiOrg = Boolean(
    otherTargetMemberships && otherTargetMemberships.length > 0,
  );
  const hasOverallRole = Boolean(targetOverallRole);
  const isActorOverallOwner = actorOverallRole === "owner";

  if ((isMultiOrg || hasOverallRole) && !isActorOverallOwner) {
    return NextResponse.json(
      {
        error:
          "This team member belongs to multiple organizations. Only an Overall administrator can reset their passcode.",
      },
      { status: 403 },
    );
  }

  const targetDesignation = designationForRoles(targetMembership.roles ?? []);
  const allowed =
    isActorOverallOwner ||
    canChangeDesignation({
      actorDesignation: actor.designation,
      targetCurrentDesignation: targetDesignation,
    });
  if (!allowed) {
    return NextResponse.json(
      { error: "You are not able to reset this person's passcode." },
      { status: 403 },
    );
  }

  let newPasscode = requestedPasscode ?? generateRandomPasscode();

  let result = await rotatePasscodeCredential(admin, {
    organizationId: actor.organizationId,
    profileId: targetProfileId,
    newPasscode,
  });

  // If a randomly generated passcode hit a collision, retry up to 3 times
  if (!requestedPasscode && !result.ok && result.severity === "recoverable") {
    for (let retry = 0; retry < 3 && !result.ok; retry += 1) {
      newPasscode = generateRandomPasscode();
      result = await rotatePasscodeCredential(admin, {
        organizationId: actor.organizationId,
        profileId: targetProfileId,
        newPasscode,
      });
    }
  }

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

  if (otherTargetMemberships && otherTargetMemberships.length > 0) {
    const otherOrgAudits = otherTargetMemberships.map((m) => ({
      organization_id: m.organization_id,
      actor_profile_id: actor.profileId,
      action: "passcode_reset",
      entity_type: "passcode_credential",
      entity_id: targetProfileId,
      reason: `${reason} (Overall administrator reset across organizations)`,
    }));
    await admin.from("audit_events").insert(otherOrgAudits);
  }

  return NextResponse.json({ ok: true, passcode: newPasscode });
}
