import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listCurrentEligibleContexts } from "@/features/context/data/active-context";
import {
  clearActiveContextCookie,
  writeActiveContextCookie,
} from "@/features/context/data/context-cookie-writer";
import type { AvailableContextSummary } from "@/features/context/domain/active-context";
import { isUuid } from "@/features/context/domain/context-cookie";
import { contextSwitchHref } from "@/features/context/domain/context-navigation";
import type { Database } from "@/types/database.generated";

/**
 * V2-003.004 — server-authoritative selection / clearing of the persisted
 * active context.
 *
 * The request is UNTRUSTED. The pair is accepted only when it appears in the
 * authenticated caller's eligible-context list, which is built from the same
 * RLS-bound facts and the same canonical resolver (`resolveUserAccess`,
 * `location:access`) as `resolveCurrentActiveContext`: location exists, belongs
 * to the organization, active, not archived, valid time zone, active
 * membership + assignment (or an Overall role). Nothing from the browser is
 * used as an identity, role or permission, and the service-role client is not
 * involved.
 *
 * Failure model:
 *  - A failed selection NEVER touches the cookie (a previously valid
 *    preference is not overwritten with an unauthorized target, nor cleared).
 *  - Denial reasons are deliberately coarse: they never reveal whether a
 *    tenant/location exists.
 */

export type SelectContextFailure =
  /** Malformed request. */
  | "invalid_request"
  /** No verified session. */
  | "unauthenticated"
  /** Not an eligible (organization, location) for this caller. */
  | "not_available"
  /** Auth/database failure: nothing was verified, nothing was written. */
  | "unavailable";

export type SelectContextResult =
  | {
      readonly ok: true;
      /** Server-built canonical destination (never derived from input). */
      readonly destination: string;
      readonly context: AvailableContextSummary;
    }
  | { readonly ok: false; readonly code: SelectContextFailure };

export type ClearContextResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "unauthenticated" | "unavailable" };

export interface ParsedSelectionInput {
  readonly organizationId: string;
  readonly locationId: string;
  readonly tab: string | null;
}

const TAB_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

/** Strict input schema: exactly two UUIDs (+ optional harmless `tab` token). */
export function parseSelectionInput(
  input: unknown,
): ParsedSelectionInput | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const allowed = new Set(["organizationId", "locationId", "tab"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return null;
  if (!isUuid(record.organizationId) || !isUuid(record.locationId)) return null;
  let tab: string | null = null;
  if (record.tab !== undefined && record.tab !== null) {
    if (typeof record.tab !== "string" || !TAB_PATTERN.test(record.tab)) {
      return null;
    }
    tab = record.tab;
  }
  return {
    organizationId: record.organizationId.toLowerCase(),
    locationId: record.locationId.toLowerCase(),
    tab,
  };
}

interface PersistenceDeps {
  readonly client?: SupabaseClient<Database>;
  /** Test seams; default to the real cookie writer. */
  readonly writeCookie?: typeof writeActiveContextCookie;
  readonly clearCookie?: typeof clearActiveContextCookie;
}

export async function selectActiveContext(
  input: unknown,
  deps: PersistenceDeps = {},
): Promise<SelectContextResult> {
  const parsed = parseSelectionInput(input);
  if (!parsed) return { ok: false, code: "invalid_request" };

  const list = await listCurrentEligibleContexts({ client: deps.client });
  if (list.status === "unauthenticated") {
    return { ok: false, code: "unauthenticated" };
  }
  if (list.status === "error") return { ok: false, code: "unavailable" };

  const match = list.contexts.find(
    (context) =>
      context.organizationId === parsed.organizationId &&
      context.locationId === parsed.locationId,
  );
  if (!match) return { ok: false, code: "not_available" };

  try {
    await (deps.writeCookie ?? writeActiveContextCookie)({
      organizationId: match.organizationId,
      locationId: match.locationId,
    });
  } catch (error) {
    console.error("selectActiveContext: cookie write failed", error);
    return { ok: false, code: "unavailable" };
  }

  return {
    ok: true,
    destination: contextSwitchHref(
      match,
      parsed.tab ? `tab=${encodeURIComponent(parsed.tab)}` : "",
    ),
    context: match,
  };
}

/**
 * Clears the persisted preference. Requires a verified session so an
 * unauthenticated request cannot touch the cookie. Clearing grants nothing:
 * the next request resolves from verified facts only (a sole eligible context
 * resolves, several require selection, none is denied) and never "the first
 * available location".
 */
export async function clearActiveContext(
  deps: PersistenceDeps = {},
): Promise<ClearContextResult> {
  const list = await listCurrentEligibleContexts({ client: deps.client });
  if (list.status === "unauthenticated") {
    return { ok: false, code: "unauthenticated" };
  }
  if (list.status === "error") return { ok: false, code: "unavailable" };
  try {
    await (deps.clearCookie ?? clearActiveContextCookie)();
  } catch (error) {
    console.error("clearActiveContext: cookie clear failed", error);
    return { ok: false, code: "unavailable" };
  }
  return { ok: true };
}
