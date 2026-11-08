"use server";

import { z } from "zod";

import {
  getActiveNeonUsers,
  getAttendanceRows,
  type NeonAttendanceRow,
} from "@/features/attendance/data/attendance-data";
import { getOwnAttendanceLink } from "@/features/attendance/data/identity-links";
import { computeAttendanceSummary } from "@/features/attendance/domain/attendance-metrics";
import {
  demoNeonAttendance,
  demoNeonUsers,
} from "@/features/attendance/demo-data";
import { resolvePeriodRange } from "@/features/attendance/domain/attendance-report";
import { assertWorkspaceExpectation } from "@/features/context/data/workspace-expectation";
import { STALE_CONTEXT_MESSAGE } from "@/features/context/domain/workspace-expectation";
import {
  derivePeriodStatus,
  type PeriodDisplayStatus,
} from "@/features/payroll/domain/payroll-balance-metrics";
import {
  getOrganizationName,
  getPayrollBalance,
  getPayrollPeriod,
  listAdjustmentsForPeriod,
  listPaymentsForPeriod,
  type PayrollAdjustment,
  type PayrollPayment,
} from "@/features/payroll/data/payroll-data";
import {
  getPayrollActor,
  type PayrollActor,
} from "@/features/payroll/data/payroll-actor";
import { resolveEmployeeLocationProvenance } from "@/features/payroll/data/payroll-provenance";
import { guardModule } from "@/features/modules/data/module-enforcement";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      sessionInvalid?: true;
      contextStale?: true;
    };

const restaurantSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const neonUserIdSchema = z.number().int().positive();
const yearSchema = z.number().int().min(2020).max(2100);
const monthSchema = z.number().int().min(1).max(12);

export type CombinedMonthlyStatement = {
  restaurant: {
    name: string;
    slug: string;
  };
  employee: {
    neonUserId: number;
    name: string;
    role: string;
  };
  period: {
    year: number;
    month: number;
    monthLabel: string;
  };
  attendance: {
    rows: NeonAttendanceRow[];
    totalHours: number;
    daysWorked: number;
    avgHoursPerDay: number;
  };
  payroll: {
    periodId: number;
    status: PeriodDisplayStatus;
    grossCents: number;
    hoursSnapshot: number;
    rateCentsSnapshot: number;
    confirmedPaymentsCents: number;
    adjustmentsCents: number;
    balanceCents: number;
    payments: PayrollPayment[];
    adjustments: PayrollAdjustment[];
  } | null;
  generatedAt: string;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

async function checkWorkspace(
  raw: unknown,
  caller: PayrollActor,
  claimedLocationId?: string,
) {
  if (!caller.scope.locationId) {
    return { ok: true as const, location: null };
  }
  const expectationRaw = raw ?? {
    profileId: caller.viewer.profileId,
    organizationId: caller.organizationId,
    locationId: claimedLocationId ?? caller.scope.locationId,
  };
  const outcome = await assertWorkspaceExpectation(
    expectationRaw,
    {
      profileId: caller.viewer.profileId,
      organizationId: caller.organizationId,
    },
    {
      resolveLocation: async () => ({
        id: caller.scope.locationId!,
        time_zone: caller.scope.timeZone,
      }),
    },
  );
  if (outcome.ok) return { ok: true as const, location: outcome.location };
  if (outcome.code === "invalid") {
    return {
      ok: false as const,
      result: { ok: false as const, error: "Invalid statement parameters." },
    };
  }
  return {
    ok: false as const,
    result: {
      ok: false as const,
      error: STALE_CONTEXT_MESSAGE,
      contextStale: true as const,
    },
  };
}

export async function getCombinedMonthlyStatementAction(input: {
  restaurantSlug: string;
  year: number;
  month: number;
  neonUserId: number;
  expectedContext?: unknown;
}): Promise<ActionResult<CombinedMonthlyStatement>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      year: yearSchema,
      month: monthSchema,
      neonUserId: neonUserIdSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: "Invalid statement parameters." };
  }

  const { restaurantSlug, year, month, neonUserId } = parsed.data;

  // CI / demo mode check before live session
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    const matchedUser = demoNeonUsers.find((u) => u.id === neonUserId) ?? null;
    const employeeName = matchedUser?.fullName ?? `Employee #${neonUserId}`;
    const employeeRole = matchedUser?.role?.trim() ?? "Staff";

    const { start: startDate, end: endDate } = resolvePeriodRange(
      { type: "month", year, month },
      `${year}-${String(month).padStart(2, "0")}-01`,
    );

    const rows = demoNeonAttendance.filter(
      (row) =>
        row.userId === neonUserId &&
        row.date >= startDate &&
        row.date <= endDate,
    );
    const aggregate = computeAttendanceSummary(rows);

    return {
      ok: true,
      data: {
        restaurant: {
          name: "The Monk's Restaurant & Bar",
          slug: restaurantSlug,
        },
        employee: {
          neonUserId,
          name: employeeName,
          role: employeeRole,
        },
        period: {
          year,
          month,
          monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
        },
        attendance: {
          rows,
          totalHours: aggregate.totalHours,
          daysWorked: aggregate.daysWorked,
          avgHoursPerDay: aggregate.avgPerDay,
        },
        payroll: {
          periodId: 1,
          status: "locked",
          grossCents: Math.round(aggregate.totalHours * 1500),
          hoursSnapshot: aggregate.totalHours,
          rateCentsSnapshot: 1500,
          confirmedPaymentsCents: Math.round(aggregate.totalHours * 1500),
          adjustmentsCents: 0,
          balanceCents: 0,
          payments: [
            {
              id: 1,
              organizationId: "demo-org",
              payrollPeriodId: 1,
              amountCents: Math.round(aggregate.totalHours * 1500),
              paymentDate: `${year}-${String(month).padStart(2, "0")}-15`,
              status: "confirmed",
              comment: "Regular Monthly Settlement",
              createdAt: `${year}-${String(month).padStart(2, "0")}-15T00:00:00Z`,
              createdBy: "demo-manager",
              updatedAt: `${year}-${String(month).padStart(2, "0")}-15T00:00:00Z`,
              confirmedAt: `${year}-${String(month).padStart(2, "0")}-15T00:00:00Z`,
              confirmedBy: "demo-manager",
              reversesPaymentId: null,
            },
          ],
          adjustments: [],
        },
        generatedAt: new Date().toISOString(),
      },
    };
  }

  const actor = await getPayrollActor(restaurantSlug);
  if (!actor) {
    return { ok: false, error: "You must be signed in to view statements." };
  }

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardModule({
    module: "payroll",
    organizationId: actor.organizationId,
    location: actor.scope.locationId ? { id: actor.scope.locationId } : null,
  });
  if (blocked) return blocked;

  const supabase = await createClient();

  // Multi-tenant & role authorization check
  if (!actor.canManage) {
    const linkResult = await getOwnAttendanceLink(supabase, {
      organizationId: actor.organizationId,
      profileId: actor.viewer.profileId,
    });
    if (!linkResult.ok || !linkResult.data) {
      return {
        ok: false,
        error: "Your account is not linked to the attendance system.",
      };
    }
    if (linkResult.data.neonUserId !== neonUserId) {
      return {
        ok: false,
        error: "You are only authorized to view your own monthly statement.",
      };
    }
  } else if (!actor.isOrgManager) {
    // Location Manager: can only view statement for staff assigned to this location
    const provenance = await resolveEmployeeLocationProvenance(
      supabase,
      actor.organizationId,
      neonUserId,
    );
    if (
      provenance.status !== "single_location" ||
      provenance.locationId !== actor.scope.locationId
    ) {
      return {
        ok: false,
        error:
          "You can only view statements for employees assigned to your location.",
      };
    }
  }

  // 1. Fetch organization name
  const orgNameResult = await getOrganizationName(supabase, {
    organizationId: actor.organizationId,
  });
  const orgName = orgNameResult.ok ? orgNameResult.data : "The Monk's";

  // 2. Fetch employee details
  const usersResult = await getActiveNeonUsers();
  const matchedUser = usersResult.ok
    ? usersResult.data.find((u) => u.id === neonUserId)
    : null;
  const employeeName = matchedUser?.fullName ?? `Employee #${neonUserId}`;
  const employeeRole = matchedUser?.role ?? "Staff";

  // 3. Resolve date range and fetch attendance rows
  const { start: startDate, end: endDate } = resolvePeriodRange(
    { type: "month", year, month },
    `${year}-${String(month).padStart(2, "0")}-01`,
  );

  const attendanceResult = await getAttendanceRows({
    userIds: [neonUserId],
    startDate,
    endDate,
  });
  const attendanceRows = attendanceResult.ok ? attendanceResult.data : [];
  const attendanceSummary = computeAttendanceSummary(attendanceRows);

  // 4. Fetch payroll period if generated
  const periodMonth = `${year}-${String(month).padStart(2, "0")}-01`;
  const periodResult = await getPayrollPeriod(supabase, {
    organizationId: actor.organizationId,
    neonUserId,
    periodMonth,
  });

  let payrollData: CombinedMonthlyStatement["payroll"] = null;

  if (periodResult.ok && periodResult.data) {
    const period = periodResult.data;

    // Defense in depth: if period has location_id, ensure location manager has authority
    if (
      !actor.isOrgManager &&
      period.locationId &&
      period.locationId !== actor.scope.locationId
    ) {
      return {
        ok: false,
        error:
          "You can only view statements for employees assigned to your location.",
      };
    }

    const [paymentsResult, adjustmentsResult, balanceResult] =
      await Promise.all([
        listPaymentsForPeriod(supabase, { periodId: period.id }),
        listAdjustmentsForPeriod(supabase, { periodId: period.id }),
        getPayrollBalance(supabase, { period }),
      ]);

    const payments = paymentsResult.ok ? paymentsResult.data : [];
    const adjustments = adjustmentsResult.ok ? adjustmentsResult.data : [];
    const balance = balanceResult.ok ? balanceResult.data : null;

    // Staff only sees confirmed payments; managers see both draft & confirmed
    const visiblePayments = !actor.canManage
      ? payments.filter((p) => p.status === "confirmed")
      : payments;

    const displayStatus = derivePeriodStatus({
      status: period.status,
      grossCents: period.grossCents,
      balanceCents: balance?.balanceCents ?? period.grossCents,
    });

    payrollData = {
      periodId: period.id,
      status: displayStatus,
      grossCents: period.grossCents,
      hoursSnapshot: period.hoursSnapshot,
      rateCentsSnapshot: period.rateCentsSnapshot,
      confirmedPaymentsCents: balance?.confirmedPaymentsCents ?? 0,
      adjustmentsCents: balance?.adjustmentsCents ?? 0,
      balanceCents: balance?.balanceCents ?? period.grossCents,
      payments: visiblePayments,
      adjustments,
    };
  }

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  return {
    ok: true,
    data: {
      restaurant: {
        name: orgName,
        slug: restaurantSlug,
      },
      employee: {
        neonUserId,
        name: employeeName,
        role: employeeRole,
      },
      period: {
        year,
        month,
        monthLabel,
      },
      attendance: {
        rows: attendanceRows,
        totalHours: attendanceSummary.totalHours,
        daysWorked: attendanceSummary.daysWorked,
        avgHoursPerDay: attendanceSummary.avgPerDay,
      },
      payroll: payrollData,
      generatedAt: new Date().toISOString(),
    },
  };
}
