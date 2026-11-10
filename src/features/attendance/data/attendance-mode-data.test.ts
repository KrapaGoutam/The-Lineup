import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  getLocationAttendanceMode,
  setLocationAttendanceMode,
} from "./attendance-mode-data";

describe("attendance-mode-data", () => {
  const locationId = "00000000-0000-0000-0000-000000000001";
  const organizationId = "00000000-0000-0000-0000-000000000002";

  it("reads location attendance mode when configured", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: locationId,
                organization_id: organizationId,
                attendance_mode: "internal_the_lineup",
                updated_at: "2026-11-09T20:00:00Z",
                time_zone: "America/Chicago",
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    const res = await getLocationAttendanceMode(
      mockSupabase as unknown as SupabaseClient<Database>,
      locationId,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.mode).toBe("INTERNAL_THE_LINEUP");
      expect(res.data.isConfigured).toBe(true);
      expect(res.data.timeZone).toBe("America/Chicago");
    }
  });

  it("handles unconfigured (null) mode gracefully", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: locationId,
                organization_id: organizationId,
                attendance_mode: null,
                updated_at: "2026-11-09T20:00:00Z",
                time_zone: "America/Chicago",
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    const res = await getLocationAttendanceMode(
      mockSupabase as unknown as SupabaseClient<Database>,
      locationId,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.mode).toBe("EXTERNAL");
      expect(res.data.isConfigured).toBe(false);
    }
  });

  it("calls set_location_attendance_mode RPC with mapped mode", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: locationId,
          organization_id: organizationId,
          attendance_mode: "internal_the_lineup",
          updated_at: "2026-11-09T21:00:00Z",
          time_zone: "America/Chicago",
        },
        error: null,
      }),
    };

    const res = await setLocationAttendanceMode(
      mockSupabase as unknown as SupabaseClient<Database>,
      {
        locationId,
        mode: "INTERNAL_THE_LINEUP",
        reason: "Admin enabling native mode",
      },
    );

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      "set_location_attendance_mode",
      {
        p_location_id: locationId,
        p_mode: "internal_the_lineup",
        p_expected_updated_at: undefined,
        p_reason: "Admin enabling native mode",
      },
    );
    expect(res.ok).toBe(true);
  });

  it("returns conflict error when RPC fails with P0004", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "P0004", message: "Stale update" },
      }),
    };

    const res = await setLocationAttendanceMode(
      mockSupabase as unknown as SupabaseClient<Database>,
      {
        locationId,
        mode: "DISABLED",
        expectedUpdatedAt: "2026-11-09T19:00:00Z",
      },
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("conflict");
    }
  });
});
