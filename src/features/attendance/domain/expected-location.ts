/**
 * V2-006 (R1) — bind an attendance READ to the location the browser is showing.
 *
 * Reads derive their location from the server-verified persisted context (never from the
 * request). A second tab can change that context after this tab rendered its header, so a
 * later read would answer for ANOTHER branch under the old branch's label. The browser
 * therefore names the location it is displaying as an UNTRUSTED assertion; the server
 * compares it with the location it verified itself and refuses on any difference. The value
 * is never used to choose a location or a query (same contract as V2-003.005).
 *
 * `undefined` means a direct / legacy invocation that made no assertion: the verified
 * location is used exactly as before. Every UI call site supplies it.
 */
export function expectedLocationAgrees(
  expectedLocationId: string | undefined,
  verifiedLocationId: string,
): boolean {
  if (expectedLocationId === undefined) return true;
  return expectedLocationId.toLowerCase() === verifiedLocationId.toLowerCase();
}
