import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireLiveSession: vi.fn(),
  nativeClockIn: vi.fn(),
  nativeClockOut: vi.fn(),
  nativeBreakStart: vi.fn(),
  nativeBreakEnd: vi.fn(),
  getActiveAttendanceSession: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("@/features/attendance/data/native-attendance-data", () => ({
  nativeClockIn: mocks.nativeClockIn,
  nativeClockOut: mocks.nativeClockOut,
  nativeBreakStart: mocks.nativeBreakStart,
  nativeBreakEnd: mocks.nativeBreakEnd,
  getActiveAttendanceSession: mocks.getActiveAttendanceSession,
}));

import {
  getActiveAttendanceSessionAction,
  nativeBreakEndAction,
  nativeBreakStartAction,
  nativeClockInAction,
  nativeClockOutAction,
} from "./native-clock-actions";

describe("native-clock-actions", () => {
  const locationId = "00000000-0000-0000-0000-000000000001";
  const profileId = "00000000-0000-0000-0000-000000000002";
  const sessionId = "00000000-0000-0000-0000-000000000003";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("nativeClockInAction", () => {
    it("fails closed when unauthenticated", async () => {
      mocks.requireLiveSession.mockResolvedValue({
        ok: false,
        error: "Authentication required.",
        sessionInvalid: true,
      });
      const res = await nativeClockInAction({ locationId });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Authentication required");
      }
    });

    it("succeeds when authenticated and RPC passes", async () => {
      mocks.requireLiveSession.mockResolvedValue(null);
      mocks.nativeClockIn.mockResolvedValue({
        ok: true,
        data: {
          success: true,
          idempotent: false,
          sessionId,
          eventId: 1,
          status: "active",
        },
      });

      const res = await nativeClockInAction({
        locationId,
        idempotencyKey: "test-key-1",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.status).toBe("active");
      }
    });

    it("returns error message when clock-in is rejected", async () => {
      mocks.requireLiveSession.mockResolvedValue(null);
      mocks.nativeClockIn.mockResolvedValue({
        ok: false,
        error: "Employee already has an open attendance session",
      });

      const res = await nativeClockInAction({ locationId });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("already has an open");
      }
    });
  });

  describe("nativeClockOutAction", () => {
    it("fails closed when unauthenticated", async () => {
      mocks.requireLiveSession.mockResolvedValue({
        ok: false,
        error: "Authentication required.",
        sessionInvalid: true,
      });
      const res = await nativeClockOutAction({ locationId });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Authentication required");
      }
    });

    it("succeeds when authenticated and RPC passes", async () => {
      mocks.requireLiveSession.mockResolvedValue(null);
      mocks.nativeClockOut.mockResolvedValue({
        ok: true,
        data: {
          success: true,
          idempotent: false,
          sessionId,
          eventId: 2,
          status: "completed",
        },
      });

      const res = await nativeClockOutAction({ locationId });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.status).toBe("completed");
      }
    });
  });

  describe("nativeBreakStartAction and nativeBreakEndAction", () => {
    it("handles break start and end successfully", async () => {
      mocks.requireLiveSession.mockResolvedValue(null);
      mocks.nativeBreakStart.mockResolvedValue({
        ok: true,
        data: { success: true, status: "on_break" },
      });
      mocks.nativeBreakEnd.mockResolvedValue({
        ok: true,
        data: { success: true, status: "active" },
      });

      const startRes = await nativeBreakStartAction({ locationId });
      expect(startRes.ok).toBe(true);

      const endRes = await nativeBreakEndAction({ locationId });
      expect(endRes.ok).toBe(true);
    });
  });

  describe("getActiveAttendanceSessionAction", () => {
    it("queries active session successfully", async () => {
      mocks.requireLiveSession.mockResolvedValue(null);
      mocks.getActiveAttendanceSession.mockResolvedValue({
        ok: true,
        data: {
          id: sessionId,
          organizationId: "org-1",
          locationId,
          profileId,
          serviceDate: "2026-11-09",
          status: "active",
          clockInAt: "2026-11-09T14:00:00Z",
          clockOutAt: null,
          totalBreakSeconds: 0,
          totalWorkedSeconds: null,
          createdBy: profileId,
          updatedBy: null,
          createdAt: "2026-11-09T14:00:00Z",
          updatedAt: "2026-11-09T14:00:00Z",
        },
      });

      const res = await getActiveAttendanceSessionAction({
        locationId,
        profileId,
      });
      expect(res.ok).toBe(true);
      if (res.ok && res.data) {
        expect(res.data.status).toBe("active");
      }
    });
  });
});
