import "server-only";

import {
  designationForRoles,
  designationToRole,
} from "@/features/auth/domain/passcode";
import type { TeamMember } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/server";

// Cycled by roster position, not stored -- there's no "server color"
// column, and a stable, deterministic assignment (same order every read)
// is all the allocation board's per-server dots actually need.
const SERVER_COLORS = [
  "var(--server-one)",
  "var(--server-two)",
  "var(--server-three)",
  "var(--server-four)",
  "var(--server-five)",
  "var(--server-six)",
  "var(--server-seven)",
];

/**
 * The real-mode roster, shaped to match `TeamMember` exactly so every
 * component that already consumes it (schedule's person picker and week
 * grid, allocation's quick-add, tips' participant list, the Team tab)
 * needs no change beyond where the array comes from -- the same "adapt
 * to the existing shape" strategy used throughout this feature.
 *
 * Feature 017: includes inactive (deactivated) members too, unlike
 * before -- the Team tab needs to see them to offer "Reactivate," and
 * this is the one roster query every real-mode consumer shares. Callers
 * that must never offer a deactivated person as an assignment target
 * (the schedule/allocation/tips pickers) filter on the returned `active`
 * field themselves (`restaurant-operations-app.tsx`'s `activeTeam`) --
 * this function stays the single source of the full roster, not two
 * near-duplicate queries.
 */
export async function getOrganizationRoster(
  organizationId: string,
): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("profile_id, roles, active, created_at, profiles(display_name)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) console.error("getOrganizationRoster", error);
  if (error || !data) return [];

  return data.map((row, index) => {
    // Supabase's generated types mark this embed as an array because
    // `memberships_profile_id_fkey`'s `isOneToOne` metadata is false --
    // but at runtime PostgREST always returns a single object for an
    // embed across the *embedding* table's own FK column (many
    // memberships to one profile), confirmed against the live project
    // directly. Indexing this as an array (as an earlier version of
    // this function did, to satisfy the compiler) silently produced
    // `undefined` for every real row -- every registered member showed
    // as "Unknown" until this was traced back to the live database.
    // See DATA_MODEL.md's "PostgREST embed cardinality" section.
    const profile = row.profiles as unknown as { display_name: string } | null;
    const name = profile?.display_name ?? "Unknown";
    const designation = designationForRoles(row.roles ?? []);
    return {
      id: row.profile_id,
      name,
      shortName: name.split(" ")[0] || name,
      role: designationToRole(designation),
      designation,
      color: SERVER_COLORS[index % SERVER_COLORS.length],
      active: row.active,
    };
  });
}
