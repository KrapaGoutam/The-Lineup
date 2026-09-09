import "server-only";

import { getActiveClockedInRows } from "@/features/attendance/data/attendance-data";
import { listAttendanceIdentityLinks } from "@/features/attendance/data/identity-links";
import type { createClient } from "@/lib/supabase/server";

// Matches the client `createClient()` actually returns (untyped against
// the generated Database schema, same as every other data-layer module
// in this app -- e.g. identity-links.ts's identical local alias).
type TypedSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ClockedInRosterResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

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
  input: { organizationId: string; serviceDate: string },
): Promise<ClockedInRosterResult<string[]>> {
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
