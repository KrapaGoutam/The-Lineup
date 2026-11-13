import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateKioskPairingCodeAction,
  listKioskDevicesAction,
  listManageableKioskLocationsAction,
  reassignKioskDeviceAction,
  renameKioskDeviceAction,
  revokeKioskDeviceAction,
} from "./kiosk-admin-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireLiveSession = vi.fn();
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: (...args: unknown[]) => requireLiveSession(...args),
}));

const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));

const LOC = "22222222-2222-2222-2222-222222222222";
const OTHER_LOC = "33333333-3333-3333-3333-333333333333";
const DEVICE = "44444444-4444-4444-4444-444444444444";

describe("listManageableKioskLocationsAction (D7)", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    requireLiveSession.mockResolvedValue(null);
    mockCreateClient.mockResolvedValue({ rpc });
  });

  it("maps the database answer and sends no client-supplied location", async () => {
    rpc.mockResolvedValueOnce({
      data: [
        {
          location_id: LOC,
          location_name: "Downtown",
          organization_id: "11111111-1111-1111-1111-111111111111",
          organization_name: "The Monk's",
        },
      ],
      error: null,
    });

    const result = await listManageableKioskLocationsAction();

    expect(result).toEqual({
      ok: true,
      data: [
        {
          locationId: LOC,
          locationName: "Downtown",
          organizationId: "11111111-1111-1111-1111-111111111111",
          organizationName: "The Monk's",
        },
      ],
    });
    // Zero arguments: the database decides from the caller's own session.
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "kiosk_list_manageable_locations",
    );
  });

  it("returns an empty list (not an error) when the caller may manage nothing", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await listManageableKioskLocationsAction()).toEqual({
      ok: true,
      data: [],
    });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await listManageableKioskLocationsAction()).toEqual({
      ok: true,
      data: [],
    });
  });

  it("stops at an invalid session before touching the database", async () => {
    const invalid = {
      ok: false,
      error: "Your session is no longer valid. Please sign in again.",
      sessionInvalid: true,
    } as const;
    requireLiveSession.mockResolvedValueOnce(invalid);

    expect(await listManageableKioskLocationsAction()).toEqual(invalid);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed with a generic message and leaks no database detail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "XX000", message: "relation secret_table exploded" },
    });
    const result = await listManageableKioskLocationsAction();
    expect(result).toEqual({
      ok: false,
      error: "Failed to load your kiosk locations.",
    });

    rpc.mockRejectedValueOnce(new Error("connection string leaked"));
    const thrown = await listManageableKioskLocationsAction();
    expect(thrown).toEqual({
      ok: false,
      error: "Failed to load your kiosk locations.",
    });
  });
});

describe("kiosk management actions never trust the listing (direct-call denial)", () => {
  const denied = { code: "42501", message: "Unauthorized" };

  beforeEach(() => {
    vi.clearAllMocks();
    requireLiveSession.mockResolvedValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    [
      "generate pairing code",
      () =>
        generateKioskPairingCodeAction({
          locationId: OTHER_LOC,
          deviceName: "Hijack",
        }),
    ],
    [
      "rename",
      () => renameKioskDeviceAction({ deviceId: DEVICE, name: "Hijack" }),
    ],
    [
      "revoke",
      () =>
        revokeKioskDeviceAction({ deviceId: DEVICE, reason: "not allowed" }),
    ],
    [
      "reassign",
      () => reassignKioskDeviceAction({ deviceId: DEVICE, newLocationId: LOC }),
    ],
  ])(
    "%s is denied when the database rejects the caller",
    async (_name, call) => {
      mockCreateClient.mockResolvedValue({
        rpc: vi.fn().mockResolvedValue({ data: null, error: denied }),
      });
      const result = await call();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/unauthorized/i);
    },
  );

  it("an unmanaged location lists no devices (RLS returns nothing)", async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    mockCreateClient.mockResolvedValue({
      from: () => ({ select: () => ({ eq: () => ({ order }) }) }),
    });
    const result = await listKioskDevicesAction({ locationId: OTHER_LOC });
    expect(result).toEqual({ ok: true, data: [] });
  });

  it("a dead session is rejected before any kiosk RPC runs", async () => {
    const rpc = vi.fn();
    mockCreateClient.mockResolvedValue({ rpc });
    requireLiveSession.mockResolvedValue({
      ok: false,
      error: "Your session is no longer valid. Please sign in again.",
      sessionInvalid: true,
    });
    const result = await revokeKioskDeviceAction({
      deviceId: DEVICE,
      reason: "should not run",
    });
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("kiosk management source never uses a privileged client", () => {
  it("admin actions and data layer use only the caller-scoped client", () => {
    const base = path.resolve(import.meta.dirname, "..");
    for (const file of [
      "actions/kiosk-admin-actions.ts",
      "data/kiosk-device-data.ts",
    ]) {
      const source = readFileSync(path.join(base, file), "utf8");
      expect(source, file).not.toMatch(
        /service[-_]?role|createAdminClient|supabase\/admin|SUPABASE_SERVICE/i,
      );
    }
  });
});
