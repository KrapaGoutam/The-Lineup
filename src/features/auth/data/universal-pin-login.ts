import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  createGlobalPasscodeLocator,
  createPersonAuthPassword,
} from "@/lib/passcode-security";
import { createClient } from "@/lib/supabase/server";
import { clearActiveContextCookie } from "@/features/context/data/context-cookie-writer";
import { markPinAttemptSucceeded, readPersonalPinAccount } from "./global-pin";

export async function universalPinLogin(
  admin: SupabaseClient<Database>,
  passcode: string,
  attemptId: string,
) {
  const deny = () =>
    NextResponse.json({ error: "PIN not recognized." }, { status: 401 });
  const { data: account, error } = await admin
    .from("personal_pin_accounts")
    .select("profile_id, synthetic_email, locator, operation_id, updated_at")
    .eq("locator", createGlobalPasscodeLocator(passcode))
    .is("operation_id", null)
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "Sign-in service unavailable. Please try again." },
      { status: 503 },
    );
  if (!account) return deny();
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.signInWithPassword({
    email: account.synthetic_email,
    password: createPersonAuthPassword(account.profile_id, passcode),
  });
  if (
    authError ||
    data.user?.id !== account.profile_id ||
    data.session?.user.id !== account.profile_id
  ) {
    if (data.session) await supabase.auth.signOut();
    return deny();
  }
  try {
    // Reject a concurrent reset/enrollment; a lookup alone is never proof.
    const current = await readPersonalPinAccount(admin, account.profile_id);
    if (
      !current ||
      current.operation_id ||
      current.locator !== account.locator ||
      current.updated_at !== account.updated_at
    ) {
      await supabase.auth.signOut();
      return deny();
    }
    await clearActiveContextCookie();
    await markPinAttemptSucceeded(admin, attemptId);
    return NextResponse.json({ next: "/" });
  } catch {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "Sign-in service unavailable. Please try again." },
      { status: 503 },
    );
  }
}
