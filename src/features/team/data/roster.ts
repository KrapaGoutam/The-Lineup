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
 */
export async function getOrganizationRoster(
  organizationId: string,
): Promise<TeamMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("profile_id, roles, created_at, profiles(display_name)")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row, index) => {
    const name = row.profiles?.[0]?.display_name ?? "Unknown";
    const designation = designationForRoles(row.roles ?? []);
    return {
      id: row.profile_id,
      name,
      shortName: name.split(" ")[0] || name,
      role: designationToRole(designation),
      designation,
      color: SERVER_COLORS[index % SERVER_COLORS.length],
    };
  });
}
