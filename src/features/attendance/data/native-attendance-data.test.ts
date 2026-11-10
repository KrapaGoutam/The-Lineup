import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  getActiveAttendanceSession,
  nativeBreakEnd,
  nativeBreakStart,
  nativeClockIn,
  nativeClockOut,
} from "./native-attendance-data";

describe("native-attendance-data", () => {
  const locationId = "00000000-0000-0000-0000-000000000001";
  const profileId = "00000000-0000-0000-0000-000000000002";
  const sessionId = "00000000-0000-0000-0000-000000000003";

  it("calls attendance_clock_in RPC", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          success: true,
          idempotent: false,
          sessionId,
          eventId: 101,
          status: "active",
        },
        error: null,
      }),
    };

    const res = await nativeClockIn(
      mockSupabase as unknown as SupabaseClient<Database>,
      {
        locationId,
        profileId,
        idempotencyKey: "key-1",
        notes: "Shift start",
      },
    );

    expect(mockSupabase.rpc).toHaveBeenCalledWith("attendance_clock_in", {
      p_location_id: locationId,
      p_profile_id: profileId,
      p_idempotency_key: "key-1",
      p_notes: "Shift start",
    });
    expect(res.ok).toBe(true);
  });

  it("handles duplicate clock-in error (already open)", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "23505",
          message: "Employee already has an open session",
        },
      }),
    };

    const res = await nativeClockIn(
      mockSupabase as unknown as SupabaseClient<Database>,
      { locationId },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("already_open");
    }
  });

  it("calls attendance_clock_out RPC", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          success: true,
          idempotent: false,
          sessionId,
          eventId: 102,
          status: "completed",
          grossElapsedSeconds: 28800,
          unclassifiedBreakCount: 0,
          netPayableSeconds: 28800,
        },
        error: null,
      }),
    };

    const res = await nativeClockOut(
      mockSupabase as unknown as SupabaseClient<Database>,
      {
        locationId,
        idempotencyKey: "key-out-1",
      },
    );

    expect(mockSupabase.rpc).toHaveBeenCalledWith("attendance_clock_out", {
      p_location_id: locationId,
      p_profile_id: undefined,
      p_idempotency_key: "key-out-1",
      p_notes: undefined,
    });
    expect(res.ok).toBe(true);
  });

  it("calls attendance_break_start and attendance_break_end", async () => {
    const mockSupabase = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({
          data: { success: true, status: "on_break" },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { success: true, status: "active", breakDurationSeconds: 900 },
          error: null,
        }),
    };

    const startRes = await nativeBreakStart(
      mockSupabase as unknown as SupabaseClient<Database>,
      { locationId },
    );
    expect(startRes.ok).toBe(true);

    const endRes = await nativeBreakEnd(
      mockSupabase as unknown as SupabaseClient<Database>,
      { locationId },
    );
    expect(endRes.ok).toBe(true);
  });

  it("queries active attendance session for employee", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: sessionId,
                    organization_id: "org-1",
                    location_id: locationId,
                    profile_id: profileId,
                    service_date: "2026-11-09",
                    status: "active",
                    clock_in_at: "2026-11-09T14:00:00Z",
                    clock_out_at: null,
                    gross_elapsed_seconds: null,
                    total_break_seconds: 0,
                    created_by: profileId,
                    updated_by: null,
                    created_at: "2026-11-09T14:00:00Z",
                    updated_at: "2026-11-09T14:00:00Z",
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const res = await getActiveAttendanceSession(
      mockSupabase as unknown as SupabaseClient<Database>,
      {
        locationId,
        profileId,
      },
    );

    expect(res.ok).toBe(true);
    if (res.ok && res.data) {
      expect(res.data.id).toBe(sessionId);
      expect(res.data.status).toBe("active");
    }
  });
});
