import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

import {
  NATIVE_REPORT_SOURCE,
  type NativeReportRow,
} from "../domain/native-report";
import type { AttendanceBreakPayClassification } from "../domain/attendance-session";

type SummaryRow =
  Database["public"]["Views"]["attendance_session_summaries"]["Row"];

export const NATIVE_REPORT_ROW_LIMIT = 2000;

export type NativeReportReadResult =
  | {
      readonly ok: true;
      readonly rows: NativeReportRow[];
      readonly truncated: boolean;
    }
  | { readonly ok: false; readonly error: string };

/**
 * Maps one `attendance_session_summaries` row. Fields that the view types as nullable but
 * are never null for a real session are validated, and a malformed row is dropped (null)
 * instead of being rendered with invented values.
 */
export function mapSummaryRow(
  row: SummaryRow,
  names: ReadonlyMap<string, string>,
  timeZone: string,
): NativeReportRow | null {
  if (
    !row.session_id ||
    !row.profile_id ||
    !row.location_id ||
    !row.service_date ||
    !row.status ||
    !row.clock_in_at
  ) {
    return null;
  }
  return {
    sessionId: row.session_id,
    profileId: row.profile_id,
    employeeName: names.get(row.profile_id) ?? "Employee",
    locationId: row.location_id,
    serviceDate: row.service_date,
    status: row.status,
    clockInAt: row.clock_in_at,
    clockOutAt: row.clock_out_at,
    grossElapsedSeconds: row.gross_elapsed_seconds,
    totalBreakSeconds: row.total_break_seconds ?? 0,
    paidBreakSeconds: row.paid_break_seconds ?? 0,
    unpaidBreakSeconds: row.unpaid_break_seconds ?? 0,
    unclassifiedBreakSeconds: row.unclassified_break_seconds ?? 0,
    openBreakCount: row.open_break_count ?? 0,
    breakCount: row.break_count ?? 0,
    breakPolicyResolved: row.break_policy_resolved === true,
    netPayableSeconds: row.net_payable_seconds,
    version: row.version ?? 1,
    correctionCount: row.correction_count ?? 0,
    lastCorrectedAt: row.last_corrected_at,
    source: NATIVE_REPORT_SOURCE,
    timeZone,
  };
}

/**
 * Reads native sessions for ONE location and an inclusive service-date range. The caller's
 * own RLS decides what is visible (managers: their location; employees: only themselves),
 * so a `profileId` filter can narrow a result but can never widen it.
 */
export async function listNativeAttendance(
  supabase: SupabaseClient<Database>,
  params: {
    readonly locationId: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly timeZone: string;
    readonly profileId?: string | null;
  },
): Promise<NativeReportReadResult> {
  try {
    let query = supabase
      .from("attendance_session_summaries")
      .select("*")
      .eq("location_id", params.locationId)
      .gte("service_date", params.startDate)
      .lte("service_date", params.endDate)
      .order("service_date", { ascending: false })
      .order("clock_in_at", { ascending: false })
      .limit(NATIVE_REPORT_ROW_LIMIT + 1);

    if (params.profileId) query = query.eq("profile_id", params.profileId);

    const { data, error } = await query;
    if (error) {
      console.error("listNativeAttendance error", { code: error.code });
      return { ok: false, error: "Attendance data unavailable. Try again." };
    }

    const all = data ?? [];
    const truncated = all.length > NATIVE_REPORT_ROW_LIMIT;
    const page = truncated ? all.slice(0, NATIVE_REPORT_ROW_LIMIT) : all;

    const profileIds = [
      ...new Set(page.map((r) => r.profile_id).filter(Boolean)),
    ] as string[];
    const names = new Map<string, string>();
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", profileIds);
      for (const p of profiles ?? []) names.set(p.id, p.display_name);
    }

    const rows = page
      .map((r) => mapSummaryRow(r, names, params.timeZone))
      .filter((r): r is NativeReportRow => r !== null);
    return { ok: true, rows, truncated };
  } catch (err: unknown) {
    console.error("listNativeAttendance unexpected error", err);
    return { ok: false, error: "Attendance data unavailable. Try again." };
  }
}

export interface NativeBreakDetail {
  readonly id: number;
  readonly sessionId: string;
  readonly startTime: string;
  readonly endTime: string | null;
  readonly durationSeconds: number | null;
  readonly payClassification: AttendanceBreakPayClassification;
}

/** Breaks of one session (RLS-scoped), oldest first. */
export async function listSessionBreaks(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<
  | { readonly ok: true; readonly breaks: NativeBreakDetail[] }
  | { readonly ok: false; readonly error: string }
> {
  try {
    const { data, error } = await supabase
      .from("attendance_breaks")
      .select(
        "id, session_id, start_time, end_time, duration_seconds, pay_classification",
      )
      .eq("session_id", sessionId)
      .order("start_time", { ascending: true })
      .limit(100);
    if (error) {
      console.error("listSessionBreaks error", { code: error.code });
      return { ok: false, error: "Unable to load breaks." };
    }
    return {
      ok: true,
      breaks: (data ?? []).map((b) => ({
        id: b.id,
        sessionId: b.session_id,
        startTime: b.start_time,
        endTime: b.end_time,
        durationSeconds: b.duration_seconds,
        payClassification: b.pay_classification,
      })),
    };
  } catch (err: unknown) {
    console.error("listSessionBreaks unexpected error", err);
    return { ok: false, error: "Unable to load breaks." };
  }
}

export interface AttendanceEmployeeOption {
  readonly profileId: string;
  readonly displayName: string;
}

/**
 * Lists active employees assigned to this location for manager selection.
 * Queries location_memberships (active=true) and retrieves display names from profiles.
 */
export async function listLocationEmployees(
  supabase: SupabaseClient<Database>,
  locationId: string,
): Promise<
  | { readonly ok: true; readonly employees: AttendanceEmployeeOption[] }
  | { readonly ok: false; readonly error: string }
> {
  try {
    const { data: assignments, error: assignErr } = await supabase
      .from("location_memberships")
      .select("profile_id")
      .eq("location_id", locationId)
      .eq("active", true);

    if (assignErr) {
      console.error("listLocationEmployees assignErr", assignErr);
      return { ok: false, error: "Unable to load location employees." };
    }

    const profileIds = [
      ...new Set((assignments ?? []).map((a) => a.profile_id).filter(Boolean)),
    ];
    if (profileIds.length === 0) {
      return { ok: true, employees: [] };
    }

    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);

    if (profErr) {
      console.error("listLocationEmployees profErr", profErr);
      return { ok: false, error: "Unable to load location employees." };
    }

    const employees = (profiles ?? [])
      .map((p) => ({
        profileId: p.id,
        displayName: p.display_name?.trim() || "Employee",
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { ok: true, employees };
  } catch (err: unknown) {
    console.error("listLocationEmployees unexpected error", err);
    return { ok: false, error: "Unable to load location employees." };
  }
}
