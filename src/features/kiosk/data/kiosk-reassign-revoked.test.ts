import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { reassignKioskDevice } from "./kiosk-device-data";

/**
 * V2-008 S1 / U-1: the database refuses to reassign a revoked kiosk device
 * (SQLSTATE 55000). The data layer must surface that as a fixed, actionable,
 * non-leaky message with a stable code - never the raw database text - and must
 * keep the pre-existing 42501 mapping.
 */

function clientWithRpcError(error: { code: string; message: string } | null) {
  const rpc = vi.fn().mockResolvedValue(
    error
      ? { data: null, error }
      : {
          data: { success: true, deviceId: "d", locationId: "l" },
          error: null,
        },
  );
  return {
    rpc,
    client: { rpc } as unknown as SupabaseClient<Database>,
  };
}

const PARAMS = { deviceId: "device-1", newLocationId: "loc-2" } as const;

describe("reassignKioskDevice error mapping (U-1)", () => {
  it("maps 55000 to a fixed DEVICE_REVOKED message that tells the manager to pair again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client, rpc } = clientWithRpcError({
      code: "55000",
      message: "Revoked devices cannot be reassigned. internal detail",
    });

    const res = await reassignKioskDevice(client, PARAMS);

    expect(rpc).toHaveBeenCalledWith("kiosk_reassign_device", {
      p_device_id: "device-1",
      p_new_location_id: "loc-2",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("DEVICE_REVOKED");
      expect(res.error).toMatch(/revoked/i);
      expect(res.error).toMatch(/pair the tablet again/i);
      expect(res.error).not.toMatch(/internal detail/);
    }
  });

  it("still maps 42501 to UNAUTHORIZED (no revoked-state disclosure)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = clientWithRpcError({
      code: "42501",
      message: "Unauthorized",
    });

    const res = await reassignKioskDevice(client, PARAMS);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("UNAUTHORIZED");
      expect(res.error).not.toMatch(/revoked/i);
    }
  });

  it("passes a successful reassignment through unchanged", async () => {
    const { client } = clientWithRpcError(null);
    const res = await reassignKioskDevice(client, PARAMS);
    expect(res).toEqual({
      ok: true,
      data: { deviceId: "d", locationId: "l" },
    });
  });
});
