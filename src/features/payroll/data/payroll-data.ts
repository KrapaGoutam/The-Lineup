import "server-only";

import {
  computeBalanceCents,
  isFullyPaid,
} from "@/features/payroll/domain/calculate-payroll";
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
    entityType: "payroll_period" | "payroll_payment" | "payroll_adjustment";
    entityId: string;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
  },
): Promise<PayrollResult<null>> {
  const { error } = await supabase.from("audit_events").insert({
    organization_id: input.organizationId,
    actor_profile_id: input.actorProfileId,
    action: input.action,
    entity_type: input.entityType,
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

/**
 * Feature 020 Phase 5. The one non-payroll read this feature needs: the
 * organization's display name, for the printed/exported statement header.
 * `organizations_select_member` (initial_schema.sql) already lets any
 * active member -- owner through server -- read their own organization's
 * row, so this works identically for a privileged or a self-scoped
 * caller with no extra grant or policy needed.
 */
export async function getOrganizationName(
  supabase: TypedSupabaseClient,
  input: { organizationId: string },
): Promise<PayrollResult<string>> {
  const { data, error } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", input.organizationId)
    .single();
  if (error) {
    console.error("getOrganizationName failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return { ok: true, data: data.name };
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
    entityType: "payroll_period",
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
    entityType: "payroll_period",
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
    entityType: "payroll_period",
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

// -- Payments -----------------------------------------------------------

export type PayrollPayment = {
  id: number;
  organizationId: string;
  payrollPeriodId: number;
  amountCents: number;
  paymentDate: string;
  comment: string | null;
  status: "draft" | "confirmed";
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  reversesPaymentId: number | null;
};

const PAYMENT_COLUMNS =
  "id, organization_id, payroll_period_id, amount_cents, payment_date, comment, status, created_at, created_by, updated_at, confirmed_at, confirmed_by, reverses_payment_id";

function mapPaymentRow(row: {
  id: number;
  organization_id: string;
  payroll_period_id: number;
  amount_cents: number;
  payment_date: string;
  comment: string | null;
  status: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  reverses_payment_id: number | null;
}): PayrollPayment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    payrollPeriodId: row.payroll_period_id,
    amountCents: row.amount_cents,
    paymentDate: row.payment_date,
    comment: row.comment,
    status: row.status as "draft" | "confirmed",
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    confirmedAt: row.confirmed_at,
    confirmedBy: row.confirmed_by,
    reversesPaymentId: row.reverses_payment_id,
  };
}

export async function getPaymentById(
  supabase: TypedSupabaseClient,
  input: { paymentId: number },
): Promise<PayrollResult<PayrollPayment | null>> {
  const { data, error } = await supabase
    .from("payroll_payments")
    .select(PAYMENT_COLUMNS)
    .eq("id", input.paymentId)
    .maybeSingle();
  if (error) {
    console.error("getPaymentById failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return { ok: true, data: data ? mapPaymentRow(data) : null };
}

/**
 * Every payment for a period, keyed ONLY by `payroll_period_id` -- the
 * column that actually determines which period a payment reduces.
 * `payment_date` never appears in this query's `where` clause and is
 * never consulted anywhere in this file to decide which period a payment
 * belongs to; it is stored purely as when the money changed hands, shown
 * on the ledger, and otherwise inert. A payment dated any month can
 * target any period -- that's not a special case this function handles,
 * it's simply the only thing this query ever asks Postgres.
 */
export async function listPaymentsForPeriod(
  supabase: TypedSupabaseClient,
  input: { periodId: number },
): Promise<PayrollResult<PayrollPayment[]>> {
  const { data, error } = await supabase
    .from("payroll_payments")
    .select(PAYMENT_COLUMNS)
    .eq("payroll_period_id", input.periodId)
    .order("payment_date", { ascending: true });
  if (error) {
    console.error("listPaymentsForPeriod failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return { ok: true, data: data.map(mapPaymentRow) };
}

export async function recordPayment(
  supabase: TypedSupabaseClient,
  input: {
    organizationId: string;
    periodId: number;
    amountCents: number;
    paymentDate: string;
    comment: string | null;
    actorProfileId: string;
  },
): Promise<PayrollResult<PayrollPayment>> {
  const { data, error } = await supabase
    .from("payroll_payments")
    .insert({
      organization_id: input.organizationId,
      payroll_period_id: input.periodId,
      amount_cents: input.amountCents,
      payment_date: input.paymentDate,
      comment: input.comment,
      created_by: input.actorProfileId,
    })
    .select(PAYMENT_COLUMNS)
    .single();
  if (error) {
    console.error("recordPayment failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }

  const payment = mapPaymentRow(data);
  const audit = await recordAuditEvent(supabase, {
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: "payroll_payment_recorded",
    entityType: "payroll_payment",
    entityId: String(payment.id),
    beforeState: null,
    afterState: {
      amount_cents: payment.amountCents,
      payment_date: payment.paymentDate,
    },
  });
  if (!audit.ok) {
    const { error: rollbackError } = await supabase
      .from("payroll_payments")
      .delete()
      .eq("id", payment.id);
    if (rollbackError) {
      console.error("recordPayment rollback failed", rollbackError);
    }
    return audit;
  }
  return { ok: true, data: payment };
}

export async function editDraftPayment(
  supabase: TypedSupabaseClient,
  input: {
    payment: PayrollPayment;
    amountCents: number;
    paymentDate: string;
    comment: string | null;
    actorProfileId: string;
  },
): Promise<PayrollResult<PayrollPayment>> {
  const { data, error } = await supabase
    .from("payroll_payments")
    .update({
      amount_cents: input.amountCents,
      payment_date: input.paymentDate,
      comment: input.comment,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.payment.id)
    .select(PAYMENT_COLUMNS)
    .single();
  if (error) {
    console.error("editDraftPayment failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }

  const payment = mapPaymentRow(data);
  const audit = await recordAuditEvent(supabase, {
    organizationId: payment.organizationId,
    actorProfileId: input.actorProfileId,
    action: "payroll_payment_edited",
    entityType: "payroll_payment",
    entityId: String(payment.id),
    beforeState: {
      amount_cents: input.payment.amountCents,
      payment_date: input.payment.paymentDate,
    },
    afterState: {
      amount_cents: payment.amountCents,
      payment_date: payment.paymentDate,
    },
  });
  if (!audit.ok) {
    const { error: rollbackError } = await supabase
      .from("payroll_payments")
      .update({
        amount_cents: input.payment.amountCents,
        payment_date: input.payment.paymentDate,
        comment: input.payment.comment,
      })
      .eq("id", payment.id);
    if (rollbackError) {
      console.error("editDraftPayment rollback failed", rollbackError);
    }
    return audit;
  }
  return { ok: true, data: payment };
}

export async function deleteDraftPayment(
  supabase: TypedSupabaseClient,
  input: { payment: PayrollPayment; actorProfileId: string },
): Promise<PayrollResult<null>> {
  const { error } = await supabase
    .from("payroll_payments")
    .delete()
    .eq("id", input.payment.id);
  if (error) {
    console.error("deleteDraftPayment failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }

  const audit = await recordAuditEvent(supabase, {
    organizationId: input.payment.organizationId,
    actorProfileId: input.actorProfileId,
    action: "payroll_payment_deleted",
    entityType: "payroll_payment",
    entityId: String(input.payment.id),
    beforeState: {
      amount_cents: input.payment.amountCents,
      payment_date: input.payment.paymentDate,
    },
    afterState: null,
  });
  if (!audit.ok) {
    // The row is gone; recreating it with the same id isn't possible
    // (identity column), so the compensating action here is re-inserting
    // an equivalent draft row rather than restoring the exact original.
    const { error: rollbackError } = await supabase
      .from("payroll_payments")
      .insert({
        organization_id: input.payment.organizationId,
        payroll_period_id: input.payment.payrollPeriodId,
        amount_cents: input.payment.amountCents,
        payment_date: input.payment.paymentDate,
        comment: input.payment.comment,
        created_by: input.payment.createdBy,
      });
    if (rollbackError) {
      console.error("deleteDraftPayment rollback failed", rollbackError);
    }
    return audit;
  }
  return { ok: true, data: null };
}

export async function confirmPayment(
  supabase: TypedSupabaseClient,
  input: { payment: PayrollPayment; actorProfileId: string },
): Promise<PayrollResult<PayrollPayment>> {
  const { data, error } = await supabase
    .from("payroll_payments")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: input.actorProfileId,
    })
    .eq("id", input.payment.id)
    .select(PAYMENT_COLUMNS)
    .single();
  if (error) {
    console.error("confirmPayment failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }

  const payment = mapPaymentRow(data);
  const audit = await recordAuditEvent(supabase, {
    organizationId: payment.organizationId,
    actorProfileId: input.actorProfileId,
    action: "payroll_payment_confirmed",
    entityType: "payroll_payment",
    entityId: String(payment.id),
    beforeState: { status: "draft" },
    afterState: { status: "confirmed" },
  });
  if (!audit.ok) {
    // Un-confirming is exactly what the immutability trigger forbids once
    // this write has landed -- there is no safe rollback here. Reported
    // as a failure so the caller knows the audit gap exists; the payment
    // itself is now correctly confirmed and stays that way.
    return audit;
  }
  return { ok: true, data: payment };
}

// -- Adjustments ----------------------------------------------------------

export type PayrollAdjustment = {
  id: number;
  organizationId: string;
  payrollPeriodId: number;
  deltaCents: number;
  reason: string;
  createdAt: string;
  createdBy: string;
};

function mapAdjustmentRow(row: {
  id: number;
  organization_id: string;
  payroll_period_id: number;
  delta_cents: number;
  reason: string;
  created_at: string;
  created_by: string;
}): PayrollAdjustment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    payrollPeriodId: row.payroll_period_id,
    deltaCents: row.delta_cents,
    reason: row.reason,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

/** Same rule as listPaymentsForPeriod: keyed only by payroll_period_id. */
export async function listAdjustmentsForPeriod(
  supabase: TypedSupabaseClient,
  input: { periodId: number },
): Promise<PayrollResult<PayrollAdjustment[]>> {
  const { data, error } = await supabase
    .from("payroll_adjustments")
    .select(
      "id, organization_id, payroll_period_id, delta_cents, reason, created_at, created_by",
    )
    .eq("payroll_period_id", input.periodId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listAdjustmentsForPeriod failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }
  return { ok: true, data: data.map(mapAdjustmentRow) };
}

/**
 * No update/rollback path on failure to audit, unlike every other write in
 * this file -- payroll_adjustments has no delete grant at all (by design,
 * see the migration), so there is nothing to compensate with. A failed
 * audit insert here is reported as a failure (the caller sees an error),
 * but the adjustment row itself, once inserted, is permanent -- exactly
 * the append-only guarantee this table exists to provide.
 */
export async function recordAdjustment(
  supabase: TypedSupabaseClient,
  input: {
    organizationId: string;
    periodId: number;
    deltaCents: number;
    reason: string;
    actorProfileId: string;
  },
): Promise<PayrollResult<PayrollAdjustment>> {
  const { data, error } = await supabase
    .from("payroll_adjustments")
    .insert({
      organization_id: input.organizationId,
      payroll_period_id: input.periodId,
      delta_cents: input.deltaCents,
      reason: input.reason,
      created_by: input.actorProfileId,
    })
    .select(
      "id, organization_id, payroll_period_id, delta_cents, reason, created_at, created_by",
    )
    .single();
  if (error) {
    console.error("recordAdjustment failed", error);
    return { ok: false, error: UNAVAILABLE_ERROR };
  }

  const adjustment = mapAdjustmentRow(data);
  const audit = await recordAuditEvent(supabase, {
    organizationId: input.organizationId,
    actorProfileId: input.actorProfileId,
    action: "payroll_adjustment_recorded",
    entityType: "payroll_adjustment",
    entityId: String(adjustment.id),
    beforeState: null,
    afterState: {
      delta_cents: adjustment.deltaCents,
      reason: adjustment.reason,
    },
  });
  if (!audit.ok) return audit;
  return { ok: true, data: adjustment };
}

// -- Balance --------------------------------------------------------------

export type PayrollBalance = {
  grossCents: number;
  confirmedPaymentsCents: number;
  draftPaymentsCents: number;
  adjustmentsCents: number;
  balanceCents: number;
  fullyPaid: boolean;
};

/**
 * The one place balance is computed from a period's ledger. Both
 * `listPaymentsForPeriod` and `listAdjustmentsForPeriod` key exclusively
 * on `payroll_period_id` -- `period.grossCents` (the frozen snapshot) and
 * those two lists are the only three things this reads. A payment's own
 * `payment_date` never enters into which rows get summed, and the
 * confirmed/draft split happens here, not in the query layer, so both
 * figures are always computed from the same fetched rows rather than two
 * separately-filtered queries that could disagree.
 */
export async function getPayrollBalance(
  supabase: TypedSupabaseClient,
  input: { period: PayrollPeriod },
): Promise<PayrollResult<PayrollBalance>> {
  const [paymentsResult, adjustmentsResult] = await Promise.all([
    listPaymentsForPeriod(supabase, { periodId: input.period.id }),
    listAdjustmentsForPeriod(supabase, { periodId: input.period.id }),
  ]);
  if (!paymentsResult.ok) return paymentsResult;
  if (!adjustmentsResult.ok) return adjustmentsResult;

  const confirmedPaymentsCents = paymentsResult.data
    .filter((payment) => payment.status === "confirmed")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const draftPaymentsCents = paymentsResult.data
    .filter((payment) => payment.status === "draft")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const adjustmentsCents = adjustmentsResult.data.reduce(
    (sum, adjustment) => sum + adjustment.deltaCents,
    0,
  );

  const balanceCents = computeBalanceCents({
    grossCents: input.period.grossCents,
    confirmedPaymentsCents,
    adjustmentsCents,
  });

  return {
    ok: true,
    data: {
      grossCents: input.period.grossCents,
      confirmedPaymentsCents,
      draftPaymentsCents,
      adjustmentsCents,
      balanceCents,
      fullyPaid: isFullyPaid(balanceCents),
    },
  };
}
