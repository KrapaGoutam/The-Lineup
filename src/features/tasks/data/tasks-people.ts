import "server-only";

import type { VerifiedLocationScope } from "@/features/context/domain/active-context";
import type { Designation } from "@/features/auth/domain/passcode";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getTasksPeople(scope: VerifiedLocationScope) {
  const supabase = (await createClient()) as SupabaseClient<Database>;
  const result = await supabase.rpc("tasks_location_people", {
    p_organization_id: scope.organizationId,
    p_location_id: scope.locationId,
  });
  if (result.error) return null;
  return (result.data ?? []).map((person) => ({
    profileId: person.profile_id,
    name: person.display_name,
    designation: person.designation as Designation,
    eligible: person.eligible,
  }));
}
