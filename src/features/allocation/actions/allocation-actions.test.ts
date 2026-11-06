import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getAllocationActor: vi.fn(),
  getPrimaryLocation: vi.fn(),
  getAllocationContext: vi.fn(),
  requireLiveSession: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    from: mocks.from,
  }),
}));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("@/features/allocation/data/allocation-actor", () => ({
  getAllocationActor: mocks.getAllocationActor,
}));
vi.mock("@/features/locations/data/primary-location", () => ({
  getPrimaryLocation: mocks.getPrimaryLocation,
}));
vi.mock("@/features/allocation/data/allocation-data", () => ({
  getAllocationContext: mocks.getAllocationContext,
}));

import { STALE_CONTEXT_MESSAGE } from "@/features/context/domain/workspace-expectation";
import {
  executeBoardActionRemote,
  getAllocationContextForDateAction,
  redoBoardAction,
  undoBoardAction,
} from "./allocation-actions";

const P = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const O = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SLUG = "the-monks";

const validCtx = (locationId = A) => ({
  profileId: P,
  organizationId: O,
  locationId,
});

describe("allocation-actions location scoping and consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: 10, error: null });
    mocks.requireLiveSession.mockResolvedValue(null);
    mocks.getAllocationActor.mockResolvedValue({
      profileId: P,
      name: "Floor Staff",
      designation: "server",
      organizationId: O,
    });
    mocks.getPrimaryLocation.mockResolvedValue({
      id: A,
      time_zone: "America/Chicago",
    });

    // Default supabase.from mock returns session row belonging to (O, A)
    mocks.from.mockImplementation((table: string) => {
      if (table === "service_sessions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { organization_id: O, location_id: A },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "rotation_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: 101 }, error: null }),
              }),
              in: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    });
  });

  describe("executeBoardActionRemote", () => {
    it("preserves stale-context recovery for an authenticated actor whose scope no longer resolves", async () => {
      mocks.getAllocationActor.mockResolvedValueOnce({ contextStale: true });
      const result = await undoBoardAction({
        restaurantSlug: SLUG,
        organizationId: O,
        serviceSessionId: 1,
      });
      expect(result).toEqual({
        ok: false,
        error: STALE_CONTEXT_MESSAGE,
        contextStale: true,
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
    });
    it("rejects unauthenticated caller", async () => {
      mocks.getAllocationActor.mockResolvedValueOnce(null);
      const res = await executeBoardActionRemote({
        restaurantSlug: SLUG,
        organizationId: O,
        locationId: A,
        timeZone: "America/Chicago",
        serviceSessionId: 1,
        action: {
          type: "assign",
          roundId: "1",
          columnId: "col-1",
          tableLabel: "T1",
        },
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.sessionInvalid).toBe(true);
      }
    });

    it("rejects invalid workspace expectation structure", async () => {
      const res = await executeBoardActionRemote({
        restaurantSlug: SLUG,
        organizationId: O,
        locationId: A,
        timeZone: "America/Chicago",
        serviceSessionId: 1,
        expectedContext: { malformed: true },
        action: {
          type: "assign",
          roundId: "1",
          columnId: "col-1",
          tableLabel: "T1",
        },
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("That request is invalid.");
      }
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("rejects stale workspace expectation (mismatched location)", async () => {
      // Verified is A, but expectation claims B
      const res = await executeBoardActionRemote({
        restaurantSlug: SLUG,
        organizationId: O,
        locationId: B,
        timeZone: "America/Chicago",
        serviceSessionId: 1,
        expectedContext: validCtx(B),
        action: {
          type: "assign",
          roundId: "1",
          columnId: "col-1",
          tableLabel: "T1",
        },
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.contextStale).toBe(true);
        expect(res.error).toBe(STALE_CONTEXT_MESSAGE);
      }
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("rejects foreign session: when serviceSessionId belongs to a different location in same org", async () => {
      // Mock session belongs to location B, but caller is operating at location A
      mocks.from.mockImplementation((table: string) => {
        if (table === "service_sessions") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { organization_id: O, location_id: B },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      });

      const res = await executeBoardActionRemote({
        restaurantSlug: SLUG,
        organizationId: O,
        locationId: A,
        timeZone: "America/Chicago",
        serviceSessionId: 999,
        expectedContext: validCtx(A),
        action: {
          type: "assign",
          roundId: "1",
          columnId: "col-1",
          tableLabel: "T1",
        },
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe(
          "That service session belongs to a different location.",
        );
      }
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("succeeds and binds verified location for add-column", async () => {
      mocks.rpc.mockResolvedValueOnce({ data: 55, error: null });
      // For add-column confirmation
      mocks.from.mockImplementation((table: string) => {
        if (table === "rotation_members") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { service_session_id: 12 },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      });

      const res = await executeBoardActionRemote({
        restaurantSlug: SLUG,
        organizationId: O,
        locationId: A,
        timeZone: "America/Chicago",
        serviceSessionId: null,
        expectedContext: validCtx(A),
        action: {
          type: "add-column",
          column: {
            id: P,
            name: "Server One",
            status: "active",
            position: 1,
          },
        },
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.serviceSessionId).toBe(12);
      }
      expect(mocks.rpc).toHaveBeenCalledWith("board_add_column", {
        p_organization_id: O,
        p_location_id: A,
        p_service_date: expect.any(String),
        p_server_profile_id: P,
      });
    });
  });

  describe("undoBoardAction", () => {
    it("rejects foreign session for undo", async () => {
      mocks.from.mockImplementation((table: string) => {
        if (table === "service_sessions") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { organization_id: O, location_id: B },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      });

      const res = await undoBoardAction({
        restaurantSlug: SLUG,
        organizationId: O,
        serviceSessionId: 42,
        expectedContext: validCtx(A),
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe(
          "That service session belongs to a different location.",
        );
      }
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("succeeds when session matches verified location", async () => {
      const res = await undoBoardAction({
        restaurantSlug: SLUG,
        organizationId: O,
        serviceSessionId: 42,
        expectedContext: validCtx(A),
      });

      expect(res.ok).toBe(true);
      expect(mocks.rpc).toHaveBeenCalledWith("board_undo", {
        p_organization_id: O,
        p_service_session_id: 42,
      });
    });
  });

  describe("redoBoardAction", () => {
    it("rejects foreign session for redo", async () => {
      mocks.from.mockImplementation((table: string) => {
        if (table === "service_sessions") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { organization_id: O, location_id: B },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      });

      const res = await redoBoardAction({
        restaurantSlug: SLUG,
        organizationId: O,
        serviceSessionId: 42,
        expectedContext: validCtx(A),
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe(
          "That service session belongs to a different location.",
        );
      }
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("succeeds when session matches verified location", async () => {
      const res = await redoBoardAction({
        restaurantSlug: SLUG,
        organizationId: O,
        serviceSessionId: 42,
        expectedContext: validCtx(A),
      });

      expect(res.ok).toBe(true);
      expect(mocks.rpc).toHaveBeenCalledWith("board_redo", {
        p_organization_id: O,
        p_service_session_id: 42,
      });
    });
  });

  describe("getAllocationContextForDateAction", () => {
    it("rejects future dates", async () => {
      const res = await getAllocationContextForDateAction({
        restaurantSlug: SLUG,
        serviceDate: "2099-01-01",
        expectedContext: validCtx(A),
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("You can't browse to a date in the future.");
      }
      expect(mocks.getAllocationContext).not.toHaveBeenCalled();
    });

    it("rejects stale workspace context", async () => {
      const res = await getAllocationContextForDateAction({
        restaurantSlug: SLUG,
        serviceDate: "2026-10-01",
        expectedContext: validCtx(B),
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.contextStale).toBe(true);
        expect(res.error).toBe(STALE_CONTEXT_MESSAGE);
      }
      expect(mocks.getAllocationContext).not.toHaveBeenCalled();
    });

    it("calls getAllocationContext with verified scope on match", async () => {
      mocks.getAllocationContext.mockResolvedValueOnce({
        locationId: A,
        board: { columns: [], rows: [] },
      });

      const res = await getAllocationContextForDateAction({
        restaurantSlug: SLUG,
        serviceDate: "2026-10-01",
        expectedContext: validCtx(A),
      });

      expect(res.ok).toBe(true);
      expect(mocks.getAllocationContext).toHaveBeenCalledWith(O, "2026-10-01", {
        organizationId: O,
        locationId: A,
        timeZone: "America/Chicago",
      });
    });
  });
  it("omitting expectation cannot select a client-supplied location", async () => {
    const result = await executeBoardActionRemote({
      restaurantSlug: SLUG,
      organizationId: O,
      locationId: B,
      timeZone: "Pacific/Auckland",
      serviceSessionId: 1,
      action: { type: "clear-board" },
    });
    expect(result.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("legacy undo fails closed when canonical location is ambiguous", async () => {
    mocks.getPrimaryLocation.mockResolvedValueOnce(null);
    expect(
      (
        await undoBoardAction({
          restaurantSlug: SLUG,
          organizationId: O,
          serviceSessionId: 1,
        })
      ).ok,
    ).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("historical read refuses an invalid live session before loading", async () => {
    mocks.requireLiveSession.mockResolvedValueOnce({
      ok: false,
      error: "Session expired",
      sessionInvalid: true,
    });
    expect(
      (
        await getAllocationContextForDateAction({
          restaurantSlug: SLUG,
          serviceDate: "2026-10-01",
          expectedContext: validCtx(),
        })
      ).ok,
    ).toBe(false);
    expect(mocks.getAllocationContext).not.toHaveBeenCalled();
  });
});
