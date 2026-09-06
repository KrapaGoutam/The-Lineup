import "server-only";

import { createPasscodeLocator } from "@/lib/passcode-security";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type RotatePasscodeResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /**
       * "recoverable": nothing changed (a validation failure, or a change
       * that failed and was fully undone) -- the person can just try
       * again. "locked_out": the worst case named in Feature 016's spec --
       * the locator was updated to the new passcode, the Supabase Auth
       * password update then failed, AND the compensating revert also
       * failed. Neither the old nor the new passcode will sign this
       * person in until a human intervenes (another reset, once whatever
       * is failing recovers). Surfaced as its own severity specifically
       * so the two callers (self-change, manager reset) can each show a
       * message that tells the truth about which case happened, instead
       * of a single generic "try again" that would be actively
       * misleading in the locked-out case.
       */
      severity: "recoverable" | "locked_out";
    };

/**
 * The one place `passcode_credentials.locator` and the corresponding
 * Supabase Auth account's password are ever changed together, for both
 * self-service change and manager-initiated reset -- see
 * docs/features/016-passcode-management.md's "How the HMAC locator and
 * the Supabase Auth password stay in sync" for the full reasoning behind
 * this exact ordering. Every caller must already have decided this
 * profile is allowed to have its passcode changed; this function only
 * performs the change, it does not authorize it.
 */
export async function rotatePasscodeCredential(
  admin: AdminClient,
  input: {
    organizationId: string;
    profileId: string;
    newPasscode: string;
  },
): Promise<RotatePasscodeResult> {
  const { data: credential, error: readError } = await admin
    .from("passcode_credentials")
    .select("id, locator")
    .eq("organization_id", input.organizationId)
    .eq("profile_id", input.profileId)
    .maybeSingle();
  if (readError || !credential) {
    return {
      ok: false,
      error: "Could not find a passcode credential for that person.",
      severity: "recoverable",
    };
  }

  const oldLocator = credential.locator;
  const newLocator = createPasscodeLocator(
    input.organizationId,
    input.newPasscode,
  );

  // Locator first. Nothing externally visible changes yet, so a failure
  // here -- most commonly the new passcode already being claimed by
  // someone else in this organization -- needs no rollback at all.
  const { error: updateLocatorError } = await admin
    .from("passcode_credentials")
    .update({ locator: newLocator, updated_at: new Date().toISOString() })
    .eq("id", credential.id);

  if (updateLocatorError) {
    if (updateLocatorError.code === "23505") {
      return {
        ok: false,
        error: "That passcode is already in use — choose a different one.",
        severity: "recoverable",
      };
    }
    return {
      ok: false,
      error: "Unable to update the passcode right now. Please try again.",
      severity: "recoverable",
    };
  }

  const { error: authError } = await admin.auth.admin.updateUserById(
    input.profileId,
    { password: input.newPasscode },
  );
  if (!authError) {
    return { ok: true };
  }

  // The Auth password update failed after the locator already changed --
  // revert the locator back to what it was. Retried once: this is the one
  // step whose failure leaves the row and the Auth account disagreeing
  // about the passcode, so it's worth one extra attempt before accepting
  // the worst case.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error: revertError } = await admin
      .from("passcode_credentials")
      .update({ locator: oldLocator, updated_at: new Date().toISOString() })
      .eq("id", credential.id);
    if (!revertError) {
      return {
        ok: false,
        error: "Unable to update the passcode right now. Please try again.",
        severity: "recoverable",
      };
    }
    console.error(
      `rotatePasscodeCredential: revert attempt ${attempt + 1} failed`,
      revertError,
    );
  }

  // Both the Auth update and its compensating revert failed. The row now
  // points at newLocator; the Auth account's password is still the old
  // passcode. Neither the old passcode (locator lookup fails -- the row
  // no longer has it) nor the new passcode (Auth's password was never
  // actually changed) will sign this person in. There is no UI-safe way
  // to auto-recover from this -- logged loudly since it needs a human to
  // notice and reset the passcode again once whatever is failing clears.
  console.error(
    "rotatePasscodeCredential: UNRECOVERED -- locator changed to a new value but the Auth password update and its compensating revert both failed. This profile cannot sign in with either passcode until it is reset again.",
    {
      organizationId: input.organizationId,
      profileId: input.profileId,
      credentialId: credential.id,
      authError,
    },
  );
  return {
    ok: false,
    error:
      "Something went wrong updating this passcode, and it couldn't be fully undone. Neither the old nor the new passcode may work right now — try resetting it again, or contact support if it keeps failing.",
    severity: "locked_out",
  };
}
