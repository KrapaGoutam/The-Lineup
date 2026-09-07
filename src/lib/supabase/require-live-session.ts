import "server-only";

import { createClient } from "./server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type SessionInvalidResult = {
  ok: false;
  error: string;
  sessionInvalid: true;
};

/**
 * Feature 017. A shared, one-line guard every real-mode Server Action
 * calls before doing its actual RLS-respecting work. `supabase.auth.getUser()`
 * is the same lightweight, already-established check `finalizeTipsAction`
 * used before this feature existed -- a network round trip to GoTrue,
 * not an extra Postgres query -- and it's what actually detects a
 * mid-session deactivation: a ban (part of Feature 017's deactivation)
 * makes this fail immediately on an already-issued, unexpired token,
 * confirmed live against the hosted project.
 *
 * Why this matters even though RLS already blocks the underlying write
 * unconditionally: RLS returning a bare permission error (or, for a
 * plain `update()` with no matching rows, silently updating nothing at
 * all with no error) is not a signal a client can safely tell apart from
 * an ordinary failure. This check runs first specifically so a dead
 * session gets a distinct, recognizable result (`sessionInvalid: true`)
 * the client reacts to by signing itself out cleanly, instead of a raw
 * error banner or a silent no-op.
 *
 * Returns `null` when the session is live (the caller should proceed);
 * returns a ready-to-return `SessionInvalidResult` otherwise -- every
 * file's own `ActionResult<T>` accepts this object structurally, since
 * its shape (`ok`, `error`, `sessionInvalid`) matches each file's own
 * `ok: false` branch exactly.
 */
export async function requireLiveSession(
  supabase: SupabaseClient,
): Promise<SessionInvalidResult | null> {
  const { data } = await supabase.auth.getUser();
  if (data.user) return null;
  return {
    ok: false,
    error: "Your session is no longer valid. Please sign in again.",
    sessionInvalid: true,
  };
}
