import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OverallRole } from "@/features/auth/domain/overall-role";
import { normalizeOverallRole } from "@/features/auth/domain/overall-role";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.generated";

/**
 * Server-authoritative reader for a user's Overall Role.
 * Returns null if the user has no Overall Role assigned or if an invalid value is encountered.
 */
export async function getOverallRole(
  userId: string,
  client?: SupabaseClient<Database>,
): Promise<OverallRole | null> {
  if (!userId) return null;

  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("overall_roles")
      .select("role")
      .eq("profile_id", userId)
      .maybeSingle();

    if (error || !data?.role) {
      return null;
    }

    return normalizeOverallRole(data.role);
  } catch {
    return null;
  }
}

/**
 * Returns the currently authenticated user's Overall Role,
 * or null if unauthenticated / unassigned.
 */
export async function getCurrentUserOverallRole(
  client?: SupabaseClient<Database>,
): Promise<OverallRole | null> {
  try {
    const supabase = client ?? (await createClient());
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return getOverallRole(user.id, supabase);
  } catch {
    return null;
  }
}
