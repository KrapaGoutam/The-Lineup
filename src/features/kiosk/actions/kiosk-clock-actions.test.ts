import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  kioskAuthenticatePinAction,
  kioskBreakEndAction,
  kioskBreakStartAction,
  kioskClearSessionAction,
  kioskClockInAction,
  kioskClockOutAction,
  kioskGetActiveStatusAction,
  kioskGetEmployeeReportAction,
} from "./kiosk-clock-actions";
import {
  encryptAccessToken,
  generateSessionToken,
  hashSessionToken,
  signSessionToken,
} from "../data/kiosk-crypto";
import type { KioskEmployeeSession } from "../data/kiosk-cookie";

// Mock server-only
vi.mock("server-only", () => ({}));

process.env.KIOSK_SESSION_SECRET =
  "test-secret-at-least-32-characters-long-123456";
process.env.APP_PIN_PEPPER = "test-pepper-at-least-32-characters-long-12345";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_kiosk_test";

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

const mockAdminClient = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

const mockSupabaseAuth = {
  signInWithPassword: vi.fn(),
};

const mockEmployeeRpc = vi.fn();
const mockEmployeeFrom = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockImplementation((_url, _key, options) => {
    // If called with Authorization header, return employee query client
    if (options?.global?.headers?.Authorization) {
      return {
        rpc: mockEmployeeRpc,
        from: mockEmployeeFrom,
        auth: { persistSession: false },
      };
    }
    // Isolated auth client
    return {
      auth: mockSupabaseAuth,
      rpc: vi.fn(),
      from: vi.fn(),
    };
  }),
}));

vi.mock("@/features/attendance/data/native-report-data", () => ({
  listNativeAttendance: vi.fn().mockResolvedValue({
    ok: true,
    rows: [
      {
        sessionId: "sess-1",
        profileId: "00000000-0000-0000-0000-000000000001",
        employeeName: "Alice Chef",
        locationId: "22222222-2222-2222-2222-222222222222",
        serviceDate: "2026-11-10",
        status: "completed",
        clockInAt: "2026-11-10T10:00:00Z",
        clockOutAt: "2026-11-10T18:00:00Z",
        grossElapsedSeconds: 28800,
        netPayableSeconds: 28800,
        totalBreakSeconds: 1800,
      },
    ],
  }),
}));

describe("Kiosk Clock Server Actions", () => {
  const MOCK_DEVICE_ID = "44444444-4444-4444-4444-444444444444";
  const MOCK_ORG_ID = "11111111-1111-1111-1111-111111111111";
  const MOCK_LOC_ID = "22222222-2222-2222-2222-222222222222";
  const MOCK_PROFILE_ID = "00000000-0000-0000-0000-000000000001";
  const VALID_DEVICE_TOKEN =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const mockSessionStorage: Record<string, Record<string, unknown>> = {};
  const mockAttemptInserts: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
    Object.keys(mockCookies).forEach((key) => delete mockCookies[key]);
    Object.keys(mockSessionStorage).forEach(
      (key) => delete mockSessionStorage[key],
    );
    mockAttemptInserts.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function setupDeviceMock() {
    mockCookies["lineup_kiosk_device"] = VALID_DEVICE_TOKEN;

    const mockSelectChain: Record<string, unknown> = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: MOCK_DEVICE_ID,
          name: "Host Station",
          organization_id: MOCK_ORG_ID,
          location_id: MOCK_LOC_ID,
          status: "active",
          organizations: {
            id: MOCK_ORG_ID,
            name: "Grand Bistro",
            slug: "grand-bistro",
          },
          locations: {
            id: MOCK_LOC_ID,
            name: "Downtown",
            time_zone: "America/Chicago",
            active: true,
            archived_at: null,
          },
        },
        error: null,
      }),
    };

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === "kiosk_devices") {
        return {
          select: vi.fn().mockReturnValue(mockSelectChain),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
          }),
        };
      }
      if (table === "kiosk_sessions") {
        return {
          upsert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
            mockSessionStorage[String(row.session_token_hash)] = row;
            return Promise.resolve({ error: null });
          }),
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
                  return Promise.resolve({
                    data: found ? { ...found } : null,
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
      return {};
    });
  }

  function setupSessionMock(overrides?: Partial<KioskEmployeeSession>) {
    setupDeviceMock();
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const sessionData = {
      profile_id: overrides?.profileId ?? MOCK_PROFILE_ID,
      display_name: overrides?.displayName ?? "Alice Chef",
      device_id: overrides?.deviceId ?? MOCK_DEVICE_ID,
      organization_id: overrides?.organizationId ?? MOCK_ORG_ID,
      location_id: overrides?.locationId ?? MOCK_LOC_ID,
      encrypted_access_token: encryptAccessToken(
        overrides?.accessToken ?? "jwt-token-alice",
      ),
      expires_at: new Date(Date.now() + 180_000).toISOString(),
    };
    mockSessionStorage[tokenHash] = sessionData;
    mockCookies["lineup_kiosk_session"] = signSessionToken(rawToken);
  }

  it("fails PIN auth if device is not paired", async () => {
    const res = await kioskAuthenticatePinAction({ pin: "1234" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("device_unpaired");
    }
  });

  it("fails PIN auth with malformed PIN", async () => {
    setupDeviceMock();
    const res = await kioskAuthenticatePinAction({ pin: "12" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("invalid_pin_format");
    }
  });

  it("locks out device after too many failed attempts", async () => {
    setupDeviceMock();

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === "kiosk_devices") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: MOCK_DEVICE_ID,
                name: "Host Station",
                organization_id: MOCK_ORG_ID,
                location_id: MOCK_LOC_ID,
                status: "active",
                organizations: {
                  id: MOCK_ORG_ID,
                  name: "Grand Bistro",
                  slug: "bistro",
                },
                locations: {
                  id: MOCK_LOC_ID,
                  name: "Downtown",
                  time_zone: "America/Chicago",
                  active: true,
                  archived_at: null,
                },
              },
              error: null,
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(Promise.resolve({})),
          }),
        };
      }
      if (table === "passcode_login_attempts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({ count: 5, error: null }),
          }),
        };
      }
      return {};
    });

    const res = await kioskAuthenticatePinAction({ pin: "9999" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("device_lockout");
    }
  });

  it("denies authentication and records failure when PIN is not recognized", async () => {
    setupDeviceMock();

    mockAdminClient.from.mockImplementation((table: string) => {
      if (table === "kiosk_devices") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: MOCK_DEVICE_ID,
                name: "Host Station",
                organization_id: MOCK_ORG_ID,
                location_id: MOCK_LOC_ID,
                status: "active",
                organizations: {
                  id: MOCK_ORG_ID,
                  name: "Grand Bistro",
                  slug: "bistro",
                },
                locations: {
                  id: MOCK_LOC_ID,
                  name: "Downtown",
                  time_zone: "America/Chicago",
                  active: true,
                  archived_at: null,
                },
              },
              error: null,
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(Promise.resolve({})),
          }),
        };
      }
      if (table === "passcode_login_attempts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
          }),
          insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
            mockAttemptInserts.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === "passcode_lockout_resets") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      if (table === "passcode_credentials") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      return {};
    });

    const res = await kioskAuthenticatePinAction({ pin: "0000" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("invalid_pin");
    }

    // Verify Requirement 5: Unrecognized PIN recorded succeeded: false
    expect(mockAttemptInserts).toHaveLength(1);
    expect(mockAttemptInserts[0].succeeded).toBe(false);
  });

  it.each([false, true])(
    "handles successful PIN authentication with attempt-write failure=%s",
    async (attemptWriteFails) => {
      setupDeviceMock();

      mockAdminClient.from.mockImplementation((table: string) => {
        if (table === "kiosk_devices") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: MOCK_DEVICE_ID,
                  name: "Host Station",
                  organization_id: MOCK_ORG_ID,
                  location_id: MOCK_LOC_ID,
                  status: "active",
                  organizations: {
                    id: MOCK_ORG_ID,
                    name: "Grand Bistro",
                    slug: "grand-bistro",
                  },
                  locations: {
                    id: MOCK_LOC_ID,
                    name: "Downtown",
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
              gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
            }),
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
          };
        }
        if (table === "passcode_lockout_resets") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: null, error: null }),
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
                  synthetic_email: "alice@grandbistro.internal",
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
                data: { roles: ["server"], active: true },
                error: null,
              }),
            }),
          };
        }
        if (table === "location_memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { active: true },
                error: null,
              }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { display_name: "Alice Chef" },
                error: null,
              }),
            }),
          };
        }
        if (table === "kiosk_sessions") {
          return {
            upsert: vi
              .fn()
              .mockImplementation((row: Record<string, unknown>) => {
                mockSessionStorage[String(row.session_token_hash)] = row;
                return Promise.resolve({ error: null });
              }),
            insert: vi
              .fn()
              .mockImplementation((row: Record<string, unknown>) => {
                mockSessionStorage[String(row.session_token_hash)] = row;
                return Promise.resolve({ error: null });
              }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {};
      });

      mockSupabaseAuth.signInWithPassword.mockResolvedValue({
        data: {
          session: { access_token: "jwt-token-alice-12345" },
          user: { id: MOCK_PROFILE_ID },
        },
        error: null,
      });

      mockEmployeeFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

      const res = await kioskAuthenticatePinAction({ pin: "1234" });
      expect(createClient).toHaveBeenCalledWith(
        "http://localhost:54321",
        "sb_publishable_kiosk_test",
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      if (attemptWriteFails) {
        expect(res).toMatchObject({
          ok: false,
          code: "rate_limit_unavailable",
        });
        expect(mockCookies["lineup_kiosk_session"]).toBeUndefined();
        expect(Object.keys(mockSessionStorage)).toHaveLength(0);
        return;
      }
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.employee.displayName).toBe("Alice Chef");
        expect(res.data.employee.profileId).toBe(MOCK_PROFILE_ID);
        // Verify Requirement 1: Zero accessToken exposure on return payload
        expect(
          (res.data as unknown as Record<string, unknown>).accessToken,
        ).toBeUndefined();
      }

      // Verify Requirement 5: Attempt recorded with succeeded: true on completed authentication
      expect(mockAttemptInserts).toHaveLength(1);
      expect(mockAttemptInserts[0].succeeded).toBe(true);

      // Verify Requirement 2: Cookie is set with opaque token (no JWT inside cookie)
      const cookieVal = mockCookies["lineup_kiosk_session"];
      expect(cookieVal).toBeDefined();
      expect(cookieVal).not.toContain("jwt-token-alice-12345");
      expect(cookieVal).toMatch(/^kiosk_sess_[a-f0-9]{64}\./);

      // Verify server-side storage holds encrypted token
      const storedSession = Object.values(mockSessionStorage)[0];
      expect(storedSession).toBeDefined();
      expect(storedSession.encrypted_access_token).toBeDefined();
      expect(storedSession.encrypted_access_token).not.toContain(
        "jwt-token-alice-12345",
      );
    },
  );

  it("kioskClockInAction invokes native clock in for authenticated employee", async () => {
    setupSessionMock();

    mockEmployeeRpc.mockResolvedValueOnce({
      data: {
        success: true,
        idempotent: false,
        sessionId: "sess-new",
        eventId: 101,
        status: "active",
        clockInAt: new Date().toISOString(),
      },
      error: null,
    });

    const res = await kioskClockInAction({ notes: "Morning shift" });
    expect(createClient).toHaveBeenCalledWith(
      "http://localhost:54321",
      "sb_publishable_kiosk_test",
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: "Bearer jwt-token-alice" } },
      },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.sessionId).toBe("sess-new");
      expect(res.data.status).toBe("active");
    }
  });

  it("kioskClockOutAction invokes native clock out for authenticated employee", async () => {
    setupSessionMock();

    mockEmployeeRpc.mockResolvedValueOnce({
      data: {
        success: true,
        idempotent: false,
        sessionId: "sess-new",
        eventId: 102,
        status: "completed",
        clockOutAt: new Date().toISOString(),
        grossElapsedSeconds: 28800,
        netPayableSeconds: 28800,
      },
      error: null,
    });

    const res = await kioskClockOutAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe("completed");
      expect(res.data.grossElapsedSeconds).toBe(28800);
    }
  });

  it("kioskBreakStartAction invokes native break start for authenticated employee", async () => {
    setupSessionMock();

    mockEmployeeRpc.mockResolvedValueOnce({
      data: {
        success: true,
        idempotent: false,
        sessionId: "sess-new",
        eventId: 103,
        status: "on_break",
        breakStartAt: new Date().toISOString(),
      },
      error: null,
    });

    const res = await kioskBreakStartAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe("on_break");
    }
  });

  it("kioskBreakEndAction invokes native break end for authenticated employee", async () => {
    setupSessionMock();

    mockEmployeeRpc.mockResolvedValueOnce({
      data: {
        success: true,
        idempotent: false,
        sessionId: "sess-new",
        eventId: 104,
        status: "active",
        breakEndAt: new Date().toISOString(),
      },
      error: null,
    });

    const res = await kioskBreakEndAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe("active");
    }
  });

  it("kioskGetActiveStatusAction returns current session without exposing JWT (Requirement 1)", async () => {
    setupSessionMock();

    mockEmployeeFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: "sess-active",
            location_id: MOCK_LOC_ID,
            profile_id: MOCK_PROFILE_ID,
            service_date: "2026-11-11",
            status: "active",
            clock_in_at: new Date().toISOString(),
          },
          error: null,
        }),
      }),
    });

    const res = await kioskGetActiveStatusAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.employee.profileId).toBe(MOCK_PROFILE_ID);
      expect(res.data.currentSession?.id).toBe("sess-active");
      // Strict verification of Requirement 1: No accessToken in response
      expect(
        (res.data as unknown as Record<string, unknown>).accessToken,
      ).toBeUndefined();
      expect(
        (res.data as unknown as Record<string, unknown>).session,
      ).toBeUndefined();
    }
  });

  it("kioskGetEmployeeReportAction fetches monthly attendance rows for employee", async () => {
    setupSessionMock();

    const res = await kioskGetEmployeeReportAction({ year: 2026, month: 11 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.rows).toHaveLength(1);
      expect(res.data.rows[0].profileId).toBe(MOCK_PROFILE_ID);
    }
  });

  it("kioskClearSessionAction purges the server session and cookie", async () => {
    setupSessionMock();

    const res = await kioskClearSessionAction();
    expect(res.ok).toBe(true);
    expect(mockCookies["lineup_kiosk_session"]).toBeUndefined();
    expect(Object.keys(mockSessionStorage)).toHaveLength(0);
  });
});
