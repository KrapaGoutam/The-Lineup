import "server-only";

import {
  createPasscodeLocator,
  createPersonAuthPassword,
} from "@/lib/passcode-security";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type AuthProber = (input: {
  email: string;
  password: string;
}) => Promise<{
  ok: boolean;
  isConfirmedInvalid?: boolean;
}>;

export type RotatePasscodeResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      severity: "recoverable" | "locked_out";
    };

/**
 * V2-009 B3 / F-1 / F-3 / F-5: Rotate passcode credentials and update the Supabase Auth
 * password using canonical person-level derivation (createPersonAuthPassword(profileId, newPasscode)).
 *
 * Implements:
 * - F-1: Tracks every updated credential locator, checks each compensating revert
 *   result, and only returns "recoverable" when consistent rollback is verified.
 *   If any revert fails, returns "locked_out".
 * - F-3: On ambiguous or reported Auth update errors, probes the new password with an
 *   isolated non-persisting client. If probe confirms new password applied, marks
 *   rotation successful. If confirmed NOT applied, performs safe compensating reverts.
 *   If indeterminate, returns "locked_out" without blind locator reverts.
 * - Concurrency protection: optimistic row matching via `.eq("id", id).eq("locator", expectedLocator)`.
 */
export async function rotatePasscodeCredential(
  admin: AdminClient,
  input: {
    organizationId?: string;
    profileId: string;
    newPasscode: string;
    currentPasscode?: string;
    authProber?: AuthProber;
  },
): Promise<RotatePasscodeResult> {
  const { data: credentials, error: readError } = await admin
    .from("passcode_credentials")
    .select("id, organization_id, locator, synthetic_email")
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
    const { data: updatedRows, error: updateLocatorError } = await admin
      .from("passcode_credentials")
      .update({ locator: newLocator, updated_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("locator", c.locator)
      .select("id");

    const updateSucceeded =
      !updateLocatorError &&
      Array.isArray(updatedRows) &&
      updatedRows.length === 1;

    if (!updateSucceeded) {
      // Revert any previously updated credentials in this batch
      let allRevertsSucceeded = true;
      for (const updated of updatedCredentials) {
        const { data: revertedRows, error: revertError } = await admin
          .from("passcode_credentials")
          .update({
            locator: updated.oldLocator,
            updated_at: new Date().toISOString(),
          })
          .eq("id", updated.id)
          .eq("locator", updated.newLocator)
          .select("id");

        if (
          revertError ||
          !Array.isArray(revertedRows) ||
          revertedRows.length !== 1
        ) {
          allRevertsSucceeded = false;
        }
      }

      if (!allRevertsSucceeded) {
        return {
          ok: false,
          error:
            "Something went wrong updating this passcode, and it couldn't be fully undone. Please ask an administrator to reset your passcode.",
          severity: "locked_out",
        };
      }

      if (updateLocatorError?.code === "23505") {
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

  // Update the single Auth user's password using person-level derivation bound to profileId
  const newPersonPassword = createPersonAuthPassword(
    input.profileId,
    input.newPasscode,
  );
  const { error: authError } = await admin.auth.admin.updateUserById(
    input.profileId,
    { password: newPersonPassword },
  );

  if (!authError) {
    return { ok: true };
  }

  // F-3: Auth update returned an error. Before reverting locators, probe whether the Auth password
  // change was actually applied (e.g. gateway timeout, socket reset, or transient error after commit).
  const syntheticEmail = credentials[0]?.synthetic_email;
  let authPasswordActuallyApplied = false;
  let authPasswordConfirmedNotApplied = false;

  if (input.authProber) {
    const probe = await input.authProber({
      email: syntheticEmail,
      password: newPersonPassword,
    });
    authPasswordActuallyApplied = probe.ok;
    authPasswordConfirmedNotApplied = Boolean(probe.isConfirmedInvalid);
  } else if (
    syntheticEmail &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    try {
      const { createClient: createSupabaseClient } = await import(
        "@supabase/supabase-js"
      );
      const isolatedClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { data: probeData, error: probeError } =
        await isolatedClient.auth.signInWithPassword({
          email: syntheticEmail,
          password: newPersonPassword,
        });

      if (!probeError && probeData?.user?.id === input.profileId) {
        authPasswordActuallyApplied = true;
      } else if (
        probeError &&
        (probeError.message
          ?.toLowerCase()
          .includes("invalid login credentials") ||
          probeError.status === 400)
      ) {
        authPasswordConfirmedNotApplied = true;
      }
    } catch {
      // Probe failed due to network error; state remains uncertain
    }
  }

  if (authPasswordActuallyApplied) {
    // New password is valid in GoTrue and locators are already updated.
    return { ok: true };
  }

  if (authPasswordConfirmedNotApplied) {
    // Auth password confirmed NOT changed -- revert all updated locators back to old values
    let allReverted = true;
    for (const item of updatedCredentials) {
      let itemReverted = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { data: revertedRows, error: revertError } = await admin
          .from("passcode_credentials")
          .update({
            locator: item.oldLocator,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .eq("locator", item.newLocator)
          .select("id");

        if (
          !revertError &&
          Array.isArray(revertedRows) &&
          revertedRows.length === 1
        ) {
          itemReverted = true;
          break;
        }
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
  }

  // Either compensation was incomplete or the Auth update state was indeterminate/uncertain.
  // Fail closed without falsely claiming recoverable.
  return {
    ok: false,
    error:
      "Something went wrong updating this passcode, and it couldn't be fully undone. Neither the old nor the new passcode may work right now — try resetting it again, or contact support if it keeps failing.",
    severity: "locked_out",
  };
}
