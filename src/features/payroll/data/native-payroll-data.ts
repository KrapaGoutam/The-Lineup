import "server-only";

import {
  mapNativePayrollError,
  type NativePayrollError,
} from "@/features/payroll/domain/native-payroll";
import type { createClient } from "@/lib/supabase/server";

type TypedSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type NativePayrollResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: NativePayrollError };

export type NativeGenerationOutcome = {
  periodId: number;
  outcome: "created" | "regenerated" | "unchanged";
  hours: number;
  rateCents: number;
  grossCents: number;
  sessions: number;
};

export type ConsumptionReviewState =
  | "pending_review"
  | "no_adjustment_needed"
  | "adjustment_recorded"
  | "superseded_by_newer_version";

export type ConsumptionReview = {
  id: number;
  periodId: number;
  sessionId: string;
  profileId: string;
  locationId: string;
  consumedVersion: number;
  observedVersion: number;
  observedVoided: boolean;
  state: ConsumptionReviewState;
  deltaNetSeconds: number | null;
  decisionNote: string | null;
  payrollAdjustmentId: number | null;
  createdAt: string;
};

const REVIEW_COLUMNS =
  "id, period_id, session_id, profile_id, location_id, consumed_version, observed_version, observed_voided, state, delta_net_seconds, decision_note, payroll_adjustment_id, created_at";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Calls the database's single atomic generation entry point. All three arguments are always
 * sent (PostgREST resolves the function by its full argument list). Nothing here computes
 * hours, rates or pay: the database proves eligibility, writes the period and the
 * consumption ledger in one transaction, or writes nothing.
 */
export async function generateNativePayrollPeriod(
  supabase: TypedSupabaseClient,
  input: { organizationId: string; profileId: string; periodMonth: string },
): Promise<NativePayrollResult<NativeGenerationOutcome>> {
  const { data, error } = await supabase.rpc("payroll_generate_native_period", {
    p_organization_id: input.organizationId,
    p_profile_id: input.profileId,
    p_period_month: input.periodMonth,
  });
  if (error) return { ok: false, error: mapNativePayrollError(error) };
  if (!isRecord(data) || typeof data.periodId !== "number") {
    return { ok: false, error: mapNativePayrollError(null) };
  }
  return {
    ok: true,
    data: {
      periodId: data.periodId,
      outcome: data.outcome as NativeGenerationOutcome["outcome"],
      hours: Number(data.hours),
      rateCents: Number(data.rateCents),
      grossCents: Number(data.grossCents),
      sessions: Number(data.sessions),
    },
  };
}

/** Raises a pending review for every correction that reached a frozen period (idempotent). */
export async function raiseConsumptionReviews(
  supabase: TypedSupabaseClient,
  input: { organizationId: string },
): Promise<NativePayrollResult<{ raised: number }>> {
  const { data, error } = await supabase.rpc(
    "payroll_raise_consumption_reviews",
    { p_organization_id: input.organizationId },
  );
  if (error) return { ok: false, error: mapNativePayrollError(error) };
  return { ok: true, data: { raised: typeof data === "number" ? data : 0 } };
}

export async function listConsumptionReviews(
  supabase: TypedSupabaseClient,
  input: { organizationId: string; state?: ConsumptionReviewState },
): Promise<NativePayrollResult<ConsumptionReview[]>> {
  let query = supabase
    .from("payroll_attendance_consumption_reviews")
    .select(REVIEW_COLUMNS)
    .eq("organization_id", input.organizationId)
    .order("id", { ascending: false });
  if (input.state) query = query.eq("state", input.state);
  const { data, error } = await query;
  if (error) return { ok: false, error: mapNativePayrollError(error) };
  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      periodId: row.period_id,
      sessionId: row.session_id,
      profileId: row.profile_id,
      locationId: row.location_id,
      consumedVersion: row.consumed_version,
      observedVersion: row.observed_version,
      observedVoided: row.observed_voided,
      state: row.state as ConsumptionReviewState,
      deltaNetSeconds: row.delta_net_seconds,
      decisionNote: row.decision_note,
      payrollAdjustmentId: row.payroll_adjustment_id,
      createdAt: row.created_at,
    })),
  };
}

/**
 * Records the decision on a review. An adjustment is only LINKED (it is created through the
 * existing audited payroll adjustment flow); this call creates no payment, no deduction and
 * changes no snapshot.
 */
export async function resolveConsumptionReview(
  supabase: TypedSupabaseClient,
  input: {
    reviewId: number;
    decision: "no_adjustment_needed" | "adjustment_recorded";
    note: string;
    payrollAdjustmentId: number | null;
  },
): Promise<
  NativePayrollResult<{ state: string; deltaNetSeconds: number | null }>
> {
  const { data, error } = await supabase.rpc(
    "payroll_resolve_consumption_review",
    {
      p_review_id: input.reviewId,
      p_decision: input.decision,
      p_note: input.note,
      ...(input.payrollAdjustmentId === null
        ? {}
        : { p_payroll_adjustment_id: input.payrollAdjustmentId }),
    },
  );
  if (error) return { ok: false, error: mapNativePayrollError(error) };
  if (!isRecord(data) || typeof data.state !== "string") {
    return { ok: false, error: mapNativePayrollError(null) };
  }
  return {
    ok: true,
    data: {
      state: data.state,
      deltaNetSeconds:
        typeof data.deltaNetSeconds === "number" ? data.deltaNetSeconds : null,
    },
  };
}

export type SourceTransitionReadiness = {
  blocked: boolean;
  blockers: string[];
  enforced: boolean;
  timeZone: string;
  locationLocalDate: string;
  effectivePeriodMonth: string;
  counts: Record<string, number>;
  warnings: Record<string, number>;
};

export async function getSourceTransitionReadiness(
  supabase: TypedSupabaseClient,
  input: {
    locationId: string;
    targetMode: "external" | "internal_the_lineup" | "disabled";
  },
): Promise<NativePayrollResult<SourceTransitionReadiness>> {
  const { data, error } = await supabase.rpc(
    "payroll_source_transition_readiness",
    { p_location_id: input.locationId, p_target_mode: input.targetMode },
  );
  if (error) return { ok: false, error: mapNativePayrollError(error) };
  if (!isRecord(data)) return { ok: false, error: mapNativePayrollError(null) };
  const numbers = (value: unknown): Record<string, number> =>
    isRecord(value)
      ? Object.fromEntries(
          Object.entries(value).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number",
          ),
        )
      : {};
  return {
    ok: true,
    data: {
      blocked: data.blocked === true,
      blockers: Array.isArray(data.blockers)
        ? data.blockers.filter((b): b is string => typeof b === "string")
        : [],
      enforced: data.enforced === true,
      timeZone: String(data.time_zone ?? ""),
      locationLocalDate: String(data.location_local_date ?? ""),
      effectivePeriodMonth: String(data.effective_period_month ?? ""),
      counts: numbers(data.counts),
      warnings: numbers(data.warnings),
    },
  };
}
