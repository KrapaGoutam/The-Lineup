/**
 * V2-003.001 — Active-context cookie contract (READ-ONLY in this subfeature).
 *
 * The cookie stores an UNTRUSTED selection preference — never authority.
 * Anything parsed here must still be validated against authenticated database
 * facts by `resolveActiveContext`. Writing / renewing / clearing the cookie is
 * V2-003.004; `serializeActiveContextCookie` exists only so the wire format is
 * defined in exactly one place (and round-trip tested), not to set cookies.
 *
 * Wire format (JSON, version 1):
 *   {"v":1,"o":"<organization uuid>","l":"<location uuid>"}
 */

export const ACTIVE_CONTEXT_COOKIE_NAME = "lineup_active_context";
export const ACTIVE_CONTEXT_COOKIE_VERSION = 1;

/** Hard cap so an oversized/hostile cookie is rejected before JSON.parse. */
const MAX_COOKIE_VALUE_LENGTH = 256;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ActiveContextCookieSelection {
  readonly organizationId: string;
  readonly locationId: string;
}

export type ActiveContextCookieParseResult =
  /** No cookie was sent (or it was an empty string). Not an error. */
  | { readonly status: "absent" }
  | {
      readonly status: "present";
      readonly selection: ActiveContextCookieSelection;
    }
  | { readonly status: "malformed"; readonly reason: string };

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/**
 * Strictly parses the raw cookie value. Never throws. Unknown versions,
 * missing/extra-typed fields and non-UUID identifiers are all `malformed`.
 * UUIDs are lower-cased so comparison against database ids is canonical.
 */
export function parseActiveContextCookie(
  raw: string | null | undefined,
): ActiveContextCookieParseResult {
  if (raw === null || raw === undefined || raw === "") {
    return { status: "absent" };
  }
  if (typeof raw !== "string") {
    return { status: "malformed", reason: "cookie_not_a_string" };
  }
  if (raw.length > MAX_COOKIE_VALUE_LENGTH) {
    return { status: "malformed", reason: "cookie_too_large" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "malformed", reason: "cookie_not_json" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "malformed", reason: "cookie_not_an_object" };
  }

  const record = parsed as Record<string, unknown>;
  if (record.v !== ACTIVE_CONTEXT_COOKIE_VERSION) {
    return { status: "malformed", reason: "cookie_unsupported_version" };
  }
  if (!isUuid(record.o)) {
    return { status: "malformed", reason: "cookie_invalid_organization_id" };
  }
  if (!isUuid(record.l)) {
    return { status: "malformed", reason: "cookie_invalid_location_id" };
  }

  return {
    status: "present",
    selection: {
      organizationId: record.o.toLowerCase(),
      locationId: record.l.toLowerCase(),
    },
  };
}

/**
 * Defines the wire format for the future writer (V2-003.004). Not used by any
 * production code path in V2-003.001.
 */
export function serializeActiveContextCookie(
  selection: ActiveContextCookieSelection,
): string {
  return JSON.stringify({
    v: ACTIVE_CONTEXT_COOKIE_VERSION,
    o: selection.organizationId,
    l: selection.locationId,
  });
}
