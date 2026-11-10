import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

import {
  evaluateNativeSession,
  flagDuplicateSourceRecords,
  type AttendanceSourceRead,
  type NativeSummaryInput,
  type ServicePeriod,
} from "../domain/financial-source";

type SummaryRow =
  Database["public"]["Views"]["attendance_session_summaries"]["Row"];

/** Financial reads page differently from the report: a silent cut-off is never acceptable. */
export const NATIVE_FINANCIAL_ROW_LIMIT = 5000;

/**
 * Validates one view row into the contract input. Returns `null` for a row that is missing
 * a field a real session always has. Callers MUST treat that as a failed read, not skip the
 * row: dropping it would silently remove hours from a financial total.
 */
export function toNativeSummaryInput(
  row: SummaryRow,
): NativeSummaryInput | null {
  if (
    !row.session_id ||
    !row.organization_id ||
    !row.location_id ||
    !row.profile_id ||
    !row.service_date ||
    !row.status ||
    !row.clock_in_at ||
    row.version === null ||
    row.break_policy_resolved === null ||
    row.total_break_seconds === null ||
    row.unpaid_break_seconds === null ||
    row.open_break_count === null ||
    row.correction_count === null
  ) {
    return null;
  }
  return {
    sessionId: row.session_id,
    organizationId: row.organization_id,
    locationId: row.location_id,
    profileId: row.profile_id,
    serviceDate: row.service_date,
    status: row.status,
    clockInAt: row.clock_in_at,
    clockOutAt: row.clock_out_at,
    grossElapsedSeconds: row.gross_elapsed_seconds,
    totalBreakSeconds: row.total_break_seconds,
    unpaidBreakSeconds: row.unpaid_break_seconds,
    openBreakCount: row.open_break_count,
    breakPolicyResolved: row.break_policy_resolved,
    netPayableSeconds: row.net_payable_seconds,
    version: row.version,
    correctionCount: row.correction_count,
    lastCorrectedAt: row.last_corrected_at,
  };
}

/**
 * Reads native sessions for ONE verified location and service-date period as canonical
 * financial records.
 *
 * Outcomes are distinct on purpose:
 *  - the caller lacks management authority  → ACCESS_DENIED (checked BEFORE reading, because
 *    RLS would otherwise answer a forbidden caller with an empty set that looks like "no hours");
 *  - the query or authority check fails     → SOURCE_ERROR;
 *  - a row cannot be validated              → SOURCE_ERROR (never skipped);
 *  - everything fine, even with zero rows   → OK.
 *
 * Consistency: one statement against the summary view, so every returned session is the
 * single committed version at the statement's snapshot. A concurrent correction commits
 * either wholly before or wholly after it; old and new versions are never mixed, and the
 * record carries `correctionVersion` so a later consumer can detect that it moved.
 */
export async function readNativeFinancialAttendance(
  supabase: SupabaseClient<Database>,
  params: {
    readonly organizationId: string;
    readonly locationId: string;
    readonly timeZone: string;
    readonly period: ServicePeriod;
    readonly profileId?: string | null;
    readonly alreadyConsumedSourceIds?: ReadonlySet<string>;
  },
): Promise<AttendanceSourceRead> {
  try {
    const { data: canManage, error: authError } = await supabase.rpc(
      "attendance_can_manage",
      { p_location_id: params.locationId },
    );
    if (authError) {
      console.error("readNativeFinancialAttendance authority check failed", {
        code: authError.code,
      });
      return authError.code === "42501"
        ? { status: "ACCESS_DENIED" }
        : { status: "SOURCE_ERROR", source: "INTERNAL_THE_LINEUP" };
    }
    if (canManage !== true) return { status: "ACCESS_DENIED" };

    let query = supabase
      .from("attendance_session_summaries")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("location_id", params.locationId)
      .gte("service_date", params.period.startDate)
      .lte("service_date", params.period.endDate)
      .order("service_date", { ascending: true })
      .order("clock_in_at", { ascending: true })
      .order("session_id", { ascending: true })
      .limit(NATIVE_FINANCIAL_ROW_LIMIT + 1);
    if (params.profileId) query = query.eq("profile_id", params.profileId);

    const { data, error } = await query;
    if (error) {
      console.error("readNativeFinancialAttendance query failed", {
        code: error.code,
      });
      return error.code === "42501"
        ? { status: "ACCESS_DENIED" }
        : { status: "SOURCE_ERROR", source: "INTERNAL_THE_LINEUP" };
    }

    const all = data ?? [];
    const truncated = all.length > NATIVE_FINANCIAL_ROW_LIMIT;
    const page = truncated ? all.slice(0, NATIVE_FINANCIAL_ROW_LIMIT) : all;

    const inputs: NativeSummaryInput[] = [];
    for (const row of page) {
      const input = toNativeSummaryInput(row);
      if (!input) {
        console.error("readNativeFinancialAttendance malformed summary row");
        return { status: "SOURCE_ERROR", source: "INTERNAL_THE_LINEUP" };
      }
      inputs.push(input);
    }

    const records = flagDuplicateSourceRecords(
      inputs.map((input) =>
        evaluateNativeSession(input, {
          expected: {
            organizationId: params.organizationId,
            locationId: params.locationId,
            ...(params.profileId ? { profileId: params.profileId } : {}),
          },
          timeZone: params.timeZone,
          period: params.period,
          alreadyConsumedSourceIds: params.alreadyConsumedSourceIds,
        }),
      ),
    );
    return {
      status: "OK",
      source: "INTERNAL_THE_LINEUP",
      records,
      truncated,
    };
  } catch (err: unknown) {
    console.error("readNativeFinancialAttendance unexpected error", err);
    return { status: "SOURCE_ERROR", source: "INTERNAL_THE_LINEUP" };
  }
}

export type OpenNativeRosterResult =
  | { readonly ok: true; readonly profileIds: string[] }
  | { readonly ok: false };

/**
 * Employees with a genuinely open native shift at one location right now (active or on a
 * break), for the Tips "Pull clocked-in team" SUGGESTION. It carries no hours and no
 * money; the manager reviews and chooses participants. RLS scopes the rows to the caller.
 */
export async function listOpenNativeSessionProfileIds(
  supabase: SupabaseClient<Database>,
  params: { readonly organizationId: string; readonly locationId: string },
): Promise<OpenNativeRosterResult> {
  try {
    const { data, error } = await supabase
      .from("attendance_session_summaries")
      .select("profile_id")
      .eq("organization_id", params.organizationId)
      .eq("location_id", params.locationId)
      .in("status", ["active", "on_break"]);
    if (error) {
      console.error("listOpenNativeSessionProfileIds failed", {
        code: error.code,
      });
      return { ok: false };
    }
    const ids = new Set<string>();
    for (const row of data ?? []) if (row.profile_id) ids.add(row.profile_id);
    return { ok: true, profileIds: [...ids] };
  } catch (err: unknown) {
    console.error("listOpenNativeSessionProfileIds unexpected error", err);
    return { ok: false };
  }
}
