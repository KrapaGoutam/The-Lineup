import { beforeEach, describe, expect, it, vi } from "vitest";

// V2-004.004: the module guard is covered by its own tests; action tests isolate it.
vi.mock("@/features/modules/data/module-enforcement", () => ({
  guardModule: vi.fn(async () => null),
  guardModuleForSlug: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentUser: vi.fn(),
  getPayrollActor: vi.fn(),
  resolveEmployeeLocationProvenance: vi.fn(),
  getOwnAttendanceLink: vi.fn(),
  listPayrollPeriods: vi.fn(),
  getPayrollBalance: vi.fn(),
  getActiveNeonUsers: vi.fn(),
  getAttendanceRows: vi.fn(),
  getPayrollPeriod: vi.fn(),
  getPayrollPeriodById: vi.fn(),
  generatePayrollPeriod: vi.fn(),
  regeneratePayrollPeriod: vi.fn(),
  lockPayrollPeriod: vi.fn(),
  unlockPayrollPeriod: vi.fn(),
  getPayrollRateOverrideCents: vi.fn(),
  getPayrollDefaultRateCents: vi.fn(),
  setPayrollDefaultRateCents: vi.fn(),
  setPayrollRateOverrideCents: vi.fn(),
  removePayrollRateOverride: vi.fn(),
  getPaymentById: vi.fn(),
  recordPayment: vi.fn(),
  editDraftPayment: vi.fn(),
  deleteDraftPayment: vi.fn(),
  confirmPayment: vi.fn(),
  recordAdjustment: vi.fn(),
  requireLiveSession: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("@/features/payroll/data/payroll-actor", () => ({
  getPayrollActor: mocks.getPayrollActor,
}));
vi.mock("@/features/payroll/data/payroll-provenance", () => ({
  resolveEmployeeLocationProvenance: mocks.resolveEmployeeLocationProvenance,
}));
vi.mock("@/features/attendance/data/identity-links", () => ({
  getOwnAttendanceLink: mocks.getOwnAttendanceLink,
}));
vi.mock("@/features/attendance/data/attendance-data", () => ({
  getActiveNeonUsers: mocks.getActiveNeonUsers,
  getAttendanceRows: mocks.getAttendanceRows,
}));
vi.mock("@/features/payroll/data/payroll-data", () => ({
  listPayrollPeriods: mocks.listPayrollPeriods,
  getPayrollBalance: mocks.getPayrollBalance,
  getPayrollPeriod: mocks.getPayrollPeriod,
  getPayrollPeriodById: mocks.getPayrollPeriodById,
  generatePayrollPeriod: mocks.generatePayrollPeriod,
  regeneratePayrollPeriod: mocks.regeneratePayrollPeriod,
  lockPayrollPeriod: mocks.lockPayrollPeriod,
  unlockPayrollPeriod: mocks.unlockPayrollPeriod,
  getPayrollRateOverrideCents: mocks.getPayrollRateOverrideCents,
  getPayrollDefaultRateCents: mocks.getPayrollDefaultRateCents,
  setPayrollDefaultRateCents: mocks.setPayrollDefaultRateCents,
  setPayrollRateOverrideCents: mocks.setPayrollRateOverrideCents,
  removePayrollRateOverride: mocks.removePayrollRateOverride,
  getPaymentById: mocks.getPaymentById,
  recordPayment: mocks.recordPayment,
  editDraftPayment: mocks.editDraftPayment,
  deleteDraftPayment: mocks.deleteDraftPayment,
  confirmPayment: mocks.confirmPayment,
  recordAdjustment: mocks.recordAdjustment,
}));

import {
  generatePayrollForEmployeesAction,
  generatePayrollPeriodAction,
  getPayrollDashboardAction,
  getPayrollGenerationEligibilityAction,
  lockPayrollPeriodAction,
  recordAdjustmentAction,
  recordPaymentAction,
  regeneratePayrollPeriodAction,
  removePayrollRateOverrideAction,
  setPayrollDefaultRateAction,
  setPayrollRateOverrideAction,
  unconfirmPaymentAction,
  unlockPayrollPeriodAction,
} from "./payroll-actions";
import { STALE_CONTEXT_MESSAGE } from "@/features/context/domain/workspace-expectation";

const organizationId = "00000000-0000-0000-0000-000000026101";
const locationIdA = "00000000-0000-0000-0000-000000026110";
const locationIdB = "00000000-0000-0000-0000-000000026120";

const manager = {
  profileId: "00000000-0000-0000-0000-000000026102",
  name: "Manager",
  role: "manager" as const,
  designation: "manager" as const,
  organizationId,
};

const managerActor = {
  organizationId,
  scope: { organizationId, locationId: null },
  viewer: {
    profileId: manager.profileId,
    name: manager.name,
    designation: manager.designation,
  },
  isOrgManager: true,
  isLocationManager: false,
  canManage: true,
};

const branchManagerActor = {
  organizationId,
  scope: { organizationId, locationId: locationIdA },
  viewer: {
    profileId: "00000000-0000-0000-0000-000000026103",
    name: "Branch Lead",
    designation: "manager",
  },
  isOrgManager: false,
  isLocationManager: true,
  canManage: true,
};

function period(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    organizationId,
    locationId: null,
    neonUserId: 13,
    periodMonth: "2026-09-01",
    hoursSnapshot: 100,
    rateCentsSnapshot: 1000,
    grossCents: 100000,
    status: "locked" as const,
    generatedAt: "2026-09-01T00:00:00.000Z",
    generatedBy: manager.profileId,
    regeneratedAt: null,
    regeneratedBy: null,
    lockedAt: "2026-09-02T00:00:00.000Z",
    lockedBy: manager.profileId,
    ...overrides,
  };
}

describe("getPayrollDashboardAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.getCurrentUser.mockResolvedValue(manager);
    mocks.getPayrollActor.mockResolvedValue(managerActor);
  });

  it("computes owedThisMonthCents/owedLastMonthCents as OUTSTANDING balance, distinct from gross generated", async () => {
    mocks.listPayrollPeriods.mockResolvedValue({
      ok: true,
      data: [
        period({ id: 1, periodMonth: "2026-09-01", grossCents: 100000 }),
        period({ id: 2, periodMonth: "2026-08-01", grossCents: 50000 }),
      ],
    });
    // September period fully paid (balance 0); August still owed 20000.
    mocks.getPayrollBalance.mockImplementation(
      async (_supabase: unknown, { period: p }: { period: { id: number } }) =>
        p.id === 1
          ? { ok: true, data: { balanceCents: 0 } }
          : { ok: true, data: { balanceCents: 20000 } },
    );

    const result = await getPayrollDashboardAction({
      restaurantSlug: "the-monks",
      todayLocalDate: "2026-09-15",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.owedThisMonthCents).toBe(0); // September fully paid
    expect(result.data.owedLastMonthCents).toBe(20000); // August still owed
    // Distinct from the pre-existing gross-generated tile.
    expect(result.data.previousMonthGeneratedCents).toBe(50000);
  });

  it("computes oldestOpenPeriod as the earliest period with a positive balance", async () => {
    mocks.listPayrollPeriods.mockResolvedValue({
      ok: true,
      data: [
        period({ id: 1, neonUserId: 13, periodMonth: "2026-09-01" }),
        period({ id: 2, neonUserId: 14, periodMonth: "2026-07-01" }),
      ],
    });
    mocks.getPayrollBalance.mockResolvedValue({
      ok: true,
      data: { balanceCents: 5000 },
    });

    const result = await getPayrollDashboardAction({
      restaurantSlug: "the-monks",
      todayLocalDate: "2026-09-15",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.oldestOpenPeriod).toEqual({
      periodMonth: "2026-07-01",
      neonUserId: 14,
      balanceCents: 5000,
    });
  });

  it("returns oldestOpenPeriod null once everything is settled", async () => {
    mocks.listPayrollPeriods.mockResolvedValue({
      ok: true,
      data: [period({ id: 1 })],
    });
    mocks.getPayrollBalance.mockResolvedValue({
      ok: true,
      data: { balanceCents: 0 },
    });

    const result = await getPayrollDashboardAction({
      restaurantSlug: "the-monks",
      todayLocalDate: "2026-09-15",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.oldestOpenPeriod).toBeNull();
  });

  it("returns the full periods array, each carrying its own balanceCents, for the grouped view to reuse", async () => {
    mocks.listPayrollPeriods.mockResolvedValue({
      ok: true,
      data: [period({ id: 1, neonUserId: 13 })],
    });
    mocks.getPayrollBalance.mockResolvedValue({
      ok: true,
      data: { balanceCents: 7500 },
    });

    const result = await getPayrollDashboardAction({
      restaurantSlug: "the-monks",
      todayLocalDate: "2026-09-15",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.periods).toEqual([
      expect.objectContaining({ id: 1, neonUserId: 13, balanceCents: 7500 }),
    ]);
  });

  it("returns the empty-dashboard shape (including the new fields) for an unlinked viewer", async () => {
    mocks.getPayrollActor.mockResolvedValue({
      ...managerActor,
      canManage: false,
      isOrgManager: false,
      isLocationManager: false,
    });
    mocks.getCurrentUser.mockResolvedValue({
      ...manager,
      role: "server",
    });
    mocks.getOwnAttendanceLink.mockResolvedValue({ ok: true, data: null });

    const result = await getPayrollDashboardAction({
      restaurantSlug: "the-monks",
      todayLocalDate: "2026-09-15",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        totalBalanceOwedCents: 0,
        previousMonthGeneratedCents: 0,
        owedThisMonthCents: 0,
        owedLastMonthCents: 0,
        oldestOpenPeriod: null,
        perPerson: [],
        periods: [],
      },
    });
  });
});

describe("generatePayrollForEmployeesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.getCurrentUser.mockResolvedValue(manager);
    mocks.getPayrollActor.mockResolvedValue(managerActor);
    mocks.resolveEmployeeLocationProvenance.mockResolvedValue({
      status: "single_location",
      locationId: locationIdA,
    });
    mocks.requireLiveSession.mockResolvedValue(null);
    mocks.getPayrollRateOverrideCents.mockResolvedValue({
      ok: true,
      data: null,
    });
    mocks.getPayrollDefaultRateCents.mockResolvedValue({
      ok: true,
      data: 1500,
    });
    mocks.getAttendanceRows.mockResolvedValue({ ok: true, data: [] });
    mocks.generatePayrollPeriod.mockImplementation(
      async (_supabase: unknown, input: { neonUserId: number }) => ({
        ok: true,
        data: period({ neonUserId: input.neonUserId }),
      }),
    );
  });

  it("reports a mixed batch clearly: generated, skipped (already exists), and failed -- never silently", async () => {
    mocks.getPayrollPeriod.mockImplementation(
      async (_supabase: unknown, input: { neonUserId: number }) => {
        if (input.neonUserId === 101) {
          return { ok: true, data: period({ neonUserId: 101 }) }; // already exists
        }
        return { ok: true, data: null };
      },
    );
    mocks.getPayrollDefaultRateCents.mockImplementation(
      async (_supabase: unknown, input: { organizationId: string }) => {
        void input;
        return { ok: true, data: 1500 };
      },
    );
    // 103's rate lookup fails outright -- a genuine failure, distinct
    // from 101's "already exists" skip.
    mocks.getPayrollRateOverrideCents.mockImplementation(
      async (_supabase: unknown, input: { neonUserId: number }) =>
        input.neonUserId === 103
          ? {
              ok: false,
              error: "Attendance data unavailable. Try again shortly.",
            }
          : { ok: true, data: null },
    );

    const result = await generatePayrollForEmployeesAction({
      restaurantSlug: "the-monks",
      neonUserIds: [101, 102, 103],
      periodMonth: "2026-09-01",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.skipped).toEqual([
      { neonUserId: 101, reason: "Already generated for this month." },
    ]);
    expect(result.data.successful).toEqual([
      { neonUserId: 102, period: expect.objectContaining({ neonUserId: 102 }) },
    ]);
    expect(result.data.failed).toEqual([
      {
        neonUserId: 103,
        error: "Attendance data unavailable. Try again shortly.",
      },
    ]);
    // Only the one genuinely-new employee actually hit the insert path.
    expect(mocks.generatePayrollPeriod).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates repeated ids -- a 'Select All' double-submit never generates the same person twice", async () => {
    mocks.getPayrollPeriod.mockResolvedValue({ ok: true, data: null });

    const result = await generatePayrollForEmployeesAction({
      restaurantSlug: "the-monks",
      neonUserIds: [101, 101, 101],
      periodMonth: "2026-09-01",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.successful).toHaveLength(1);
    expect(mocks.generatePayrollPeriod).toHaveBeenCalledTimes(1);
  });

  it("refuses a non-manager caller entirely, before touching any employee", async () => {
    mocks.getPayrollActor.mockResolvedValue({
      ...managerActor,
      canManage: false,
    });
    mocks.getCurrentUser.mockResolvedValue({ ...manager, role: "server" });
    mocks.getOwnAttendanceLink.mockResolvedValue({ ok: true, data: null });

    const result = await generatePayrollForEmployeesAction({
      restaurantSlug: "the-monks",
      neonUserIds: [101, 102],
      periodMonth: "2026-09-01",
    });

    expect(result).toEqual({
      ok: false,
      error: "You don't have access to payroll.",
    });
    expect(mocks.getPayrollPeriod).not.toHaveBeenCalled();
  });

  it("rejects an empty employee list as an invalid request rather than a no-op success", async () => {
    const result = await generatePayrollForEmployeesAction({
      restaurantSlug: "the-monks",
      neonUserIds: [],
      periodMonth: "2026-09-01",
    });
    expect(result.ok).toBe(false);
  });
});

describe("getPayrollGenerationEligibilityAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.getCurrentUser.mockResolvedValue(manager);
    mocks.getPayrollActor.mockResolvedValue(managerActor);
    mocks.resolveEmployeeLocationProvenance.mockResolvedValue({
      status: "single_location",
      locationId: locationIdA,
    });
  });

  it("flags each active employee as already-generated or ready for the chosen month", async () => {
    mocks.getActiveNeonUsers.mockResolvedValue({
      ok: true,
      data: [
        { id: 101, fullName: "Anil Rao", role: "Host" },
        { id: 102, fullName: "Priya Nair", role: "Server" },
      ],
    });
    mocks.getPayrollPeriod.mockImplementation(
      async (_supabase: unknown, input: { neonUserId: number }) => ({
        ok: true,
        data: input.neonUserId === 101 ? period({ neonUserId: 101 }) : null,
      }),
    );

    const result = await getPayrollGenerationEligibilityAction({
      restaurantSlug: "the-monks",
      periodMonth: "2026-09-01",
    });

    expect(result).toEqual({
      ok: true,
      data: [
        {
          neonUserId: 101,
          fullName: "Anil Rao",
          alreadyGenerated: true,
          multiLocation: false,
        },
        {
          neonUserId: 102,
          fullName: "Priya Nair",
          alreadyGenerated: false,
          multiLocation: false,
        },
      ],
    });
  });

  it("refuses a non-manager caller", async () => {
    mocks.getPayrollActor.mockResolvedValue({
      ...managerActor,
      canManage: false,
    });
    mocks.getCurrentUser.mockResolvedValue({ ...manager, role: "server" });
    mocks.getOwnAttendanceLink.mockResolvedValue({ ok: true, data: null });

    const result = await getPayrollGenerationEligibilityAction({
      restaurantSlug: "the-monks",
      periodMonth: "2026-09-01",
    });

    expect(result).toEqual({
      ok: false,
      error: "You don't have access to payroll.",
    });
  });
});

describe("unlockPayrollPeriodAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.getCurrentUser.mockResolvedValue(manager);
    mocks.getPayrollActor.mockResolvedValue(managerActor);
    mocks.requireLiveSession.mockResolvedValue(null);
    mocks.unlockPayrollPeriod.mockResolvedValue({ ok: true, data: null });
  });

  it("unlocks a locked period with a reason, passing the period's own previous lock metadata through for rollback", async () => {
    mocks.getPayrollPeriodById.mockResolvedValue({
      ok: true,
      data: period({
        id: 5,
        status: "locked",
        lockedAt: "2026-09-02T00:00:00.000Z",
        lockedBy: "manager-1",
      }),
    });

    const result = await unlockPayrollPeriodAction({
      restaurantSlug: "the-monks",
      periodId: 5,
      reason: "Wrong hours snapshot, needs regeneration.",
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(mocks.unlockPayrollPeriod).toHaveBeenCalledWith(
      {},
      {
        periodId: 5,
        organizationId,
        actorProfileId: manager.profileId,
        reason: "Wrong hours snapshot, needs regeneration.",
        previousLockedAt: "2026-09-02T00:00:00.000Z",
        previousLockedBy: "manager-1",
        locationId: null,
      },
    );
  });

  it("refuses to unlock a period that isn't locked", async () => {
    mocks.getPayrollPeriodById.mockResolvedValue({
      ok: true,
      data: period({ id: 5, status: "draft" }),
    });

    const result = await unlockPayrollPeriodAction({
      restaurantSlug: "the-monks",
      periodId: 5,
      reason: "Some reason",
    });

    expect(result).toEqual({
      ok: false,
      error: "This payroll period isn't locked.",
    });
    expect(mocks.unlockPayrollPeriod).not.toHaveBeenCalled();
  });

  it("rejects a too-short reason as an invalid request", async () => {
    mocks.getPayrollPeriodById.mockResolvedValue({
      ok: true,
      data: period({ id: 5, status: "locked" }),
    });

    const result = await unlockPayrollPeriodAction({
      restaurantSlug: "the-monks",
      periodId: 5,
      reason: "no",
    });

    expect(result.ok).toBe(false);
    expect(mocks.unlockPayrollPeriod).not.toHaveBeenCalled();
  });

  it("refuses a non-manager caller entirely, before fetching the period", async () => {
    mocks.getPayrollActor.mockResolvedValue({
      ...managerActor,
      canManage: false,
    });
    mocks.getCurrentUser.mockResolvedValue({ ...manager, role: "server" });
    mocks.getOwnAttendanceLink.mockResolvedValue({ ok: true, data: null });

    const result = await unlockPayrollPeriodAction({
      restaurantSlug: "the-monks",
      periodId: 5,
      reason: "Some reason",
    });

    expect(result).toEqual({
      ok: false,
      error: "You don't have access to payroll.",
    });
    expect(mocks.getPayrollPeriodById).not.toHaveBeenCalled();
  });

  it("refuses a period belonging to a different organization", async () => {
    mocks.getPayrollPeriodById.mockResolvedValue({
      ok: true,
      data: period({
        id: 5,
        status: "locked",
        organizationId: "00000000-0000-0000-0000-000000099999",
      }),
    });

    const result = await unlockPayrollPeriodAction({
      restaurantSlug: "the-monks",
      periodId: 5,
      reason: "Some reason",
    });

    expect(result).toEqual({
      ok: false,
      error: "That payroll period could not be found.",
    });
    expect(mocks.unlockPayrollPeriod).not.toHaveBeenCalled();
  });
});

describe("unconfirmPaymentAction", () => {
  const rpcMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockReset();
    mocks.createClient.mockResolvedValue({ rpc: rpcMock });
    mocks.getCurrentUser.mockResolvedValue(manager);
    mocks.getPayrollActor.mockResolvedValue(managerActor);
    mocks.getPaymentById.mockResolvedValue({
      ok: true,
      data: { id: 7, organizationId, payrollPeriodId: 1 },
    });
    mocks.getPayrollPeriodById.mockResolvedValue({
      ok: true,
      data: period({ id: 1, locationId: null }),
    });
    mocks.requireLiveSession.mockResolvedValue(null);
  });

  it("calls the unconfirm_payroll_payment RPC with the exact payment id and reason", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    const result = await unconfirmPaymentAction({
      restaurantSlug: "the-monks",
      paymentId: 7,
      reason: "Amount was recorded wrong.",
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(rpcMock).toHaveBeenCalledWith("unconfirm_payroll_payment", {
      p_payment_id: 7,
      p_reason: "Amount was recorded wrong.",
    });
  });

  it("surfaces the RPC's own error message -- e.g. the trigger's refusal -- rather than a generic one", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "This payment is not confirmed." },
    });

    const result = await unconfirmPaymentAction({
      restaurantSlug: "the-monks",
      paymentId: 7,
      reason: "Some reason",
    });

    expect(result).toEqual({
      ok: false,
      error: "This payment is not confirmed.",
    });
  });

  it("rejects a too-short reason before ever calling the RPC", async () => {
    const result = await unconfirmPaymentAction({
      restaurantSlug: "the-monks",
      paymentId: 7,
      reason: "no",
    });

    expect(result.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("refuses a non-manager caller before ever calling the RPC", async () => {
    mocks.getPayrollActor.mockResolvedValue({
      ...managerActor,
      canManage: false,
    });
    mocks.getCurrentUser.mockResolvedValue({ ...manager, role: "server" });
    mocks.getOwnAttendanceLink.mockResolvedValue({ ok: true, data: null });

    const result = await unconfirmPaymentAction({
      restaurantSlug: "the-monks",
      paymentId: 7,
      reason: "Some reason",
    });

    expect(result).toEqual({
      ok: false,
      error: "You don't have access to payroll.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("rate configuration role enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.requireLiveSession.mockResolvedValue(null);
  });

  it("rejects non-org managers when setting default rate", async () => {
    mocks.getPayrollActor.mockResolvedValue(branchManagerActor);

    const result = await setPayrollDefaultRateAction({
      restaurantSlug: "the-monks",
      rateCents: 1500,
    });

    expect(result).toEqual({
      ok: false,
      error: "Only organization managers can configure compensation rates.",
    });
    expect(mocks.setPayrollDefaultRateCents).not.toHaveBeenCalled();
  });

  it("allows organization managers to set default rate", async () => {
    mocks.getPayrollActor.mockResolvedValue(managerActor);
    mocks.setPayrollDefaultRateCents.mockResolvedValue({
      ok: true,
      data: null,
    });

    const result = await setPayrollDefaultRateAction({
      restaurantSlug: "the-monks",
      rateCents: 1600,
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(mocks.setPayrollDefaultRateCents).toHaveBeenCalledWith(
      {},
      { organizationId, rateCents: 1600, actorProfileId: manager.profileId },
    );
  });

  it("rejects non-org managers when setting rate override", async () => {
    mocks.getPayrollActor.mockResolvedValue(branchManagerActor);

    const result = await setPayrollRateOverrideAction({
      restaurantSlug: "the-monks",
      neonUserId: 13,
      rateCents: 2000,
    });

    expect(result).toEqual({
      ok: false,
      error: "Only organization managers can configure compensation rates.",
    });
    expect(mocks.setPayrollRateOverrideCents).not.toHaveBeenCalled();
  });

  it("allows organization managers to set rate override", async () => {
    mocks.getPayrollActor.mockResolvedValue(managerActor);
    mocks.setPayrollRateOverrideCents.mockResolvedValue({
      ok: true,
      data: null,
    });

    const result = await setPayrollRateOverrideAction({
      restaurantSlug: "the-monks",
      neonUserId: 13,
      rateCents: 2000,
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(mocks.setPayrollRateOverrideCents).toHaveBeenCalledWith(
      {},
      {
        organizationId,
        neonUserId: 13,
        rateCents: 2000,
        actorProfileId: manager.profileId,
      },
    );
  });

  it("rejects non-org managers when removing rate override", async () => {
    mocks.getPayrollActor.mockResolvedValue(branchManagerActor);

    const result = await removePayrollRateOverrideAction({
      restaurantSlug: "the-monks",
      neonUserId: 13,
    });

    expect(result).toEqual({
      ok: false,
      error: "Only organization managers can configure compensation rates.",
    });
    expect(mocks.removePayrollRateOverride).not.toHaveBeenCalled();
  });

  it("allows organization managers to remove rate override", async () => {
    mocks.getPayrollActor.mockResolvedValue(managerActor);
    mocks.removePayrollRateOverride.mockResolvedValue({ ok: true, data: null });

    const result = await removePayrollRateOverrideAction({
      restaurantSlug: "the-monks",
      neonUserId: 13,
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(mocks.removePayrollRateOverride).toHaveBeenCalledWith(
      {},
      { organizationId, neonUserId: 13 },
    );
  });
});

describe("location scoping and multi-location safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.requireLiveSession.mockResolvedValue(null);
    mocks.getPayrollPeriod.mockResolvedValue({ ok: true, data: null });
    mocks.getPayrollRateOverrideCents.mockResolvedValue({
      ok: true,
      data: null,
    });
    mocks.getPayrollDefaultRateCents.mockResolvedValue({
      ok: true,
      data: 1500,
    });
    mocks.getAttendanceRows.mockResolvedValue({ ok: true, data: [] });
    mocks.generatePayrollPeriod.mockImplementation(
      async (
        _supabase: unknown,
        input: { neonUserId: number; locationId?: string | null },
      ) => ({
        ok: true,
        data: period({
          neonUserId: input.neonUserId,
          locationId: input.locationId ?? null,
        }),
      }),
    );
  });

  it("generatePayrollPeriodAction rejects branch manager without physical attendance provenance", async () => {
    mocks.getPayrollActor.mockResolvedValue(branchManagerActor);

    const result = await generatePayrollPeriodAction({
      restaurantSlug: "the-monks",
      neonUserId: 13,
      periodMonth: "2026-09-01",
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Payroll generation requires organization manager authority because attendance records do not have verified physical location provenance.",
    });
    expect(mocks.generatePayrollPeriod).not.toHaveBeenCalled();
  });

  it("generatePayrollForEmployeesAction rejects branch manager without physical attendance provenance", async () => {
    mocks.getPayrollActor.mockResolvedValue(branchManagerActor);

    const result = await generatePayrollForEmployeesAction({
      restaurantSlug: "the-monks",
      neonUserIds: [101, 102, 103],
      periodMonth: "2026-09-01",
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Payroll generation requires organization manager authority because attendance records do not have verified physical location provenance.",
    });
    expect(mocks.generatePayrollPeriod).not.toHaveBeenCalled();
  });

  it("generatePayrollPeriodAction allows org manager to generate period defaulting to null location", async () => {
    mocks.getPayrollActor.mockResolvedValue(managerActor);

    const result = await generatePayrollPeriodAction({
      restaurantSlug: "the-monks",
      neonUserId: 13,
      periodMonth: "2026-09-01",
    });

    expect(result.ok).toBe(true);
    expect(mocks.generatePayrollPeriod).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        locationId: null,
        neonUserId: 13,
      }),
    );
  });

  it("generatePayrollForEmployeesAction allows org manager to generate periods defaulting to null location", async () => {
    mocks.getPayrollActor.mockResolvedValue(managerActor);

    const result = await generatePayrollForEmployeesAction({
      restaurantSlug: "the-monks",
      neonUserIds: [101, 102],
      periodMonth: "2026-09-01",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.successful).toHaveLength(2);
    expect(mocks.generatePayrollPeriod).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        locationId: null,
      }),
    );
  });

  it("regeneratePayrollPeriodAction refuses a branch manager for any period (no attendance location provenance)", async () => {
    mocks.getPayrollActor.mockResolvedValue(branchManagerActor);
    for (const locationId of [
      locationIdB,
      branchManagerActor.scope.locationId,
    ]) {
      mocks.getPayrollPeriodById.mockResolvedValue({
        ok: true,
        data: period({ id: 2, locationId }),
      });

      const result = await regeneratePayrollPeriodAction({
        restaurantSlug: "the-monks",
        periodId: 2,
      });

      expect(result).toEqual({
        ok: false,
        error:
          "Payroll regeneration requires organization manager authority because attendance records do not have verified physical location provenance.",
      });
    }
    expect(mocks.regeneratePayrollPeriod).not.toHaveBeenCalled();
  });

  it("lockPayrollPeriodAction refuses foreign location period for branch manager", async () => {
    mocks.getPayrollActor.mockResolvedValue(branchManagerActor);
    mocks.getPayrollPeriodById.mockResolvedValue({
      ok: true,
      data: period({ id: 2, locationId: locationIdB, status: "draft" }),
    });

    const result = await lockPayrollPeriodAction({
      restaurantSlug: "the-monks",
      periodId: 2,
    });

    expect(result).toEqual({
      ok: false,
      error: "You do not have permission to manage payroll for this location.",
    });
    expect(mocks.lockPayrollPeriod).not.toHaveBeenCalled();
  });

  it("unlockPayrollPeriodAction refuses foreign location period for branch manager", async () => {
    mocks.getPayrollActor.mockResolvedValue(branchManagerActor);
    mocks.getPayrollPeriodById.mockResolvedValue({
      ok: true,
      data: period({ id: 2, locationId: locationIdB, status: "locked" }),
    });

    const result = await unlockPayrollPeriodAction({
      restaurantSlug: "the-monks",
      periodId: 2,
      reason: "Needs adjustment for errors",
    });

    expect(result).toEqual({
      ok: false,
      error: "You do not have permission to manage payroll for this location.",
    });
    expect(mocks.unlockPayrollPeriod).not.toHaveBeenCalled();
  });

  it("recordPaymentAction refuses foreign location period for branch manager", async () => {
    mocks.getPayrollActor.mockResolvedValue(branchManagerActor);
    mocks.getPayrollPeriodById.mockResolvedValue({
      ok: true,
      data: period({ id: 2, locationId: locationIdB }),
    });

    const result = await recordPaymentAction({
      restaurantSlug: "the-monks",
      periodId: 2,
      amountCents: 5000,
      paymentDate: "2026-09-15",
    });

    expect(result).toEqual({
      ok: false,
      error: "You do not have permission to manage payroll for this location.",
    });
    expect(mocks.recordPayment).not.toHaveBeenCalled();
  });

  it("unconfirmPaymentAction refuses payment on foreign location period for branch manager", async () => {
    mocks.getPayrollActor.mockResolvedValue(branchManagerActor);
    mocks.getPaymentById.mockResolvedValue({
      ok: true,
      data: { id: 8, organizationId, payrollPeriodId: 2 },
    });
    mocks.getPayrollPeriodById.mockResolvedValue({
      ok: true,
      data: period({ id: 2, locationId: locationIdB }),
    });

    const result = await unconfirmPaymentAction({
      restaurantSlug: "the-monks",
      paymentId: 8,
      reason: "Correction required",
    });

    expect(result).toEqual({
      ok: false,
      error: "You do not have permission to manage payroll for this location.",
    });
  });

  it("recordAdjustmentAction refuses foreign location period for branch manager", async () => {
    mocks.getPayrollActor.mockResolvedValue(branchManagerActor);
    mocks.getPayrollPeriodById.mockResolvedValue({
      ok: true,
      data: period({ id: 2, locationId: locationIdB }),
    });

    const result = await recordAdjustmentAction({
      restaurantSlug: "the-monks",
      periodId: 2,
      deltaCents: -500,
      reason: "Manual correction for overpayment",
    });

    expect(result).toEqual({
      ok: false,
      error: "You do not have permission to manage payroll for this location.",
    });
    expect(mocks.recordAdjustment).not.toHaveBeenCalled();
  });

  it("recordPaymentAction refuses null-location org-wide period for branch manager", async () => {
    mocks.getPayrollActor.mockResolvedValue(branchManagerActor);
    mocks.getPayrollPeriodById.mockResolvedValue({
      ok: true,
      data: period({ id: 2, locationId: null }),
    });

    const result = await recordPaymentAction({
      restaurantSlug: "the-monks",
      periodId: 2,
      amountCents: 5000,
      paymentDate: "2026-09-15",
    });

    expect(result).toEqual({
      ok: false,
      error: "You do not have permission to manage payroll for this location.",
    });
    expect(mocks.recordPayment).not.toHaveBeenCalled();
  });
});

describe("workspace expectation verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.requireLiveSession.mockResolvedValue(null);
  });

  it("rejects actions when expectedContext location mismatches active location", async () => {
    mocks.getPayrollActor.mockResolvedValue(branchManagerActor);

    const result = await lockPayrollPeriodAction({
      restaurantSlug: "the-monks",
      periodId: 1,
      expectedContext: {
        profileId: branchManagerActor.viewer.profileId,
        organizationId,
        locationId: locationIdB, // Mismatched!
      },
    });

    expect(result).toEqual({
      ok: false,
      error: STALE_CONTEXT_MESSAGE,
      contextStale: true,
    });
  });
});
