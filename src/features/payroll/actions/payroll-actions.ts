"use server";

import { z } from "zod";

import {
  getActiveNeonUsers,
  getAttendanceRows,
  type NeonUser,
} from "@/features/attendance/data/attendance-data";
import { aggregateHours } from "@/features/attendance/domain/attendance-report";
import { getOwnAttendanceLink } from "@/features/attendance/data/identity-links";
import { assertWorkspaceExpectation } from "@/features/context/data/workspace-expectation";
import { STALE_CONTEXT_MESSAGE } from "@/features/context/domain/workspace-expectation";
import {
  computeGrossCents,
  monthDateRange,
  normalizePeriodMonth,
  previousPeriodMonth,
  resolveEffectiveRateCents,
} from "@/features/payroll/domain/calculate-payroll";
import {
  computeOwedForMonth,
  findOldestOpenPeriod,
  type OldestOpenPeriod,
  type PayrollPeriodWithBalance,
} from "@/features/payroll/domain/payroll-balance-metrics";
import {
  confirmPayment,
  countPaymentsForPeriod,
  deleteDraftPayment,
  editDraftPayment,
  generatePayrollPeriod,
  getOrganizationName,
  getPaymentById,
  getPayrollBalance,
  getPayrollDefaultRateCents,
  getPayrollPeriod,
  getPayrollPeriodById,
  getPayrollRateOverrideCents,
  listAdjustmentsForPeriod,
  listPaymentsForPeriod,
  listPayrollPeriods,
  listPayrollRateOverrides,
  lockPayrollPeriod,
  recordAdjustment,
  recordPayment,
  regeneratePayrollPeriod,
  removePayrollRateOverride,
  setPayrollDefaultRateCents,
  setPayrollRateOverrideCents,
  unlockPayrollPeriod,
  type PayrollAdjustment,
  type PayrollBalance,
  type PayrollPayment,
  type PayrollPeriod,
} from "@/features/payroll/data/payroll-data";
import {
  getPayrollActor,
  type PayrollActor,
} from "@/features/payroll/data/payroll-actor";
import { resolveEmployeeLocationProvenance } from "@/features/payroll/data/payroll-provenance";
import { guardModule } from "@/features/modules/data/module-enforcement";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      sessionInvalid?: true;
      contextStale?: true;
    };

const NOT_SIGNED_IN_ERROR = "You need to sign in to see payroll.";
const NOT_MANAGER_ERROR = "You don't have access to payroll.";
const NOT_LOCATION_MANAGER_ERROR =
  "You do not have permission to manage payroll for this location.";

const restaurantSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const neonUserIdSchema = z.number().int().positive();
const periodMonthSchema = z.iso.date();
const rateCentsSchema = z.number().int().min(0);
const periodIdSchema = z.number().int().positive();
const paymentIdSchema = z.number().int().positive();
const amountCentsSchema = z.number().int().positive();
const paymentDateSchema = z.iso.date();
const commentSchema = z.string().trim().min(1).max(500).nullable().optional();
const deltaCentsSchema = z
  .number()
  .int()
  .refine((value) => value !== 0, {
    message: "An adjustment must be a nonzero amount.",
  });
const reasonSchema = z.string().trim().min(3).max(500);

function invalidRequest<T>(): ActionResult<T> {
  return { ok: false, error: "That payroll request is invalid." };
}

/**
 * Server-side request-context consistency check (V2-003.005).
 * Validates that the client's expected context matches the server-verified caller.
 */
async function checkWorkspace(
  raw: unknown,
  caller: PayrollActor,
  claimedLocationId?: string,
) {
  if (!caller.scope.locationId) {
    // Org-level manager without specific location binding
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
      result: {
        ok: false as const,
        error: "That payroll request is invalid.",
      },
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

function guardPayrollModule(actor: PayrollActor) {
  return guardModule({
    module: "payroll",
    organizationId: actor.organizationId,
    location: actor.scope.locationId ? { id: actor.scope.locationId } : null,
  });
}

export type PayrollAccessView =
  | {
      scope: "all";
      canManage: true;
      isOrgManager: boolean;
      locationId: string | null;
    }
  | {
      scope: "self";
      neonUserId: number;
      person: NeonUser | null;
      canManage: false;
      isOrgManager: false;
      locationId: string | null;
    }
  | {
      scope: "unlinked";
      canManage: false;
      isOrgManager: false;
      locationId: string | null;
    };

/** Tells the client what to render -- never what to enforce. */
export async function getPayrollAccessAction(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
}): Promise<ActionResult<PayrollAccessView>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor) return { ok: false, error: NOT_SIGNED_IN_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  if (actor.canManage) {
    return {
      ok: true,
      data: {
        scope: "all",
        canManage: true,
        isOrgManager: actor.isOrgManager,
        locationId: actor.scope.locationId,
      },
    };
  }

  const supabase = await createClient();
  const link = await getOwnAttendanceLink(supabase, {
    organizationId: actor.organizationId,
    profileId: actor.viewer.profileId,
  });
  if (!link.ok || !link.data) {
    return {
      ok: true,
      data: {
        scope: "unlinked",
        canManage: false,
        isOrgManager: false,
        locationId: actor.scope.locationId,
      },
    };
  }

  const usersResult = await getActiveNeonUsers();
  const person = usersResult.ok
    ? (usersResult.data.find((user) => user.id === link.data?.neonUserId) ??
      null)
    : null;

  return {
    ok: true,
    data: {
      scope: "self",
      neonUserId: link.data.neonUserId,
      person,
      canManage: false,
      isOrgManager: false,
      locationId: actor.scope.locationId,
    },
  };
}

export type PayrollRateOptions = {
  users: NeonUser[];
  defaultRateCents: number | null;
  overrides: Array<{ neonUserId: number; rateCents: number }>;
};

export async function getPayrollRateOptionsAction(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
}): Promise<ActionResult<PayrollRateOptions>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const usersResult = await getActiveNeonUsers();
  if (!usersResult.ok) return { ok: false, error: usersResult.error };

  const supabase = await createClient();

  // If location manager (not org manager), filter workforce to members of this location
  let candidateUsers = usersResult.data;
  if (!actor.isOrgManager && actor.scope.locationId) {
    const { data: locMembers } = await supabase
      .from("location_memberships")
      .select("profile_id")
      .eq("location_id", actor.scope.locationId)
      .eq("active", true);
    const profileIds = (locMembers ?? []).map((m) => m.profile_id);
    if (profileIds.length === 0) {
      candidateUsers = [];
    } else {
      const { data: links } = await supabase
        .from("attendance_identity_links")
        .select("neon_user_id")
        .eq("organization_id", actor.organizationId)
        .in("profile_id", profileIds);
      const linkedNeonIds = new Set((links ?? []).map((l) => l.neon_user_id));
      candidateUsers = usersResult.data.filter((u) => linkedNeonIds.has(u.id));
    }
  }

  const [defaultRateResult, overridesResult] = await Promise.all([
    getPayrollDefaultRateCents(supabase, {
      organizationId: actor.organizationId,
    }),
    listPayrollRateOverrides(supabase, {
      organizationId: actor.organizationId,
    }),
  ]);
  if (!defaultRateResult.ok)
    return { ok: false, error: defaultRateResult.error };
  if (!overridesResult.ok) return { ok: false, error: overridesResult.error };

  return {
    ok: true,
    data: {
      users: candidateUsers,
      defaultRateCents: defaultRateResult.data,
      overrides: overridesResult.data,
    },
  };
}

export async function setPayrollDefaultRateAction(input: {
  restaurantSlug: string;
  rateCents: number;
  expectedContext?: unknown;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      rateCents: rateCentsSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  if (!actor.isOrgManager) {
    return {
      ok: false,
      error: "Only organization managers can configure compensation rates.",
    };
  }

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  return setPayrollDefaultRateCents(supabase, {
    organizationId: actor.organizationId,
    rateCents: parsed.data.rateCents,
    actorProfileId: actor.viewer.profileId,
  });
}

export async function setPayrollRateOverrideAction(input: {
  restaurantSlug: string;
  neonUserId: number;
  rateCents: number;
  expectedContext?: unknown;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      neonUserId: neonUserIdSchema,
      rateCents: rateCentsSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  if (!actor.isOrgManager) {
    return {
      ok: false,
      error: "Only organization managers can configure compensation rates.",
    };
  }

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  return setPayrollRateOverrideCents(supabase, {
    organizationId: actor.organizationId,
    neonUserId: parsed.data.neonUserId,
    rateCents: parsed.data.rateCents,
    actorProfileId: actor.viewer.profileId,
  });
}

export async function removePayrollRateOverrideAction(input: {
  restaurantSlug: string;
  neonUserId: number;
  expectedContext?: unknown;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      neonUserId: neonUserIdSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  if (!actor.isOrgManager) {
    return {
      ok: false,
      error: "Only organization managers can configure compensation rates.",
    };
  }

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  return removePayrollRateOverride(supabase, {
    organizationId: actor.organizationId,
    neonUserId: parsed.data.neonUserId,
  });
}

export async function listPayrollPeriodsAction(input: {
  restaurantSlug: string;
  periodMonth?: string;
  expectedContext?: unknown;
}): Promise<ActionResult<PayrollPeriod[]>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      periodMonth: periodMonthSchema.optional(),
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor) return { ok: false, error: NOT_SIGNED_IN_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  if (!actor.canManage) {
    const link = await getOwnAttendanceLink(supabase, {
      organizationId: actor.organizationId,
      profileId: actor.viewer.profileId,
    });
    if (!link.ok || !link.data) return { ok: true, data: [] };
    // RLS payroll_periods_select_self handles scoping to own neon_user_id
    return listPayrollPeriods(supabase, {
      organizationId: actor.organizationId,
      periodMonth: parsed.data.periodMonth,
    });
  }

  const filterLocationId = !actor.isOrgManager
    ? actor.scope.locationId
    : undefined;
  return listPayrollPeriods(supabase, {
    organizationId: actor.organizationId,
    periodMonth: parsed.data.periodMonth,
    locationId: filterLocationId,
  });
}

export type PayrollLedger = {
  period: PayrollPeriod;
  payments: PayrollPayment[];
  adjustments: PayrollAdjustment[];
  balance: PayrollBalance;
  organizationName: string;
};

export async function getPayrollLedgerAction(input: {
  restaurantSlug: string;
  periodId: number;
  expectedContext?: unknown;
}): Promise<ActionResult<PayrollLedger>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      periodId: periodIdSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor) return { ok: false, error: NOT_SIGNED_IN_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  let ownNeonUserId: number | null = null;
  if (!actor.canManage) {
    const link = await getOwnAttendanceLink(supabase, {
      organizationId: actor.organizationId,
      profileId: actor.viewer.profileId,
    });
    if (!link.ok || !link.data) {
      return { ok: false, error: "That payroll period could not be found." };
    }
    ownNeonUserId = link.data.neonUserId;
  }

  const periodResult = await getPayrollPeriodById(supabase, {
    periodId: parsed.data.periodId,
  });
  if (!periodResult.ok) return { ok: false, error: periodResult.error };
  const period = periodResult.data;
  if (!period || period.organizationId !== actor.organizationId) {
    return { ok: false, error: "That payroll period could not be found." };
  }

  if (!actor.canManage) {
    if (period.neonUserId !== ownNeonUserId) {
      return { ok: false, error: "That payroll period could not be found." };
    }
  } else if (
    !actor.isOrgManager &&
    period.locationId &&
    period.locationId !== actor.scope.locationId
  ) {
    return { ok: false, error: "That payroll period could not be found." };
  }

  const [
    paymentsResult,
    adjustmentsResult,
    balanceResult,
    organizationNameResult,
  ] = await Promise.all([
    listPaymentsForPeriod(supabase, { periodId: period.id }),
    listAdjustmentsForPeriod(supabase, { periodId: period.id }),
    getPayrollBalance(supabase, { period }),
    getOrganizationName(supabase, {
      organizationId: actor.organizationId,
    }),
  ]);
  if (!paymentsResult.ok) return { ok: false, error: paymentsResult.error };
  if (!adjustmentsResult.ok)
    return { ok: false, error: adjustmentsResult.error };
  if (!balanceResult.ok) return { ok: false, error: balanceResult.error };
  if (!organizationNameResult.ok)
    return { ok: false, error: organizationNameResult.error };

  const payments = !actor.canManage
    ? paymentsResult.data.filter((p) => p.status === "confirmed")
    : paymentsResult.data;

  return {
    ok: true,
    data: {
      period,
      payments,
      adjustments: adjustmentsResult.data,
      balance: balanceResult.data,
      organizationName: organizationNameResult.data,
    },
  };
}

async function computeSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: { organizationId: string; neonUserId: number; periodMonth: string },
): Promise<
  ActionResult<{
    hoursSnapshot: number;
    rateCentsSnapshot: number;
    grossCents: number;
  }>
> {
  const [overrideResult, defaultResult] = await Promise.all([
    getPayrollRateOverrideCents(supabase, {
      organizationId: input.organizationId,
      neonUserId: input.neonUserId,
    }),
    getPayrollDefaultRateCents(supabase, {
      organizationId: input.organizationId,
    }),
  ]);
  if (!overrideResult.ok) return { ok: false, error: overrideResult.error };
  if (!defaultResult.ok) return { ok: false, error: defaultResult.error };

  const rateCentsSnapshot = resolveEffectiveRateCents({
    overrideRateCents: overrideResult.data,
    defaultRateCents: defaultResult.data,
  });
  if (rateCentsSnapshot === null) {
    return {
      ok: false,
      error:
        "No pay rate is configured for this person, and there's no organization default set. Set a rate first.",
    };
  }

  const { start, end } = monthDateRange(input.periodMonth);
  const rowsResult = await getAttendanceRows({
    userIds: [input.neonUserId],
    startDate: start,
    endDate: end,
  });
  if (!rowsResult.ok) return { ok: false, error: rowsResult.error };

  const { totalHours } = aggregateHours(rowsResult.data);
  const grossCents = computeGrossCents(totalHours, rateCentsSnapshot);
  return {
    ok: true,
    data: { hoursSnapshot: totalHours, rateCentsSnapshot, grossCents },
  };
}

export async function generatePayrollPeriodAction(input: {
  restaurantSlug: string;
  neonUserId: number;
  periodMonth: string;
  expectedContext?: unknown;
}): Promise<ActionResult<PayrollPeriod>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      neonUserId: neonUserIdSchema,
      periodMonth: periodMonthSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const provenance = await resolveEmployeeLocationProvenance(
    supabase,
    actor.organizationId,
    parsed.data.neonUserId,
  );

  let targetLocationId: string | null = null;
  if (!actor.isOrgManager) {
    if (provenance.status === "multi_location") {
      return {
        ok: false,
        error:
          "This employee is assigned to multiple locations. Multi-location payroll must be generated by an organization manager.",
      };
    }
    if (
      provenance.status !== "single_location" ||
      provenance.locationId !== actor.scope.locationId
    ) {
      return {
        ok: false,
        error:
          "You cannot generate payroll for an employee assigned to another location.",
      };
    }
    targetLocationId = actor.scope.locationId;
  } else {
    targetLocationId =
      provenance.status === "single_location"
        ? provenance.locationId
        : (actor.scope.locationId ?? null);
  }

  const periodMonth = normalizePeriodMonth(parsed.data.periodMonth);

  const existing = await getPayrollPeriod(supabase, {
    organizationId: actor.organizationId,
    neonUserId: parsed.data.neonUserId,
    periodMonth,
  });
  if (!existing.ok) return { ok: false, error: existing.error };
  if (existing.data) {
    return {
      ok: false,
      error:
        "A payroll period already exists for this person and month -- use Regenerate instead.",
    };
  }

  const snapshot = await computeSnapshot(supabase, {
    organizationId: actor.organizationId,
    neonUserId: parsed.data.neonUserId,
    periodMonth,
  });
  if (!snapshot.ok) return snapshot;

  return generatePayrollPeriod(supabase, {
    organizationId: actor.organizationId,
    locationId: targetLocationId,
    neonUserId: parsed.data.neonUserId,
    periodMonth,
    ...snapshot.data,
    actorProfileId: actor.viewer.profileId,
  });
}

export type BulkGeneratePayrollResult = {
  successful: Array<{ neonUserId: number; period: PayrollPeriod }>;
  skipped: Array<{ neonUserId: number; reason: string }>;
  failed: Array<{ neonUserId: number; error: string }>;
};

const neonUserIdsSchema = z.array(neonUserIdSchema).min(1).max(200);

export async function generatePayrollForEmployeesAction(input: {
  restaurantSlug: string;
  neonUserIds: number[];
  periodMonth: string;
  expectedContext?: unknown;
}): Promise<ActionResult<BulkGeneratePayrollResult>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      neonUserIds: neonUserIdsSchema,
      periodMonth: periodMonthSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const periodMonth = normalizePeriodMonth(parsed.data.periodMonth);
  const neonUserIds = [...new Set(parsed.data.neonUserIds)];

  const result: BulkGeneratePayrollResult = {
    successful: [],
    skipped: [],
    failed: [],
  };

  for (const neonUserId of neonUserIds) {
    const existing = await getPayrollPeriod(supabase, {
      organizationId: actor.organizationId,
      neonUserId,
      periodMonth,
    });
    if (!existing.ok) {
      result.failed.push({ neonUserId, error: existing.error });
      continue;
    }
    if (existing.data) {
      result.skipped.push({
        neonUserId,
        reason: "Already generated for this month.",
      });
      continue;
    }

    const provenance = await resolveEmployeeLocationProvenance(
      supabase,
      actor.organizationId,
      neonUserId,
    );

    let targetLocationId: string | null = null;
    if (!actor.isOrgManager) {
      if (provenance.status === "multi_location") {
        result.skipped.push({
          neonUserId,
          reason:
            "Assigned to multiple locations; requires organization manager generation.",
        });
        continue;
      }
      if (
        provenance.status !== "single_location" ||
        provenance.locationId !== actor.scope.locationId
      ) {
        result.skipped.push({
          neonUserId,
          reason: "Not assigned to this location.",
        });
        continue;
      }
      targetLocationId = actor.scope.locationId;
    } else {
      targetLocationId =
        provenance.status === "single_location"
          ? provenance.locationId
          : (actor.scope.locationId ?? null);
    }

    const snapshot = await computeSnapshot(supabase, {
      organizationId: actor.organizationId,
      neonUserId,
      periodMonth,
    });
    if (!snapshot.ok) {
      result.failed.push({ neonUserId, error: snapshot.error });
      continue;
    }

    const generated = await generatePayrollPeriod(supabase, {
      organizationId: actor.organizationId,
      locationId: targetLocationId,
      neonUserId,
      periodMonth,
      ...snapshot.data,
      actorProfileId: actor.viewer.profileId,
    });
    if (!generated.ok) {
      result.failed.push({ neonUserId, error: generated.error });
      continue;
    }
    result.successful.push({ neonUserId, period: generated.data });
  }

  return { ok: true, data: result };
}

export type PayrollGenerationEligibility = {
  neonUserId: number;
  fullName: string;
  alreadyGenerated: boolean;
  multiLocation?: boolean;
};

export async function getPayrollGenerationEligibilityAction(input: {
  restaurantSlug: string;
  periodMonth: string;
  expectedContext?: unknown;
}): Promise<ActionResult<PayrollGenerationEligibility[]>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      periodMonth: periodMonthSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const usersResult = await getActiveNeonUsers();
  if (!usersResult.ok) return { ok: false, error: usersResult.error };

  const supabase = await createClient();

  let candidateUsers = usersResult.data;
  if (!actor.isOrgManager && actor.scope.locationId) {
    const { data: locMembers } = await supabase
      .from("location_memberships")
      .select("profile_id")
      .eq("location_id", actor.scope.locationId)
      .eq("active", true);
    const profileIds = (locMembers ?? []).map((m) => m.profile_id);
    if (profileIds.length === 0) {
      candidateUsers = [];
    } else {
      const { data: links } = await supabase
        .from("attendance_identity_links")
        .select("neon_user_id")
        .eq("organization_id", actor.organizationId)
        .in("profile_id", profileIds);
      const linkedNeonIds = new Set((links ?? []).map((l) => l.neon_user_id));
      candidateUsers = usersResult.data.filter((u) => linkedNeonIds.has(u.id));
    }
  }

  const periodMonth = normalizePeriodMonth(parsed.data.periodMonth);
  const eligibility = await Promise.all(
    candidateUsers.map(async (user) => {
      const existing = await getPayrollPeriod(supabase, {
        organizationId: actor.organizationId,
        neonUserId: user.id,
        periodMonth,
      });
      const prov = await resolveEmployeeLocationProvenance(
        supabase,
        actor.organizationId,
        user.id,
      );
      return {
        neonUserId: user.id,
        fullName: user.fullName,
        alreadyGenerated: existing.ok ? Boolean(existing.data) : false,
        multiLocation: prov.status === "multi_location",
      };
    }),
  );

  return { ok: true, data: eligibility };
}

export async function regeneratePayrollPeriodAction(input: {
  restaurantSlug: string;
  periodId: number;
  expectedContext?: unknown;
}): Promise<ActionResult<PayrollPeriod>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      periodId: z.number().int().positive(),
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const periodResult = await getPayrollPeriodById(supabase, {
    periodId: parsed.data.periodId,
  });
  if (!periodResult.ok) return { ok: false, error: periodResult.error };
  const period = periodResult.data;
  if (!period || period.organizationId !== actor.organizationId) {
    return { ok: false, error: "That payroll period could not be found." };
  }
  if (
    !actor.isOrgManager &&
    period.locationId &&
    period.locationId !== actor.scope.locationId
  ) {
    return {
      ok: false,
      error: NOT_LOCATION_MANAGER_ERROR,
    };
  }
  if (period.status === "locked") {
    return {
      ok: false,
      error: "This payroll period is locked and can no longer be regenerated.",
    };
  }

  const paymentCount = await countPaymentsForPeriod(supabase, {
    periodId: period.id,
  });
  if (!paymentCount.ok) return { ok: false, error: paymentCount.error };
  if (paymentCount.data > 0) {
    return {
      ok: false,
      error: `Cannot regenerate: ${paymentCount.data} payment${paymentCount.data === 1 ? "" : "s"} already recorded against this period. Record a manual adjustment instead.`,
    };
  }

  const snapshot = await computeSnapshot(supabase, {
    organizationId: actor.organizationId,
    neonUserId: period.neonUserId,
    periodMonth: period.periodMonth,
  });
  if (!snapshot.ok) return snapshot;

  return regeneratePayrollPeriod(supabase, {
    period,
    ...snapshot.data,
    actorProfileId: actor.viewer.profileId,
  });
}

export async function lockPayrollPeriodAction(input: {
  restaurantSlug: string;
  periodId: number;
  expectedContext?: unknown;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      periodId: z.number().int().positive(),
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const periodResult = await getPayrollPeriodById(supabase, {
    periodId: parsed.data.periodId,
  });
  if (!periodResult.ok) return { ok: false, error: periodResult.error };
  const period = periodResult.data;
  if (!period || period.organizationId !== actor.organizationId) {
    return { ok: false, error: "That payroll period could not be found." };
  }
  if (
    !actor.isOrgManager &&
    period.locationId &&
    period.locationId !== actor.scope.locationId
  ) {
    return {
      ok: false,
      error: NOT_LOCATION_MANAGER_ERROR,
    };
  }
  if (period.status === "locked") {
    return { ok: false, error: "This payroll period is already locked." };
  }

  return lockPayrollPeriod(supabase, {
    periodId: period.id,
    organizationId: actor.organizationId,
    locationId: period.locationId,
    actorProfileId: actor.viewer.profileId,
  });
}

export async function unlockPayrollPeriodAction(input: {
  restaurantSlug: string;
  periodId: number;
  reason: string;
  expectedContext?: unknown;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      periodId: z.number().int().positive(),
      reason: reasonSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const periodResult = await getPayrollPeriodById(supabase, {
    periodId: parsed.data.periodId,
  });
  if (!periodResult.ok) return { ok: false, error: periodResult.error };
  const period = periodResult.data;
  if (!period || period.organizationId !== actor.organizationId) {
    return { ok: false, error: "That payroll period could not be found." };
  }
  if (
    !actor.isOrgManager &&
    period.locationId &&
    period.locationId !== actor.scope.locationId
  ) {
    return {
      ok: false,
      error: NOT_LOCATION_MANAGER_ERROR,
    };
  }
  if (period.status !== "locked") {
    return { ok: false, error: "This payroll period isn't locked." };
  }

  return unlockPayrollPeriod(supabase, {
    periodId: period.id,
    organizationId: actor.organizationId,
    locationId: period.locationId,
    actorProfileId: actor.viewer.profileId,
    reason: parsed.data.reason,
    previousLockedAt: period.lockedAt,
    previousLockedBy: period.lockedBy,
  });
}

export async function recordPaymentAction(input: {
  restaurantSlug: string;
  periodId: number;
  amountCents: number;
  paymentDate: string;
  comment?: string | null;
  expectedContext?: unknown;
}): Promise<ActionResult<PayrollPayment>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      periodId: periodIdSchema,
      amountCents: amountCentsSchema,
      paymentDate: paymentDateSchema,
      comment: commentSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const periodResult = await getPayrollPeriodById(supabase, {
    periodId: parsed.data.periodId,
  });
  if (!periodResult.ok) return { ok: false, error: periodResult.error };
  const period = periodResult.data;
  if (!period || period.organizationId !== actor.organizationId) {
    return { ok: false, error: "That payroll period could not be found." };
  }
  if (
    !actor.isOrgManager &&
    period.locationId &&
    period.locationId !== actor.scope.locationId
  ) {
    return {
      ok: false,
      error: NOT_LOCATION_MANAGER_ERROR,
    };
  }

  return recordPayment(supabase, {
    organizationId: actor.organizationId,
    locationId: period.locationId,
    periodId: period.id,
    amountCents: parsed.data.amountCents,
    paymentDate: parsed.data.paymentDate,
    comment: parsed.data.comment ?? null,
    actorProfileId: actor.viewer.profileId,
  });
}

export async function editDraftPaymentAction(input: {
  restaurantSlug: string;
  paymentId: number;
  amountCents: number;
  paymentDate: string;
  comment?: string | null;
  expectedContext?: unknown;
}): Promise<ActionResult<PayrollPayment>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      paymentId: paymentIdSchema,
      amountCents: amountCentsSchema,
      paymentDate: paymentDateSchema,
      comment: commentSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const paymentResult = await getPaymentById(supabase, {
    paymentId: parsed.data.paymentId,
  });
  if (!paymentResult.ok) return { ok: false, error: paymentResult.error };
  const payment = paymentResult.data;
  if (!payment || payment.organizationId !== actor.organizationId) {
    return { ok: false, error: "That payment could not be found." };
  }
  if (payment.status === "confirmed") {
    return {
      ok: false,
      error:
        "This payment is confirmed and can no longer be edited. Record a manual adjustment instead.",
    };
  }

  const periodResult = await getPayrollPeriodById(supabase, {
    periodId: payment.payrollPeriodId,
  });
  if (!periodResult.ok || !periodResult.data) {
    return { ok: false, error: "That payroll period could not be found." };
  }
  const period = periodResult.data;
  if (
    !actor.isOrgManager &&
    period.locationId &&
    period.locationId !== actor.scope.locationId
  ) {
    return {
      ok: false,
      error: NOT_LOCATION_MANAGER_ERROR,
    };
  }

  return editDraftPayment(supabase, {
    payment,
    locationId: period.locationId,
    amountCents: parsed.data.amountCents,
    paymentDate: parsed.data.paymentDate,
    comment: parsed.data.comment ?? null,
    actorProfileId: actor.viewer.profileId,
  });
}

export async function deleteDraftPaymentAction(input: {
  restaurantSlug: string;
  paymentId: number;
  expectedContext?: unknown;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      paymentId: paymentIdSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const paymentResult = await getPaymentById(supabase, {
    paymentId: parsed.data.paymentId,
  });
  if (!paymentResult.ok) return { ok: false, error: paymentResult.error };
  const payment = paymentResult.data;
  if (!payment || payment.organizationId !== actor.organizationId) {
    return { ok: false, error: "That payment could not be found." };
  }
  if (payment.status === "confirmed") {
    return {
      ok: false,
      error:
        "This payment is confirmed and can no longer be deleted. Record a manual adjustment instead.",
    };
  }

  const periodResult = await getPayrollPeriodById(supabase, {
    periodId: payment.payrollPeriodId,
  });
  if (!periodResult.ok || !periodResult.data) {
    return { ok: false, error: "That payroll period could not be found." };
  }
  const period = periodResult.data;
  if (
    !actor.isOrgManager &&
    period.locationId &&
    period.locationId !== actor.scope.locationId
  ) {
    return {
      ok: false,
      error: NOT_LOCATION_MANAGER_ERROR,
    };
  }

  return deleteDraftPayment(supabase, {
    payment,
    locationId: period.locationId,
    actorProfileId: actor.viewer.profileId,
  });
}

export async function confirmPaymentAction(input: {
  restaurantSlug: string;
  paymentId: number;
  expectedContext?: unknown;
}): Promise<ActionResult<PayrollPayment>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      paymentId: paymentIdSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const paymentResult = await getPaymentById(supabase, {
    paymentId: parsed.data.paymentId,
  });
  if (!paymentResult.ok) return { ok: false, error: paymentResult.error };
  const payment = paymentResult.data;
  if (!payment || payment.organizationId !== actor.organizationId) {
    return { ok: false, error: "That payment could not be found." };
  }
  if (payment.status === "confirmed") {
    return { ok: false, error: "This payment is already confirmed." };
  }

  const periodResult = await getPayrollPeriodById(supabase, {
    periodId: payment.payrollPeriodId,
  });
  if (!periodResult.ok || !periodResult.data) {
    return { ok: false, error: "That payroll period could not be found." };
  }
  const period = periodResult.data;
  if (
    !actor.isOrgManager &&
    period.locationId &&
    period.locationId !== actor.scope.locationId
  ) {
    return {
      ok: false,
      error: NOT_LOCATION_MANAGER_ERROR,
    };
  }

  return confirmPayment(supabase, {
    payment,
    locationId: period.locationId,
    actorProfileId: actor.viewer.profileId,
  });
}

export async function unconfirmPaymentAction(input: {
  restaurantSlug: string;
  paymentId: number;
  reason: string;
  expectedContext?: unknown;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      paymentId: paymentIdSchema,
      reason: reasonSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const paymentResult = await getPaymentById(supabase, {
    paymentId: parsed.data.paymentId,
  });
  if (!paymentResult.ok || !paymentResult.data) {
    return { ok: false, error: "That payment could not be found." };
  }
  const payment = paymentResult.data;
  const periodResult = await getPayrollPeriodById(supabase, {
    periodId: payment.payrollPeriodId,
  });
  if (!periodResult.ok || !periodResult.data) {
    return { ok: false, error: "That payroll period could not be found." };
  }
  const period = periodResult.data;
  if (
    !actor.isOrgManager &&
    period.locationId &&
    period.locationId !== actor.scope.locationId
  ) {
    return {
      ok: false,
      error: NOT_LOCATION_MANAGER_ERROR,
    };
  }

  const { error } = await supabase.rpc("unconfirm_payroll_payment", {
    p_payment_id: parsed.data.paymentId,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function recordAdjustmentAction(input: {
  restaurantSlug: string;
  periodId: number;
  deltaCents: number;
  reason: string;
  expectedContext?: unknown;
}): Promise<ActionResult<PayrollAdjustment>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      periodId: periodIdSchema,
      deltaCents: deltaCentsSchema,
      reason: reasonSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor || !actor.canManage)
    return { ok: false, error: NOT_MANAGER_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const periodResult = await getPayrollPeriodById(supabase, {
    periodId: parsed.data.periodId,
  });
  if (!periodResult.ok) return { ok: false, error: periodResult.error };
  const period = periodResult.data;
  if (!period || period.organizationId !== actor.organizationId) {
    return { ok: false, error: "That payroll period could not be found." };
  }
  if (
    !actor.isOrgManager &&
    period.locationId &&
    period.locationId !== actor.scope.locationId
  ) {
    return {
      ok: false,
      error: NOT_LOCATION_MANAGER_ERROR,
    };
  }

  return recordAdjustment(supabase, {
    organizationId: actor.organizationId,
    locationId: period.locationId,
    periodId: period.id,
    deltaCents: parsed.data.deltaCents,
    reason: parsed.data.reason,
    actorProfileId: actor.viewer.profileId,
  });
}

export type PayrollDashboardPerson = {
  neonUserId: number;
  balanceCents: number;
  totalGeneratedCents: number;
};

export type PayrollDashboard = {
  totalBalanceOwedCents: number;
  previousMonthGeneratedCents: number;
  owedThisMonthCents: number;
  owedLastMonthCents: number;
  oldestOpenPeriod: OldestOpenPeriod | null;
  perPerson: PayrollDashboardPerson[];
  periods: PayrollPeriodWithBalance[];
};

const EMPTY_DASHBOARD: PayrollDashboard = {
  totalBalanceOwedCents: 0,
  previousMonthGeneratedCents: 0,
  owedThisMonthCents: 0,
  owedLastMonthCents: 0,
  oldestOpenPeriod: null,
  perPerson: [],
  periods: [],
};

export async function getPayrollDashboardAction(input: {
  restaurantSlug: string;
  todayLocalDate: string;
  expectedContext?: unknown;
}): Promise<ActionResult<PayrollDashboard>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      todayLocalDate: periodMonthSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const actor = await getPayrollActor(parsed.data.restaurantSlug);
  if (!actor) return { ok: false, error: NOT_SIGNED_IN_ERROR };

  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace.result;

  const blocked = await guardPayrollModule(actor);
  if (blocked) return blocked;

  const supabase = await createClient();

  if (!actor.canManage) {
    const link = await getOwnAttendanceLink(supabase, {
      organizationId: actor.organizationId,
      profileId: actor.viewer.profileId,
    });
    if (!link.ok || !link.data) {
      return { ok: true, data: EMPTY_DASHBOARD };
    }
  }

  const filterLocationId = !actor.isOrgManager
    ? actor.scope.locationId
    : undefined;
  const periodsResult = await listPayrollPeriods(supabase, {
    organizationId: actor.organizationId,
    locationId: filterLocationId,
  });
  if (!periodsResult.ok) return { ok: false, error: periodsResult.error };

  const balanceResults = await Promise.all(
    periodsResult.data.map((period) => getPayrollBalance(supabase, { period })),
  );
  const failed = balanceResults.find((result) => !result.ok);
  if (failed && !failed.ok) return { ok: false, error: failed.error };

  const currentMonth = normalizePeriodMonth(parsed.data.todayLocalDate);
  const previousMonth = previousPeriodMonth(parsed.data.todayLocalDate);
  let totalBalanceOwedCents = 0;
  let previousMonthGeneratedCents = 0;
  const perPersonByNeonUserId = new Map<number, PayrollDashboardPerson>();
  const periodsWithBalance: PayrollPeriodWithBalance[] = [];

  periodsResult.data.forEach((period, index) => {
    const balanceResult = balanceResults[index];
    if (!balanceResult.ok) return;
    const { balanceCents } = balanceResult.data;

    totalBalanceOwedCents += Math.max(0, balanceCents);
    if (period.periodMonth === previousMonth) {
      previousMonthGeneratedCents += period.grossCents;
    }

    const existing = perPersonByNeonUserId.get(period.neonUserId) ?? {
      neonUserId: period.neonUserId,
      balanceCents: 0,
      totalGeneratedCents: 0,
    };
    existing.balanceCents += balanceCents;
    existing.totalGeneratedCents += period.grossCents;
    perPersonByNeonUserId.set(period.neonUserId, existing);

    periodsWithBalance.push({
      id: period.id,
      neonUserId: period.neonUserId,
      periodMonth: period.periodMonth,
      hoursSnapshot: period.hoursSnapshot,
      rateCentsSnapshot: period.rateCentsSnapshot,
      grossCents: period.grossCents,
      status: period.status,
      balanceCents,
    });
  });

  return {
    ok: true,
    data: {
      totalBalanceOwedCents,
      previousMonthGeneratedCents,
      owedThisMonthCents: computeOwedForMonth(periodsWithBalance, currentMonth),
      owedLastMonthCents: computeOwedForMonth(
        periodsWithBalance,
        previousMonth,
      ),
      oldestOpenPeriod: findOldestOpenPeriod(periodsWithBalance),
      perPerson: Array.from(perPersonByNeonUserId.values()),
      periods: periodsWithBalance,
    },
  };
}
