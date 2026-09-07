import "server-only";

import { createAuthPassword } from "@/lib/passcode-security";
import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseAuthClient = {
  auth: {
    signInWithPassword: (input: {
      email: string;
      password: string;
    }) => Promise<{ error: { message: string } | null }>;
  };
};

export type VerifyPasscodeResult = {
  ok: boolean;
  verifiedVia: "derived" | "legacy" | null;
};

/**
 * Every credential created before this function existed has the RAW
 * passcode as its Supabase Auth password (that's all `createUser` and
 * `signInWithPassword` ever required, until `updateUserById` proved they
 * shouldn't have been relied on -- see createAuthPassword's comment).
 * There is no bulk-migration path available: the raw passcode is never
 * stored anywhere, so nothing server-side can recompute a derived
 * password for an account that hasn't typed its passcode in since this
 * shipped. Every verification therefore tries the derived password
 * first (the steady-state, already-migrated case) and falls back to the
 * raw passcode (the legacy case) rather than assuming one or the other.
 *
 * This function only verifies -- it never writes anything. A caller that
 * gets `verifiedVia: "legacy"` back and wants to opportunistically
 * upgrade that account does so itself (see /api/auth/passcode/route.ts,
 * the one caller where that upgrade is worth doing: the passcode isn't
 * about to change, so this is the only chance to migrate the account
 * until its next sign-in). The other two callers -- self-change and
 * reset -- always write a brand new derived password moments later
 * regardless of how the old one verified, so migrating here first would
 * just be an extra write immediately overwritten by another one.
 */
export async function verifyPasscode(
  supabase: SupabaseAuthClient,
  input: { syntheticEmail: string; organizationId: string; passcode: string },
): Promise<VerifyPasscodeResult> {
  const derivedPassword = createAuthPassword(
    input.organizationId,
    input.passcode,
  );
  const { error: derivedError } = await supabase.auth.signInWithPassword({
    email: input.syntheticEmail,
    password: derivedPassword,
  });
  if (!derivedError) return { ok: true, verifiedVia: "derived" };

  const { error: legacyError } = await supabase.auth.signInWithPassword({
    email: input.syntheticEmail,
    password: input.passcode,
  });
  if (!legacyError) return { ok: true, verifiedVia: "legacy" };

  return { ok: false, verifiedVia: null };
}

/**
 * Best-effort, fire-and-forget-shaped (but awaited) upgrade of a legacy
 * account to the derived-password scheme, called only after
 * verifyPasscode has already returned `verifiedVia: "legacy"` for this
 * exact passcode. Never allowed to turn a successful sign-in into a
 * failed response: a failure here is logged and swallowed, leaving the
 * account exactly as usable as it was before this call (still on the
 * legacy scheme, tried again on their next sign-in).
 */
export async function migrateLegacyAuthPassword(
  admin: ReturnType<typeof createAdminClient>,
  input: { profileId: string; organizationId: string; passcode: string },
): Promise<void> {
  const { error } = await admin.auth.admin.updateUserById(input.profileId, {
    password: createAuthPassword(input.organizationId, input.passcode),
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
