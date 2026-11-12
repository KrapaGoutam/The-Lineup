import { describe, expect, it, vi } from "vitest";
import {
  generateKioskPairingCodeAction,
  listKioskDevicesAction,
  reassignKioskDeviceAction,
  renameKioskDeviceAction,
  revokeKioskDeviceAction,
} from "./kiosk-admin-actions";

// Mock server-only
vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: vi.fn().mockResolvedValue(null),
}));

const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));

describe("Kiosk Admin Server Actions", () => {
  const MOCK_PROFILE_ID = "00000000-0000-0000-0000-000000000001";
  const MOCK_ORG_ID = "11111111-1111-1111-1111-111111111111";
  const MOCK_LOC_ID = "22222222-2222-2222-2222-222222222222";
  const MOCK_NEW_LOC_ID = "33333333-3333-3333-3333-333333333333";
  const MOCK_DEVICE_ID = "44444444-4444-4444-4444-444444444444";

  function setupAuth(authorized: boolean) {
    mockCreateClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: MOCK_PROFILE_ID } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "locations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: MOCK_LOC_ID,
                    organization_id: MOCK_ORG_ID,
                    active: true,
                    archived_at: null,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: authorized
                        ? { roles: ["general_manager"] }
                        : { roles: ["server"] },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "location_memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "kiosk_devices") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: MOCK_DEVICE_ID,
                    organization_id: MOCK_ORG_ID,
                    location_id: MOCK_LOC_ID,
                    name: "Front Tablet",
                    status: "active",
                    credential_version: 1,
                    last_seen_at: null,
                    revoked_at: null,
                    revoked_by: null,
                    revocation_reason: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: MOCK_DEVICE_ID,
                      organization_id: MOCK_ORG_ID,
                      location_id: MOCK_LOC_ID,
                      name: "Front Tablet",
                      status: "active",
                      credential_version: 1,
                      last_seen_at: null,
                      revoked_at: null,
                      revoked_by: null,
                      revocation_reason: null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
      rpc: vi.fn((fnName: string) => {
        if (!authorized) {
          return Promise.resolve({
            data: null,
            error: {
              code: "42501",
              message: "Unauthorized to manage kiosk devices.",
            },
          });
        }
        if (fnName === "kiosk_generate_pairing_code") {
          return Promise.resolve({
            data: {
              pairing_id: "55555555-5555-5555-5555-555555555555",
              location_id: MOCK_LOC_ID,
              organization_id: MOCK_ORG_ID,
              device_name: "Host Station",
              expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            },
            error: null,
          });
        }
        if (fnName === "kiosk_rename_device") {
          return Promise.resolve({
            data: {
              id: MOCK_DEVICE_ID,
              organization_id: MOCK_ORG_ID,
              location_id: MOCK_LOC_ID,
              name: "Renamed Tablet",
              status: "active",
              credential_version: 1,
              last_seen_at: null,
              revoked_at: null,
              revoked_by: null,
              revocation_reason: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            error: null,
          });
        }
        if (fnName === "kiosk_reassign_device") {
          return Promise.resolve({
            data: {
              id: MOCK_DEVICE_ID,
              organization_id: MOCK_ORG_ID,
              location_id: MOCK_NEW_LOC_ID,
              name: "Renamed Tablet",
              status: "active",
              credential_version: 2,
              last_seen_at: null,
              revoked_at: null,
              revoked_by: null,
              revocation_reason: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            error: null,
          });
        }
        if (fnName === "kiosk_revoke_device") {
          return Promise.resolve({
            data: {
              id: MOCK_DEVICE_ID,
              organization_id: MOCK_ORG_ID,
              location_id: MOCK_LOC_ID,
              name: "Renamed Tablet",
              status: "revoked",
              credential_version: 2,
              last_seen_at: null,
              revoked_at: new Date().toISOString(),
              revoked_by: MOCK_PROFILE_ID,
              revocation_reason: "Decommissioned old tablet",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    });
  }

  it("fails generateKioskPairingCodeAction with invalid input", async () => {
    const res = await generateKioskPairingCodeAction({
      locationId: "invalid-uuid",
      deviceName: "",
    });
    expect(res.ok).toBe(false);
  });

  it("denies generateKioskPairingCodeAction for unauthorized caller", async () => {
    setupAuth(false);
    const res = await generateKioskPairingCodeAction({
      locationId: MOCK_LOC_ID,
      deviceName: "Host Station",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/unauthorized/i);
    }
  });

  it("generates pairing code successfully for authorized manager", async () => {
    setupAuth(true);
    const res = await generateKioskPairingCodeAction({
      locationId: MOCK_LOC_ID,
      deviceName: "Host Station",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.pairingCode).toBeDefined();
      expect(res.data.pairingCode.length).toBe(6);
      expect(res.data.locationId).toBe(MOCK_LOC_ID);
    }
  });

  it("lists kiosk devices for authorized manager", async () => {
    setupAuth(true);
    const res = await listKioskDevicesAction({
      locationId: MOCK_LOC_ID,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.length).toBe(1);
      expect(res.data[0].id).toBe(MOCK_DEVICE_ID);
    }
  });

  it("renames kiosk device for authorized manager", async () => {
    setupAuth(true);
    const res = await renameKioskDeviceAction({
      deviceId: MOCK_DEVICE_ID,
      name: "Renamed Tablet",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.name).toBe("Renamed Tablet");
    }
  });

  it("reassigns kiosk device to a new location", async () => {
    setupAuth(true);
    const res = await reassignKioskDeviceAction({
      deviceId: MOCK_DEVICE_ID,
      newLocationId: MOCK_NEW_LOC_ID,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.locationId).toBe(MOCK_NEW_LOC_ID);
    }
  });

  it("revokes kiosk device with required reason", async () => {
    setupAuth(true);
    const res = await revokeKioskDeviceAction({
      deviceId: MOCK_DEVICE_ID,
      reason: "Decommissioned old tablet",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.status).toBe("revoked");
    }
  });

  it("rejects revoking device with empty or too short reason", async () => {
    setupAuth(true);
    const res = await revokeKioskDeviceAction({
      deviceId: MOCK_DEVICE_ID,
      reason: "no",
    });
    expect(res.ok).toBe(false);
  });
});
