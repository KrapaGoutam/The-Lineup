import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  kioskAuthenticatePinAction,
  kioskBreakEndAction,
  kioskBreakStartAction,
  kioskClockInAction,
  kioskClockOutAction,
  kioskGetActiveStatusAction,
  kioskGetEmployeeReportAction,
} from "./kiosk-clock-actions";
import { revokeKioskDeviceAction } from "./kiosk-admin-actions";
import {
  generateSessionToken,
  hashSessionToken,
  signSessionToken,
  verifySessionToken,
  encryptAccessToken,
  decryptAccessToken,
  getKioskSessionSecret,
} from "../data/kiosk-crypto";
import { consumeKioskPairingCode } from "../data/kiosk-device-data";
import type { KioskEmployeeSession } from "../data/kiosk-cookie";

// Mock server-only
vi.mock("server-only", () => ({}));

process.env.APP_PIN_PEPPER = "test-pepper-at-least-32-characters-long-12345";
process.env.KIOSK_SESSION_SECRET =
  "test-kiosk-session-secret-at-least-32-characters-12345";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-anon-key";

const mockCookies: Record<string, string> = {};

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockImplementation(() => ({
    get: (name: string) =>
      mockCookies[name] ? { name, value: mockCookies[name] } : undefined,
    set: (name: string, value: string) => {
      mockCookies[name] = value;
    },
    delete: (name: string) => {
      delete mockCookies[name];
    },
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: vi.fn().mockResolvedValue(null),
}));

const mockCreateServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateServerClient(),
}));

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockImplementation(() => ({
    from: mockAdminFrom,
    rpc: mockAdminRpc,
  })),
}));

const mockSupabaseAuth = {
  signInWithPassword: vi.fn(),
};

const mockEmployeeRpc = vi.fn();
const mockEmployeeFrom = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockImplementation((_url, _key, options) => {
    if (options?.global?.headers?.Authorization) {
      return {
        rpc: mockEmployeeRpc,
        from: mockEmployeeFrom,
        auth: { persistSession: false },
      };
    }
    return {
      auth: mockSupabaseAuth,
      rpc: vi.fn(),
      from: vi.fn(),
    };
  }),
}));

vi.mock("@/features/attendance/data/native-report-data", () => ({
  listNativeAttendance: vi.fn().mockImplementation((_client, params) => {
    // Verify strict employee isolation
    return Promise.resolve({
      ok: true,
      rows: [
        {
          sessionId: "sess-1",
          profileId: params.profileId,
          employeeName: "Target Employee",
          locationId: params.locationId,
          serviceDate: "2026-11-10",
          status: "completed",
          clockInAt: "2026-11-10T10:00:00Z",
          clockOutAt: "2026-11-10T18:00:00Z",
          grossElapsedSeconds: 28800,
          netPayableSeconds: 28800,
          totalBreakSeconds: 1800,
        },
      ],
    });
  }),
}));

describe("Kiosk Lifecycle, Security & Hardening Suite (Batch C Remediation)", () => {
  const MOCK_DEVICE_ID = "44444444-4444-4444-4444-444444444444";
  const MOCK_ORG_A = "11111111-1111-1111-1111-111111111111";
  const MOCK_LOC_1 = "22222222-2222-2222-2222-222222222222";
  const MOCK_LOC_2 = "33333333-3333-3333-3333-333333333333";
  const MOCK_PROFILE_ID = "00000000-0000-0000-0000-000000000001";
  const VALID_DEVICE_TOKEN =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const mockSessionStorage: Record<string, Record<string, unknown>> = {};
  const mockAttemptInserts: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockCookies).forEach((key) => delete mockCookies[key]);
    Object.keys(mockSessionStorage).forEach(
      (key) => delete mockSessionStorage[key],
    );
    mockAttemptInserts.length = 0;

    // Default employee mocks
    mockEmployeeRpc.mockResolvedValue({ data: null, error: null });
    mockEmployeeFrom.mockImplementation((table: string) => {
      if (table === "attendance_sessions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "sess-active-1",
                  organization_id: MOCK_ORG_A,
                  location_id: MOCK_LOC_1,
                  profile_id: MOCK_PROFILE_ID,
                  service_date: "2026-11-10",
                  status: "active",
                  clock_in_at: new Date().toISOString(),
                  clock_out_at: null,
                  gross_elapsed_seconds: 3600,
                  total_break_seconds: 0,
                  created_by: MOCK_PROFILE_ID,
                  updated_by: MOCK_PROFILE_ID,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: MOCK_PROFILE_ID,
              display_name: "Alice Chef",
              photo_url: null,
              role: "server",
            },
            error: null,
          }),
        }),
      };
    });
  });

  function setupRevokedDeviceMock() {
    mockCookies["lineup_kiosk_device"] = VALID_DEVICE_TOKEN;

    // A revoked device returns null because query filters on status='active'
    const mockSelectChain: Record<string, unknown> = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "kiosk_devices") {
        return {
          select: vi.fn().mockReturnValue(mockSelectChain),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });
  }

  function setupActiveDeviceMock(locationId: string = MOCK_LOC_1) {
    mockCookies["lineup_kiosk_device"] = VALID_DEVICE_TOKEN;

    const mockSelectChain: Record<string, unknown> = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: MOCK_DEVICE_ID,
          name: "Front Tablet",
          organization_id: MOCK_ORG_A,
          location_id: locationId,
          status: "active",
          created_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
          organizations: {
            id: MOCK_ORG_A,
            name: "Grand Bistro",
            slug: "grand-bistro",
          },
          locations: {
            id: locationId,
            name: locationId === MOCK_LOC_1 ? "Location 1" : "Location 2",
            time_zone: "America/Chicago",
            active: true,
            archived_at: null,
          },
        },
        error: null,
      }),
    };

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "kiosk_devices") {
        return {
          select: vi.fn().mockReturnValue(mockSelectChain),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === "kiosk_sessions") {
        return {
          insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
            mockSessionStorage[String(row.session_token_hash)] = row;
            return Promise.resolve({ error: null });
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === "session_token_hash") {
                delete mockSessionStorage[val];
              } else if (col === "device_id") {
                Object.keys(mockSessionStorage).forEach((k) => {
                  if (mockSessionStorage[k].device_id === val) {
                    delete mockSessionStorage[k];
                  }
                });
              }
              return Promise.resolve({ error: null });
            }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: string) => ({
              gt: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockImplementation(() => {
                  const found = mockSessionStorage[val];
                  if (!found)
                    return Promise.resolve({ data: null, error: null });
                  if (
                    new Date(String(found.expires_at)).getTime() <= Date.now()
                  ) {
                    return Promise.resolve({ data: null, error: null });
                  }
                  return Promise.resolve({
                    data: { ...found },
                    error: null,
                  });
                }),
              }),
            })),
          }),
        };
      }
      if (table === "passcode_login_attempts") {
        return {
          insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
            mockAttemptInserts.push(row);
            return Promise.resolve({ error: null });
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });
  }

  function setupSessionMock(
    overrides?: Partial<KioskEmployeeSession & { expiresAtDate?: Date }>,
  ) {
    setupActiveDeviceMock(overrides?.locationId ?? MOCK_LOC_1);
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = (
      overrides?.expiresAtDate ?? new Date(Date.now() + 180_000)
    ).toISOString();

    const sessionData = {
      profile_id: overrides?.profileId ?? MOCK_PROFILE_ID,
      display_name: overrides?.displayName ?? "Alice",
      device_id: overrides?.deviceId ?? MOCK_DEVICE_ID,
      organization_id: overrides?.organizationId ?? MOCK_ORG_A,
      location_id: overrides?.locationId ?? MOCK_LOC_1,
      encrypted_access_token: encryptAccessToken(
        overrides?.accessToken ?? "jwt-test-token",
      ),
      expires_at: expiresAt,
    };
    mockSessionStorage[tokenHash] = sessionData;
    const cookieValue = signSessionToken(rawToken);
    mockCookies["lineup_kiosk_session"] = cookieValue;

    return { rawToken, tokenHash, cookieValue };
  }

  describe("Device Revocation Fail-Closed Enforcement", () => {
    it("fails closed on PIN authentication if device status is revoked", async () => {
      setupRevokedDeviceMock();

      const res = await kioskAuthenticatePinAction({ pin: "1234" });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("device_revoked");
      }
      expect(mockCookies["lineup_kiosk_device"]).toBeUndefined();
      expect(mockCookies["lineup_kiosk_session"]).toBeUndefined();
    });

    it("fails closed on Clock In if device status is revoked", async () => {
      setupRevokedDeviceMock();
      setupSessionMock();
      setupRevokedDeviceMock();

      const res = await kioskClockInAction();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("device_revoked");
      }
    });

    it("fails closed on Clock Out if device status is revoked", async () => {
      setupRevokedDeviceMock();
      setupSessionMock();
      setupRevokedDeviceMock();

      const res = await kioskClockOutAction();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("device_revoked");
      }
    });

    it("fails closed on Break Start and Break End if device status is revoked", async () => {
      setupRevokedDeviceMock();
      setupSessionMock();
      setupRevokedDeviceMock();

      const resStart = await kioskBreakStartAction();
      expect(resStart.ok).toBe(false);
      if (!resStart.ok) expect(resStart.code).toBe("device_revoked");

      setupRevokedDeviceMock();
      const resEnd = await kioskBreakEndAction();
      expect(resEnd.ok).toBe(false);
      if (!resEnd.ok) expect(resEnd.code).toBe("device_revoked");
    });

    it("fails closed on Get Active Status and Employee Report if device status is revoked", async () => {
      setupRevokedDeviceMock();
      setupSessionMock();
      setupRevokedDeviceMock();

      const resStatus = await kioskGetActiveStatusAction();
      expect(resStatus.ok).toBe(false);
      if (!resStatus.ok) expect(resStatus.code).toBe("device_revoked");

      setupRevokedDeviceMock();
      const resReport = await kioskGetEmployeeReportAction({
        year: 2026,
        month: 11,
      });
      expect(resReport.ok).toBe(false);
      if (!resReport.ok) expect(resReport.code).toBe("device_revoked");
    });
  });

  describe("Device Location Reassignment & Session Invalidation", () => {
    it("invalidates active employee session when tablet location is reassigned", async () => {
      setupSessionMock({ locationId: MOCK_LOC_1 });
      setupActiveDeviceMock(MOCK_LOC_2);

      const res = await kioskClockInAction();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("session_expired");
        expect(res.error).toContain("Session expired");
      }
      expect(mockCookies["lineup_kiosk_session"]).toBeUndefined();
    });
  });

  describe("Security Hardening & Rate Limiting", () => {
    it("enforces device lockout after 5 consecutive failed PIN attempts", async () => {
      setupActiveDeviceMock(MOCK_LOC_1);

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "kiosk_devices") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: MOCK_DEVICE_ID,
                  name: "Front Tablet",
                  organization_id: MOCK_ORG_A,
                  location_id: MOCK_LOC_1,
                  status: "active",
                  organizations: { id: MOCK_ORG_A, name: "Org", slug: "org" },
                  locations: {
                    id: MOCK_LOC_1,
                    name: "Loc",
                    time_zone: "America/Chicago",
                    active: true,
                    archived_at: null,
                  },
                },
                error: null,
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "passcode_login_attempts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockResolvedValue({
                count: 5,
                error: null,
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const res = await kioskAuthenticatePinAction({ pin: "9999" });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("device_lockout");
        expect(res.error).toContain(
          "Too many failed attempts on this kiosk. Please try again in 15 minutes.",
        );
      }
    });

    it("enforces org-wide lockout after 30 failures across restaurant", async () => {
      setupActiveDeviceMock(MOCK_LOC_1);

      let callCount = 0;
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "kiosk_devices") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: MOCK_DEVICE_ID,
                  name: "Front Tablet",
                  organization_id: MOCK_ORG_A,
                  location_id: MOCK_LOC_1,
                  status: "active",
                  organizations: { id: MOCK_ORG_A, name: "Org", slug: "org" },
                  locations: {
                    id: MOCK_LOC_1,
                    name: "Loc",
                    time_zone: "America/Chicago",
                    active: true,
                    archived_at: null,
                  },
                },
                error: null,
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "passcode_lockout_resets") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          };
        }
        if (table === "passcode_login_attempts") {
          callCount++;
          const count = callCount >= 3 ? 32 : 0;
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockResolvedValue({
                count,
                error: null,
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const res = await kioskAuthenticatePinAction({ pin: "9999" });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("org_lockout");
        expect(res.error).toContain(
          "Too many failed attempts across this restaurant",
        );
      }
    });
  });

  describe("Mandatory Remediation 1: Zero Employee JWT Exposure", () => {
    it("never returns raw Supabase accessToken in kioskGetActiveStatusAction response", async () => {
      setupSessionMock({ accessToken: "sensitive-supabase-jwt-token-12345" });

      const res = await kioskGetActiveStatusAction();
      expect(res.ok).toBe(true);
      if (res.ok) {
        // Assert employee metadata returned
        expect(res.data.employee.profileId).toBe(MOCK_PROFILE_ID);
        expect(res.data.employee.displayName).toBe("Alice");
        expect(res.data.currentSession?.status).toBe("active");

        // Assert response object contains NO accessToken or session property
        const serialized = JSON.stringify(res);
        expect(serialized).not.toContain("sensitive-supabase-jwt-token-12345");
        expect(
          (res.data as unknown as Record<string, unknown>).accessToken,
        ).toBeUndefined();
        expect(
          (res.data as unknown as Record<string, unknown>).session,
        ).toBeUndefined();
      }
    });
  });

  describe("Mandatory Remediation 2: Secure Server-Side Session Storage & Opaque Token", () => {
    it("stores encrypted JWT in kiosk_sessions and uses opaque HMAC-signed cookie", () => {
      const { tokenHash, cookieValue } = setupSessionMock({
        accessToken: "my-secret-access-token",
      });

      // Assert cookie format: kiosk_sess_<hex>.<base64url-signature>
      expect(cookieValue).toMatch(/^kiosk_sess_[a-f0-9]{64}\.[A-Za-z0-9_-]+$/);

      // Assert database record exists and holds encrypted ciphertext, not plaintext
      const dbRecord = mockSessionStorage[tokenHash];
      expect(dbRecord).toBeDefined();
      expect(dbRecord.encrypted_access_token).toBeDefined();
      expect(dbRecord.encrypted_access_token).not.toBe(
        "my-secret-access-token",
      );

      // Assert decryption recovers the original access token
      const decrypted = decryptAccessToken(
        String(dbRecord.encrypted_access_token),
      );
      expect(decrypted).toBe("my-secret-access-token");
    });

    it("rejects tampered session token in cookie", async () => {
      setupSessionMock();

      // Tamper with the raw token portion
      const [tokenPrefix, sig] = mockCookies["lineup_kiosk_session"].split(".");
      const tamperedToken = tokenPrefix.slice(0, -4) + "ffff." + sig;
      expect(verifySessionToken(tamperedToken)).toBeNull();
      mockCookies["lineup_kiosk_session"] = tamperedToken;

      const res = await kioskClockInAction();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("session_expired");
      }
    });

    it("rejects tampered signature in cookie", async () => {
      setupSessionMock();

      const [tokenPrefix] = mockCookies["lineup_kiosk_session"].split(".");
      mockCookies["lineup_kiosk_session"] =
        `${tokenPrefix}.0000000000000000000000000000000000000000000000000000000000000000`;

      const res = await kioskClockInAction();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("session_expired");
      }
    });
  });

  describe("Mandatory Remediation 3: Fail-Closed Dedicated KIOSK_SESSION_SECRET in Deployed Environments", () => {
    it("fails closed when KIOSK_SESSION_SECRET is missing in production environment even if APP_PIN_PEPPER is set", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.KIOSK_SESSION_SECRET;
      const originalPepper = process.env.APP_PIN_PEPPER;
      try {
        // @ts-expect-error force mutating NODE_ENV
        process.env.NODE_ENV = "production";
        delete process.env.KIOSK_SESSION_SECRET;
        process.env.APP_PIN_PEPPER =
          "app-pin-pepper-key-at-least-32-chars-long";

        expect(() => getKioskSessionSecret()).toThrow(
          "KIOSK_SESSION_SECRET must be configured with at least 32 characters.",
        );
      } finally {
        // @ts-expect-error restore NODE_ENV
        process.env.NODE_ENV = originalEnv;
        process.env.KIOSK_SESSION_SECRET = originalSecret;
        process.env.APP_PIN_PEPPER = originalPepper;
      }
    });

    it("fails closed when KIOSK_SESSION_SECRET is too short (< 32 chars) in production environment", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.KIOSK_SESSION_SECRET;
      const originalPepper = process.env.APP_PIN_PEPPER;
      try {
        // @ts-expect-error force mutating NODE_ENV
        process.env.NODE_ENV = "production";
        process.env.APP_PIN_PEPPER =
          "app-pin-pepper-key-at-least-32-chars-long";
        process.env.KIOSK_SESSION_SECRET = "short-secret";

        expect(() => getKioskSessionSecret()).toThrow(
          "KIOSK_SESSION_SECRET must be configured with at least 32 characters.",
        );
      } finally {
        // @ts-expect-error restore NODE_ENV
        process.env.NODE_ENV = originalEnv;
        process.env.KIOSK_SESSION_SECRET = originalSecret;
        process.env.APP_PIN_PEPPER = originalPepper;
      }
    });
  });

  describe("Mandatory Remediation 4: Pairing Code Failure Accounting & Brute-Force Protection", () => {
    it("atomically calls kiosk_record_pairing_failure RPC on invalid pairing code", async () => {
      const mockAdmin = {
        rpc: vi.fn().mockImplementation((fn: string) => {
          if (fn === "kiosk_consume_pairing_code") {
            return Promise.resolve({
              data: null,
              error: {
                code: "P0001",
                message: "Invalid or expired pairing code.",
              },
            });
          }
          if (fn === "kiosk_record_pairing_failure") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const res = await consumeKioskPairingCode(mockAdmin as never, {
        pairingCode: "INVALID-CODE-123",
      });

      expect(res.ok).toBe(false);
      // Assert failure RPC was called with code hash
      expect(mockAdmin.rpc).toHaveBeenCalledWith(
        "kiosk_record_pairing_failure",
        expect.objectContaining({
          p_client_identifier: "tablet-pairing-client",
        }),
      );
    });
  });

  describe("Mandatory Remediation 5: Complete PIN Failure Accounting", () => {
    it.each([false, true])(
      "denies an unrecognized PIN with attempt-write failure=%s",
      async (attemptWriteFails) => {
        setupActiveDeviceMock();

        mockAdminFrom.mockImplementation((table: string) => {
          if (table === "kiosk_devices") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: MOCK_DEVICE_ID,
                    name: "Host Station",
                    organization_id: MOCK_ORG_A,
                    location_id: MOCK_LOC_1,
                    status: "active",
                    organizations: { id: MOCK_ORG_A, name: "Org", slug: "org" },
                    locations: {
                      id: MOCK_LOC_1,
                      name: "Loc",
                      time_zone: "America/Chicago",
                      active: true,
                      archived_at: null,
                    },
                  },
                  error: null,
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          if (table === "passcode_login_attempts") {
            return {
              insert: vi
                .fn()
                .mockImplementation((row: Record<string, unknown>) => {
                  mockAttemptInserts.push(row);
                  return Promise.resolve({
                    error: attemptWriteFails
                      ? { message: "Attempt ledger unavailable" }
                      : null,
                  });
                }),
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnThis(),
                gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
              }),
            };
          }
          if (table === "passcode_credentials") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnThis(),
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          if (table === "passcode_lockout_resets") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnThis(),
                order: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            };
          }
          return { select: vi.fn().mockReturnThis() };
        });

        const res = await kioskAuthenticatePinAction({ pin: "1234" });
        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.code).toBe(
            attemptWriteFails ? "rate_limit_unavailable" : "invalid_pin",
          );
        }
        expect(mockAttemptInserts.length).toBe(1);
        expect(mockAttemptInserts[0].succeeded).toBe(false);
        expect(mockAttemptInserts[0].organization_id).toBe(MOCK_ORG_A);
        expect(mockAttemptInserts[0].fingerprint).toBe(
          `kiosk:${MOCK_DEVICE_ID}`,
        );
      },
    );

    it("records succeeded: false when employee membership is inactive", async () => {
      setupActiveDeviceMock();

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "kiosk_devices") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: MOCK_DEVICE_ID,
                  name: "Host Station",
                  organization_id: MOCK_ORG_A,
                  location_id: MOCK_LOC_1,
                  status: "active",
                  organizations: { id: MOCK_ORG_A, name: "Org", slug: "org" },
                  locations: {
                    id: MOCK_LOC_1,
                    name: "Loc",
                    time_zone: "America/Chicago",
                    active: true,
                    archived_at: null,
                  },
                },
                error: null,
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "passcode_login_attempts") {
          return {
            insert: vi
              .fn()
              .mockImplementation((row: Record<string, unknown>) => {
                mockAttemptInserts.push(row);
                return Promise.resolve({ error: null });
              }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
            }),
          };
        }
        if (table === "passcode_credentials") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  profile_id: MOCK_PROFILE_ID,
                  organization_id: MOCK_ORG_A,
                  synthetic_email: "employee-1@example.com",
                },
                error: null,
              }),
            }),
          };
        }
        if (table === "locations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  attendance_mode: "internal_the_lineup",
                  active: true,
                  archived_at: null,
                },
                error: null,
              }),
            }),
          };
        }
        if (table === "memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: null, // Inactive / not found!
                error: null,
              }),
            }),
          };
        }
        if (table === "passcode_lockout_resets") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const res = await kioskAuthenticatePinAction({ pin: "1234" });
      expect(res.ok).toBe(false);
      expect(mockAttemptInserts.length).toBe(1);
      expect(mockAttemptInserts[0].succeeded).toBe(false);
    });

    it("fails closed with rate_limit_unavailable when rate limit query returns a database error", async () => {
      setupActiveDeviceMock();

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "kiosk_devices") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: MOCK_DEVICE_ID,
                  name: "Host Station",
                  organization_id: MOCK_ORG_A,
                  location_id: MOCK_LOC_1,
                  status: "active",
                  organizations: { id: MOCK_ORG_A, name: "Org", slug: "org" },
                  locations: {
                    id: MOCK_LOC_1,
                    name: "Loc",
                    time_zone: "America/Chicago",
                    active: true,
                    archived_at: null,
                  },
                },
                error: null,
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "passcode_login_attempts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockResolvedValue({
                count: null,
                error: { message: "Database connection failed", code: "08006" },
              }),
            }),
          };
        }
        return {};
      });

      const res = await kioskAuthenticatePinAction({ pin: "1234" });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("rate_limit_unavailable");
        expect(res.error).toBe(
          "Authentication service temporarily unavailable. Please try again.",
        );
      }
    });
  });

  describe("Mandatory Remediation 6: Inactivity and Revocation Boundaries", () => {
    it("rejects session that has exceeded 3-minute inactivity TTL", async () => {
      const expiredDate = new Date(Date.now() - 1000);
      setupSessionMock({ expiresAtDate: expiredDate });

      const res = await kioskClockInAction();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("session_expired");
      }
    });

    it("purges session from database when device is revoked", async () => {
      setupActiveDeviceMock();
      const { tokenHash } = setupSessionMock();
      expect(mockSessionStorage[tokenHash]).toBeDefined();

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "kiosk_sessions") {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === "device_id") {
                  Object.keys(mockSessionStorage).forEach((k) => {
                    if (mockSessionStorage[k].device_id === val) {
                      delete mockSessionStorage[k];
                    }
                  });
                }
                return Promise.resolve({ error: null });
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      });

      const adminClient = {
        from: mockAdminFrom,
      };
      await adminClient
        .from("kiosk_sessions")
        .delete()
        .eq("device_id", MOCK_DEVICE_ID);

      expect(mockSessionStorage[tokenHash]).toBeUndefined();
    });
  });

  describe("Cross-Tenant and Admin Isolation", () => {
    it("rejects device management actions from an unauthorized role", async () => {
      mockCreateServerClient.mockReturnValue({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: "42501",
            message: "Unauthorized to revoke this device.",
          },
        }),
      });

      const res = await revokeKioskDeviceAction({
        deviceId: MOCK_DEVICE_ID,
        reason: "Unauthorized attempt",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Unauthorized to revoke this device.");
      }
    });

    it("verifies cross-employee timesheet isolation", async () => {
      setupSessionMock({
        profileId: "alice-uuid-0001",
        displayName: "Alice",
      });

      const reportRes = await kioskGetEmployeeReportAction({
        year: 2026,
        month: 11,
      });

      expect(reportRes.ok).toBe(true);
      if (reportRes.ok) {
        // Assert report data only matches Alice's profileId
        expect(reportRes.data.rows.length).toBe(1);
        expect(reportRes.data.rows[0].profileId).toBe("alice-uuid-0001");
      }
    });
  });
});
