import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireLiveSession: vi.fn(),
  getLocationAttendanceMode: vi.fn(),
  setLocationAttendanceMode: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("@/features/attendance/data/attendance-mode-data", () => ({
  getLocationAttendanceMode: mocks.getLocationAttendanceMode,
  setLocationAttendanceMode: mocks.setLocationAttendanceMode,
}));

import {
  getLocationAttendanceModeAction,
  setLocationAttendanceModeAction,
} from "./attendance-mode-actions";

describe("attendance-mode-actions", () => {
  const locationId = "00000000-0000-0000-0000-000000000001";
  const organizationId = "00000000-0000-0000-0000-000000000002";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getLocationAttendanceModeAction", () => {
    it("fails closed when unauthenticated", async () => {
      mocks.requireLiveSession.mockResolvedValue({
        ok: false,
        error: "Authentication required.",
        sessionInvalid: true,
      });
      const res = await getLocationAttendanceModeAction(locationId);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Authentication required");
      }
    });

    it("returns mode record when authorized", async () => {
      mocks.requireLiveSession.mockResolvedValue(null);
      mocks.getLocationAttendanceMode.mockResolvedValue({
        ok: true,
        data: {
          locationId,
          organizationId,
          mode: "INTERNAL_THE_LINEUP",
          isConfigured: true,
          updatedAt: "2026-11-09T20:00:00Z",
          timeZone: "America/Chicago",
        },
      });

      const res = await getLocationAttendanceModeAction(locationId);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.mode).toBe("INTERNAL_THE_LINEUP");
      }
    });

    it("rejects invalid UUID", async () => {
      mocks.requireLiveSession.mockResolvedValue(null);
      const res = await getLocationAttendanceModeAction("not-a-uuid");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Invalid location ID");
      }
    });
  });

  describe("setLocationAttendanceModeAction", () => {
    it("fails closed when unauthenticated", async () => {
      mocks.requireLiveSession.mockResolvedValue({
        ok: false,
        error: "Authentication required.",
        sessionInvalid: true,
      });
      const res = await setLocationAttendanceModeAction({
        locationId,
        mode: "INTERNAL_THE_LINEUP",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("Authentication required");
      }
    });

    it("updates mode and revalidates paths when authorized", async () => {
      mocks.requireLiveSession.mockResolvedValue(null);
      mocks.setLocationAttendanceMode.mockResolvedValue({
        ok: true,
        data: {
          locationId,
          organizationId,
          mode: "INTERNAL_THE_LINEUP",
          isConfigured: true,
          updatedAt: "2026-11-09T21:00:00Z",
          timeZone: "America/Chicago",
        },
      });

      const res = await setLocationAttendanceModeAction({
        locationId,
        mode: "INTERNAL_THE_LINEUP",
        reason: "Admin enabling native attendance",
      });

      expect(res.ok).toBe(true);
    });

    it("rejects invalid mode string", async () => {
      mocks.requireLiveSession.mockResolvedValue(null);
      const res = await setLocationAttendanceModeAction({
        locationId,
        mode: "INVALID_MODE" as unknown as "EXTERNAL",
      });
      expect(res.ok).toBe(false);
    });
  });
});
