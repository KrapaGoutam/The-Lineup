import { describe, expect, it } from "vitest";

import {
  ACTIVE_CONTEXT_COOKIE_NAME,
  parseActiveContextCookie,
  serializeActiveContextCookie,
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
