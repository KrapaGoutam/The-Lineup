import { NextResponse } from "next/server";

import { clearActiveContextCookie } from "@/features/context/data/context-cookie-writer";
import { createClient } from "@/lib/supabase/server";

/**
 * Trusted server sign-out. V2-003.004: the persisted active-context cookie is
 * ALWAYS expired together with the auth session -- even when ending the
 * session fails -- so the next person on a shared device never inherits this
 * user's saved workspace. Failures are reported without credentials/tokens.
 */
export async function POST() {
  let signedOut = true;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) signedOut = false;
  } catch {
    signedOut = false;
  }

  let cleared = true;
  try {
    await clearActiveContextCookie();
  } catch {
    cleared = false;
  }

  const ok = signedOut && cleared;
  return NextResponse.json(
    { ok },
    { status: ok ? 200 : 500, headers: { "Cache-Control": "no-store" } },
  );
}
