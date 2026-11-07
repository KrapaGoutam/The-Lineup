import { beforeEach, describe, expect, it, vi } from "vitest";

// V2-004.004: the module guard is covered by its own tests; action tests isolate it.
vi.mock("@/features/modules/data/module-enforcement", () => ({
  guardModule: vi.fn(async () => null),
  guardModuleForSlug: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  fetchClockedInRoster: vi.fn(),
  getTipsActor: vi.fn(),
  requireLiveSession: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/tips/data/tips-actor", () => ({
  getTipsActor: mocks.getTipsActor,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("@/features/tips/data/fetch-clocked-in-roster", () => ({
  fetchClockedInRoster: mocks.fetchClockedInRoster,
}));

import {
  addTipIntervalAction,
  finalizeTipsAction,
  getClockedInRosterAction,
  reopenTipsAction,
} from "./tips-actions";

const organizationId = "00000000-0000-0000-0000-000000029101";
const locationId = "00000000-0000-0000-0000-000000029102";
const managerId = "00000000-0000-0000-0000-000000029103";
const serverId = "00000000-0000-0000-0000-000000029104";

const managerCaller = {
  organizationId,
  scope: {
    organizationId,
    locationId,
    timeZone: "America/Chicago",
  },
  viewer: {
    profileId: managerId,
    name: "Manager",
    designation: "manager" as const,
  },
};

const serverCaller = {
  organizationId,
  scope: {
    organizationId,
    locationId,
    timeZone: "America/Chicago",
  },
  viewer: {
    profileId: serverId,
    name: "Server",
    designation: "staff" as const,
  },
};

describe("tips-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null });
    mocks.createClient.mockResolvedValue({
      rpc: mocks.rpc,
    });
    mocks.requireLiveSession.mockResolvedValue(null);
    mocks.getTipsActor.mockResolvedValue(managerCaller);
  });

  describe("getClockedInRosterAction", () => {
    it("refuses a request with a malformed restaurant slug before touching anything else", async () => {
      await expect(
        getClockedInRosterAction({ restaurantSlug: "Not A Slug!" }),
      ).resolves.toEqual({ ok: false, error: "That request is invalid." });
      expect(mocks.getTipsActor).not.toHaveBeenCalled();
    });

    it("refuses a server -- only a manager or owner can pull the roster", async () => {
      mocks.getTipsActor.mockResolvedValue(serverCaller);

      await expect(
        getClockedInRosterAction({ restaurantSlug: "the-monks" }),
      ).resolves.toEqual({
        ok: false,
        error: "Only a manager or owner can pull the clocked-in team.",
      });
      expect(mocks.fetchClockedInRoster).not.toHaveBeenCalled();
    });

    it("re-derives the organization and service date server-side for a manager, filtering to verified location workforce", async () => {
      mocks.getTipsActor.mockResolvedValue(managerCaller);
      mocks.fetchClockedInRoster.mockResolvedValue({
        ok: true,
        data: ["profile-a", "profile-b", "profile-c"],
      });
      // Mock location roster: profile-a and profile-b are in this location, profile-c is at another location
      mocks.rpc.mockResolvedValue({
        data: [
          { profile_id: "profile-a", active: true },
          { profile_id: "profile-b", active: true },
          { profile_id: "profile-d", active: true },
        ],
        error: null,
      });

      await expect(
        getClockedInRosterAction({ restaurantSlug: "the-monks" }),
      ).resolves.toEqual({
        ok: true,
        data: { profileIds: ["profile-a", "profile-b"] },
      });
      expect(mocks.fetchClockedInRoster).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ organizationId }),
      );
      expect(mocks.rpc).toHaveBeenCalledWith("tips_location_roster", {
        p_organization_id: organizationId,
        p_location_id: locationId,
      });
    });

    it("propagates a failure from the roster lookup itself", async () => {
      mocks.getTipsActor.mockResolvedValue(managerCaller);
      mocks.fetchClockedInRoster.mockResolvedValue({
        ok: false,
        error: "Attendance data unavailable. Try again shortly.",
      });

      await expect(
        getClockedInRosterAction({ restaurantSlug: "the-monks" }),
      ).resolves.toEqual({
        ok: false,
        error: "Attendance data unavailable. Try again shortly.",
      });
    });

    it("refuses a stale workspace expectation", async () => {
      mocks.getTipsActor.mockResolvedValue(managerCaller);
      const staleExpectation = {
        profileId: managerId,
        organizationId,
        locationId: "00000000-0000-0000-0000-000000029999",
      };

      const result = await getClockedInRosterAction({
        restaurantSlug: "the-monks",
        expectedContext: staleExpectation,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.contextStale).toBe(true);
      }
    });
  });

  describe("addTipIntervalAction", () => {
    it("refuses a non-manager", async () => {
      mocks.getTipsActor.mockResolvedValue(serverCaller);
      const result = await addTipIntervalAction({
        restaurantSlug: "the-monks",
        start: "11:00",
        end: "14:00",
        amountCents: 10000,
        participantIds: ["p1"],
      });
      expect(result).toEqual({
        ok: false,
        error: "Only an owner, manager or assistant manager can do that.",
      });
    });

    it("refuses invalid amount or empty participants", async () => {
      mocks.getTipsActor.mockResolvedValue(managerCaller);
      const negAmount = await addTipIntervalAction({
        restaurantSlug: "the-monks",
        start: "11:00",
        end: "14:00",
        amountCents: -50,
        participantIds: ["p1"],
      });
      expect(negAmount).toEqual({
        ok: false,
        error: "Tip amount must be a non-negative number of cents.",
      });

      const emptyPart = await addTipIntervalAction({
        restaurantSlug: "the-monks",
        start: "11:00",
        end: "14:00",
        amountCents: 5000,
        participantIds: [],
      });
      expect(emptyPart).toEqual({
        ok: false,
        error: "Choose at least one participant.",
      });
    });

    it("successfully delegates to atomic tips_add_interval RPC", async () => {
      mocks.getTipsActor.mockResolvedValue(managerCaller);
      mocks.rpc.mockResolvedValue({
        data: { interval_id: 101, tip_pool_id: 501 },
        error: null,
      });

      const result = await addTipIntervalAction({
        restaurantSlug: "the-monks",
        start: "11:00",
        end: "14:00",
        amountCents: 25000,
        participantIds: ["p1", "p2"],
      });

      expect(result).toEqual({
        ok: true,
        data: {
          interval: {
            id: "101",
            start: "11:00",
            end: "14:00",
            amountCents: 25000,
            participantIds: ["p1", "p2"],
          },
          tipPoolId: 501,
        },
      });
      expect(mocks.rpc).toHaveBeenCalledWith(
        "tips_add_interval",
        expect.objectContaining({
          p_organization_id: organizationId,
          p_location_id: locationId,
          p_amount_cents: 25000,
          p_participant_ids: ["p1", "p2"],
        }),
      );
    });
  });

  describe("finalizeTipsAction", () => {
    it("refuses a non-manager", async () => {
      mocks.getTipsActor.mockResolvedValue(serverCaller);
      const result = await finalizeTipsAction({
        restaurantSlug: "the-monks",
        tipPoolId: 501,
      });
      expect(result).toEqual({
        ok: false,
        error: "Only an owner, manager or assistant manager can do that.",
      });
    });

    it("successfully calls tips_finalize_pool RPC", async () => {
      mocks.getTipsActor.mockResolvedValue(managerCaller);
      mocks.rpc.mockResolvedValue({ data: null, error: null });

      const result = await finalizeTipsAction({
        restaurantSlug: "the-monks",
        tipPoolId: 501,
      });
      expect(result).toEqual({ ok: true, data: null });
      expect(mocks.rpc).toHaveBeenCalledWith("tips_finalize_pool", {
        p_organization_id: organizationId,
        p_location_id: locationId,
        p_tip_pool_id: 501,
      });
    });
  });

  describe("reopenTipsAction", () => {
    it("refuses a short reason", async () => {
      mocks.getTipsActor.mockResolvedValue(managerCaller);
      const result = await reopenTipsAction({
        restaurantSlug: "the-monks",
        tipPoolId: 501,
        reason: "no",
      });
      expect(result).toEqual({
        ok: false,
        error: "Enter a short reason (at least 3 characters).",
      });
    });

    it("successfully calls tips_reopen_pool RPC", async () => {
      mocks.getTipsActor.mockResolvedValue(managerCaller);
      mocks.rpc.mockResolvedValue({ data: null, error: null });

      const result = await reopenTipsAction({
        restaurantSlug: "the-monks",
        tipPoolId: 501,
        reason: "Late shift adjustment",
      });
      expect(result).toEqual({ ok: true, data: null });
      expect(mocks.rpc).toHaveBeenCalledWith("tips_reopen_pool", {
        p_organization_id: organizationId,
        p_location_id: locationId,
        p_tip_pool_id: 501,
        p_reason: "Late shift adjustment",
      });
    });
  });
});
