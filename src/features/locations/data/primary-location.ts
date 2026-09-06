import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The organization's one location for this pilot (bootstrap creates
 * exactly one). Multi-location selection is out of scope until real
 * usage shows it's needed -- a deliberate simplification, not an
 * oversight, shared by every real-mode data loader that needs "the"
 * location (schedule, tips, and eventually allocation in Phase C).
 */
export async function getPrimaryLocation(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("id, time_zone")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}
