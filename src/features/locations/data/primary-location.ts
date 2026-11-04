import "server-only";

import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import {
  listCurrentEligibleContexts,
  resolveCurrentActiveContext,
} from "@/features/context/data/active-context";
import { readActiveContextCookieValue } from "@/features/context/data/context-cookie-reader";
import type { VerifiedLocationScope } from "@/features/context/domain/active-context";
import { parseActiveContextCookie } from "@/features/context/domain/context-cookie";
import {
  hintAgreesWithContext,
  parseRequestWorkspaceHint,
} from "@/features/context/domain/request-consistency";
import type { RequestWorkspaceHint } from "@/features/context/domain/request-consistency";

/**
 * V2-003.004 — which location does a module Server Action / follow-up read
 * operate on? (Legacy helper name; full module scoping is V2-005.)
 *
 * The operational context is the SERVER-VERIFIED PERSISTED context, never the
 * browser's `Referer`:
 *
 *  1. Cookie present and well-formed → it must name THIS organization and
 *     resolve, right now, through the canonical resolver (authenticated user,
 *     active membership/assignment or Overall role, active, non-archived
 *     location). A cookie for another organization, a stale/revoked pair or a
 *     malformed value is a SAFE DENIAL (`null`) -- never a substitute location.
 *  2. No cookie → the caller's single canonical eligible location in this
 *     organization (V2-003.003); zero or several is ambiguous → `null`.
 *  3. Consistency: the same-origin `Referer` (what the user is looking at) may
 *     only make a request FAIL CLOSED when it names an explicit location that
 *     differs from the verified one. It never selects a location and its
 *     absence changes nothing, so a request with no `Referer` still resolves
 *     from the persisted context.
 *
 * Time zone always comes from the verified location row.
 *
 * The application-ENTRY path (`loadPageData`) does not call this: it resolves
 * a verified context once and passes the exact location to every initial
 * loader through `locationForLoader`.
 */
export async function getPrimaryLocation(organizationId: string) {
  const signals = await readRequestSignals();

  const cookie = parseActiveContextCookie(signals.rawCookie);
  if (cookie.status === "malformed") return null;

  if (cookie.status === "present") {
    // A persisted context for another organization can never operate this one.
    if (cookie.selection.organizationId !== organizationId) return null;
    const result = await resolveCurrentActiveContext({
      routeSlug: null,
      cookieValue: signals.rawCookie,
    });
    if (
      result.status !== "resolved" ||
      result.context.organizationId !== organizationId ||
      result.context.locationId !== cookie.selection.locationId
    ) {
      return null;
    }
    if (!hintAgreesWithContext(signals.hint, result.context)) return null;
    return {
      id: result.context.locationId,
      time_zone: result.context.timeZone,
    };
  }

  // No persisted context: only a single, server-verified eligible location in
  // THIS organization may be used (same facts + resolver as the entry path).
  const list = await listCurrentEligibleContexts();
  if (list.status !== "ok") return null;
  const inOrganization = list.contexts.filter(
    (context) => context.organizationId === organizationId,
  );
  if (inOrganization.length !== 1) return null;
  const sole = inOrganization[0];
  if (!hintAgreesWithContext(signals.hint, sole)) return null;
  return { id: sole.locationId, time_zone: sole.timeZone };
}

async function readRequestSignals(): Promise<{
  rawCookie: string | null;
  hint: RequestWorkspaceHint;
}> {
  const rawCookie = await readActiveContextCookieValue();
  let referer: string | null = null;
  let host: string | null = null;
  try {
    const requestHeaders = await headers();
    referer = requestHeaders.get("referer");
    host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  } catch (error) {
    unstable_rethrow(error);
  }
  return { rawCookie, hint: parseRequestWorkspaceHint({ referer, host }) };
}

export type LoaderLocation = { id: string; time_zone: string };

/**
 * Single choke point for "which location does this loader use?".
 *
 *  - With a verified scope (entry path): uses EXACTLY that location and time
 *    zone, and fails safe (null) if the scope belongs to a different
 *    organization than the one being loaded. It never substitutes another
 *    location.
 *  - Without one (legacy direct callers only): falls back to
 *    `getPrimaryLocation`, preserving existing behavior until V2-005.
 */
export async function locationForLoader(
  organizationId: string,
  scope?: VerifiedLocationScope,
): Promise<LoaderLocation | null> {
  if (scope) {
    if (scope.organizationId !== organizationId) return null;
    return { id: scope.locationId, time_zone: scope.timeZone };
  }
  return getPrimaryLocation(organizationId);
}
