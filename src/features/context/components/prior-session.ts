/**
 * V2-003.005 -- a sign-in must never inherit the PREVIOUS employee's location
 * from this tab's address bar.
 *
 * The workspace canonicalizes the URL to `?location=<shown>`. The shell clears
 * it when it signs itself out, but a session can also end underneath a tab (a
 * revoked session surfaced by a server re-render, another tab signing out), in
 * which case the login screen appears with the old `?location=` still in the
 * address bar. The next person's passcode sign-in would then read it as a
 * DELIBERATE deep link and open the previous employee's location (when they
 * are eligible for it), contradicting V2-003.004's "a fresh sign-in never
 * inherits a previous workspace".
 *
 * The module-level flag lives as long as the document and survives the shell's
 * remounts. It is only set while a real signed-in workspace is mounted, so a
 * deep link opened WHILE signed out (no prior workspace in this document) is
 * still honoured after sign-in.
 */
let workspaceWasOpen = false;

/** Call while a real (non-demo) signed-in workspace is mounted. */
export function noteWorkspaceOpened(): void {
  workspaceWasOpen = true;
}

/**
 * Call right before a passcode sign-in refreshes the page. If this document
 * showed a workspace earlier, the address bar is reset to the bare route (same
 * as the shell's own sign-out) and `true` is returned. One-shot.
 */
export function clearPriorWorkspaceUrl(pathname: string): boolean {
  if (!workspaceWasOpen) return false;
  workspaceWasOpen = false;
  window.history.replaceState(null, "", pathname);
  return true;
}
