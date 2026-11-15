"use server";

import { z } from "zod";

import {
  evaluateFinancialActivation,
  resolveFinancialSource,
} from "@/features/attendance/domain/financial-source";
import { assertWorkspaceExpectation } from "@/features/context/data/workspace-expectation";
import { STALE_CONTEXT_MESSAGE } from "@/features/context/domain/workspace-expectation";
import { guardModule } from "@/features/modules/data/module-enforcement";
import {
  generateNativePayrollPeriod,
  getSourceTransitionReadiness,
  listConsumptionReviews,
  raiseConsumptionReviews,
  resolveConsumptionReview,
  type ConsumptionReview,
  type NativeGenerationOutcome,
  type SourceTransitionReadiness,
} from "@/features/payroll/data/native-payroll-data";
import {
  getPayrollActor,
  type PayrollActor,
} from "@/features/payroll/data/payroll-actor";
import { firstOfMonth } from "@/features/payroll/domain/native-payroll";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

/**
 * V2-006 R2 — server actions for native (profile-keyed) Payroll. They are THIN: identity,
 * eligibility, hours, rate, rounding, the consumption ledger and the cross-key guard all live
 * in the database. These actions verify the caller, apply the recorded owner-policy gate and
 * relay one atomic database call.
 *
 * Nothing here can pay anyone: it creates/regenerates a DRAFT period, records review
 * decisions, and reads readiness. Real payments stay in the existing audited payment flow.
 *
 * "use server": only async functions may be exported.
 */

export type NativePayrollActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      code?: string;
      sessionInvalid?: true;
      moduleUnavailable?: true;
      contextStale?: true;
    };

const NOT_SIGNED_IN_ERROR = "You need to sign in to see payroll.";
const NOT_ORG_MANAGER_ERROR =
  "Native payroll needs organization-wide payroll authority.";
const NOT_ACTIVATED_ERROR =
  "Native attendance is not enabled for payroll yet. Nothing was changed.";

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const uuidSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const idSchema = z.number().int().positive();
const noteSchema = z.string().trim().min(3).max(500);

function invalid<T>(): NativePayrollActionResult<T> {
  return { ok: false, error: "That payroll request is invalid." };
}

async function checkWorkspace(raw: unknown, caller: PayrollActor) {
  if (!caller.scope.locationId) return { ok: true as const };
  const expectation = raw ?? {
    profileId: caller.viewer.profileId,
    organizationId: caller.organizationId,
    locationId: caller.scope.locationId,
  };
  const outcome = await assertWorkspaceExpectation(
    expectation,
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
  if (outcome.ok) return { ok: true as const };
  if (outcome.code === "invalid") {
    return { ok: false as const, result: invalid<never>() };
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

/**
 * Caller, workspace, module and live-session checks shared by every action here. Returns the
 * org-wide manager, or the failure to hand straight back to the client.
 */
async function authorize(
  restaurantSlug: string,
  expectedContext: unknown,
): Promise<
  | {
      ok: true;
      actor: PayrollActor;
      supabase: Awaited<ReturnType<typeof createClient>>;
    }
  | { ok: false; result: NativePayrollActionResult<never> }
> {
  const actor = await getPayrollActor(restaurantSlug);
  if (!actor)
    return { ok: false, result: { ok: false, error: NOT_SIGNED_IN_ERROR } };
  if (!actor.canManage || !actor.isOrgManager) {
    return { ok: false, result: { ok: false, error: NOT_ORG_MANAGER_ERROR } };
  }

  const workspace = await checkWorkspace(expectedContext, actor);
  if (!workspace.ok) return { ok: false, result: workspace.result };

  const blocked = await guardModule({
    module: "payroll",
    organizationId: actor.organizationId,
    location: actor.scope.locationId ? { id: actor.scope.locationId } : null,
  });
  if (blocked) return { ok: false, result: blocked };

  const supabase = await createClient();
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) return { ok: false, result: sessionCheck };
  return { ok: true, actor, supabase };
}

/** The recorded owner-policy gate. Native attendance is never consumed while it is closed. */
function nativeFinancialPolicyOpen(): boolean {
  return (
    evaluateFinancialActivation(resolveFinancialSource("internal_the_lineup"))
      .status === "ACTIVE"
  );
}

export async function generateNativePayrollPeriodAction(input: {
  restaurantSlug: string;
  profileId: string;
  periodMonth: string;
  expectedContext?: unknown;
}): Promise<NativePayrollActionResult<NativeGenerationOutcome>> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      profileId: uuidSchema,
      periodMonth: z.iso.date(),
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalid();

  const auth = await authorize(
    parsed.data.restaurantSlug,
    parsed.data.expectedContext,
  );
  if (!auth.ok) return auth.result;

  // Application-level policy gate (the database has its own independent switch).
  if (!nativeFinancialPolicyOpen()) {
    return { ok: false, error: NOT_ACTIVATED_ERROR, code: "not_activated" };
  }

  const result = await generateNativePayrollPeriod(auth.supabase, {
    organizationId: auth.actor.organizationId,
    profileId: parsed.data.profileId,
    periodMonth: firstOfMonth(parsed.data.periodMonth),
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error.message,
      code: result.error.code,
    };
  }
  return { ok: true, data: result.data };
}

/**
 * Lists the corrections that reached a frozen period, raising any that are newly detected.
 * Read-and-record only: no snapshot, payment or adjustment is created or changed.
 */
export async function getConsumptionReviewsAction(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
}): Promise<NativePayrollActionResult<ConsumptionReview[]>> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalid();

  const auth = await authorize(
    parsed.data.restaurantSlug,
    parsed.data.expectedContext,
  );
  if (!auth.ok) return auth.result;

  const raised = await raiseConsumptionReviews(auth.supabase, {
    organizationId: auth.actor.organizationId,
  });
  if (!raised.ok) {
    return { ok: false, error: raised.error.message, code: raised.error.code };
  }
  const listed = await listConsumptionReviews(auth.supabase, {
    organizationId: auth.actor.organizationId,
  });
  if (!listed.ok) {
    return { ok: false, error: listed.error.message, code: listed.error.code };
  }
  return { ok: true, data: listed.data };
}

export async function resolveConsumptionReviewAction(input: {
  restaurantSlug: string;
  reviewId: number;
  decision: "no_adjustment_needed" | "adjustment_recorded";
  note: string;
  payrollAdjustmentId?: number | null;
  expectedContext?: unknown;
}): Promise<
  NativePayrollActionResult<{ state: string; deltaNetSeconds: number | null }>
> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      reviewId: idSchema,
      decision: z.enum(["no_adjustment_needed", "adjustment_recorded"]),
      note: noteSchema,
      payrollAdjustmentId: idSchema.nullable().optional(),
      expectedContext: z.unknown().optional(),
    })
    .refine((v) =>
      v.decision === "adjustment_recorded"
        ? v.payrollAdjustmentId != null
        : v.payrollAdjustmentId == null,
    )
    .safeParse(input);
  if (!parsed.success) return invalid();

  const auth = await authorize(
    parsed.data.restaurantSlug,
    parsed.data.expectedContext,
  );
  if (!auth.ok) return auth.result;

  const result = await resolveConsumptionReview(auth.supabase, {
    reviewId: parsed.data.reviewId,
    decision: parsed.data.decision,
    note: parsed.data.note,
    payrollAdjustmentId: parsed.data.payrollAdjustmentId ?? null,
  });
  if (!result.ok) {
    return { ok: false, error: result.error.message, code: result.error.code };
  }
  return { ok: true, data: result.data };
}

/** Read-only: what would block changing this location's attendance source right now. */
export async function getSourceTransitionReadinessAction(input: {
  restaurantSlug: string;
  locationId: string;
  targetMode: "external" | "internal_the_lineup" | "disabled";
  expectedContext?: unknown;
}): Promise<NativePayrollActionResult<SourceTransitionReadiness>> {
  const parsed = z
    .object({
      restaurantSlug: slugSchema,
      locationId: uuidSchema,
      targetMode: z.enum(["external", "internal_the_lineup", "disabled"]),
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return invalid();

  const auth = await authorize(
    parsed.data.restaurantSlug,
    parsed.data.expectedContext,
  );
  if (!auth.ok) return auth.result;

  const result = await getSourceTransitionReadiness(auth.supabase, {
    locationId: parsed.data.locationId,
    targetMode: parsed.data.targetMode,
  });
  if (!result.ok) {
    return { ok: false, error: result.error.message, code: result.error.code };
  }
  return { ok: true, data: result.data };
}
