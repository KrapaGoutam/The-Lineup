import { describe, expect, it } from "vitest";

import {
  ACTIVE_CONTEXT_COOKIE_MAX_AGE_SECONDS,
  ACTIVE_CONTEXT_COOKIE_NAME,
  activeContextClearOptions,
  activeContextWriteOptions,
  cookieNamesPair,
  parseActiveContextCookie,
  serializeActiveContextCookie,
  shouldUseSecureCookie,
} from "./context-cookie";

const ORG = "00000000-0000-4000-8000-000000000001";
const LOC = "00000000-0000-4000-8000-000000000011";

describe("active-context cookie contract (V2-003.001, read-only)", () => {
  it("uses a stable cookie name", () => {
    expect(ACTIVE_CONTEXT_COOKIE_NAME).toBe("lineup_active_context");
  });

  it.each([undefined, null, ""])(
    "treats %j as absent (not an error)",
    (raw) => {
      expect(parseActiveContextCookie(raw)).toEqual({ status: "absent" });
    },
  );

  it("round-trips the wire format", () => {
    const raw = serializeActiveContextCookie({
      organizationId: ORG,
      locationId: LOC,
    });
    expect(parseActiveContextCookie(raw)).toEqual({
      status: "present",
      selection: { organizationId: ORG, locationId: LOC },
    });
  });

  it("canonicalises identifiers to lower case", () => {
    const raw = JSON.stringify({
      v: 1,
      o: ORG.toUpperCase(),
      l: LOC.toUpperCase(),
    });
    expect(parseActiveContextCookie(raw)).toEqual({
      status: "present",
      selection: { organizationId: ORG, locationId: LOC },
    });
  });

  it.each([
    ["not json", "{oops", "cookie_not_json"],
    ["array", "[1]", "cookie_not_an_object"],
    ["null", "null", "cookie_not_an_object"],
    ["number", "7", "cookie_not_an_object"],
    [
      "unknown version",
      JSON.stringify({ v: 9, o: ORG, l: LOC }),
      "cookie_unsupported_version",
    ],
    [
      "string version",
      JSON.stringify({ v: "1", o: ORG, l: LOC }),
      "cookie_unsupported_version",
    ],
    [
      "bad org",
      JSON.stringify({ v: 1, o: "x", l: LOC }),
      "cookie_invalid_organization_id",
    ],
    [
      "bad loc",
      JSON.stringify({ v: 1, o: ORG, l: 5 }),
      "cookie_invalid_location_id",
    ],
    ["too large", "a".repeat(1000), "cookie_too_large"],
  ])("rejects %s", (_label, raw, reason) => {
    expect(parseActiveContextCookie(raw)).toEqual({
      status: "malformed",
      reason,
    });
  });

  it("never throws on hostile input", () => {
    for (const raw of ['{"v":1,"o":"__proto__"}', "\u0000", "{".repeat(100)]) {
      expect(() => parseActiveContextCookie(raw)).not.toThrow();
    }
  });
});

describe("V2-003.004 cookie attributes", () => {
  it("PERSIST-12/13: one centralized, strict attribute set (HttpOnly, SameSite=Lax, path=/, 7 days, host-only)", () => {
    expect(activeContextWriteOptions(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    expect(ACTIVE_CONTEXT_COOKIE_MAX_AGE_SECONDS).toBe(604800);
    expect(activeContextWriteOptions(true)).not.toHaveProperty("domain");
  });

  it("clear uses the same scope and attributes as write (only the lifetime differs)", () => {
    expect({ ...activeContextClearOptions(true), maxAge: 1 }).toEqual({
      ...activeContextWriteOptions(true),
      maxAge: 1,
    });
    expect(activeContextClearOptions(true).maxAge).toBe(0);
  });

  it("Secure is mandatory for production; only a loopback host that is not explicitly HTTPS is exempt", () => {
    const secure = (
      nodeEnv: string | undefined,
      host: string | null,
      proto: string | null,
    ) => shouldUseSecureCookie({ nodeEnv, host, forwardedProto: proto });
    expect(secure("production", "app.example.com", "https")).toBe(true);
    expect(secure("production", "app.example.com", null)).toBe(true);
    expect(secure("production", "app.example.com", "http")).toBe(true);
    expect(secure("production", "localhost:3000", "https")).toBe(true);
    expect(secure("production", "localhost:3000", null)).toBe(false);
    expect(secure("production", "localhost:3000", "http")).toBe(false);
    expect(secure("production", "127.0.0.1:3100", "http")).toBe(false);
    expect(secure("production", "[::1]:3000", "http")).toBe(false);
    // a look-alike host is not loopback
    expect(secure("production", "localhost.evil.test", "http")).toBe(true);
    expect(secure("production", "evil.test:80", "http,https")).toBe(true);
    expect(secure("development", "localhost:3000", "http")).toBe(false);

    // A client-suppliable X-Forwarded-Host can only make the decision stricter:
    // spoofing "localhost" can never switch Secure off for a real Host.
    const withForwardedHost = (
      host: string | null,
      forwardedHost: string | null,
      proto: string | null = null,
    ) =>
      shouldUseSecureCookie({
        nodeEnv: "production",
        host,
        forwardedHost,
        forwardedProto: proto,
      });
    expect(withForwardedHost("app.example.com", "localhost")).toBe(true);
    expect(withForwardedHost("app.example.com", "localhost, evil.test")).toBe(
      true,
    );
    expect(withForwardedHost("app.example.com", "127.0.0.1:3000")).toBe(true);
    expect(withForwardedHost("localhost:3000", "app.example.com")).toBe(true);
    expect(withForwardedHost("localhost:3000", "localhost:3000")).toBe(false);
    expect(withForwardedHost("localhost:3000", null)).toBe(false);
    expect(withForwardedHost("localhost:3000", "localhost", "https")).toBe(
      true,
    );
  });

  it("PERSIST-11: the v1 wire format is unchanged and ids only (no roles/tokens/flags)", () => {
    const value = serializeActiveContextCookie({
      organizationId: "11111111-1111-4111-8111-111111111111",
      locationId: "22222222-2222-4222-8222-222222222222",
    });
    expect(Object.keys(JSON.parse(value)).sort()).toEqual(["l", "o", "v"]);
    expect(parseActiveContextCookie(value)).toMatchObject({
      status: "present",
    });
  });

  it("cookieNamesPair compares canonical (lower-cased) ids and never matches absent/malformed", () => {
    const pair = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      locationId: "22222222-2222-4222-8222-222222222222",
    };
    const present = parseActiveContextCookie(
      serializeActiveContextCookie({
        organizationId: pair.organizationId.toUpperCase(),
        locationId: pair.locationId,
      }),
    );
    expect(cookieNamesPair(present, pair)).toBe(true);
    expect(
      cookieNamesPair(present, {
        ...pair,
        locationId: "33333333-3333-4333-8333-333333333333",
      }),
    ).toBe(false);
    expect(cookieNamesPair({ status: "absent" }, pair)).toBe(false);
    expect(cookieNamesPair({ status: "malformed", reason: "x" }, pair)).toBe(
      false,
    );
  });
});
