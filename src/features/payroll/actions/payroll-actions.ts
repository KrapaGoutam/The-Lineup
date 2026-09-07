"use server";

import { z } from "zod";

import type { SignedInUser } from "@/components/login-screen";
import {
  getActiveNeonUsers,
  getAttendanceRows,
  type NeonUser,
} from "@/features/attendance/data/attendance-data";
import { aggregateHours } from "@/features/attendance/domain/attendance-report";
import {
  computeGrossCents,
  monthDateRange,
  normalizePeriodMonth,
  resolveEffectiveRateCents,
} from "@/features/payroll/domain/calculate-payroll";
import {
  countPaymentsForPeriod,
  generatePayrollPeriod,
  getPayrollDefaultRateCents,
  getPayrollPeriod,
  getPayrollPeriodById,
  getPayrollRateOverrideCents,
  listPayrollPeriods,
  listPayrollRateOverrides,
  lockPayrollPeriod,
  regeneratePayrollPeriod,
  removePayrollRateOverride,
  setPayrollDefaultRateCents,
  setPayrollRateOverrideCents,
  type PayrollPeriod,
} from "@/features/payroll/data/payroll-data";
import { getCurrentUser } from "@/lib/current-user";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; sessionInvalid?: true };

const NOT_MANAGER_ERROR = "You don't have access to payroll.";

const restaurantSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const neonUserIdSchema = z.number().int().positive();
const periodMonthSchema = z.iso.date();
const rateCentsSchema = z.number().int().min(0);

function invalidRequest<T>(): ActionResult<T> {
  return { ok: false, error: "That payroll request is invalid." };
}

/**
 * Feature 020 Phase 2. Payroll is privileged-only for now -- this phase
 * builds generation/snapshot machinery and a manager-facing screen to
 * exercise it, not the self-service employee view (that view only becomes
 * meaningful once Phase 3 adds payments/balance; see the spec's "Views"
 * section). A regular member gets the same generic refusal every other
 * manager-only action in this app already gives, not a payroll-specific
 * information leak about whether they're linked or not.
 */
async function requirePayrollManager(
  restaurantSlug: string,
): Promise<SignedInUser | null> {
  const currentUser = await getCurrentUser(restaurantSlug);
  if (!currentUser || currentUser.role === "server") return null;
  return currentUser;
}

export type PayrollRateOptions = {
  users: NeonUser[];
  defaultRateCents: number | null;
  overrides: Array<{ neonUserId: number; rateCents: number }>;
};

export async function getPayrollRateOptionsAction(input: {
  restaurantSlug: string;
}): Promise<ActionResult<PayrollRateOptions>> {
  const parsed = z
    .object({ restaurantSlug: restaurantSlugSchema })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const currentUser = await requirePayrollManager(parsed.data.restaurantSlug);
  if (!currentUser) return { ok: false, error: NOT_MANAGER_ERROR };

  const usersResult = await getActiveNeonUsers();
  if (!usersResult.ok) return { ok: false, error: usersResult.error };

  const supabase = await createClient();
  const [defaultRateResult, overridesResult] = await Promise.all([
    getPayrollDefaultRateCents(supabase, {
      organizationId: currentUser.organizationId,
    }),
    listPayrollRateOverrides(supabase, {
      organizationId: currentUser.organizationId,
    }),
  ]);
  if (!defaultRateResult.ok)
    return { ok: false, error: defaultRateResult.error };
  if (!overridesResult.ok) return { ok: false, error: overridesResult.error };

  return {
    ok: true,
    data: {
      users: usersResult.data,
      defaultRateCents: defaultRateResult.data,
      overrides: overridesResult.data,
    },
  };
}

export async function setPayrollDefaultRateAction(input: {
  restaurantSlug: string;
  rateCents: number;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      rateCents: rateCentsSchema,
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const currentUser = await requirePayrollManager(parsed.data.restaurantSlug);
  if (!currentUser) return { ok: false, error: NOT_MANAGER_ERROR };

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  return setPayrollDefaultRateCents(supabase, {
    organizationId: currentUser.organizationId,
    rateCents: parsed.data.rateCents,
    actorProfileId: currentUser.profileId,
  });
}

export async function setPayrollRateOverrideAction(input: {
  restaurantSlug: string;
  neonUserId: number;
  rateCents: number;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      neonUserId: neonUserIdSchema,
      rateCents: rateCentsSchema,
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const currentUser = await requirePayrollManager(parsed.data.restaurantSlug);
  if (!currentUser) return { ok: false, error: NOT_MANAGER_ERROR };

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  return setPayrollRateOverrideCents(supabase, {
    organizationId: currentUser.organizationId,
    neonUserId: parsed.data.neonUserId,
    rateCents: parsed.data.rateCents,
    actorProfileId: currentUser.profileId,
  });
}

export async function removePayrollRateOverrideAction(input: {
  restaurantSlug: string;
  neonUserId: number;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      neonUserId: neonUserIdSchema,
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const currentUser = await requirePayrollManager(parsed.data.restaurantSlug);
  if (!currentUser) return { ok: false, error: NOT_MANAGER_ERROR };

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  return removePayrollRateOverride(supabase, {
    organizationId: currentUser.organizationId,
    neonUserId: parsed.data.neonUserId,
  });
}

export async function listPayrollPeriodsAction(input: {
  restaurantSlug: string;
  periodMonth?: string;
}): Promise<ActionResult<PayrollPeriod[]>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      periodMonth: periodMonthSchema.optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const currentUser = await requirePayrollManager(parsed.data.restaurantSlug);
  if (!currentUser) return { ok: false, error: NOT_MANAGER_ERROR };

  const supabase = await createClient();
  return listPayrollPeriods(supabase, {
    organizationId: currentUser.organizationId,
    periodMonth: parsed.data.periodMonth,
  });
}

/**
 * Fetches this month's Neon hours for one person and computes gross cents
 * -- the one piece of logic generate and regenerate both need identically.
 * Never called with a rate resolved from anywhere but the CURRENT
 * payroll_rates/payroll_settings state, per the spec's hard question 4
 * answer (a rate change only ever affects what a future generate/
 * regenerate computes, never an already-generated snapshot).
 */
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
}): Promise<ActionResult<PayrollPeriod>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      neonUserId: neonUserIdSchema,
      periodMonth: periodMonthSchema,
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const currentUser = await requirePayrollManager(parsed.data.restaurantSlug);
  if (!currentUser) return { ok: false, error: NOT_MANAGER_ERROR };

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const periodMonth = normalizePeriodMonth(parsed.data.periodMonth);

  const existing = await getPayrollPeriod(supabase, {
    organizationId: currentUser.organizationId,
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
    organizationId: currentUser.organizationId,
    neonUserId: parsed.data.neonUserId,
    periodMonth,
  });
  if (!snapshot.ok) return snapshot;

  return generatePayrollPeriod(supabase, {
    organizationId: currentUser.organizationId,
    neonUserId: parsed.data.neonUserId,
    periodMonth,
    ...snapshot.data,
    actorProfileId: currentUser.profileId,
  });
}

export async function regeneratePayrollPeriodAction(input: {
  restaurantSlug: string;
  periodId: number;
}): Promise<ActionResult<PayrollPeriod>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      periodId: z.number().int().positive(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const currentUser = await requirePayrollManager(parsed.data.restaurantSlug);
  if (!currentUser) return { ok: false, error: NOT_MANAGER_ERROR };

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const periodResult = await getPayrollPeriodById(supabase, {
    periodId: parsed.data.periodId,
  });
  if (!periodResult.ok) return { ok: false, error: periodResult.error };
  const period = periodResult.data;
  // Not found, or belongs to a different organization -- RLS would already
  // block the write below either way, but this gives a clear message
  // instead of a raw "no rows updated" surprise.
  if (!period || period.organizationId !== currentUser.organizationId) {
    return { ok: false, error: "That payroll period could not be found." };
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
      error: `Cannot regenerate: ${paymentCount.data} payment${paymentCount.data === 1 ? "" : "s"} already recorded against this period. Use a manual adjustment instead once that's built.`,
    };
  }

  const snapshot = await computeSnapshot(supabase, {
    organizationId: currentUser.organizationId,
    neonUserId: period.neonUserId,
    periodMonth: period.periodMonth,
  });
  if (!snapshot.ok) return snapshot;

  return regeneratePayrollPeriod(supabase, {
    period,
    ...snapshot.data,
    actorProfileId: currentUser.profileId,
  });
}

export async function lockPayrollPeriodAction(input: {
  restaurantSlug: string;
  periodId: number;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      periodId: z.number().int().positive(),
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const currentUser = await requirePayrollManager(parsed.data.restaurantSlug);
  if (!currentUser) return { ok: false, error: NOT_MANAGER_ERROR };

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const periodResult = await getPayrollPeriodById(supabase, {
    periodId: parsed.data.periodId,
  });
  if (!periodResult.ok) return { ok: false, error: periodResult.error };
  const period = periodResult.data;
  if (!period || period.organizationId !== currentUser.organizationId) {
    return { ok: false, error: "That payroll period could not be found." };
  }
  if (period.status === "locked") {
    return { ok: false, error: "This payroll period is already locked." };
  }

  return lockPayrollPeriod(supabase, {
    periodId: period.id,
    organizationId: currentUser.organizationId,
    actorProfileId: currentUser.profileId,
  });
}
