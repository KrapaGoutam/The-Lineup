import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

import type { ParsedCorrectionInput } from "../domain/attendance-correction";

export type CorrectionErrorCode =
  | "unauthorized"
  | "stale"
  | "invalid"
  | "voided"
  | "overlap"
  | "unexpected";

export type CorrectionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: string;
      readonly code: CorrectionErrorCode;
    };

export interface CorrectionResponse {
  readonly success: boolean;
  readonly idempotent: boolean;
  readonly sessionId: string;
  readonly eventId: number;
  readonly correctionSeq: number;
  readonly version: number;
  readonly status?: string;
  readonly changedFields?: readonly string[];
}

/** Maps a database error to a stable code and a message that is safe to show. */
export function mapCorrectionError(error: {
  code?: string;
  message?: string;
}): { code: CorrectionErrorCode; error: string } {
  switch (error.code) {
    case "42501":
      // Uniform on purpose: never reveal whether the session exists.
      return {
        code: "unauthorized",
        error: "You can't correct this attendance record.",
      };
    case "P0004":
      return {
        code: "stale",
        error:
          "This record was changed by someone else. Reload it and try again.",
      };
    case "55000":
      return { code: "voided", error: "A voided session cannot be corrected." };
    case "23P01":
      return {
        code: "overlap",
        error:
          "The corrected shift overlaps another attendance session for this employee.",
      };
    case "22023":
      return {
        code: "invalid",
        error: error.message || "That correction isn't valid.",
      };
    case "22007":
    case "22008":
      return { code: "invalid", error: "Enter valid times." };
    default:
      return {
        code: "unexpected",
        error: "The correction could not be saved.",
      };
  }
}

/**
 * Applies a manager correction through the atomic database function. The function — not
 * this wrapper — decides authority, validates every rule and appends the audit event.
 */
export async function correctNativeAttendanceSession(
  supabase: SupabaseClient<Database>,
  input: ParsedCorrectionInput,
): Promise<CorrectionResult<CorrectionResponse>> {
  try {
    const breaks = input.breaks.map((b) => ({
      id: b.id,
      ...(b.startTime !== undefined ? { start_time: b.startTime } : {}),
      ...(b.endTime !== undefined ? { end_time: b.endTime } : {}),
      ...(b.payClassification !== undefined
        ? { pay_classification: b.payClassification }
        : {}),
    }));

    const { data, error } = await supabase.rpc("attendance_correct_session", {
      p_session_id: input.sessionId,
      p_expected_version: input.expectedVersion,
      p_reason: input.reason,
      p_clock_in_at: input.clockInAt,
      p_clock_out_at: input.clockOutAt,
      p_breaks: breaks,
      p_void: input.void,
      p_idempotency_key: input.idempotencyKey,
    });

    if (error) {
      console.error("correctNativeAttendanceSession error", {
        code: error.code,
      });
      return { ok: false, ...mapCorrectionError(error) };
    }

    return { ok: true, data: data as unknown as CorrectionResponse };
  } catch (err: unknown) {
    console.error("correctNativeAttendanceSession unexpected error", err);
    return {
      ok: false,
      code: "unexpected",
      error: "The correction could not be saved.",
    };
  }
}

export interface SessionHistoryEntry {
  readonly id: number;
  readonly eventType: Database["public"]["Enums"]["attendance_event_type"];
  /** Original events: the recorded instant. Corrections: the server audit timestamp. */
  readonly eventTime: string;
  readonly source: Database["public"]["Enums"]["attendance_event_source"];
  readonly actorProfileId: string;
  readonly isCorrection: boolean;
  readonly reason: string | null;
  readonly correctionSeq: number | null;
  readonly changedFields: readonly string[];
  readonly selfCorrection: boolean;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function mapHistoryRow(
  row: Pick<
    Database["public"]["Tables"]["attendance_events"]["Row"],
    | "id"
    | "event_type"
    | "event_time"
    | "source"
    | "actor_profile_id"
    | "is_manager_correction"
    | "correction_reason"
    | "metadata"
  >,
): SessionHistoryEntry {
  const meta = asRecord(row.metadata) ?? {};
  const changed = Array.isArray(meta.changed_fields)
    ? meta.changed_fields.filter((f): f is string => typeof f === "string")
    : [];
  return {
    id: row.id,
    eventType: row.event_type,
    eventTime: row.event_time,
    source: row.source,
    actorProfileId: row.actor_profile_id,
    isCorrection: row.is_manager_correction,
    reason: row.correction_reason,
    correctionSeq: typeof meta.seq === "number" ? meta.seq : null,
    changedFields: changed,
    selfCorrection: meta.self_correction === true,
    before: asRecord(meta.before),
    after: asRecord(meta.after),
  };
}

/** Original events and corrections for one session, oldest first (RLS-scoped). */
export async function getSessionHistory(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<CorrectionResult<SessionHistoryEntry[]>> {
  try {
    const { data, error } = await supabase
      .from("attendance_events")
      .select(
        "id, event_type, event_time, source, actor_profile_id, is_manager_correction, correction_reason, metadata",
      )
      .eq("session_id", sessionId)
      .order("id", { ascending: true })
      .limit(500);

    if (error) {
      console.error("getSessionHistory error", { code: error.code });
      return {
        ok: false,
        code: "unexpected",
        error: "Unable to load the record history.",
      };
    }
    return { ok: true, data: (data ?? []).map(mapHistoryRow) };
  } catch (err: unknown) {
    console.error("getSessionHistory unexpected error", err);
    return {
      ok: false,
      code: "unexpected",
      error: "Unable to load the record history.",
    };
  }
}
