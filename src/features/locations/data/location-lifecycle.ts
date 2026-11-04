import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { Location } from "@/features/locations/domain/location";
import { mapLocationRow } from "@/features/locations/domain/location";
import {
  LIFECYCLE_ERROR_CODES,
  parseBlockedDetail,
  parseLifecycleReadiness,
  type LifecycleBlocker,
  type LocationLifecycleAction,
  type LocationLifecycleEvent,
  type LocationLifecycleReadiness,
  type LocationLifecycleStatus,
} from "@/features/locations/domain/location-lifecycle";
import { createClient } from "@/lib/supabase/server";

/**
 * V2-002.005 — Location lifecycle data access.
 *
 * Thin, server-only wrappers over the database authority:
 *  - `public.get_location_lifecycle_readiness` (informational preview),
 *  - `public.transition_location_lifecycle` (transactional, audited, final),
 *  - `public.location_lifecycle_events` (append-only audit, read under RLS).
 * The actor is never passed: the database derives it from `auth.uid()`.
 */

export type LifecycleErrorKind =
  | "BLOCKED"
  | "INVALID_TRANSITION"
  | "STATE_CONFLICT"
  | "UNAUTHORIZED"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "UNKNOWN";

export type LifecycleResult<T> =
  | { readonly success: true; readonly data: T }
  | {
      readonly success: false;
      readonly error: string;
      readonly kind: LifecycleErrorKind;
      readonly blockers?: readonly LifecycleBlocker[];
    };

interface RpcError {
  readonly message?: string;
  readonly code?: string;
  readonly details?: string | null;
}

export function classifyLifecycleError(error: RpcError): {
  kind: LifecycleErrorKind;
  message: string;
  blockers?: LifecycleBlocker[];
} {
  const message = error.message?.trim() || "Lifecycle operation failed.";
  switch (error.code) {
    case LIFECYCLE_ERROR_CODES.blocked:
      return {
        kind: "BLOCKED",
        message,
        blockers: parseBlockedDetail(error.details),
      };
    case LIFECYCLE_ERROR_CODES.invalidTransition:
      return { kind: "INVALID_TRANSITION", message };
    case LIFECYCLE_ERROR_CODES.stateConflict:
      return { kind: "STATE_CONFLICT", message };
    case LIFECYCLE_ERROR_CODES.unauthorized:
      return { kind: "UNAUTHORIZED", message };
    case LIFECYCLE_ERROR_CODES.invalidInput:
      return { kind: "INVALID_INPUT", message };
    case LIFECYCLE_ERROR_CODES.notFound:
      return { kind: "NOT_FOUND", message };
    default:
      return { kind: "UNKNOWN", message };
  }
}

/** Informational readiness preview (the transition re-checks transactionally). */
export async function fetchLocationLifecycleReadiness(
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<LifecycleResult<LocationLifecycleReadiness>> {
  if (!locationId?.trim()) {
    return {
      success: false,
      error: "Location ID is required.",
      kind: "INVALID_INPUT",
    };
  }
  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase.rpc(
      "get_location_lifecycle_readiness",
      { p_location_id: locationId.trim() },
    );
    if (error) {
      const c = classifyLifecycleError(error);
      return { success: false, error: c.message, kind: c.kind };
    }
    const parsed = parseLifecycleReadiness(data);
    if (!parsed) {
      return {
        success: false,
        error: "Unexpected lifecycle readiness response.",
        kind: "UNKNOWN",
      };
    }
    return { success: true, data: parsed };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to load lifecycle status.",
      kind: "UNKNOWN",
    };
  }
}

export interface LifecycleTransitionParams {
  readonly locationId: string;
  readonly action: LocationLifecycleAction;
  readonly reason: string;
  readonly expectedStatus?: LocationLifecycleStatus | null;
}

/** Applies one audited lifecycle transition through the database RPC. */
export async function applyLocationLifecycleTransition(
  params: LifecycleTransitionParams,
  client?: SupabaseClient<Database>,
): Promise<LifecycleResult<Location>> {
  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase.rpc(
      "transition_location_lifecycle",
      {
        p_location_id: params.locationId,
        p_action: params.action,
        p_reason: params.reason,
        ...(params.expectedStatus
          ? { p_expected_status: params.expectedStatus }
          : {}),
      },
    );
    if (error) {
      const c = classifyLifecycleError(error);
      return {
        success: false,
        error: c.message,
        kind: c.kind,
        blockers: c.blockers,
      };
    }
    if (!data) {
      return {
        success: false,
        error: "Lifecycle transition returned no location.",
        kind: "UNKNOWN",
      };
    }
    return { success: true, data: mapLocationRow(data) };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Lifecycle transition failed.",
      kind: "UNKNOWN",
    };
  }
}

const EVENT_COLUMNS =
  "id, location_id, organization_id, actor_profile_id, action, previous_state, new_state, reason, changed_at" as const;

/** Newest-first lifecycle audit history (RLS limits it to management scope). */
export async function listLocationLifecycleEvents(
  locationId: string,
  client?: SupabaseClient<Database>,
  limit = 50,
): Promise<LocationLifecycleEvent[]> {
  if (!locationId?.trim()) return [];
  try {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("location_lifecycle_events")
      .select(EVENT_COLUMNS)
      .eq("location_id", locationId.trim())
      .order("changed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)));
    if (error || !data) return [];
    return data.map((row) => ({
      id: row.id,
      locationId: row.location_id,
      organizationId: row.organization_id,
      actorProfileId: row.actor_profile_id,
      action: row.action as LocationLifecycleAction,
      previousState: row.previous_state as LocationLifecycleStatus,
      newState: row.new_state as LocationLifecycleStatus,
      reason: row.reason,
      changedAt: row.changed_at,
    }));
  } catch {
    return [];
  }
}
