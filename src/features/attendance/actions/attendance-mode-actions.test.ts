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
    it.each([
      "2026-11-16T12:24:55.899175+00:00",
      "2026-11-16T12:24:55.899175Z",
    ])(
      "passes the original valid timestamp %s to the update",
      async (timestamp) => {
        mocks.requireLiveSession.mockResolvedValue(null);
        mocks.setLocationAttendanceMode.mockResolvedValue({
          ok: true,
          data: { locationId, organizationId, mode: "INTERNAL_THE_LINEUP" },
        });

        const res = await setLocationAttendanceModeAction({
          locationId,
          mode: "INTERNAL_THE_LINEUP",
          expectedUpdatedAt: timestamp,
          reason: "Use native attendance",
        });

        expect(res.ok).toBe(true);
        expect(mocks.setLocationAttendanceMode).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ expectedUpdatedAt: timestamp }),
        );
      },
    );

    it("rejects malformed timestamps before the update", async () => {
      mocks.requireLiveSession.mockResolvedValue(null);
      const res = await setLocationAttendanceModeAction({
        locationId,
        mode: "INTERNAL_THE_LINEUP",
        expectedUpdatedAt: "2026-11-16T12:24:55+25:00",
        reason: "Use native attendance",
      });
      expect(res.ok).toBe(false);
      expect(mocks.setLocationAttendanceMode).not.toHaveBeenCalled();
    });

    it("fails closed when unauthenticated", async () => {
      mocks.requireLiveSession.mockResolvedValue({
        ok: false,
        error: "Authentication required.",
        sessionInvalid: true,
      });
      const res = await setLocationAttendanceModeAction({
        locationId,
        mode: "INTERNAL_THE_LINEUP",
        expectedUpdatedAt: "2026-11-09T20:00:00Z",
        reason: "Admin enabling native attendance",
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
        expectedUpdatedAt: "2026-11-09T20:00:00Z",
        reason: "Admin enabling native attendance",
      });

      expect(res.ok).toBe(true);
      expect(mocks.setLocationAttendanceMode).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          expectedUpdatedAt: "2026-11-09T20:00:00Z",
          reason: "Admin enabling native attendance",
        }),
      );
    });

    it("rejects invalid mode string", async () => {
      mocks.requireLiveSession.mockResolvedValue(null);
      const res = await setLocationAttendanceModeAction({
        locationId,
        mode: "INVALID_MODE" as unknown as "EXTERNAL",
        expectedUpdatedAt: "2026-11-09T20:00:00Z",
        reason: "Change the source",
      });
      expect(res.ok).toBe(false);
    });

    it("requires a reason and expected timestamp before invoking the RPC", async () => {
      mocks.requireLiveSession.mockResolvedValue(null);
      const missingReason = await setLocationAttendanceModeAction({
        locationId,
        mode: "EXTERNAL",
        expectedUpdatedAt: "2026-11-09T20:00:00Z",
        reason: " ",
      });
      const missingTimestamp = await setLocationAttendanceModeAction({
        locationId,
        mode: "EXTERNAL",
        reason: "Switch to external clock",
      } as never);
      expect(missingReason.ok).toBe(false);
      expect(missingTimestamp.ok).toBe(false);
      expect(mocks.setLocationAttendanceMode).not.toHaveBeenCalled();
    });

    it("returns conflict information without treating the write as successful", async () => {
      mocks.requireLiveSession.mockResolvedValue(null);
      mocks.setLocationAttendanceMode.mockResolvedValue({
        ok: false,
        code: "conflict",
        error:
          "Configuration conflict: location was modified by another operation.",
      });
      const res = await setLocationAttendanceModeAction({
        locationId,
        mode: "DISABLED",
        expectedUpdatedAt: "2026-11-09T20:00:00Z",
        reason: "Seasonal closure",
      });
      expect(res).toMatchObject({ ok: false, code: "conflict" });
    });
  });
});
