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
let inFlight: Promise<void> | null = null;

export function requestSignOut(): Promise<void> {
  const run: Promise<void> = (async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // Network failure: the server still rejects/expires the session on its
      // own; the UI has already returned to the login screen.
    }
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
