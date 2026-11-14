import "server-only";

import {
  createPasscodeLocator,
  createPersonAuthPassword,
} from "@/lib/passcode-security";
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
 * V2-009 B3: Rotate passcode credentials and update the Supabase Auth password
 * to the canonical person-level password (createPersonAuthPassword).
 *
 * For users with memberships in multiple organizations, this rotates the
 * locators across all of their credentials atomically (with compensating reverts),
 * ensuring the person's single 4-digit PIN remains synchronized everywhere.
 */
export async function rotatePasscodeCredential(
  admin: AdminClient,
  input: {
    organizationId?: string;
    profileId: string;
    newPasscode: string;
  },
): Promise<RotatePasscodeResult> {
  const { data: credentials, error: readError } = await admin
    .from("passcode_credentials")
    .select("id, organization_id, locator")
    .eq("profile_id", input.profileId);

  if (readError || !credentials || credentials.length === 0) {
    return {
      ok: false,
      error: "Could not find a passcode credential for that person.",
      severity: "recoverable",
    };
  }

  if (
    input.organizationId &&
    !credentials.some((c) => c.organization_id === input.organizationId)
  ) {
    return {
      ok: false,
      error: "Could not find a passcode credential for that person.",
      severity: "recoverable",
    };
  }

  // Pre-check for locator collisions across all organizations before writing
  for (const c of credentials) {
    const candidateLocator = createPasscodeLocator(
      c.organization_id,
      input.newPasscode,
    );
    const { data: collision } = await admin
      .from("passcode_credentials")
      .select("id")
      .eq("organization_id", c.organization_id)
      .eq("locator", candidateLocator)
      .neq("id", c.id)
      .maybeSingle();

    if (collision) {
      return {
        ok: false,
        error: "That passcode is already in use — choose a different one.",
        severity: "recoverable",
      };
    }
  }

  // Update locators for all credentials held by this profile
  const updatedCredentials: Array<{
    id: string | number;
    organizationId: string;
    oldLocator: string;
    newLocator: string;
  }> = [];

  for (const c of credentials) {
    const newLocator = createPasscodeLocator(
      c.organization_id,
      input.newPasscode,
    );
    const { error: updateLocatorError } = await admin
      .from("passcode_credentials")
      .update({ locator: newLocator, updated_at: new Date().toISOString() })
      .eq("id", c.id);

    if (updateLocatorError) {
      // Revert any previously updated credentials in this batch
      for (const updated of updatedCredentials) {
        await admin
          .from("passcode_credentials")
          .update({
            locator: updated.oldLocator,
            updated_at: new Date().toISOString(),
          })
          .eq("id", updated.id);
      }
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

    updatedCredentials.push({
      id: c.id,
      organizationId: c.organization_id,
      oldLocator: c.locator,
      newLocator,
    });
  }

  // Update the single Auth user's password using the canonical person-level password
  const { error: authError } = await admin.auth.admin.updateUserById(
    input.profileId,
    { password: createPersonAuthPassword(input.newPasscode) },
  );
  if (!authError) {
    return { ok: true };
  }

  // Auth update failed -- revert all updated locators back to what they were
  let allReverted = true;
  for (const item of updatedCredentials) {
    let itemReverted = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error: revertError } = await admin
        .from("passcode_credentials")
        .update({
          locator: item.oldLocator,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      if (!revertError) {
        itemReverted = true;
        break;
      }
      console.error(
        `rotatePasscodeCredential: revert attempt ${attempt + 1} failed for credential ${item.id}`,
        revertError,
      );
    }
    if (!itemReverted) {
      allReverted = false;
    }
  }

  if (allReverted) {
    return {
      ok: false,
      error: "Unable to update the passcode right now. Please try again.",
      severity: "recoverable",
    };
  }

  console.error(
    "rotatePasscodeCredential: UNRECOVERED -- locator(s) changed to a new value but the Auth password update and compensating revert(s) failed. This profile cannot sign in with either passcode until it is reset again.",
    {
      profileId: input.profileId,
      credentials: updatedCredentials.map((u) => u.id),
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
