import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// GoTrue's ban_duration has no literal "forever" -- it's a plain
// Go-style duration string ("2h45m") with no infinite value. ~100 years
// is the practical community convention for an effectively permanent
// ban, reversed explicitly by reactivateMember ("none"), never by
// waiting it out.
const PERMANENT_BAN_DURATION = "876000h";

export type CoordinatedWriteOutcome = {
  membership: boolean;
  credential: boolean;
  ban: boolean;
};

export type SetMemberActiveResult =
  | { ok: true }
  | { ok: false; error: string; writes: CoordinatedWriteOutcome };

/**
 * Feature 017. The one place `memberships.active`, `passcode_credentials.active`,
 * and the member's Supabase Auth ban are ever changed together, for both
 * deactivation (`active: false`) and its exact symmetric reverse,
 * reactivation (`active: true`). Every caller must already have decided
 * this profile is allowed to be (de)activated; this function only
 * performs the three writes, it does not authorize them.
 *
 * Unlike rotatePasscodeCredential (Feature 016), there is no single
 * clean revert target here -- three independent systems, not one DB row
 * with an obvious "put it back" value. Per the approved spec: best
 * effort, in a fixed order, no revert on a partial failure.
 *
 * Order matters: `memberships.active` first, because `private.has_org_role`
 * -- the function nearly every RLS policy in this schema calls -- requires
 * it, so landing this write first blocks every actual data operation
 * immediately even if the next two steps then fail. `passcode_credentials.active`
 * second (blocks the locator lookup at the very first step of a future
 * sign-in attempt). The Auth ban last (closes the identity-check gap --
 * getCurrentUser()/getUser() -- for a session already in progress;
 * confirmed live that this does NOT gate direct RLS reads, which is
 * exactly why membership.active has to land first, not this).
 *
 * Every step is attempted regardless of an earlier step's outcome, to
 * land as much protection as possible even if one write fails for an
 * unrelated reason -- stopping early would leave MORE exposed, not less.
 * Each step is also naturally idempotent (setting a column to a value it
 * may already hold, or re-banning/un-banning an account already in that
 * state, is harmless), so calling this again to retry a partial failure
 * is always safe.
 */
async function setMemberActive(
  admin: AdminClient,
  input: { organizationId: string; profileId: string; active: boolean },
): Promise<SetMemberActiveResult> {
  const writes: CoordinatedWriteOutcome = {
    membership: false,
    credential: false,
    ban: false,
  };

  const { error: membershipError } = await admin
    .from("memberships")
    .update({ active: input.active })
    .eq("organization_id", input.organizationId)
    .eq("profile_id", input.profileId);
  writes.membership = !membershipError;

  const { error: credentialError } = await admin
    .from("passcode_credentials")
    .update({ active: input.active, updated_at: new Date().toISOString() })
    .eq("organization_id", input.organizationId)
    .eq("profile_id", input.profileId);
  writes.credential = !credentialError;

  const { error: banError } = await admin.auth.admin.updateUserById(
    input.profileId,
    { ban_duration: input.active ? "none" : PERMANENT_BAN_DURATION },
  );
  writes.ban = !banError;

  if (writes.membership && writes.credential && writes.ban) {
    return { ok: true };
  }

  const failedParts = [
    !writes.membership && "membership",
    !writes.credential && "passcode credential",
    !writes.ban && "account lock",
  ].filter((part): part is string => Boolean(part));

  console.error(
    `setMemberActive: partial failure setting active=${input.active} for profile ${input.profileId} in org ${input.organizationId}`,
    { writes, membershipError, credentialError, banError },
  );

  return {
    ok: false,
    error:
      `${input.active ? "Reactivation" : "Deactivation"} partially failed ` +
      `(${failedParts.join(", ")} did not update). Already-completed steps ` +
      "are safe to leave as-is -- try again to retry just what's left.",
    writes,
  };
}

export function deactivateMember(
  admin: AdminClient,
  input: { organizationId: string; profileId: string },
): Promise<SetMemberActiveResult> {
  return setMemberActive(admin, { ...input, active: false });
}

export function reactivateMember(
  admin: AdminClient,
  input: { organizationId: string; profileId: string },
): Promise<SetMemberActiveResult> {
  return setMemberActive(admin, { ...input, active: true });
}
