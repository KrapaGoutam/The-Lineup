import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentUser: vi.fn(),
  getOwnAttendanceLink: vi.fn(),
  getActiveNeonUsers: vi.fn(),
  getAttendanceRows: vi.fn(),
  getOrganizationName: vi.fn(),
  getPayrollPeriod: vi.fn(),
  listPaymentsForPeriod: vi.fn(),
  listAdjustmentsForPeriod: vi.fn(),
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
  getActiveNeonUsers: mocks.getActiveNeonUsers,
  getAttendanceRows: mocks.getAttendanceRows,
}));
vi.mock("@/features/payroll/data/payroll-data", () => ({
  getOrganizationName: mocks.getOrganizationName,
  getPayrollPeriod: mocks.getPayrollPeriod,
  listPaymentsForPeriod: mocks.listPaymentsForPeriod,
  listAdjustmentsForPeriod: mocks.listAdjustmentsForPeriod,
  getPayrollBalance: mocks.getPayrollBalance,
}));

import { getCombinedMonthlyStatementAction } from "./statement-actions";

const organizationId = "00000000-0000-0000-0000-000000030001";
const managerUser = {
  profileId: "00000000-0000-0000-0000-000000030002",
  name: "Manager Alice",
  role: "manager" as const,
  designation: "manager" as const,
  organizationId,
};

const staffUser = {
  profileId: "00000000-0000-0000-0000-000000030003",
  name: "Server Bob",
  role: "server" as const,
  designation: "server" as const,
  organizationId,
};

describe("getCombinedMonthlyStatementAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.getOrganizationName.mockResolvedValue({
      ok: true,
      data: "The Monk's Cellar",
    });
    mocks.getActiveNeonUsers.mockResolvedValue({
      ok: true,
      data: [
        { id: 101, fullName: "Server Bob", role: "Server" },
        { id: 102, fullName: "Host Charlie", role: "Host" },
      ],
    });
    mocks.getAttendanceRows.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 1,
          userId: 101,
          date: "2026-09-02",
          clockIn: "2026-09-02T16:00:00Z",
          clockOut: "2026-09-02T22:00:00Z",
          hoursWorked: 6.0,
          autoClockedOut: false,
        },
        {
          id: 2,
          userId: 101,
          date: "2026-09-03",
          clockIn: "2026-09-03T16:00:00Z",
          clockOut: "2026-09-03T22:00:00Z",
          hoursWorked: 6.0,
          autoClockedOut: false,
        },
      ],
    });
    mocks.getPayrollPeriod.mockResolvedValue({
      ok: true,
      data: {
        id: 55,
        organizationId,
        neonUserId: 101,
        periodMonth: "2026-09-01",
        hoursSnapshot: 12.0,
        rateCentsSnapshot: 1500,
        grossCents: 18000,
        status: "locked",
        generatedAt: "2026-09-01T00:00:00Z",
        generatedBy: managerUser.profileId,
        regeneratedAt: null,
        regeneratedBy: null,
        lockedAt: "2026-09-05T00:00:00Z",
        lockedBy: managerUser.profileId,
      },
    });
    mocks.listPaymentsForPeriod.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 1,
          periodId: 55,
          amountCents: 10000,
          paymentDate: "2026-09-10",
          method: "direct_deposit",
          status: "confirmed",
          comment: "First installment",
          createdAt: "2026-09-10T12:00:00Z",
          createdBy: managerUser.profileId,
          confirmedAt: "2026-09-10T12:00:00Z",
          confirmedBy: managerUser.profileId,
        },
      ],
    });
    mocks.listAdjustmentsForPeriod.mockResolvedValue({
      ok: true,
      data: [],
    });
    mocks.getPayrollBalance.mockResolvedValue({
      ok: true,
      data: {
        grossCents: 18000,
        confirmedPaymentsCents: 10000,
        adjustmentsCents: 0,
        balanceCents: 8000,
        fullyPaid: false,
      },
    });
  });

  it("fails if caller is not authenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const result = await getCombinedMonthlyStatementAction({
      restaurantSlug: "the-monks",
      year: 2026,
      month: 9,
      neonUserId: 101,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("signed in");
    }
  });

  it("rejects staff user attempting to view another employee's statement", async () => {
    mocks.getCurrentUser.mockResolvedValue(staffUser);
    mocks.getOwnAttendanceLink.mockResolvedValue({
      ok: true,
      data: { neonUserId: 101 },
    });

    const result = await getCombinedMonthlyStatementAction({
      restaurantSlug: "the-monks",
      year: 2026,
      month: 9,
      neonUserId: 102, // Attempting to view Charlie's statement
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("only authorized to view your own");
    }
  });

  it("allows staff user viewing their own statement", async () => {
    mocks.getCurrentUser.mockResolvedValue(staffUser);
    mocks.getOwnAttendanceLink.mockResolvedValue({
      ok: true,
      data: { neonUserId: 101 },
    });

    const result = await getCombinedMonthlyStatementAction({
      restaurantSlug: "the-monks",
      year: 2026,
      month: 9,
      neonUserId: 101,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.employee.name).toBe("Server Bob");
      expect(result.data.attendance.totalHours).toBe(12.0);
      expect(result.data.attendance.daysWorked).toBe(2);
      expect(result.data.payroll?.grossCents).toBe(18000);
      expect(result.data.payroll?.balanceCents).toBe(8000);
      expect(result.data.payroll?.status).toBe("part-paid");
    }
  });

  it("allows manager to view any employee's statement", async () => {
    mocks.getCurrentUser.mockResolvedValue(managerUser);

    const result = await getCombinedMonthlyStatementAction({
      restaurantSlug: "the-monks",
      year: 2026,
      month: 9,
      neonUserId: 102,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.employee.neonUserId).toBe(102);
      expect(result.data.restaurant.name).toBe("The Monk's Cellar");
      expect(result.data.period.monthLabel).toBe("September 2026");
    }
  });

  it("handles when no payroll period has been generated yet", async () => {
    mocks.getCurrentUser.mockResolvedValue(managerUser);
    mocks.getPayrollPeriod.mockResolvedValue({
      ok: true,
      data: null,
    });

    const result = await getCombinedMonthlyStatementAction({
      restaurantSlug: "the-monks",
      year: 2026,
      month: 9,
      neonUserId: 101,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.attendance.totalHours).toBe(12.0);
      expect(result.data.payroll).toBeNull();
    }
  });
});
