import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// V2-004.004: the module guard is covered by its own tests; action tests isolate it.
vi.mock("@/features/modules/data/module-enforcement", () => ({
  guardModule: vi.fn(async () => null),
  guardModuleForSlug: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  fetchClockedInRoster: vi.fn(),
  getTipsActor: vi.fn(),
  loadTipsRange: vi.fn(),
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
vi.mock("@/features/tips/data/tips-data", () => ({
  loadTipsRange: mocks.loadTipsRange,
}));
vi.mock("@/features/tips/data/fetch-clocked-in-roster", () => ({
  fetchClockedInRoster: mocks.fetchClockedInRoster,
}));

import {
  getClockedInRosterAction,
  getTipsRangeAction,
  recalculateTipsAction,
  reopenTipsAction,
  saveTipIntervalAction,
  voidTipIntervalAction,
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
          { profile_id: "profile-a", active: true, eligible: true },
          { profile_id: "profile-b", active: true, eligible: true },
          { profile_id: "profile-d", active: true, eligible: true },
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

    it("never suggests a historical-only (ineligible) person even if they are clocked in", async () => {
      mocks.getTipsActor.mockResolvedValue(managerCaller);
      mocks.fetchClockedInRoster.mockResolvedValue({
        ok: true,
        data: ["profile-a", "profile-hist"],
      });
      mocks.rpc.mockResolvedValue({
        data: [
          { profile_id: "profile-a", active: true, eligible: true },
          { profile_id: "profile-hist", active: true, eligible: false },
        ],
        error: null,
      });

      await expect(
        getClockedInRosterAction({ restaurantSlug: "the-monks" }),
      ).resolves.toEqual({ ok: true, data: { profileIds: ["profile-a"] } });
    });

    it.each([
      ["PGRST202", "available yet"],
      ["42883", "available yet"],
      ["42501", "don't have access"],
      ["XX000", "couldn't be loaded"],
    ])(
      "fails closed (no unfiltered attendance roster) when the location roster RPC errors with %s",
      async (code, messagePart) => {
        mocks.getTipsActor.mockResolvedValue(managerCaller);
        mocks.fetchClockedInRoster.mockResolvedValue({
          ok: true,
          data: ["profile-a", "profile-c"],
        });
        mocks.rpc.mockResolvedValue({
          data: null,
          error: { code, message: "boom" },
        });

        const result = await getClockedInRosterAction({
          restaurantSlug: "the-monks",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain(messagePart);
      },
    );

    it("fails closed when the roster RPC returns a non-array", async () => {
      mocks.getTipsActor.mockResolvedValue(managerCaller);
      mocks.fetchClockedInRoster.mockResolvedValue({
        ok: true,
        data: ["profile-a"],
      });
      mocks.rpc.mockResolvedValue({ data: null, error: null });

      const result = await getClockedInRosterAction({
        restaurantSlug: "the-monks",
      });
      expect(result.ok).toBe(false);
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

  describe("saveTipIntervalAction", () => {
    const p1 = "00000000-0000-4000-8000-0000000a0001";
    const p2 = "00000000-0000-4000-8000-0000000a0002";
    const valid = {
      restaurantSlug: "the-monks",
      serviceDate: "2026-11-18",
      start: "11:00",
      end: "13:00",
      cashCents: 1001,
      cardCents: 500,
      participantIds: [p1, p2],
    };

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-18T18:00:00Z"));
      mocks.rpc.mockResolvedValue({
        data: { interval_id: 7, tip_pool_id: 3, revision: 1 },
        error: null,
      });
    });
    afterEach(() => vi.useRealTimers());

    it("refuses a non-manager before any database call", async () => {
      mocks.getTipsActor.mockResolvedValue(serverCaller);
      await expect(saveTipIntervalAction(valid)).resolves.toEqual({
        ok: false,
        error: "Only an owner, manager or assistant manager can do that.",
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it.each([
      ["a non-uuid participant", { participantIds: ["not-a-uuid"] }],
      ["a negative amount", { cashCents: -1 }],
      ["a fractional amount", { cardCents: 1.5 }],
      ["an absurd amount", { cashCents: 10_000_001 }],
      ["a bad time", { start: "9:00" }],
      ["no participants", { participantIds: [] }],
      ["a malformed date", { serviceDate: "11/18/2026" }],
    ])(
      "rejects %s without touching the actor or database",
      async (_name, patch) => {
        await expect(
          saveTipIntervalAction({ ...valid, ...patch }),
        ).resolves.toEqual({
          ok: false,
          error: "That request is invalid.",
        });
        expect(mocks.getTipsActor).not.toHaveBeenCalled();
        expect(mocks.rpc).not.toHaveBeenCalled();
      },
    );

    it("an update needs the revision it was read at and a reason", async () => {
      const noReason = await saveTipIntervalAction({
        ...valid,
        intervalId: "7",
        expectedRevision: 1,
      });
      expect(noReason.ok).toBe(false);
      expect(!noReason.ok && noReason.error).toContain("reason");
      const noRevision = await saveTipIntervalAction({
        ...valid,
        intervalId: "7",
        reason: "Counted again",
      });
      expect(noRevision).toEqual({
        ok: false,
        error: "That request is invalid.",
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("rejects a zero total", async () => {
      const result = await saveTipIntervalAction({
        ...valid,
        cashCents: 0,
        cardCents: 0,
      });
      expect(result.ok).toBe(false);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("creates: tenancy and zone come from the verified caller, instants from the location zone", async () => {
      const result = await saveTipIntervalAction(valid);
      expect(result).toEqual({
        ok: true,
        data: { intervalId: 7, tipPoolId: 3, revision: 1 },
      });
      expect(mocks.rpc).toHaveBeenCalledWith("tips_save_interval", {
        p_organization_id: organizationId,
        p_location_id: locationId,
        p_service_date: "2026-11-18",
        p_starts_at: "2026-11-18T17:00:00.000Z",
        p_ends_at: "2026-11-18T19:00:00.000Z",
        p_cash_cents: 1001,
        p_card_cents: 500,
        p_participant_ids: [p1, p2],
        p_interval_id: undefined,
        p_expected_revision: undefined,
        p_reason: undefined,
      });
    });

    it("a cross-midnight interval ends on the next calendar day", async () => {
      await saveTipIntervalAction({ ...valid, start: "23:00", end: "01:00" });
      expect(mocks.rpc).toHaveBeenCalledWith(
        "tips_save_interval",
        expect.objectContaining({
          p_starts_at: "2026-11-19T05:00:00.000Z",
          p_ends_at: "2026-11-19T07:00:00.000Z",
        }),
      );
    });

    it("updates: passes the interval, revision and reason through", async () => {
      await saveTipIntervalAction({
        ...valid,
        intervalId: "7",
        expectedRevision: 2,
        reason: "  Counted again  ",
      });
      expect(mocks.rpc).toHaveBeenCalledWith(
        "tips_save_interval",
        expect.objectContaining({
          p_interval_id: 7,
          p_expected_revision: 2,
          p_reason: "Counted again",
        }),
      );
    });

    it("refuses a stale workspace (another branch in the same tab) before any write", async () => {
      const result = await saveTipIntervalAction({
        ...valid,
        locationId: "00000000-0000-4000-8000-00000000dead",
      });
      expect(result).toMatchObject({ ok: false, contextStale: true });
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("refuses service dates outside the window", async () => {
      const old = await saveTipIntervalAction({
        ...valid,
        serviceDate: "2024-01-01",
      });
      const future = await saveTipIntervalAction({
        ...valid,
        serviceDate: "2026-12-25",
      });
      expect(old.ok).toBe(false);
      expect(future.ok).toBe(false);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("reports a concurrent edit as a conflict", async () => {
      mocks.rpc.mockResolvedValue({
        data: null,
        error: {
          code: "P0409",
          message:
            "This interval was changed by someone else. Reload and try again.",
        },
      });
      const result = await saveTipIntervalAction({
        ...valid,
        intervalId: "7",
        expectedRevision: 1,
        reason: "x y z",
      });
      expect(result).toMatchObject({ ok: false, conflict: true });
    });

    it("passes authored database errors through and hides unexpected ones", async () => {
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { code: "22023", message: "Tip intervals cannot overlap." },
      });
      await expect(saveTipIntervalAction(valid)).resolves.toEqual({
        ok: false,
        error: "Tip intervals cannot overlap.",
      });
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { code: "XX000", message: 'relation "secret_table" exploded' },
      });
      const hidden = await saveTipIntervalAction(valid);
      expect(!hidden.ok && hidden.error).not.toContain("secret_table");
    });
  });

  describe("voidTipIntervalAction", () => {
    const input = {
      restaurantSlug: "the-monks",
      intervalId: "7",
      expectedRevision: 2,
      reason: "Entered on the wrong day",
    };

    it("refuses a non-manager and a short reason", async () => {
      mocks.getTipsActor.mockResolvedValue(serverCaller);
      const denied = await voidTipIntervalAction(input);
      expect(denied.ok).toBe(false);
      mocks.getTipsActor.mockResolvedValue(managerCaller);
      const short = await voidTipIntervalAction({ ...input, reason: "x" });
      expect(!short.ok && short.error).toContain("reason");
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("voids with the revision and reason", async () => {
      await expect(voidTipIntervalAction(input)).resolves.toEqual({
        ok: true,
        data: null,
      });
      expect(mocks.rpc).toHaveBeenCalledWith("tips_void_interval", {
        p_organization_id: organizationId,
        p_location_id: locationId,
        p_interval_id: 7,
        p_expected_revision: 2,
        p_reason: "Entered on the wrong day",
      });
    });

    it("surfaces a concurrent change as a conflict", async () => {
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { code: "P0409", message: "changed" },
      });
      await expect(voidTipIntervalAction(input)).resolves.toMatchObject({
        conflict: true,
      });
    });
  });

  describe("recalculateTipsAction", () => {
    it("is manager-only and reports whether anything changed", async () => {
      mocks.getTipsActor.mockResolvedValue(serverCaller);
      const denied = await recalculateTipsAction({
        restaurantSlug: "the-monks",
        tipPoolId: 3,
      });
      expect(denied.ok).toBe(false);
      mocks.getTipsActor.mockResolvedValue(managerCaller);
      mocks.rpc.mockResolvedValue({ data: { changed: true }, error: null });
      await expect(
        recalculateTipsAction({ restaurantSlug: "the-monks", tipPoolId: 3 }),
      ).resolves.toEqual({ ok: true, data: { changed: true } });
      expect(mocks.rpc).toHaveBeenCalledWith("tips_recalculate_pool", {
        p_organization_id: organizationId,
        p_location_id: locationId,
        p_tip_pool_id: 3,
      });
    });
  });

  describe("getTipsRangeAction", () => {
    const base = {
      restaurantSlug: "the-monks",
      from: "2026-11-01",
      to: "2026-11-30",
    };
    const loaded = {
      ok: true,
      range: { days: [] },
      team: [],
      selectableIds: [],
    };

    it("lets staff read (the database narrows to their own data) and binds to the verified location", async () => {
      mocks.getTipsActor.mockResolvedValue(serverCaller);
      mocks.loadTipsRange.mockResolvedValue(loaded);
      const result = await getTipsRangeAction(base);
      expect(result.ok).toBe(true);
      expect(mocks.loadTipsRange).toHaveBeenCalledWith(expect.anything(), {
        organizationId,
        locationId,
        from: "2026-11-01",
        to: "2026-11-30",
        includeRevisions: false,
      });
    });

    it("passes the audit-trail request through for the database to honour", async () => {
      mocks.loadTipsRange.mockResolvedValue(loaded);
      await getTipsRangeAction({ ...base, includeRevisions: true });
      expect(mocks.loadTipsRange).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ includeRevisions: true }),
      );
    });

    it("rejects inverted and malformed ranges", async () => {
      const inverted = await getTipsRangeAction({
        ...base,
        from: "2026-12-01",
        to: "2026-11-01",
      });
      expect(inverted.ok).toBe(false);
      await expect(
        getTipsRangeAction({ ...base, from: "yesterday" }),
      ).resolves.toEqual({ ok: false, error: "That request is invalid." });
      expect(mocks.loadTipsRange).not.toHaveBeenCalled();
    });

    it("fails closed with the standard message when the read is unavailable", async () => {
      mocks.loadTipsRange.mockResolvedValue({
        ok: false,
        reason: "access_denied",
      });
      const result = await getTipsRangeAction(base);
      expect(!result.ok && result.error).toContain("don't have access");
    });

    it("refuses a caller with no verified Tips actor", async () => {
      mocks.getTipsActor.mockResolvedValue(null);
      const result = await getTipsRangeAction(base);
      expect(result.ok).toBe(false);
      expect(mocks.loadTipsRange).not.toHaveBeenCalled();
    });
  });

  describe("reopenTipsAction (audited correction of a legacy locked day)", () => {
    it("refuses a short reason", async () => {
      const result = await reopenTipsAction({
        restaurantSlug: "the-monks",
        tipPoolId: 3,
        reason: "x",
      });
      expect(result).toEqual({
        ok: false,
        error: "Enter a short reason (at least 3 characters).",
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("refuses a non-manager", async () => {
      mocks.getTipsActor.mockResolvedValue(serverCaller);
      const result = await reopenTipsAction({
        restaurantSlug: "the-monks",
        tipPoolId: 3,
        reason: "Fix split",
      });
      expect(result.ok).toBe(false);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("calls tips_reopen_pool with the verified org/location", async () => {
      await expect(
        reopenTipsAction({
          restaurantSlug: "the-monks",
          tipPoolId: 3,
          reason: "Fix split",
        }),
      ).resolves.toEqual({ ok: true, data: null });
      expect(mocks.rpc).toHaveBeenCalledWith("tips_reopen_pool", {
        p_organization_id: organizationId,
        p_location_id: locationId,
        p_tip_pool_id: 3,
        p_reason: "Fix split",
      });
    });
  });
});
