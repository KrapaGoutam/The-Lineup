import "server-only";

import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";

import { ACTIVE_CONTEXT_COOKIE_NAME } from "@/features/context/domain/context-cookie";

/**
 * V2-003.001 — READ-ONLY access to the active-context cookie.
 *
 * Returns the raw (untrusted) cookie value or null. This module deliberately
 * exposes no setter: persisting / renewing / clearing the cookie belongs to
 * V2-003.004. Fails soft to `null` when the request scope has no cookie store.
 */
export async function readActiveContextCookieValue(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(ACTIVE_CONTEXT_COOKIE_NAME)?.value ?? null;
  } catch (error) {
    // `cookies()` signals "this render is request-time/dynamic" by throwing a
    // framework error. Swallowing it would let Next prerender and cache an
    // unauthenticated snapshot, so it must always propagate.
    unstable_rethrow(error);
    return null;
  }
}
