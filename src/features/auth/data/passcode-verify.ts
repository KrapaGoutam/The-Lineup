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
      data?: {
        user?: { id: string } | null;
        session: Session | null;
      } | null;
      error: { message: string } | null;
    }>;
    signOut?: () => Promise<unknown>;
  };
};

export type VerifyPasscodeResult = {
  ok: boolean;
  verifiedVia: "person" | "derived" | "legacy" | null;
  session?: Session | null;
  user?: { id: string } | null;
};

function isIdentityBound(
  data:
    | {
        user?: { id: string } | null;
        session: Session | null;
      }
    | null
    | undefined,
  expectedProfileId: string,
): boolean {
  const userId = data?.user?.id ?? data?.session?.user?.id;
  return Boolean(userId && userId === expectedProfileId);
}

/**
 * V2-009 B3 / F-2 / F-5: Credential verification with canonical person-level
 * password derivation (createPersonAuthPassword(profileId, passcode)) and
 * fail-closed identity binding (authenticated user.id === input.profileId).
 *
 * Tries:
 * 1. Canonical person-level password bound to profile ID
 * 2. Pre-B3 organization-derived password (createAuthPassword)
 * 3. Legacy raw 4-digit passcode
 *
 * If authentication succeeds but the resulting user identity does not match
 * expectedProfileId, the session is cleared safely and verification fails closed.
 */
export async function verifyPasscode(
  supabase: SupabaseAuthClient,
  input: {
    profileId: string;
    syntheticEmail: string;
    organizationId: string;
    passcode: string;
  },
): Promise<VerifyPasscodeResult> {
  const personPassword = createPersonAuthPassword(
    input.profileId,
    input.passcode,
  );
  const { data: personData, error: personError } =
    await supabase.auth.signInWithPassword({
      email: input.syntheticEmail,
      password: personPassword,
    });
  if (!personError) {
    if (!isIdentityBound(personData, input.profileId)) {
      if (supabase.auth.signOut) {
        await supabase.auth.signOut().catch(() => {});
      }
      return { ok: false, verifiedVia: null };
    }
    return {
      ok: true,
      verifiedVia: "person",
      session: personData?.session ?? null,
      user: personData?.user ?? personData?.session?.user ?? null,
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
    if (!isIdentityBound(derivedData, input.profileId)) {
      if (supabase.auth.signOut) {
        await supabase.auth.signOut().catch(() => {});
      }
      return { ok: false, verifiedVia: null };
    }
    return {
      ok: true,
      verifiedVia: "derived",
      session: derivedData?.session ?? null,
      user: derivedData?.user ?? derivedData?.session?.user ?? null,
    };
  }

  const { data: legacyData, error: legacyError } =
    await supabase.auth.signInWithPassword({
      email: input.syntheticEmail,
      password: input.passcode,
    });
  if (!legacyError) {
    if (!isIdentityBound(legacyData, input.profileId)) {
      if (supabase.auth.signOut) {
        await supabase.auth.signOut().catch(() => {});
      }
      return { ok: false, verifiedVia: null };
    }
    return {
      ok: true,
      verifiedVia: "legacy",
      session: legacyData?.session ?? null,
      user: legacyData?.user ?? legacyData?.session?.user ?? null,
    };
  }

  return { ok: false, verifiedVia: null };
}

/**
 * Best-effort upgrade of a legacy account (raw passcode or legacy org-derived)
 * to the canonical person-level password scheme bound to profileId.
 */
export async function migrateLegacyAuthPassword(
  admin: ReturnType<typeof createAdminClient>,
  input: { profileId: string; organizationId?: string; passcode: string },
): Promise<void> {
  const { error } = await admin.auth.admin.updateUserById(input.profileId, {
    password: createPersonAuthPassword(input.profileId, input.passcode),
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
