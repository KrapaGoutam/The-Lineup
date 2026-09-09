import { NextResponse } from "next/server";

import { designationForRoles } from "@/features/auth/domain/passcode";
import { canPurgeMember } from "@/features/team/domain/designations";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type PurgeBody = {
  restaurantSlug?: string;
  targetProfileId?: string;
  confirmName?: string;
  reason?: string;
};

/**
 * Feature 035. Unlike deactivate/reactivate (which write directly via
 * the admin client, with authorization enforced entirely in this route),
 * the actual purge write goes through `public.purge_inactive_member` --
 * a SECURITY DEFINER Postgres function, called here via the regular
 * per-request client (not admin) so `auth.uid()` resolves to this
 * actor's real session for the function's own internal checks and the
 * audit event's actor_profile_id. Two independent reasons this needs a
 * real database function rather than this route's own coordinated
 * writes: genuine single-transaction atomicity across profiles/
 * registrations/memberships/audit_events (deactivate's three writes are
 * explicitly best-effort/non-atomic -- purge's own spec calls out
 * atomicity as a non-negotiable), and `registrations` has UPDATE
 * revoked from `authenticated` entirely, so no amount of admin-client
 * juggling in this route could reach it -- only the function's elevated
 * privileges can.
 *
 * This route's own checks (target lookup, canPurgeMember,
 * confirmName match) exist to return a friendly, specific JSON error
 * before ever hitting the database -- the RPC's own internal checks
 * (private.can_purge_member, the self/org/membership-count guards) are
 * still the authoritative ones and are re-checked there regardless of
 * what this route already verified.
 */
export async function POST(request: Request) {
  let body: PurgeBody;
  try {
    body = (await request.json()) as PurgeBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const slug = body.restaurantSlug?.trim().toLowerCase();
  const targetProfileId = body.targetProfileId?.trim();
  const confirmName = body.confirmName?.trim() ?? "";
  const reason = body.reason?.trim();

  if (!slug || !targetProfileId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
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
      { error: "You can't purge your own account." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { data: targetMembership } = await admin
    .from("memberships")
    .select("roles, active, purged_at")
    .eq("organization_id", actor.organizationId)
    .eq("profile_id", targetProfileId)
    .maybeSingle();
  if (!targetMembership) {
    return NextResponse.json(
      { error: "That person is not a member of this organization." },
      { status: 404 },
    );
  }

  const { data: targetProfile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", targetProfileId)
    .maybeSingle();
  const targetName = targetProfile?.display_name ?? "";

  // The typed-name safeguard the feature's own non-negotiable requires --
  // deliberately checked here, not just left to the client, since the
  // client-side check alone would be trivially bypassable from devtools
  // for an action this irreversible.
  if (!confirmName || confirmName !== targetName) {
    return NextResponse.json(
      {
        error: `Type "${targetName}" exactly to confirm this permanent deletion.`,
      },
      { status: 400 },
    );
  }

  const targetDesignation = designationForRoles(targetMembership.roles ?? []);
  const allowed = canPurgeMember({
    actorProfileId: actor.profileId,
    actorDesignation: actor.designation,
    targetProfileId,
    targetCurrentDesignation: targetDesignation,
    targetIsActive: targetMembership.active,
    targetIsPurged: targetMembership.purged_at !== null,
  });
  if (!allowed) {
    return NextResponse.json(
      {
        error: targetMembership.active
          ? "This person must be deactivated before they can be purged."
          : targetMembership.purged_at !== null
            ? "This person has already been purged."
            : "You are not able to purge this person.",
      },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("purge_inactive_member", {
    p_organization_id: actor.organizationId,
    p_target_profile_id: targetProfileId,
    p_reason: reason && reason.length >= 3 ? reason : null,
  });
  if (rpcError) {
    return NextResponse.json(
      { error: "Unable to purge this person right now. Nothing was changed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
