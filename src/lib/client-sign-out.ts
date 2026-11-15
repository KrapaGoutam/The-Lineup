"use client";

/**
 * Client sign-out that can be awaited by the next sign-in.
 *
 * A forced sign-out (revoked session) is fire-and-forget for the UI, but its
 * POST must never land AFTER the next person's sign-in and end THEIR session
 * (or wipe their freshly selected workspace). The login screen awaits
 * `settleSignOut()` before it submits a passcode, so the two requests are
 * strictly ordered: sign-out, then sign-in.
 */
import { publishContextEvent } from "@/features/context/components/context-sync-channel";

let inFlight: Promise<void> | null = null;

export function requestSignOut(): Promise<void> {
  const run: Promise<void> = (async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // Network failure: the server still rejects/expires the session on its
      // own; the UI has already returned to the login screen.
    }
    // V2-003.005: other tabs re-verify against the server (they learn nothing
    // from this message beyond "ask again"). Sent after the POST settled so a
    // peer's check cannot race ahead of the cookie expiry.
    publishContextEvent("signed_out");
  })().finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

/** Resolves once any in-flight sign-out request has finished. */
export async function settleSignOut(): Promise<void> {
  if (inFlight) await inFlight;
}
