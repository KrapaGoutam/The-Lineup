"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { Location } from "@/features/locations/domain/location";
import { getLocationById } from "@/features/locations/data/location-reader";
import {
  applyLocationLifecycleTransition,
  fetchLocationLifecycleReadiness,
  listLocationLifecycleEvents,
  type LifecycleErrorKind,
} from "@/features/locations/data/location-lifecycle";
import {
  getLocationLifecycleStatus,
  isLocationLifecycleAction,
  isLocationLifecycleStatus,
  validateLifecycleReason,
  validateLifecycleTransition,
  type LifecycleBlocker,
  type LocationLifecycleAction,
  type LocationLifecycleEvent,
  type LocationLifecycleReadiness,
  type LocationLifecycleStatus,
} from "@/features/locations/domain/location-lifecycle";
import {
  verifyLocationAdminAuthority,
  type ActionResult,
} from "@/features/locations/actions/location-admin-actions";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";

/**
 * V2-002.005 — Location lifecycle server actions.
 *
 * Every action: live session → actor from `supabase.auth.getUser()` (never from
 * input) → management authority over the claimed organization → the location
 * is resolved from persisted data and must belong to that organization →
 * delegate to the database RPC, which remains the final authority and
 * re-checks authority, state and blockers inside its own transaction.
 * No service-role client is used.
 */

const UNAUTHENTICATED = "Unauthenticated. Please sign in.";
const UNAUTHORIZED =
  "Unauthorized: management authority required for this organization.";

export interface LifecycleActionError {
  readonly kind?: LifecycleErrorKind;
  readonly blockers?: readonly LifecycleBlocker[];
}

export type LifecycleActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | (Extract<ActionResult<T>, { ok: false }> & LifecycleActionError);

interface Authorized {
  readonly supabase: SupabaseClient<Database>;
  readonly location: Location;
}

async function authorize(
  organizationId: string,
  locationId: string,
  client?: SupabaseClient<Database>,
): Promise<
  | { readonly ok: true; readonly value: Authorized }
  | Extract<ActionResult<never>, { ok: false }>
> {
  if (!organizationId?.trim()) {
    return { ok: false, error: "Organization ID is required." };
  }
  if (!locationId?.trim()) {
    return { ok: false, error: "Location ID is required." };
  }

  const supabase = client ?? (await createClient());
  const sessionCheck = await requireLiveSession(supabase);
  if (sessionCheck) {
    return { ok: false, error: sessionCheck.error, sessionInvalid: true };
  }
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false, error: UNAUTHENTICATED, sessionInvalid: true };
  }

  const authorized = await verifyLocationAdminAuthority(
    user.id,
    organizationId.trim(),
    supabase,
  );
  if (!authorized) {
    return { ok: false, error: UNAUTHORIZED, code: "UNAUTHORIZED" };
  }

  const location = await getLocationById(locationId.trim(), supabase);
  if (!location) {
    return {
      ok: false,
      error: "Location not found or access denied.",
      code: "NOT_FOUND",
    };
  }
  if (location.organizationId !== organizationId.trim()) {
    return {
      ok: false,
      error: "Location does not belong to the selected organization.",
      code: "TENANT_MISMATCH",
    };
  }
  return { ok: true, value: { supabase, location } };
}

/** Informational readiness preview for the confirmation dialog. */
export async function getLocationLifecycleReadinessAction(
  params: { readonly organizationId: string; readonly locationId: string },
  client?: SupabaseClient<Database>,
): Promise<ActionResult<LocationLifecycleReadiness>> {
  try {
    const auth = await authorize(
      params.organizationId,
      params.locationId,
      client,
    );
    if (!auth.ok) return auth;
    const result = await fetchLocationLifecycleReadiness(
      auth.value.location.id,
      auth.value.supabase,
    );
    if (!result.success) {
      return { ok: false, error: result.error, code: result.kind };
    }
    return { ok: true, data: result.data };
  } catch (err: unknown) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Failed to load lifecycle status.",
    };
  }
}

/** Audit history for a location (View History). */
export async function listLocationLifecycleEventsAction(
  params: { readonly organizationId: string; readonly locationId: string },
  client?: SupabaseClient<Database>,
): Promise<ActionResult<LocationLifecycleEvent[]>> {
  try {
    const auth = await authorize(
      params.organizationId,
      params.locationId,
      client,
    );
    if (!auth.ok) return auth;
    const events = await listLocationLifecycleEvents(
      auth.value.location.id,
      auth.value.supabase,
    );
    return { ok: true, data: events };
  } catch (err: unknown) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to load lifecycle history.",
    };
  }
}

/** Client-supplied transition request. Only these fields are ever read. */
export interface TransitionLocationLifecycleParams {
  readonly organizationId: string;
  readonly locationId: string;
  readonly action: LocationLifecycleAction;
  readonly reason: string;
  readonly expectedStatus?: LocationLifecycleStatus;
}

/**
 * Applies one audited lifecycle transition. Forged `actorProfileId`,
 * `isManager`, `overallRole` … are never read; the database derives the actor.
 */
export async function transitionLocationLifecycleAction(
  params: TransitionLocationLifecycleParams,
  client?: SupabaseClient<Database>,
): Promise<LifecycleActionResult<Location>> {
  if (!isLocationLifecycleAction(params?.action)) {
    return {
      ok: false,
      error: "Unknown lifecycle action.",
      code: "INVALID_INPUT",
    };
  }
  const reasonCheck = validateLifecycleReason(params.reason);
  if (!reasonCheck.valid) {
    return {
      ok: false,
      error: reasonCheck.errors[0] ?? "A reason is required.",
      code: "INVALID_INPUT",
    };
  }
  if (
    params.expectedStatus !== undefined &&
    !isLocationLifecycleStatus(params.expectedStatus)
  ) {
    return {
      ok: false,
      error: "Invalid expected status.",
      code: "INVALID_INPUT",
    };
  }

  try {
    const auth = await authorize(
      params.organizationId,
      params.locationId,
      client,
    );
    if (!auth.ok) return auth;

    // Early, cheap rejection against persisted state; the RPC is still final.
    const current = getLocationLifecycleStatus(auth.value.location);
    const transition = validateLifecycleTransition(current, params.action);
    if (!transition.valid) {
      return {
        ok: false,
        error: transition.error ?? "Invalid lifecycle transition.",
        code: "INVALID_TRANSITION",
        kind: "INVALID_TRANSITION",
      };
    }

    const result = await applyLocationLifecycleTransition(
      {
        locationId: auth.value.location.id,
        action: params.action,
        reason: params.reason.trim(),
        expectedStatus: params.expectedStatus ?? current,
      },
      auth.value.supabase,
    );
    if (!result.success) {
      return {
        ok: false,
        error: result.error,
        code: result.kind,
        kind: result.kind,
        blockers: result.blockers,
      };
    }
    return { ok: true, data: result.data };
  } catch (err: unknown) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Lifecycle transition failed.",
    };
  }
}
