import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.generated";
import type { LocationRoleAssignment } from "@/features/auth/domain/location-role";
import { mapLocationRoleRow } from "@/features/auth/domain/location-role";
import {
  listLocationRoles,
  listActiveLocationRoles,
} from "@/features/auth/data/location-role";
import type { LocationAssignmentChangeInput } from "@/features/auth/domain/location-assignment";
import { validateLocationAssignmentChanges } from "@/features/auth/domain/location-assignment";
import { createClient } from "@/lib/supabase/server";

export interface LocationAssignmentSuccess {
  readonly success: true;
  readonly assignments: LocationRoleAssignment[];
}

export interface LocationAssignmentFailure {
  readonly success: false;
  readonly error: string;
  readonly code: string;
}

export type LocationAssignmentResult =
  | LocationAssignmentSuccess
  | LocationAssignmentFailure;

/**
 * Server-authoritative read contract for a profile's complete explicit location assignment matrix
 * (both active and inactive assignments), ordered deterministically.
 */
export async function listProfileLocationAssignments(
  profileId: string,
  client?: SupabaseClient<Database>,
): Promise<LocationRoleAssignment[]> {
  return listLocationRoles(profileId, client);
}

/**
 * Server-authoritative read contract returning only ACTIVE location assignments for a profile.
 */
export async function listActiveProfileLocationAssignments(
  profileId: string,
  client?: SupabaseClient<Database>,
): Promise<LocationRoleAssignment[]> {
  return listActiveLocationRoles(profileId, client);
}

/**
 * Helper mapping PostgreSQL RPC error codes/messages to structured domain error codes.
 */
function mapRpcErrorCode(error: { message: string; code?: string }): string {
  const msg = error.message.toLowerCase();
  if (msg.includes("authentication required")) return "UNAUTHORIZED";
  if (msg.includes("lacks active membership")) return "MEMBERSHIP_REQUIRED";
  if (msg.includes("unauthorized") || error.code === "42501")
    return "UNAUTHORIZED";
  if (msg.includes("duplicate location") || error.code === "23505")
    return "DUPLICATE_LOCATION";
  if (msg.includes("does not exist") || error.code === "P0002")
    return "NOT_FOUND";
  if (msg.includes("invalid") || error.code === "22P02")
    return "INVALID_ARGUMENT";
  return "MUTATION_FAILED";
}

/**
 * Server-authoritative mutation contract applying an explicit change-set of location assignments.
 * Invariants enforced:
 * 1. Actor identity is resolved strictly from server session context (never trusted from payload).
 * 2. Pre-validates change-set: empty is a deterministic no-op, duplicate locations fail-closed.
 * 3. Atomic execution: entire batch succeeds or fails together (0 partial writes).
 * 4. Fails closed with structured domain codes on validation or authorization errors.
 */
export async function applyLocationAssignmentChanges(
  targetProfileId: string,
  changes: readonly LocationAssignmentChangeInput[],
  client?: SupabaseClient<Database>,
): Promise<LocationAssignmentResult> {
  if (!targetProfileId) {
    return {
      success: false,
      error: "Target profile ID is required",
      code: "MISSING_TARGET_PROFILE",
    };
  }

  // 1. Pure pre-validation of change instructions
  const validation = validateLocationAssignmentChanges(changes);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error,
      code: validation.code,
    };
  }

  // Deterministic no-op for empty change set
  if (validation.changes.length === 0) {
    return {
      success: true,
      assignments: [],
    };
  }

  try {
    const supabase = client ?? (await createClient());

    // 2. Format validated payload for PostgreSQL RPC
    const formattedPayload = validation.changes.map((c) => ({
      locationId: c.locationId,
      action: c.action,
      role: c.role,
      active: c.active,
    }));

    // 3. Invoke atomic PostgreSQL RPC
    const { data, error } = await supabase.rpc(
      "apply_location_assignment_changes",
      {
        p_target_profile_id: targetProfileId,
        p_changes: formattedPayload as unknown as Json,
      },
    );

    if (error) {
      return {
        success: false,
        error: error.message,
        code: mapRpcErrorCode(error),
      };
    }

    const assignments = (data ?? []).map((row) =>
      mapLocationRoleRow(
        row as unknown as Parameters<typeof mapLocationRoleRow>[0],
      ),
    );

    return {
      success: true,
      assignments,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return {
      success: false,
      error: message,
      code: "INTERNAL_ERROR",
    };
  }
}
