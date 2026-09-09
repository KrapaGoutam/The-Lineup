"use server";

import { z } from "zod";

import type { SignedInUser } from "@/components/login-screen";
import {
  getActiveNeonUsers,
  getAttendanceRows,
  type NeonUser,
} from "@/features/attendance/data/attendance-data";
import { aggregateHours } from "@/features/attendance/domain/attendance-report";
import { getOwnAttendanceLink } from "@/features/attendance/data/identity-links";
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
  type PayrollAdjustment,
  type PayrollBalance,
  type PayrollPayment,
  type PayrollPeriod,
} from "@/features/payroll/data/payroll-data";
import { getCurrentUser } from "@/lib/current-user";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; sessionInvalid?: true };

const NOT_SIGNED_IN_ERROR = "You need to sign in to see payroll.";
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

export type PayrollAccess =
  | { scope: "all" }
  | { scope: "self"; neonUserId: number }
  | { scope: "unlinked" };

/**
 * Feature 020 Phase 3. The sole authority for payroll scope, resolved
 * fresh server-side on every action -- identical shape and identical
 * source of truth to attendance's `resolveAttendanceAccess`
 * (attendance-actions.ts), reusing the exact same
 * `attendance_identity_links` row via `getOwnAttendanceLink` rather than
 * a second linking mechanism. Write actions (rates, generate/regenerate/
 * lock, recording a payment or an adjustment, confirming/editing/deleting
 * a payment) all still require `scope === "all"` -- a regular member
 * never generates their own payroll, sets their own rate, or writes
 * anything on this feature, only reads their own. Read actions
 * (listing periods, the ledger/balance for one period) accept "self" too,
 * and lean on `payroll_periods`/`payroll_payments`/`payroll_adjustments`'
 * own RLS self-select policies to do the actual row-scoping -- the same
 * query runs for a privileged or a self-scoped caller; RLS decides what
 * comes back, not a second app-layer filter that could disagree with it.
 */
async function resolvePayrollAccess(
  restaurantSlug: string,
): Promise<{ user: SignedInUser; access: PayrollAccess } | null> {
  const currentUser = await getCurrentUser(restaurantSlug);
  if (!currentUser) return null;
  if (currentUser.role !== "server") {
    return { user: currentUser, access: { scope: "all" } };
  }

  const supabase = await createClient();
  const link = await getOwnAttendanceLink(supabase, {
    organizationId: currentUser.organizationId,
    profileId: currentUser.profileId,
  });
  if (!link.ok || !link.data) {
    return { user: currentUser, access: { scope: "unlinked" } };
  }
  return {
    user: currentUser,
    access: { scope: "self", neonUserId: link.data.neonUserId },
  };
}

/** Privileged-only actions (every write in this file) still use this. */
async function requirePayrollManager(
  restaurantSlug: string,
): Promise<SignedInUser | null> {
  const resolved = await resolvePayrollAccess(restaurantSlug);
  if (!resolved || resolved.access.scope !== "all") return null;
  return resolved.user;
}

export type PayrollAccessView =
  | { scope: "all" }
  | { scope: "self"; neonUserId: number; person: NeonUser | null }
  | { scope: "unlinked" };

/** Tells the client what to render -- never what to enforce, exactly like attendance's getAttendanceAccessAction. */
export async function getPayrollAccessAction(input: {
  restaurantSlug: string;
}): Promise<ActionResult<PayrollAccessView>> {
  const parsed = z
    .object({ restaurantSlug: restaurantSlugSchema })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const resolved = await resolvePayrollAccess(parsed.data.restaurantSlug);
  if (!resolved) return { ok: false, error: NOT_SIGNED_IN_ERROR };
  const { access } = resolved;
  if (access.scope !== "self") return { ok: true, data: access };

  const usersResult = await getActiveNeonUsers();
  const person = usersResult.ok
    ? (usersResult.data.find((user) => user.id === access.neonUserId) ?? null)
    : null;
  return {
    ok: true,
    data: { scope: "self", neonUserId: access.neonUserId, person },
  };
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

  const resolved = await resolvePayrollAccess(parsed.data.restaurantSlug);
  if (!resolved) return { ok: false, error: NOT_SIGNED_IN_ERROR };
  if (resolved.access.scope === "unlinked") return { ok: true, data: [] };

  // Identical query for "all" and "self" -- payroll_periods_select_self's
  // own RLS is what actually restricts a self-scoped caller to their own
  // linked periods; this action does not duplicate that filter.
  const supabase = await createClient();
  return listPayrollPeriods(supabase, {
    organizationId: resolved.user.organizationId,
    periodMonth: parsed.data.periodMonth,
  });
}

export type PayrollLedger = {
  period: PayrollPeriod;
  payments: PayrollPayment[];
  adjustments: PayrollAdjustment[];
  balance: PayrollBalance;
  /** Feature 020 Phase 5: for the printed/exported statement header. */
  organizationName: string;
};

/**
 * The full ledger for one period: the frozen snapshot, every payment
 * (confirmed-only for a self-scoped caller, both statuses for privileged
 * -- again purely a consequence of `payroll_payments`' own RLS, not an
 * app-layer filter here), every adjustment, and the computed balance.
 * `payment_date` is never part of how any of this is selected -- see
 * `listPaymentsForPeriod`'s own comment in payroll-data.ts.
 */
export async function getPayrollLedgerAction(input: {
  restaurantSlug: string;
  periodId: number;
}): Promise<ActionResult<PayrollLedger>> {
  const parsed = z
    .object({ restaurantSlug: restaurantSlugSchema, periodId: periodIdSchema })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const resolved = await resolvePayrollAccess(parsed.data.restaurantSlug);
  if (!resolved) return { ok: false, error: NOT_SIGNED_IN_ERROR };
  if (resolved.access.scope === "unlinked") {
    return { ok: false, error: "That payroll period could not be found." };
  }

  const supabase = await createClient();
  const periodResult = await getPayrollPeriodById(supabase, {
    periodId: parsed.data.periodId,
  });
  if (!periodResult.ok) return { ok: false, error: periodResult.error };
  const period = periodResult.data;
  if (!period || period.organizationId !== resolved.user.organizationId) {
    return { ok: false, error: "That payroll period could not be found." };
  }
  // Defense in depth beyond RLS: a self-scoped caller only ever gets a
  // period belonging to their own linked Neon id, checked explicitly here
  // too, not solely relied on from the select policy.
  if (
    resolved.access.scope === "self" &&
    period.neonUserId !== resolved.access.neonUserId
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
      organizationId: resolved.user.organizationId,
    }),
  ]);
  if (!paymentsResult.ok) return { ok: false, error: paymentsResult.error };
  if (!adjustmentsResult.ok)
    return { ok: false, error: adjustmentsResult.error };
  if (!balanceResult.ok) return { ok: false, error: balanceResult.error };
  if (!organizationNameResult.ok)
    return { ok: false, error: organizationNameResult.error };

  return {
    ok: true,
    data: {
      period,
      payments: paymentsResult.data,
      adjustments: adjustmentsResult.data,
      balance: balanceResult.data,
      organizationName: organizationNameResult.data,
    },
  };
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
      error: `Cannot regenerate: ${paymentCount.data} payment${paymentCount.data === 1 ? "" : "s"} already recorded against this period. Record a manual adjustment instead.`,
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

// -- Payments ---------------------------------------------------------------

/**
 * Records a payment AGAINST a target period, identified only by
 * `periodId` -- `paymentDate` is stored purely as metadata (when the
 * money changed hands) and never used to derive, validate, or restrict
 * which period this reduces. A payment dated any month can target any
 * period; nothing here checks the two against each other.
 */
export async function recordPaymentAction(input: {
  restaurantSlug: string;
  periodId: number;
  amountCents: number;
  paymentDate: string;
  comment?: string | null;
}): Promise<ActionResult<PayrollPayment>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      periodId: periodIdSchema,
      amountCents: amountCentsSchema,
      paymentDate: paymentDateSchema,
      comment: commentSchema,
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

  return recordPayment(supabase, {
    organizationId: currentUser.organizationId,
    periodId: period.id,
    amountCents: parsed.data.amountCents,
    paymentDate: parsed.data.paymentDate,
    comment: parsed.data.comment ?? null,
    actorProfileId: currentUser.profileId,
  });
}

export async function editDraftPaymentAction(input: {
  restaurantSlug: string;
  paymentId: number;
  amountCents: number;
  paymentDate: string;
  comment?: string | null;
}): Promise<ActionResult<PayrollPayment>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      paymentId: paymentIdSchema,
      amountCents: amountCentsSchema,
      paymentDate: paymentDateSchema,
      comment: commentSchema,
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const currentUser = await requirePayrollManager(parsed.data.restaurantSlug);
  if (!currentUser) return { ok: false, error: NOT_MANAGER_ERROR };

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const paymentResult = await getPaymentById(supabase, {
    paymentId: parsed.data.paymentId,
  });
  if (!paymentResult.ok) return { ok: false, error: paymentResult.error };
  const payment = paymentResult.data;
  if (!payment || payment.organizationId !== currentUser.organizationId) {
    return { ok: false, error: "That payment could not be found." };
  }
  // The database trigger is the real backstop; this just gives a clear
  // message instead of letting a confirmed-row edit surface as a raw
  // Postgres error.
  if (payment.status === "confirmed") {
    return {
      ok: false,
      error:
        "This payment is confirmed and can no longer be edited. Record a manual adjustment instead.",
    };
  }

  return editDraftPayment(supabase, {
    payment,
    amountCents: parsed.data.amountCents,
    paymentDate: parsed.data.paymentDate,
    comment: parsed.data.comment ?? null,
    actorProfileId: currentUser.profileId,
  });
}

export async function deleteDraftPaymentAction(input: {
  restaurantSlug: string;
  paymentId: number;
}): Promise<ActionResult<null>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      paymentId: paymentIdSchema,
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const currentUser = await requirePayrollManager(parsed.data.restaurantSlug);
  if (!currentUser) return { ok: false, error: NOT_MANAGER_ERROR };

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const paymentResult = await getPaymentById(supabase, {
    paymentId: parsed.data.paymentId,
  });
  if (!paymentResult.ok) return { ok: false, error: paymentResult.error };
  const payment = paymentResult.data;
  if (!payment || payment.organizationId !== currentUser.organizationId) {
    return { ok: false, error: "That payment could not be found." };
  }
  if (payment.status === "confirmed") {
    return {
      ok: false,
      error:
        "This payment is confirmed and can no longer be deleted. Record a manual adjustment instead.",
    };
  }

  return deleteDraftPayment(supabase, {
    payment,
    actorProfileId: currentUser.profileId,
  });
}

export async function confirmPaymentAction(input: {
  restaurantSlug: string;
  paymentId: number;
}): Promise<ActionResult<PayrollPayment>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      paymentId: paymentIdSchema,
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const currentUser = await requirePayrollManager(parsed.data.restaurantSlug);
  if (!currentUser) return { ok: false, error: NOT_MANAGER_ERROR };

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return sessionCheck;

  const paymentResult = await getPaymentById(supabase, {
    paymentId: parsed.data.paymentId,
  });
  if (!paymentResult.ok) return { ok: false, error: paymentResult.error };
  const payment = paymentResult.data;
  if (!payment || payment.organizationId !== currentUser.organizationId) {
    return { ok: false, error: "That payment could not be found." };
  }
  if (payment.status === "confirmed") {
    return { ok: false, error: "This payment is already confirmed." };
  }

  return confirmPayment(supabase, {
    payment,
    actorProfileId: currentUser.profileId,
  });
}

// -- Adjustments --------------------------------------------------------------

/**
 * The escape hatch for a wrong CONFIRMED payment (frozen, per the two
 * triggers on payroll_payments) and for a wrong generated snapshot once
 * regeneration is blocked (per forbid_payroll_period_snapshot_edit) --
 * never an edit to either. A signed delta plus a mandatory reason,
 * targeting a period the same way a payment does: by `periodId`, nothing
 * else.
 */
export async function recordAdjustmentAction(input: {
  restaurantSlug: string;
  periodId: number;
  deltaCents: number;
  reason: string;
}): Promise<ActionResult<PayrollAdjustment>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      periodId: periodIdSchema,
      deltaCents: deltaCentsSchema,
      reason: reasonSchema,
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

  return recordAdjustment(supabase, {
    organizationId: currentUser.organizationId,
    periodId: period.id,
    deltaCents: parsed.data.deltaCents,
    reason: parsed.data.reason,
    actorProfileId: currentUser.profileId,
  });
}

// -- Dashboard ----------------------------------------------------------

export type PayrollDashboardPerson = {
  neonUserId: number;
  /**
   * Net across every one of this person's periods (gross - confirmed
   * payments - adjustments, summed) -- can be negative if they've been
   * overpaid. Unlike the org-wide `totalBalanceOwedCents` below, this is
   * NOT clamped per period before summing, since "does this person owe
   * money or were they overpaid" is a real, useful distinction to show
   * for one person that a clamped aggregate would hide.
   */
  balanceCents: number;
  /** Sum of gross_cents across every one of this person's periods, all-time. */
  totalGeneratedCents: number;
};

export type PayrollDashboard = {
  /**
   * Sum, across every period in the organization, of that period's
   * balance clamped to zero before summing -- an overpaid period for one
   * person never offsets what's still owed to someone else (or even to
   * that same person in a different month). "How much more do I need to
   * pay out, in total" is the question this answers.
   */
  totalBalanceOwedCents: number;
  /** Sum of gross_cents for periods whose period_month is literally last
   * calendar month (relative to `todayLocalDate`) -- a fixed reference
   * point, independent of any period/person filter elsewhere on the page. */
  previousMonthGeneratedCents: number;
  /**
   * Feature 026. Outstanding (not gross-generated) balance for the
   * current/previous calendar month's periods -- a genuinely different
   * figure from `previousMonthGeneratedCents` above (a fully-paid period
   * contributes zero here, not its original gross amount). See
   * `computeOwedForMonth`'s own doc comment.
   */
  owedThisMonthCents: number;
  owedLastMonthCents: number;
  /** The chronologically earliest period with a positive outstanding
   * balance, or null once everything is settled. See
   * `findOldestOpenPeriod`. */
  oldestOpenPeriod: OldestOpenPeriod | null;
  perPerson: PayrollDashboardPerson[];
  /** Feature 026. Every period in scope (RLS already limits this to the
   * org for a privileged caller, or just the caller's own locked
   * periods for a self-scoped one), each carrying its own already-
   * computed `balanceCents` -- what the grouped-by-person view renders
   * from, reusing this exact fetch rather than a second N+1 balance
   * query. */
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

/**
 * Feature 020 Phase 4. Read-only aggregation -- no write anywhere in this
 * function. Every figure is derived from `listPayrollPeriods` (RLS-scoped
 * to "every period in the org" for a privileged caller, "only my own
 * linked periods" for a self-scoped one -- the identical query, same as
 * every other Phase 3 read action) and `getPayrollBalance` per period,
 * the exact same function `getPayrollLedgerAction` already uses. Nothing
 * here re-derives balance a second way from a raw payments/adjustments
 * aggregation that could disagree with Phase 3's proven-correct,
 * period-keyed calculation -- every number here traces back to either
 * `period.grossCents` (the frozen snapshot itself) or a `getPayrollBalance`
 * result, both keyed on `payroll_period_id`.
 */
export async function getPayrollDashboardAction(input: {
  restaurantSlug: string;
  todayLocalDate: string;
}): Promise<ActionResult<PayrollDashboard>> {
  const parsed = z
    .object({
      restaurantSlug: restaurantSlugSchema,
      todayLocalDate: periodMonthSchema,
    })
    .safeParse(input);
  if (!parsed.success) return invalidRequest();

  const resolved = await resolvePayrollAccess(parsed.data.restaurantSlug);
  if (!resolved) return { ok: false, error: NOT_SIGNED_IN_ERROR };
  if (resolved.access.scope === "unlinked") {
    return { ok: true, data: EMPTY_DASHBOARD };
  }

  const supabase = await createClient();
  const periodsResult = await listPayrollPeriods(supabase, {
    organizationId: resolved.user.organizationId,
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
    if (!balanceResult.ok) return; // unreachable -- already checked above
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
