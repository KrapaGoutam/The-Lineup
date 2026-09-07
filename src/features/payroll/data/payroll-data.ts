import "server-only";

import type { createClient } from "@/lib/supabase/server";

// Matches the client `createClient()` actually returns (untyped against the
// generated Database schema, same as every other data-layer module in this
// app -- e.g. identity-links.ts's identical local alias).
type TypedSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type PayrollResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const UNAVAILABLE_ERROR = "Unable to reach payroll data right now.";

export type PayrollPeriod = {
  id: number;
  organizationId: string;
  neonUserId: number;
  periodMonth: string;
  hoursSnapshot: number;
  rateCentsSnapshot: number;
  grossCents: number;
  status: "draft" | "locked";
  generatedAt: string;
  generatedBy: string;
  regeneratedAt: string | null;
  regeneratedBy: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
};

function mapPeriodRow(row: {
  id: number;
  organization_id: string;
  neon_user_id: number;
  period_month: string;
  hours_snapshot: number | string;
  rate_cents_snapshot: number;
  gross_cents: number;
  status: string;
  generated_at: string;
  generated_by: string;
  regenerated_at: string | null;
  regenerated_by: string | null;
  locked_at: string | null;
  locked_by: string | null;
}): PayrollPeriod {
  return {
    id: row.id,
    organizationId: row.organization_id,
    neonUserId: row.neon_user_id,
    // period_month is a plain `date` column -- forced to text at the
    // query layer below the same way attendance.date is (see
    // attendance-data.ts's ATTENDANCE_QUERY_SQL comment), never left to
    // the driver's own timezone-dependent Date parsing.
    periodMonth: row.period_month,
    // Postgres numeric columns arrive as strings over the wire to avoid
    // float precision loss -- converted here, once.
    hoursSnapshot: Number(row.hours_snapshot),
    rateCentsSnapshot: row.rate_cents_snapshot,
    grossCents: row.gross_cents,
    status: row.status as "draft" | "locked",
    generatedAt: row.generated_at,
    generatedBy: row.generated_by,
    regeneratedAt: row.regenerated_at,
    regeneratedBy: row.regenerated_by,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
  };
}

async function recordAuditEvent(
  supabase: TypedSupabaseClient,
  input: {
    organizationId: string;
    actorProfileId: string;
    action: string;
    entityId: string;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
  },
): Promise<PayrollResult<null>> {
  const { error } = await supabase.from("audit_events").insert({
    organization_id: input.organizationId,
    actor_profile_id: input.actorProfileId,
    action: input.action,
    entity_type: "payroll_period",
    entity_id: input.entityId,
    before_state: input.beforeState,
    after_state: input.afterState,
  });
  if (error) {
    console.error("recordPayrollAuditEvent failed", error, input.action);
    return { ok: false, error: "Unable to record the payroll audit event." };
  }
  return { ok: true, data: null };
}

export async function getPayrollDefaultRateCents(
  supabase: TypedSupabaseClient,
  input: { organizationId: string },
): Promise<PayrollResult<number | null>> {
  const { data, error } = await supabase
    .from("payroll_settings")
    .select("default_rate_cents")
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (error) {
    console.error("getPayrollDefaultRateCents failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return { ok: true, data: data?.default_rate_cents ?? null };
}

export async function setPayrollDefaultRateCents(
  supabase: TypedSupabaseClient,
  input: { organizationId: string; rateCents: number; actorProfileId: string },
): Promise<PayrollResult<null>> {
  const { error } = await supabase.from("payroll_settings").upsert(
    {
      organization_id: input.organizationId,
      default_rate_cents: input.rateCents,
      updated_at: new Date().toISOString(),
      updated_by: input.actorProfileId,
    },
    { onConflict: "organization_id" },
  );
  if (error) {
    console.error("setPayrollDefaultRateCents failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return { ok: true, data: null };
}

export async function getPayrollRateOverrideCents(
  supabase: TypedSupabaseClient,
  input: { organizationId: string; neonUserId: number },
): Promise<PayrollResult<number | null>> {
  const { data, error } = await supabase
    .from("payroll_rates")
    .select("rate_cents")
    .eq("organization_id", input.organizationId)
    .eq("neon_user_id", input.neonUserId)
    .maybeSingle();
  if (error) {
    console.error("getPayrollRateOverrideCents failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return { ok: true, data: data?.rate_cents ?? null };
}

export async function listPayrollRateOverrides(
  supabase: TypedSupabaseClient,
  input: { organizationId: string },
): Promise<PayrollResult<Array<{ neonUserId: number; rateCents: number }>>> {
  const { data, error } = await supabase
    .from("payroll_rates")
    .select("neon_user_id, rate_cents")
    .eq("organization_id", input.organizationId);
  if (error) {
    console.error("listPayrollRateOverrides failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return {
    ok: true,
    data: data.map((row) => ({
      neonUserId: row.neon_user_id,
      rateCents: row.rate_cents,
    })),
  };
}

export async function setPayrollRateOverrideCents(
  supabase: TypedSupabaseClient,
  input: {
    organizationId: string;
    neonUserId: number;
    rateCents: number;
    actorProfileId: string;
  },
): Promise<PayrollResult<null>> {
  const { error } = await supabase.from("payroll_rates").upsert(
    {
      organization_id: input.organizationId,
      neon_user_id: input.neonUserId,
      rate_cents: input.rateCents,
      updated_at: new Date().toISOString(),
      updated_by: input.actorProfileId,
    },
    { onConflict: "organization_id,neon_user_id" },
  );
  if (error) {
    console.error("setPayrollRateOverrideCents failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return { ok: true, data: null };
}

export async function removePayrollRateOverride(
  supabase: TypedSupabaseClient,
  input: { organizationId: string; neonUserId: number },
): Promise<PayrollResult<null>> {
  const { error } = await supabase
    .from("payroll_rates")
    .delete()
    .eq("organization_id", input.organizationId)
    .eq("neon_user_id", input.neonUserId);
  if (error) {
    console.error("removePayrollRateOverride failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return { ok: true, data: null };
}

export async function getPayrollPeriod(
  supabase: TypedSupabaseClient,
  input: { organizationId: string; neonUserId: number; periodMonth: string },
): Promise<PayrollResult<PayrollPeriod | null>> {
  const { data, error } = await supabase
    .from("payroll_periods")
    .select(
      "id, organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, status, generated_at, generated_by, regenerated_at, regenerated_by, locked_at, locked_by",
    )
    .eq("organization_id", input.organizationId)
    .eq("neon_user_id", input.neonUserId)
    .eq("period_month", input.periodMonth)
    .maybeSingle();
  if (error) {
    console.error("getPayrollPeriod failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return { ok: true, data: data ? mapPeriodRow(data) : null };
}

export async function getPayrollPeriodById(
  supabase: TypedSupabaseClient,
  input: { periodId: number },
): Promise<PayrollResult<PayrollPeriod | null>> {
  const { data, error } = await supabase
    .from("payroll_periods")
    .select(
      "id, organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, status, generated_at, generated_by, regenerated_at, regenerated_by, locked_at, locked_by",
    )
    .eq("id", input.periodId)
    .maybeSingle();
  if (error) {
    console.error("getPayrollPeriodById failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return { ok: true, data: data ? mapPeriodRow(data) : null };
}

export async function listPayrollPeriods(
  supabase: TypedSupabaseClient,
  input: { organizationId: string; periodMonth?: string },
): Promise<PayrollResult<PayrollPeriod[]>> {
  let query = supabase
    .from("payroll_periods")
    .select(
      "id, organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, status, generated_at, generated_by, regenerated_at, regenerated_by, locked_at, locked_by",
    )
    .eq("organization_id", input.organizationId)
    .order("period_month", { ascending: false });
  if (input.periodMonth) {
    query = query.eq("period_month", input.periodMonth);
  }
  const { data, error } = await query;
  if (error) {
    console.error("listPayrollPeriods failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return { ok: true, data: data.map(mapPeriodRow) };
}

/**
 * Whether ANY payment (draft or confirmed) exists against a period -- the
 * single fact regeneratePayrollPeriod's guard depends on. Never distinguishes
 * draft from confirmed here: either one blocks regeneration, per the spec's
 * hard question 1 answer.
 */
export async function countPaymentsForPeriod(
  supabase: TypedSupabaseClient,
  input: { periodId: number },
): Promise<PayrollResult<number>> {
  const { count, error } = await supabase
    .from("payroll_payments")
    .select("id", { count: "exact", head: true })
    .eq("payroll_period_id", input.periodId);
  if (error) {
    console.error("countPaymentsForPeriod failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return { ok: true, data: count ?? 0 };
}

export async function generatePayrollPeriod(
  supabase: TypedSupabaseClient,
  input: {
    organizationId: string;
    neonUserId: number;
    periodMonth: string;
    hoursSnapshot: number;
    rateCentsSnapshot: number;
    grossCents: number;
    actorProfileId: string;
  },
): Promise<PayrollResult<PayrollPeriod>> {
  const { data, error } = await supabase
    .from("payroll_periods")
    .insert({
      organization_id: input.organizationId,
      neon_user_id: input.neonUserId,
      period_month: input.periodMonth,
      hours_snapshot: input.hoursSnapshot,
      rate_cents_snapshot: input.rateCentsSnapshot,
      gross_cents: input.grossCents,
      generated_by: input.actorProfileId,
    })
    .select(
      "id, organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, status, generated_at, generated_by, regenerated_at, regenerated_by, locked_at, locked_by",
    )
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error:
          "A payroll period already exists for this person and month -- use Regenerate instead.",
      };
    }
    console.error("generatePayrollPeriod failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }

  const period = mapPeriodRow(data);
  const audit = await recordAuditEvent(supabase, {
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: "payroll_period_generated",
    entityId: String(period.id),
    beforeState: null,
    afterState: {
      gross_cents: period.grossCents,
      hours_snapshot: period.hoursSnapshot,
    },
  });
  if (!audit.ok) {
    // Same compensating-write discipline as identity-links.ts: never claim
    // success for an unaudited financial record. Best effort, since
    // Supabase's Data API has no client-side multi-statement transaction.
    const { error: rollbackError } = await supabase
      .from("payroll_periods")
      .delete()
      .eq("id", period.id);
    if (rollbackError) {
      console.error("generatePayrollPeriod rollback failed", rollbackError);
    }
    return audit;
  }
  return { ok: true, data: period };
}

export async function regeneratePayrollPeriod(
  supabase: TypedSupabaseClient,
  input: {
    period: PayrollPeriod;
    hoursSnapshot: number;
    rateCentsSnapshot: number;
    grossCents: number;
    actorProfileId: string;
  },
): Promise<PayrollResult<PayrollPeriod>> {
  const { data, error } = await supabase
    .from("payroll_periods")
    .update({
      hours_snapshot: input.hoursSnapshot,
      rate_cents_snapshot: input.rateCentsSnapshot,
      gross_cents: input.grossCents,
      regenerated_at: new Date().toISOString(),
      regenerated_by: input.actorProfileId,
    })
    .eq("id", input.period.id)
    .select(
      "id, organization_id, neon_user_id, period_month, hours_snapshot, rate_cents_snapshot, gross_cents, status, generated_at, generated_by, regenerated_at, regenerated_by, locked_at, locked_by",
    )
    .single();
  if (error) {
    console.error("regeneratePayrollPeriod failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }

  const period = mapPeriodRow(data);
  const audit = await recordAuditEvent(supabase, {
    organizationId: period.organizationId,
    actorProfileId: input.actorProfileId,
    action: "payroll_period_regenerated",
    entityId: String(period.id),
    beforeState: { gross_cents: input.period.grossCents },
    afterState: { gross_cents: period.grossCents },
  });
  if (!audit.ok) {
    const { error: rollbackError } = await supabase
      .from("payroll_periods")
      .update({
        hours_snapshot: input.period.hoursSnapshot,
        rate_cents_snapshot: input.period.rateCentsSnapshot,
        gross_cents: input.period.grossCents,
        regenerated_at: input.period.regeneratedAt,
        regenerated_by: input.period.regeneratedBy,
      })
      .eq("id", period.id);
    if (rollbackError) {
      console.error("regeneratePayrollPeriod rollback failed", rollbackError);
    }
    return audit;
  }
  return { ok: true, data: period };
}

export async function lockPayrollPeriod(
  supabase: TypedSupabaseClient,
  input: { periodId: number; organizationId: string; actorProfileId: string },
): Promise<PayrollResult<null>> {
  const { error } = await supabase
    .from("payroll_periods")
    .update({
      status: "locked",
      locked_at: new Date().toISOString(),
      locked_by: input.actorProfileId,
    })
    .eq("id", input.periodId);
  if (error) {
    console.error("lockPayrollPeriod failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }

  const audit = await recordAuditEvent(supabase, {
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: "payroll_period_locked",
    entityId: String(input.periodId),
    beforeState: { status: "draft" },
    afterState: { status: "locked" },
  });
  if (!audit.ok) {
    const { error: rollbackError } = await supabase
      .from("payroll_periods")
      .update({ status: "draft", locked_at: null, locked_by: null })
      .eq("id", input.periodId);
    if (rollbackError) {
      console.error("lockPayrollPeriod rollback failed", rollbackError);
    }
    return audit;
  }
  return { ok: true, data: null };
}
