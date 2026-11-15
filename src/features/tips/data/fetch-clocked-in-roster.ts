import "server-only";

import { getActiveClockedInRows } from "@/features/attendance/data/attendance-data";
import { listAttendanceIdentityLinks } from "@/features/attendance/data/identity-links";
import { listOpenNativeSessionProfileIds } from "@/features/attendance/data/native-financial-data";
import { resolveFinancialSource } from "@/features/attendance/domain/financial-source";
import type { createClient } from "@/lib/supabase/server";

// Matches the client `createClient()` actually returns (untyped against
// the generated Database schema, same as every other data-layer module
// in this app -- e.g. identity-links.ts's identical local alias).
type TypedSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ClockedInRosterResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const ROSTER_UNAVAILABLE = "Attendance data unavailable. Try again shortly.";

/**
 * The location's attendance mode, for choosing the roster source.
 *
 * A database that predates the attendance-mode column (PostgREST 42703, undefined column)
 * is a legacy database by definition, so it keeps the unchanged Neon path: there is nothing
 * else it could mean. Any OTHER failure, or a location that cannot be read, fails closed
 * rather than guessing a source, which could pull Neon rows into an internal location.
 */
async function readLocationAttendanceMode(
  supabase: TypedSupabaseClient,
  locationId: string,
): Promise<{ ok: true; mode: string | null } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("locations")
    .select("attendance_mode")
    .eq("id", locationId)
    .maybeSingle();
  if (error) {
    if (error.code === "42703") return { ok: true, mode: null };
    console.error("readLocationAttendanceMode failed", { code: error.code });
    return { ok: false, error: ROSTER_UNAVAILABLE };
  }
  if (!data) return { ok: false, error: ROSTER_UNAVAILABLE };
  return { ok: true, mode: data.attendance_mode };
}

/**
 * Feature 029. Read-only convenience lookup for Tip Split's "Pull
 * clocked-in team": whoever has a genuinely open shift right now
 * (`getActiveClockedInRows`), resolved to THIS organization's own
 * profile ids via `attendance_identity_links` -- strictly UUID-to-UUID,
 * never a name-string match. An active Neon row for a Neon user with no
 * link at all is silently excluded: there is no corresponding team-
 * member checkbox to preselect for them in the first place, and this is
 * only ever a starting-point suggestion the manager reviews before
 * submitting, never a write of its own (see this feature's own
 * Reconciliation 2 -- the frozen-snapshot guarantee this reads toward is
 * already enforced at the RLS layer, independent of anything here).
 */
export async function fetchClockedInRoster(
  supabase: TypedSupabaseClient,
  input: {
    organizationId: string;
    serviceDate: string;
    /**
     * V2-006.006. The VERIFIED location the suggestion is for. When given, the location's
     * attendance mode decides the source so the two sources are never silently mixed:
     *   internal_the_lineup → native open sessions at that location;
     *   disabled            → no attendance-derived suggestion;
     *   external / unset    → the existing Neon path below, unchanged.
     * When omitted the behaviour is exactly the pre-V2 Neon path.
     */
    locationId?: string;
  },
): Promise<ClockedInRosterResult<string[]>> {
  if (input.locationId) {
    const mode = await readLocationAttendanceMode(supabase, input.locationId);
    if (!mode.ok) return mode;
    const decision = resolveFinancialSource(mode.mode);
    if (decision.state === "DISABLED") return { ok: true, data: [] };
    if (decision.state === "INTERNAL_THE_LINEUP") {
      const open = await listOpenNativeSessionProfileIds(supabase, {
        organizationId: input.organizationId,
        locationId: input.locationId,
      });
      if (!open.ok) return { ok: false, error: ROSTER_UNAVAILABLE };
      return { ok: true, data: open.profileIds };
    }
    // external / unconfigured: fall through to the unchanged Neon path.
  }

  const [activeRowsResult, linksResult] = await Promise.all([
    getActiveClockedInRows({ serviceDate: input.serviceDate }),
    listAttendanceIdentityLinks(supabase, {
      organizationId: input.organizationId,
    }),
  ]);
  if (!activeRowsResult.ok) return activeRowsResult;
  if (!linksResult.ok) return linksResult;

  const profileIdByNeonUserId = new Map(
    linksResult.data.map((link) => [link.neonUserId, link.profileId]),
  );
  const profileIds = new Set<string>();
  for (const row of activeRowsResult.data) {
    const profileId = profileIdByNeonUserId.get(row.userId);
    if (profileId) profileIds.add(profileId);
  }
  return { ok: true, data: [...profileIds] };
}
