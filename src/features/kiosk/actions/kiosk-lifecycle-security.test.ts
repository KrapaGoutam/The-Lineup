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
import { signKioskSession, verifyKioskSession } from "../data/kiosk-cookie";

// Mock server-only
vi.mock("server-only", () => ({}));

process.env.APP_PIN_PEPPER = "test-pepper-at-least-32-characters-long-12345";
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

describe("Kiosk Lifecycle, Security & Hardening Suite (Batch C)", () => {
  const MOCK_DEVICE_ID = "44444444-4444-4444-4444-444444444444";
  const MOCK_ORG_A = "11111111-1111-1111-1111-111111111111";
  const MOCK_LOC_1 = "22222222-2222-2222-2222-222222222222";
  const MOCK_LOC_2 = "33333333-3333-3333-3333-333333333333";
  const MOCK_PROFILE_ID = "00000000-0000-0000-0000-000000000001";
  const VALID_DEVICE_TOKEN =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockCookies).forEach((key) => delete mockCookies[key]);
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
      return { select: vi.fn().mockReturnThis() };
    });
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
      const signedSession = signKioskSession({
        profileId: MOCK_PROFILE_ID,
        displayName: "Alice",
        deviceId: MOCK_DEVICE_ID,
        organizationId: MOCK_ORG_A,
        locationId: MOCK_LOC_1,
        accessToken: "jwt",
        expiresAt: Date.now() + 60_000,
      });
      mockCookies["lineup_kiosk_session"] = signedSession;

      const res = await kioskClockInAction();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("device_revoked");
      }
    });

    it("fails closed on Clock Out if device status is revoked", async () => {
      setupRevokedDeviceMock();
      const signedSession = signKioskSession({
        profileId: MOCK_PROFILE_ID,
        displayName: "Alice",
        deviceId: MOCK_DEVICE_ID,
        organizationId: MOCK_ORG_A,
        locationId: MOCK_LOC_1,
        accessToken: "jwt",
        expiresAt: Date.now() + 60_000,
      });
      mockCookies["lineup_kiosk_session"] = signedSession;

      const res = await kioskClockOutAction();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("device_revoked");
      }
    });

    it("fails closed on Break Start and Break End if device status is revoked", async () => {
      setupRevokedDeviceMock();
      const signedSession = signKioskSession({
        profileId: MOCK_PROFILE_ID,
        displayName: "Alice",
        deviceId: MOCK_DEVICE_ID,
        organizationId: MOCK_ORG_A,
        locationId: MOCK_LOC_1,
        accessToken: "jwt",
        expiresAt: Date.now() + 60_000,
      });
      mockCookies["lineup_kiosk_session"] = signedSession;

      const resStart = await kioskBreakStartAction();
      expect(resStart.ok).toBe(false);
      if (!resStart.ok) expect(resStart.code).toBe("device_revoked");

      setupRevokedDeviceMock();
      mockCookies["lineup_kiosk_session"] = signedSession;

      const resEnd = await kioskBreakEndAction();
      expect(resEnd.ok).toBe(false);
      if (!resEnd.ok) expect(resEnd.code).toBe("device_revoked");
    });

    it("fails closed on Get Active Status and Employee Report if device status is revoked", async () => {
      setupRevokedDeviceMock();
      const signedSession = signKioskSession({
        profileId: MOCK_PROFILE_ID,
        displayName: "Alice",
        deviceId: MOCK_DEVICE_ID,
        organizationId: MOCK_ORG_A,
        locationId: MOCK_LOC_1,
        accessToken: "jwt",
        expiresAt: Date.now() + 60_000,
      });
      mockCookies["lineup_kiosk_session"] = signedSession;

      const resStatus = await kioskGetActiveStatusAction();
      expect(resStatus.ok).toBe(false);
      if (!resStatus.ok) expect(resStatus.code).toBe("device_revoked");

      setupRevokedDeviceMock();
      mockCookies["lineup_kiosk_session"] = signedSession;

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
      // Device is now bound to Location 2 on the server
      setupActiveDeviceMock(MOCK_LOC_2);

      // Employee cookie was issued for Location 1
      const staleSession = signKioskSession({
        profileId: MOCK_PROFILE_ID,
        displayName: "Alice",
        deviceId: MOCK_DEVICE_ID,
        organizationId: MOCK_ORG_A,
        locationId: MOCK_LOC_1, // Stale location ID!
        accessToken: "jwt",
        expiresAt: Date.now() + 60_000,
      });
      mockCookies["lineup_kiosk_session"] = staleSession;

      // Attempt clock in with stale location session
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
                count: 5, // 5 failures on this kiosk!
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
          // First call: fingerprint failures (return 0)
          // Second call: recent success (return 0)
          // Third call: organization failures (return 32)
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
      setupActiveDeviceMock(MOCK_LOC_1);

      const aliceSession = signKioskSession({
        profileId: "alice-uuid-0001",
        displayName: "Alice",
        deviceId: MOCK_DEVICE_ID,
        organizationId: MOCK_ORG_A,
        locationId: MOCK_LOC_1,
        accessToken: "jwt-alice",
        expiresAt: Date.now() + 60_000,
      });
      mockCookies["lineup_kiosk_session"] = aliceSession;

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

    it("fails HMAC verification if session cookie payload is tampered with", () => {
      const validSession = signKioskSession({
        profileId: "alice-uuid-0001",
        displayName: "Alice",
        deviceId: MOCK_DEVICE_ID,
        organizationId: MOCK_ORG_A,
        locationId: MOCK_LOC_1,
        accessToken: "jwt-alice",
        expiresAt: Date.now() + 60_000,
      });

      // Split payload and signature
      const [payloadB64, signature] = validSession.split(".");
      expect(payloadB64).toBeDefined();
      expect(signature).toBeDefined();

      // Tamper with payload (change profileId to Bob's)
      const parsed = JSON.parse(
        Buffer.from(payloadB64, "base64url").toString("utf-8"),
      );
      parsed.profileId = "bob-uuid-0002";
      const tamperedPayloadB64 = Buffer.from(
        JSON.stringify(parsed),
        "utf-8",
      ).toString("base64url");

      const tamperedCookie = `${tamperedPayloadB64}.${signature}`;
      const result = verifyKioskSession(tamperedCookie);
      expect(result).toBeNull(); // Rejected due to invalid HMAC!
    });
  });
});
