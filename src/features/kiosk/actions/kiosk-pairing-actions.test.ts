import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getKioskDeviceStatusAction,
  pairKioskDeviceAction,
  unpairKioskDeviceAction,
} from "./kiosk-pairing-actions";

// Mock server-only
vi.mock("server-only", () => ({}));

const mockCookies: Record<string, string> = {};

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockImplementation(() => ({
    get: (name: string) =>
      mockCookies[name] ? { value: mockCookies[name] } : undefined,
    set: (name: string, value: string) => {
      mockCookies[name] = value;
    },
    delete: (name: string) => {
      delete mockCookies[name];
    },
  })),
}));

const mockAdminClient = {
  rpc: vi.fn(),
  from: vi.fn(),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

describe("Kiosk Pairing Server Actions", () => {
  const MOCK_DEVICE_ID = "44444444-4444-4444-4444-444444444444";
  const MOCK_ORG_ID = "11111111-1111-1111-1111-111111111111";
  const MOCK_LOC_ID = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockCookies).forEach((key) => delete mockCookies[key]);
  });

  it("rejects invalid pairing code format in pairKioskDeviceAction", async () => {
    const res = await pairKioskDeviceAction({ pairingCode: "12" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/alphanumeric/i);
    }
  });

  it("pairs kiosk tablet successfully with valid code", async () => {
    mockAdminClient.rpc.mockResolvedValueOnce({
      data: {
        device_id: MOCK_DEVICE_ID,
        device_name: "Host Station",
        organization_id: MOCK_ORG_ID,
        organization_name: "The Grand Bistro",
        organization_slug: "grand-bistro",
        location_id: MOCK_LOC_ID,
        location_name: "Downtown",
        time_zone: "America/Chicago",
        status: "active",
      },
      error: null,
    });

    const res = await pairKioskDeviceAction({ pairingCode: "ABC234" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.deviceId).toBe(MOCK_DEVICE_ID);
      expect(res.data.locationName).toBe("Downtown");
      expect(mockCookies["lineup_kiosk_device"]).toBeDefined();
    }
  });

  it("returns paired: false when no device cookie is present", async () => {
    const res = await getKioskDeviceStatusAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.paired).toBe(false);
      expect(res.data.context).toBeNull();
    }
  });

  it("returns paired: true and context when valid device cookie exists", async () => {
    mockCookies["lineup_kiosk_device"] =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

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
            name: "The Grand Bistro",
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
      return {};
    });

    const res = await getKioskDeviceStatusAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.paired).toBe(true);
      expect(res.data.context?.deviceId).toBe(MOCK_DEVICE_ID);
      expect(res.data.context?.locationName).toBe("Downtown");
    }
  });

  it("clears stale cookie and returns paired: false if device is revoked", async () => {
    mockCookies["lineup_kiosk_device"] = "revoked-device-token";

    mockAdminClient.from.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: MOCK_DEVICE_ID,
              name: "Host Station",
              organization_id: MOCK_ORG_ID,
              location_id: MOCK_LOC_ID,
              status: "revoked",
              organizations: {
                id: MOCK_ORG_ID,
                name: "The Grand Bistro",
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
      }),
    });

    const res = await getKioskDeviceStatusAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.paired).toBe(false);
      expect(res.data.context).toBeNull();
      expect(mockCookies["lineup_kiosk_device"]).toBeUndefined();
    }
  });

  it("unpairKioskDeviceAction clears device and session cookies", async () => {
    mockCookies["lineup_kiosk_device"] = "existing-token";
    mockCookies["lineup_kiosk_session"] = "existing-session";

    const res = await unpairKioskDeviceAction();
    expect(res.ok).toBe(true);
    expect(mockCookies["lineup_kiosk_device"]).toBeUndefined();
    expect(mockCookies["lineup_kiosk_session"]).toBeUndefined();
  });
});
