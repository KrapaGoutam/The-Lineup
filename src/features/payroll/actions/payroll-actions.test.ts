import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentUser: vi.fn(),
  getOwnAttendanceLink: vi.fn(),
  listPayrollPeriods: vi.fn(),
  getPayrollBalance: vi.fn(),
  getActiveNeonUsers: vi.fn(),
  getAttendanceRows: vi.fn(),
  getPayrollPeriod: vi.fn(),
  generatePayrollPeriod: vi.fn(),
  getPayrollRateOverrideCents: vi.fn(),
  getPayrollDefaultRateCents: vi.fn(),
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
  generatePayrollPeriod: mocks.generatePayrollPeriod,
  getPayrollRateOverrideCents: mocks.getPayrollRateOverrideCents,
  getPayrollDefaultRateCents: mocks.getPayrollDefaultRateCents,
}));

import {
  generatePayrollForEmployeesAction,
  getPayrollDashboardAction,
  getPayrollGenerationEligibilityAction,
} from "./payroll-actions";

const organizationId = "00000000-0000-0000-0000-000000026101";
const manager = {
  profileId: "00000000-0000-0000-0000-000000026102",
  name: "Manager",
  role: "manager" as const,
  designation: "manager" as const,
  organizationId,
};

function period(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    organizationId,
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
        { neonUserId: 101, fullName: "Anil Rao", alreadyGenerated: true },
        { neonUserId: 102, fullName: "Priya Nair", alreadyGenerated: false },
      ],
    });
  });

  it("refuses a non-manager caller", async () => {
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
