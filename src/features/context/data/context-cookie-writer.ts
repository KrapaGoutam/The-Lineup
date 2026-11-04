import "server-only";

import { cookies, headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import {
  ACTIVE_CONTEXT_COOKIE_NAME,
  activeContextClearOptions,
  activeContextWriteOptions,
  serializeActiveContextCookie,
  shouldUseSecureCookie,
} from "@/features/context/domain/context-cookie";
import type { ActiveContextCookieSelection } from "@/features/context/domain/context-cookie";

/**
 * V2-003.004 — the ONLY place that writes / clears the active-context cookie.
 *
 * Callers must have authorized the selection first (see
 * `context-persistence.ts`); this module trusts nothing else and applies one
 * centralized attribute set so write and clear always share scope. Values come
 * from `serializeActiveContextCookie` (the single wire-format definition), so
 * a caller can only ever store two ids -- never roles, tokens or flags.
 *
 * Only usable where Next allows cookie mutation (Server Actions and Route
 * Handlers); it throws in a render, which is the intended guard against a
 * cookie write during an ordinary GET render.
 */

async function secureForRequest(): Promise<boolean> {
  let host: string | null = null;
  let forwardedProto: string | null = null;
  try {
    const requestHeaders = await headers();
    host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
    forwardedProto = requestHeaders.get("x-forwarded-proto");
  } catch (error) {
    unstable_rethrow(error);
  }
  return shouldUseSecureCookie({
    nodeEnv: process.env.NODE_ENV,
    host,
    forwardedProto,
  });
}

export async function writeActiveContextCookie(
  selection: ActiveContextCookieSelection,
): Promise<void> {
  const store = await cookies();
  store.set(
    ACTIVE_CONTEXT_COOKIE_NAME,
    serializeActiveContextCookie({
      organizationId: selection.organizationId.toLowerCase(),
      locationId: selection.locationId.toLowerCase(),
    }),
    activeContextWriteOptions(await secureForRequest()),
  );
}

/** Expires the cookie with the exact scope/attributes it was written with. */
export async function clearActiveContextCookie(): Promise<void> {
  const store = await cookies();
  store.set(
    ACTIVE_CONTEXT_COOKIE_NAME,
    "",
    activeContextClearOptions(await secureForRequest()),
  );
}
