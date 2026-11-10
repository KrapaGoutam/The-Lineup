"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { guardModule } from "@/features/modules/data/module-enforcement";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

import { getAttendanceEntryUser } from "../data/attendance-actor";
import {
  getSessionHistory,
  correctNativeAttendanceSession,
  type CorrectionResponse,
  type SessionHistoryEntry,
} from "../data/native-correction-data";
import {
  listNativeAttendance,
  listSessionBreaks,
  type NativeBreakDetail,
} from "../data/native-report-data";
import { STALE_CONTEXT_MESSAGE } from "@/features/context/domain/workspace-expectation";

import { correctionInputSchema } from "../domain/attendance-correction";
import { expectedLocationAgrees } from "../domain/expected-location";
import {
  decideReportSource,
  type AttendanceReportSource,
} from "../domain/attendance-source";
import {
  summarizeNativeReport,
  type NativeReportRow,
  type NativeReportTotals,
} from "../domain/native-report";

export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: string;
      readonly sessionInvalid?: true;
      readonly moduleUnavailable?: true;
      readonly contextStale?: true;
      readonly code?: string;
    };

const NOT_SIGNED_IN = "You need to sign in to see attendance.";
const NO_LOCATION =
  "Choose a location first. Attendance is shown for one location at a time.";
const INVALID_REQUEST = "That attendance request is invalid.";
const MAX_RANGE_DAYS = 92;

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const dateSchema = z.iso.date();
// Same lenient shape check as the rest of the attendance actions; the database is the authority.
const uuidSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

interface VerifiedContext {
  readonly supabase: Awaited<ReturnType<typeof createClient>>;
  readonly userProfileId: string;
  readonly organizationId: string;
  readonly location: { readonly id: string; readonly time_zone: string };
}

/**
 * The single place these actions establish who is asking and where. The location is the
 * SERVER-VERIFIED persisted context (never a request field); the module guard is applied
 * to that same location; authorization to read or change anything is still decided by RLS
 * and the database functions.
 */
async function resolveContext(
  restaurantSlug: string,
  expectedLocationId?: string,
): Promise<
  | { ok: true; ctx: VerifiedContext }
  | Extract<ActionResult<never>, { ok: false }>
> {
  const supabase = await createClient();
  const invalid = await requireLiveSession(supabase);
  if (invalid) return invalid;

  const user = await getAttendanceEntryUser(restaurantSlug);
  if (!user) return { ok: false, error: NOT_SIGNED_IN };

  const location = await getPrimaryLocation(user.organizationId);
  if (!location) return { ok: false, error: NO_LOCATION, contextStale: true };

  // R1: the browser's on-screen location is only an assertion to compare, never a selector.
  if (!expectedLocationAgrees(expectedLocationId, location.id)) {
    return { ok: false, error: STALE_CONTEXT_MESSAGE, contextStale: true };
  }

  const blocked = await guardModule({
    module: "attendance",
    organizationId: user.organizationId,
    location,
  });
  if (blocked) return blocked;

  return {
    ok: true,
    ctx: {
      supabase,
      userProfileId: user.profileId,
      organizationId: user.organizationId,
      location: { id: location.id, time_zone: location.time_zone },
    },
  };
}

export interface AttendanceSourceView {
  readonly source: AttendanceReportSource;
  readonly label: string;
  readonly description: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly timeZone: string;
  /** The caller's own authority at this location; the database still enforces it. */
  readonly canManage: boolean;
}

/** Which attendance source applies to the verified location, and what the caller can do. */
export async function getAttendanceSourceAction(input: {
  restaurantSlug: string;
}): Promise<ActionResult<AttendanceSourceView>> {
  try {
    const parsed = z.object({ restaurantSlug: slugSchema }).safeParse(input);
    if (!parsed.success) return { ok: false, error: INVALID_REQUEST };

    const resolved = await resolveContext(parsed.data.restaurantSlug);
    if (!resolved.ok) return resolved;
    const { supabase, location } = resolved.ctx;

    const [{ data: row, error }, { data: canManage }] = await Promise.all([
      supabase
        .from("locations")
        .select("name, attendance_mode, time_zone")
        .eq("id", location.id)
        .maybeSingle(),
      supabase.rpc("attendance_can_manage", { p_location_id: location.id }),
    ]);
    if (error || !row) {
      return { ok: false, error: "Unable to read this location." };
    }

    const decision = decideReportSource(row.attendance_mode);
    return {
      ok: true,
      data: {
        source: decision.source,
        label: decision.label,
        description: decision.description,
        locationId: location.id,
        locationName: row.name,
        timeZone: row.time_zone,
        canManage: canManage === true,
      },
    };
  } catch (err: unknown) {
    console.error("getAttendanceSourceAction unexpected error", err);
    return { ok: false, error: "Unable to read attendance settings." };
  }
}

export interface NativeReportView {
  readonly rows: NativeReportRow[];
  readonly totals: NativeReportTotals;
  readonly truncated: boolean;
  readonly timeZone: string;
  readonly canManage: boolean;
}

const reportInputSchema = z
  .object({
    restaurantSlug: slugSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    profileId: uuidSchema.nullable().optional(),
    /** The location the UI is showing; compared with the verified one (R1), never trusted. */
    expectedLocationId: uuidSchema.optional(),
  })
  .refine(({ startDate, endDate }) => startDate <= endDate)
  .refine(({ startDate, endDate }) => {
    const days =
      (Date.parse(`${endDate}T00:00:00Z`) -
        Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000;
    return days <= MAX_RANGE_DAYS;
  });

/**
 * Native (TheLineup Internal) attendance for the verified location and a date range. Only
 * answers for a location in INTERNAL mode: for any other mode it returns an error and never
 * falls back to — or merges with — another source. Visibility is RLS-scoped: managers see
 * their location, an employee sees only themself regardless of the filter sent.
 */
export async function getNativeAttendanceReportAction(input: {
  restaurantSlug: string;
  startDate: string;
  endDate: string;
  profileId?: string | null;
  expectedLocationId?: string;
}): Promise<ActionResult<NativeReportView>> {
  try {
    const parsed = reportInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: INVALID_REQUEST };

    const resolved = await resolveContext(
      parsed.data.restaurantSlug,
      parsed.data.expectedLocationId,
    );
    if (!resolved.ok) return resolved;
    const { supabase, location } = resolved.ctx;

    const [{ data: row }, { data: canManage }] = await Promise.all([
      supabase
        .from("locations")
        .select("attendance_mode, time_zone")
        .eq("id", location.id)
        .maybeSingle(),
      supabase.rpc("attendance_can_manage", { p_location_id: location.id }),
    ]);
    if (!row) return { ok: false, error: "Unable to read this location." };
    if (!decideReportSource(row.attendance_mode).readsNative) {
      return {
        ok: false,
        error: "This location doesn't use TheLineup Internal attendance.",
        code: "not_internal",
      };
    }

    const result = await listNativeAttendance(supabase, {
      locationId: location.id,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      timeZone: row.time_zone,
      profileId: parsed.data.profileId ?? null,
    });
    if (!result.ok) return { ok: false, error: result.error };

    return {
      ok: true,
      data: {
        rows: result.rows,
        totals: summarizeNativeReport(result.rows),
        truncated: result.truncated,
        timeZone: row.time_zone,
        canManage: canManage === true,
      },
    };
  } catch (err: unknown) {
    console.error("getNativeAttendanceReportAction unexpected error", err);
    return { ok: false, error: "Attendance data unavailable. Try again." };
  }
}

export interface SessionDetailView {
  readonly breaks: NativeBreakDetail[];
  readonly history: SessionHistoryEntry[];
  readonly names: Record<string, string>;
}

/** Breaks plus the full append-only history (originals and corrections) of one session. */
export async function getAttendanceSessionDetailAction(input: {
  restaurantSlug: string;
  sessionId: string;
}): Promise<ActionResult<SessionDetailView>> {
  try {
    const parsed = z
      .object({ restaurantSlug: slugSchema, sessionId: uuidSchema })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: INVALID_REQUEST };

    const resolved = await resolveContext(parsed.data.restaurantSlug);
    if (!resolved.ok) return resolved;
    const { supabase, location } = resolved.ctx;

    // The session must belong to the verified location (RLS also hides foreign ones).
    const { data: session } = await supabase
      .from("attendance_session_summaries")
      .select("session_id")
      .eq("session_id", parsed.data.sessionId)
      .eq("location_id", location.id)
      .maybeSingle();
    if (!session) return { ok: false, error: "That record isn't available." };

    const [breaks, history] = await Promise.all([
      listSessionBreaks(supabase, parsed.data.sessionId),
      getSessionHistory(supabase, parsed.data.sessionId),
    ]);
    if (!breaks.ok) return { ok: false, error: breaks.error };
    if (!history.ok) return { ok: false, error: history.error };

    const actorIds = [...new Set(history.data.map((h) => h.actorProfileId))];
    const names: Record<string, string> = {};
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);
      for (const p of profiles ?? []) names[p.id] = p.display_name;
    }

    return {
      ok: true,
      data: { breaks: breaks.breaks, history: history.data, names },
    };
  } catch (err: unknown) {
    console.error("getAttendanceSessionDetailAction unexpected error", err);
    return { ok: false, error: "Unable to load the record." };
  }
}

/**
 * Applies a manager correction. Authority, validation and the audit event live in the
 * database function; this action adds input validation and refuses a session that is not at
 * the caller's verified location (so a stale tab cannot act on another location).
 */
export async function correctAttendanceSessionAction(
  input: { restaurantSlug: string } & z.input<typeof correctionInputSchema>,
): Promise<ActionResult<CorrectionResponse>> {
  try {
    const { restaurantSlug, ...rest } = input;
    const slug = slugSchema.safeParse(restaurantSlug);
    const parsed = correctionInputSchema.safeParse(rest);
    if (!slug.success || !parsed.success) {
      return {
        ok: false,
        error: parsed.success
          ? INVALID_REQUEST
          : (parsed.error.issues[0]?.message ?? INVALID_REQUEST),
      };
    }

    const resolved = await resolveContext(slug.data);
    if (!resolved.ok) return resolved;
    const { supabase, location } = resolved.ctx;

    const { data: session } = await supabase
      .from("attendance_session_summaries")
      .select("session_id")
      .eq("session_id", parsed.data.sessionId)
      .eq("location_id", location.id)
      .maybeSingle();
    if (!session) {
      return {
        ok: false,
        error:
          "That record isn't at the location you're working in. Switch location and try again.",
        contextStale: true,
      };
    }

    const result = await correctNativeAttendanceSession(supabase, parsed.data);
    if (!result.ok)
      return { ok: false, error: result.error, code: result.code };

    revalidatePath("/attendance");
    return { ok: true, data: result.data };
  } catch (err: unknown) {
    console.error("correctAttendanceSessionAction unexpected error", err);
    return { ok: false, error: "The correction could not be saved." };
  }
}
