/**
 * V2-003.001 / V2-003.004 — Active-context cookie contract.
 *
 * The cookie stores an UNTRUSTED selection preference — never authority.
 * Anything parsed here must still be validated against authenticated database
 * facts by `resolveActiveContext`. V2-003.004 adds the (server-only) writer in
 * `data/context-cookie-writer.ts`; the wire format and the cookie attributes
 * are defined here, in exactly one place, so every write / clear path shares
 * them.
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

// ── V2-003.004 cookie attributes (single source of truth) ───────────────────

/**
 * Preference lifetime: 7 days FIXED from the last verified selection (or
 * verified deep-link reconciliation). It is deliberately not sliding: renewing
 * it from unrelated requests would race with a concurrent selection and could
 * resurrect a superseded preference. Expiry only costs the user a re-selection
 * (or nothing, for a single-context user); it never affects authentication.
 */
export const ACTIVE_CONTEXT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface ActiveContextCookieOptions {
  readonly httpOnly: true;
  readonly secure: boolean;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly maxAge: number;
}

/** No `domain` attribute on purpose: host-only, never shared with subdomains. */
function baseOptions(
  secure: boolean,
): Omit<ActiveContextCookieOptions, "maxAge"> {
  return { httpOnly: true, secure, sameSite: "lax", path: "/" };
}

function hostname(host: string | null | undefined): string {
  const value = (host ?? "").trim().toLowerCase();
  if (value.startsWith("[")) return value.slice(0, value.indexOf("]") + 1);
  return value.split(":")[0] ?? "";
}

export function isLoopbackHost(host: string | null | undefined): boolean {
  const name = hostname(host);
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

/**
 * `Secure` is ALWAYS on for production traffic. The only exception is a
 * LOOPBACK host (localhost / 127.0.0.1 / [::1]) that is not explicitly HTTPS
 * (local `next start`, CI browser tests send no `x-forwarded-proto`): browsers
 * such as WebKit refuse to store a `Secure` cookie there, and a loopback host
 * can never be a real deployment (proxies always set the forwarded protocol
 * and a real hostname). Any non-loopback host, and any HTTPS request, keeps
 * the strict value. Development builds get `secure: false` so `next dev` over
 * HTTP works. The exemption is derived from the request, not from a flag a
 * deployment could leave switched on.
 *
 * `host` is the Host the server itself received. `forwardedHost`
 * (`X-Forwarded-Host`) is client-suppliable on any deployment whose proxy does
 * not overwrite it, so it can only ever make the decision STRICTER: a
 * forwarded host that is present and not loopback keeps `Secure` on, and a
 * spoofed `X-Forwarded-Host: localhost` can never switch it off for a real
 * Host.
 */
export function shouldUseSecureCookie(input: {
  readonly nodeEnv: string | undefined;
  readonly host: string | null | undefined;
  readonly forwardedHost?: string | null | undefined;
  readonly forwardedProto: string | null | undefined;
}): boolean {
  if (input.nodeEnv !== "production") return false;
  const proto = (input.forwardedProto ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  const forwardedHost = (input.forwardedHost ?? "").split(",")[0]?.trim();
  const loopback =
    isLoopbackHost(input.host) &&
    (forwardedHost === "" || isLoopbackHost(forwardedHost));
  if (loopback && proto !== "https") return false;
  return true;
}

export function activeContextWriteOptions(
  secure: boolean,
): ActiveContextCookieOptions {
  return {
    ...baseOptions(secure),
    maxAge: ACTIVE_CONTEXT_COOKIE_MAX_AGE_SECONDS,
  };
}

/** Same scope/attributes as the write (otherwise the browser keeps the old one). */
export function activeContextClearOptions(
  secure: boolean,
): ActiveContextCookieOptions {
  return { ...baseOptions(secure), maxAge: 0 };
}

/** True when the parsed cookie names exactly this (organization, location). */
export function cookieNamesPair(
  cookie: ActiveContextCookieParseResult,
  pair: ActiveContextCookieSelection,
): boolean {
  return (
    cookie.status === "present" &&
    cookie.selection.organizationId === pair.organizationId.toLowerCase() &&
    cookie.selection.locationId === pair.locationId.toLowerCase()
  );
}
