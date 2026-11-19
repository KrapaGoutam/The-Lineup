import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireLiveSession: vi.fn(),
  resolveContext: vi.fn(),
  assertWorkspace: vi.fn(),
  checkModules: vi.fn(),
  rpc: vi.fn(),
  readAttendanceCard: vi.fn(),
  readPayrollCard: vi.fn(),
  readTipsCard: vi.fn(),
  readLowStockCard: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("@/features/context/data/active-context", () => ({
  resolveCurrentActiveContext: mocks.resolveContext,
}));
vi.mock("@/features/context/data/workspace-expectation", () => ({
  assertWorkspaceExpectation: mocks.assertWorkspace,
}));
vi.mock("@/features/modules/data/module-enforcement", () => ({
  checkModulesAccess: mocks.checkModules,
}));
vi.mock("../data/dashboard-readers", () => ({
  readAttendanceCard: mocks.readAttendanceCard,
  readPayrollCard: mocks.readPayrollCard,
  readTipsCard: mocks.readTipsCard,
  readLowStockCard: mocks.readLowStockCard,
}));

import { getDashboardAction } from "./dashboard-actions";

const organizationId = "00000000-0000-0000-0000-000000090001";
const locationId = "00000000-0000-0000-0000-000000090002";
const profileId = "00000000-0000-0000-0000-000000090003";

function context(
  capabilities: string[],
  effectiveLevel: string,
): { status: "resolved"; context: unknown } {
  return {
    status: "resolved",
    context: {
      organizationId,
      organizationName: "The Monk's",
      locationId,
      locationName: "River Oaks",
      timeZone: "America/Chicago",
      profileId,
      access: { allowed: true, capabilities, effectiveLevel },
    },
  };
}

const MANAGER = context(
  ["location:access", "location:operate", "location:manage"],
  "manager",
);
const STAFF = context(["location:access", "location:operate"], "staff");

const ok = <T>(data: T) => ({ status: "ok" as const, data });
/** The verdicts `checkModulesAccess` would return with exactly these modules usable. */
const enabled = (...keys: string[]) =>
  Object.fromEntries(
    [
      "attendance",
      "payroll",
      "tips",
      "bar_inventory",
      "tasks",
      "table_allocation",
    ].map((key) => [
      key,
      keys.includes(key)
        ? { allowed: true }
        : { allowed: false, code: "module_disabled" },
    ]),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.requireLiveSession.mockResolvedValue(null);
  mocks.resolveContext.mockResolvedValue(MANAGER);
  mocks.assertWorkspace.mockResolvedValue({
    ok: true,
    location: { id: locationId, time_zone: "America/Chicago" },
  });
  mocks.checkModules.mockImplementation(async () =>
    enabled(
      "attendance",
      "payroll",
      "tips",
      "bar_inventory",
      "tasks",
      "table_allocation",
    ),
  );
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.readAttendanceCard.mockResolvedValue(
    ok({ clockedIn: 3, onBreak: 1, sourceLabel: "x" }),
  );
  mocks.readPayrollCard.mockResolvedValue(
    ok({
      draftPeriods: 2,
      periodMonth: "2026-11-01",
      outstandingBalanceCents: 5000,
      periodsCounted: 4,
    }),
  );
  mocks.readTipsCard.mockResolvedValue(
    ok({
      view: "manager",
      serviceDate: "x",
      totalCents: 1,
      cashCents: 1,
      cardCents: 0,
      notSplitCents: 0,
      intervalCount: 1,
      lastUpdatedAt: null,
    }),
  );
  mocks.readLowStockCard.mockResolvedValue(
    ok({ needsOrdering: 4, critical: 1, low: 3 }),
  );
});

describe("getDashboardAction", () => {
  it("rejects a malformed slug before touching anything", async () => {
    await expect(
      getDashboardAction({ restaurantSlug: "Bad Slug!" }),
    ).resolves.toEqual({
      ok: false,
      error: "That request is invalid.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("a dead session returns sessionInvalid and reads nothing", async () => {
    mocks.requireLiveSession.mockResolvedValue({
      ok: false,
      error: "gone",
      sessionInvalid: true,
    });
    const result = await getDashboardAction({ restaurantSlug: "the-monks" });
    expect(result).toMatchObject({ ok: false, sessionInvalid: true });
    expect(mocks.resolveContext).not.toHaveBeenCalled();
    expect(mocks.readAttendanceCard).not.toHaveBeenCalled();
  });

  it("an unresolved or denied context returns an error and reads nothing", async () => {
    mocks.resolveContext.mockResolvedValue({ status: "no_access" });
    const result = await getDashboardAction({ restaurantSlug: "the-monks" });
    expect(result.ok).toBe(false);
    for (const reader of [
      mocks.readAttendanceCard,
      mocks.readPayrollCard,
      mocks.readTipsCard,
      mocks.readLowStockCard,
    ]) {
      expect(reader).not.toHaveBeenCalled();
    }
  });

  it("a stale tab is refused as contextStale", async () => {
    mocks.assertWorkspace.mockResolvedValue({ ok: false, code: "stale" });
    const result = await getDashboardAction({ restaurantSlug: "the-monks" });
    expect(result).toMatchObject({ ok: false, contextStale: true });
    expect(mocks.readPayrollCard).not.toHaveBeenCalled();
  });

  it("a manager gets all four cards, read only for the verified organization and branch", async () => {
    const result = await getDashboardAction({
      restaurantSlug: "the-monks",
      // A claimed (and wrong) location in the untrusted expectation is only compared.
      expectedContext: { locationId: "ignored" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data.cards).sort()).toEqual([
      "attendance",
      "lowStock",
      "payroll",
      "tips",
    ]);
    expect(result.data.isManagement).toBe(true);
    expect(result.data.locationName).toBe("River Oaks");
    expect(mocks.readPayrollCard).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId, locationId }),
    );
    expect(mocks.readTipsCard).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ organizationId, locationId, profileId }),
    );
    expect(result.data.quickActions.map((a) => a.id)).toContain("payroll");
  });

  it("staff receive only a Tips card: financial and inventory readers never run", async () => {
    mocks.resolveContext.mockResolvedValue(STAFF);
    mocks.readTipsCard.mockResolvedValue(
      ok({
        view: "staff",
        serviceDate: "x",
        totalCents: 700,
        cashCents: 700,
        cardCents: 0,
        notSplitCents: 0,
      }),
    );
    const result = await getDashboardAction({ restaurantSlug: "the-monks" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data.cards)).toEqual(["tips"]);
    expect(result.data.isManagement).toBe(false);
    expect(mocks.readPayrollCard).not.toHaveBeenCalled();
    expect(mocks.readLowStockCard).not.toHaveBeenCalled();
    expect(mocks.readAttendanceCard).not.toHaveBeenCalled();
    const ids = result.data.quickActions.map((a) => a.id);
    expect(ids).not.toContain("payroll");
    expect(ids).not.toContain("inventory");
    expect(ids).not.toContain("reporting");
    // No management RPC authority is even asked for.
    const asked = mocks.rpc.mock.calls.map((call) => call[0]);
    expect(asked).toEqual(["tips_location_authorized"]);
  });

  it("a card whose module is off for a manager is module_off, never read, never linked", async () => {
    mocks.checkModules.mockResolvedValue(
      enabled("attendance", "payroll", "tasks"),
    );
    const result = await getDashboardAction({ restaurantSlug: "the-monks" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.cards.tips).toEqual({ status: "module_off" });
    expect(result.data.cards.lowStock).toEqual({ status: "module_off" });
    expect(mocks.readTipsCard).not.toHaveBeenCalled();
    expect(mocks.readLowStockCard).not.toHaveBeenCalled();
    const ids = result.data.quickActions.map((a) => a.id);
    expect(ids).not.toContain("tips");
    expect(ids).not.toContain("inventory");
  });

  it("a staff member with a module off gets no card at all for it", async () => {
    mocks.resolveContext.mockResolvedValue(STAFF);
    mocks.checkModules.mockResolvedValue(enabled("attendance"));
    const result = await getDashboardAction({ restaurantSlug: "the-monks" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.cards).toEqual({});
  });

  it("a module's own authority denying the viewer removes the card (no payroll for an unauthorized manager)", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "payroll_location_authorized" ? false : true,
      error: null,
    }));
    const result = await getDashboardAction({ restaurantSlug: "the-monks" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.cards.payroll).toBeUndefined();
    expect(mocks.readPayrollCard).not.toHaveBeenCalled();
    expect(result.data.quickActions.map((a) => a.id)).not.toContain("payroll");
  });

  it("one failing source is an unavailable card; the others still load", async () => {
    mocks.readLowStockCard.mockResolvedValue({
      status: "unavailable",
      reason: "Couldn't load inventory right now.",
    });
    const result = await getDashboardAction({ restaurantSlug: "the-monks" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.cards.lowStock?.status).toBe("unavailable");
    expect(result.data.cards.payroll?.status).toBe("ok");
  });

  it("an unexpected throw becomes a generic error, never a partial or zero payload", async () => {
    mocks.checkModules.mockRejectedValue(new Error("boom"));
    const result = await getDashboardAction({ restaurantSlug: "the-monks" });
    expect(result).toEqual({
      ok: false,
      error: "The dashboard couldn't be loaded. Try again shortly.",
    });
  });

  it("modules are decided for the VERIFIED branch only, in one batched call", async () => {
    await getDashboardAction({
      restaurantSlug: "the-monks",
      expectedContext: { locationId: "00000000-0000-0000-0000-00000000dead" },
    });
    expect(mocks.checkModules).toHaveBeenCalledTimes(1);
    expect(mocks.checkModules).toHaveBeenCalledWith(
      expect.arrayContaining([
        "attendance",
        "payroll",
        "tips",
        "bar_inventory",
      ]),
      { organizationId, location: { id: locationId } },
    );
  });

  it("when no module is usable (e.g. a configuration that cannot be read) nothing is read or linked", async () => {
    mocks.checkModules.mockResolvedValue(enabled());
    const result = await getDashboardAction({ restaurantSlug: "the-monks" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.quickActions).toEqual([]);
    for (const card of Object.values(result.data.cards)) {
      expect(card).toEqual({ status: "module_off" });
    }
    for (const reader of [
      mocks.readAttendanceCard,
      mocks.readPayrollCard,
      mocks.readTipsCard,
      mocks.readLowStockCard,
    ]) {
      expect(reader).not.toHaveBeenCalled();
    }
  });
});
