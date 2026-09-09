import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentUser: vi.fn(),
  getOwnAttendanceLink: vi.fn(),
  listPayrollPeriods: vi.fn(),
  getPayrollBalance: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/features/attendance/data/identity-links", () => ({
  getOwnAttendanceLink: mocks.getOwnAttendanceLink,
}));
vi.mock("@/features/attendance/data/attendance-data", () => ({
  getActiveNeonUsers: vi.fn(),
  getAttendanceRows: vi.fn(),
}));
vi.mock("@/features/payroll/data/payroll-data", () => ({
  listPayrollPeriods: mocks.listPayrollPeriods,
  getPayrollBalance: mocks.getPayrollBalance,
}));

import { getPayrollDashboardAction } from "./payroll-actions";

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
