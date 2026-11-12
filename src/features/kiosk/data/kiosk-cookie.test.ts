import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  KIOSK_DEVICE_COOKIE,
  KIOSK_SESSION_COOKIE,
  clearKioskDeviceCookie,
  clearKioskSessionCookie,
  decryptAccessToken,
  encryptAccessToken,
  getKioskDeviceCookie,
  getKioskSessionCookie,
  getKioskSessionSecret,
  setKioskDeviceCookie,
  setKioskSessionCookie,
  signSessionToken,
  verifySessionToken,
  type KioskEmployeeSession,
} from "./kiosk-cookie";
import { generateSessionToken } from "./kiosk-crypto";

vi.mock("server-only", () => ({}));

const mockCookieStore: Record<string, string> = {};

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockImplementation(() => ({
    get: (name: string) =>
      mockCookieStore[name] ? { value: mockCookieStore[name] } : undefined,
    set: (name: string, value: string) => {
      mockCookieStore[name] = value;
    },
    delete: (name: string) => {
      delete mockCookieStore[name];
    },
  })),
}));

describe("Kiosk Session & Cookie Security", () => {
  const TEST_SECRET = "test-secret-at-least-32-characters-long-123456";

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockCookieStore).forEach((k) => delete mockCookieStore[k]);
    process.env.KIOSK_SESSION_SECRET = TEST_SECRET;
  });

  describe("Session Secret Validation (Requirement 3)", () => {
    it("returns configured KIOSK_SESSION_SECRET", () => {
      process.env.KIOSK_SESSION_SECRET =
        "super-secret-production-key-32-chars-long";
      expect(getKioskSessionSecret()).toBe(
        "super-secret-production-key-32-chars-long",
      );
    });

    it("falls back to APP_PIN_PEPPER if KIOSK_SESSION_SECRET is unset", () => {
      delete process.env.KIOSK_SESSION_SECRET;
      process.env.APP_PIN_PEPPER = "app-pin-pepper-key-at-least-32-chars-long";
      expect(getKioskSessionSecret()).toBe(
        "app-pin-pepper-key-at-least-32-chars-long",
      );
    });

    it("fails closed in non-test environment when secret is missing or too short", () => {
      delete process.env.KIOSK_SESSION_SECRET;
      delete process.env.APP_PIN_PEPPER;
      const originalEnv = process.env.NODE_ENV;
      try {
        // @ts-expect-error mutating NODE_ENV for test
        process.env.NODE_ENV = "production";
        expect(() => getKioskSessionSecret()).toThrow(
          /KIOSK_SESSION_SECRET \(or APP_PIN_PEPPER\) must be configured/i,
        );
      } finally {
        // @ts-expect-error restoring NODE_ENV
        process.env.NODE_ENV = originalEnv;
        process.env.KIOSK_SESSION_SECRET = TEST_SECRET;
      }
    });
  });

  describe("AES-256-GCM Access Token Encryption (Requirement 2)", () => {
    it("encrypts and decrypts access token with authenticated integrity", () => {
      const originalJwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0";
      const encrypted = encryptAccessToken(originalJwt, TEST_SECRET);

      expect(typeof encrypted).toBe("string");
      expect(encrypted).not.toContain(originalJwt);
      expect(encrypted.split(":")).toHaveLength(3); // iv:tag:ciphertext

      const decrypted = decryptAccessToken(encrypted, TEST_SECRET);
      expect(decrypted).toBe(originalJwt);
    });

    it("rejects tampered ciphertext with GCM auth tag verification failure", () => {
      const originalJwt = "secret-supabase-access-token-jwt";
      const encrypted = encryptAccessToken(originalJwt, TEST_SECRET);
      const parts = encrypted.split(":");
      // Tamper with ciphertext
      const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}ff`;

      expect(decryptAccessToken(tampered, TEST_SECRET)).toBeNull();
    });

    it("rejects decryption with incorrect secret key", () => {
      const originalJwt = "secret-supabase-access-token-jwt";
      const encrypted = encryptAccessToken(originalJwt, TEST_SECRET);
      const wrongSecret = "wrong-secret-key-at-least-32-chars-long-99999";

      expect(decryptAccessToken(encrypted, wrongSecret)).toBeNull();
    });
  });

  describe("Opaque Session Token Signing & Verification (Requirement 2)", () => {
    it("generates, signs, and successfully verifies opaque token", () => {
      const token = generateSessionToken();
      expect(token).toMatch(/^kiosk_sess_[a-f0-9]{64}$/);

      const signed = signSessionToken(token);
      expect(signed).toContain(".");

      const verified = verifySessionToken(signed);
      expect(verified).toBe(token);
    });

    it("rejects tampered signature on session token", () => {
      const token = generateSessionToken();
      const signed = signSessionToken(token);
      const [rawToken] = signed.split(".");
      const tamperedSigned = `${rawToken}.invalid_tampered_signature_here`;

      expect(verifySessionToken(tamperedSigned)).toBeNull();
    });

    it("rejects malformed token strings", () => {
      expect(verifySessionToken("")).toBeNull();
      expect(verifySessionToken("no-dots")).toBeNull();
      expect(verifySessionToken("one.two.three")).toBeNull();
    });
  });

  describe("Server-Side Session Storage Roundtrip", () => {
    const mockSessionRow: Record<string, unknown> = {};

    const mockAdmin = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "kiosk_sessions") {
          return {
            insert: vi
              .fn()
              .mockImplementation((data: Record<string, unknown>) => {
                Object.assign(mockSessionRow, data);
                return Promise.resolve({ error: null });
              }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => {
                Object.keys(mockSessionRow).forEach(
                  (k) => delete mockSessionRow[k],
                );
                return Promise.resolve({ error: null });
              }),
            }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockImplementation(() => {
                    if (Object.keys(mockSessionRow).length === 0) {
                      return Promise.resolve({ data: null, error: null });
                    }
                    return Promise.resolve({
                      data: { ...mockSessionRow },
                      error: null,
                    });
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    it("persists server session with encrypted token and sets opaque cookie", async () => {
      const sessionInput: Omit<KioskEmployeeSession, "expiresAt"> = {
        profileId: "prof-alice",
        displayName: "Alice Chef",
        deviceId: "dev-tablet-1",
        organizationId: "org-bistro",
        locationId: "loc-downtown",
        accessToken: "super-secret-employee-supabase-jwt",
      };

      // @ts-expect-error mock admin
      await setKioskSessionCookie(mockAdmin, sessionInput);

      // Verify cookie is opaque and contains NO accessToken
      const cookieVal = mockCookieStore[KIOSK_SESSION_COOKIE];
      expect(cookieVal).toBeDefined();
      expect(cookieVal).not.toContain("super-secret-employee-supabase-jwt");
      expect(cookieVal).not.toContain("prof-alice");
      expect(cookieVal).toMatch(/^kiosk_sess_[a-f0-9]{64}\./);

      // Verify server storage holds encrypted token
      expect(mockSessionRow.profile_id).toBe("prof-alice");
      expect(mockSessionRow.encrypted_access_token).toBeDefined();
      expect(mockSessionRow.encrypted_access_token).not.toContain(
        "super-secret-employee-supabase-jwt",
      );

      // Read back session
      // @ts-expect-error mock admin
      const retrieved = await getKioskSessionCookie(mockAdmin);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.profileId).toBe("prof-alice");
      expect(retrieved?.displayName).toBe("Alice Chef");
      expect(retrieved?.accessToken).toBe("super-secret-employee-supabase-jwt");
    });

    it("clears session both in database and cookie", async () => {
      const sessionInput: Omit<KioskEmployeeSession, "expiresAt"> = {
        profileId: "prof-alice",
        displayName: "Alice Chef",
        deviceId: "dev-tablet-1",
        organizationId: "org-bistro",
        locationId: "loc-downtown",
        accessToken: "jwt-to-clear",
      };
      // @ts-expect-error mock admin
      await setKioskSessionCookie(mockAdmin, sessionInput);
      expect(mockCookieStore[KIOSK_SESSION_COOKIE]).toBeDefined();

      // @ts-expect-error mock admin
      await clearKioskSessionCookie(mockAdmin);
      expect(mockCookieStore[KIOSK_SESSION_COOKIE]).toBeUndefined();
      expect(Object.keys(mockSessionRow).length).toBe(0);
    });
  });

  describe("Device Cookie Management", () => {
    it("sets, reads, and clears device cookie", async () => {
      await setKioskDeviceCookie("device-token-12345");
      expect(mockCookieStore[KIOSK_DEVICE_COOKIE]).toBe("device-token-12345");

      const retrieved = await getKioskDeviceCookie();
      expect(retrieved).toBe("device-token-12345");

      await clearKioskDeviceCookie();
      expect(mockCookieStore[KIOSK_DEVICE_COOKIE]).toBeUndefined();
    });
  });
});
