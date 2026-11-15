import { afterEach, describe, expect, it, vi } from "vitest";
import { trustedClientAddress } from "./trusted-client-address";

afterEach(() => vi.unstubAllEnvs());

describe("trusted client address", () => {
  it("uses the platform header and ignores spoofable forwarded alternatives", () => {
    vi.stubEnv("VERCEL", "1");
    const request = new Request("https://example.test", {
      headers: {
        "x-vercel-forwarded-for": "192.0.2.7",
        "x-forwarded-for": "203.0.113.55",
        "x-real-ip": "203.0.113.56",
      },
    });
    expect(trustedClientAddress(request)).toBe("192.0.2.7");
  });

  it.each([null, "invalid", "192.0.2.7, 203.0.113.5"])(
    "fails closed for a missing or malformed platform header (%s)",
    (header) => {
      vi.stubEnv("VERCEL", "1");
      const request = new Request("https://example.test", {
        headers: {
          ...(header ? { "x-vercel-forwarded-for": header } : {}),
          "x-forwarded-for": "203.0.113.55",
        },
      });
      expect(trustedClientAddress(request)).toBe("unknown");
    },
  );

  it("allows forwarded test addresses only outside production", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NODE_ENV", "test");
    const request = new Request("https://example.test", {
      headers: { "x-forwarded-for": "2001:db8::7" },
    });
    expect(trustedClientAddress(request)).toBe("2001:db8::7");
    vi.stubEnv("NODE_ENV", "production");
    expect(trustedClientAddress(request)).toBe("unknown");
  });

  it("normalizes alternate IPv6 spellings to one quota identity", () => {
    vi.stubEnv("VERCEL", "1");
    const request = (address: string) =>
      new Request("https://example.test", {
        headers: { "x-vercel-forwarded-for": address },
      });
    expect(trustedClientAddress(request("2001:0DB8:0:0::7"))).toBe(
      trustedClientAddress(request("2001:db8::7")),
    );
  });
});
