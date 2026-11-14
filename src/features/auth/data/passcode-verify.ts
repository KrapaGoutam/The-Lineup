import "server-only";

import type { Session } from "@supabase/supabase-js";

import {
  createAuthPassword,
  createPersonAuthPassword,
} from "@/lib/passcode-security";
import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseAuthClient = {
  auth: {
    signInWithPassword: (input: {
      email: string;
      password: string;
    }) => Promise<{
      data?: { session: Session | null } | null;
      error: { message: string } | null;
    }>;
  };
};

export type VerifyPasscodeResult = {
  ok: boolean;
  verifiedVia: "person" | "derived" | "legacy" | null;
  session?: Session | null;
};

/**
 * V2-009 B3: Every credential verification tries the canonical person-level
 * password first (createPersonAuthPassword, derived from the passcode alone).
 * If that fails, it falls back to the legacy organization-derived password
 * (createAuthPassword), and finally to the legacy raw 4-digit passcode.
 *
 * This function only verifies -- it never writes anything. A caller that
 * gets `verifiedVia: "derived"` or `verifiedVia: "legacy"` back can
 * opportunistically upgrade that account to the person-level scheme using
 * migrateLegacyAuthPassword.
 */
export async function verifyPasscode(
  supabase: SupabaseAuthClient,
  input: { syntheticEmail: string; organizationId: string; passcode: string },
): Promise<VerifyPasscodeResult> {
  const personPassword = createPersonAuthPassword(input.passcode);
  const { data: personData, error: personError } =
    await supabase.auth.signInWithPassword({
      email: input.syntheticEmail,
      password: personPassword,
    });
  if (!personError) {
    return {
      ok: true,
      verifiedVia: "person",
      session: personData?.session ?? null,
    };
  }

  const derivedPassword = createAuthPassword(
    input.organizationId,
    input.passcode,
  );
  const { data: derivedData, error: derivedError } =
    await supabase.auth.signInWithPassword({
      email: input.syntheticEmail,
      password: derivedPassword,
    });
  if (!derivedError) {
    return {
      ok: true,
      verifiedVia: "derived",
      session: derivedData?.session ?? null,
    };
  }

  const { data: legacyData, error: legacyError } =
    await supabase.auth.signInWithPassword({
      email: input.syntheticEmail,
      password: input.passcode,
    });
  if (!legacyError) {
    return {
      ok: true,
      verifiedVia: "legacy",
      session: legacyData?.session ?? null,
    };
  }

  return { ok: false, verifiedVia: null };
}

/**
 * Best-effort upgrade of a legacy account (raw passcode or legacy org-derived)
 * to the canonical person-level password scheme. Never allowed to turn a
 * successful sign-in into a failed response: a failure here is logged and
 * swallowed.
 */
export async function migrateLegacyAuthPassword(
  admin: ReturnType<typeof createAdminClient>,
  input: { profileId: string; organizationId?: string; passcode: string },
): Promise<void> {
  const { error } = await admin.auth.admin.updateUserById(input.profileId, {
    password: createPersonAuthPassword(input.passcode),
  });
  if (error) {
    console.error(
      "migrateLegacyAuthPassword: opportunistic migration failed, account remains on the legacy scheme",
      {
        profileId: input.profileId,
        organizationId: input.organizationId,
        error,
      },
    );
  }
}
