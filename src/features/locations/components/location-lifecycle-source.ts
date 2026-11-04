import type { Location } from "@/features/locations/domain/location";
import {
  getLocationLifecycleStatus,
  type LifecycleBlocker,
  type LocationLifecycleAction,
  type LocationLifecycleEvent,
  type LocationLifecycleReadiness,
} from "@/features/locations/domain/location-lifecycle";
import {
  getLocationLifecycleReadinessAction,
  listLocationLifecycleEventsAction,
  transitionLocationLifecycleAction,
} from "@/features/locations/actions/location-lifecycle-actions";

export type LifecycleSourceResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: string;
      readonly code?: string;
      readonly kind?: string;
      readonly blockers?: readonly LifecycleBlocker[];
      readonly sessionInvalid?: true;
    };

export interface LifecycleTransitionRequest {
  readonly organizationId: string;
  readonly location: Location;
  readonly action: LocationLifecycleAction;
  readonly reason: string;
}

/**
 * Data boundary for the location lifecycle UI. The live implementation calls
 * the server actions; the demo implementation (location-lifecycle-demo.ts) is
 * fully in-memory and never imports the server actions, so demo mode cannot
 * reach the hosted database.
 */
export interface LocationLifecycleSource {
  readonly kind: "live" | "demo";
  loadReadiness(
    organizationId: string,
    location: Location,
  ): Promise<LifecycleSourceResult<LocationLifecycleReadiness>>;
  transition(
    request: LifecycleTransitionRequest,
  ): Promise<LifecycleSourceResult<Location>>;
  loadHistory(
    organizationId: string,
    location: Location,
  ): Promise<LifecycleSourceResult<LocationLifecycleEvent[]>>;
}

export function createLiveLocationLifecycleSource(): LocationLifecycleSource {
  return {
    kind: "live",
    loadReadiness: (organizationId, location) =>
      getLocationLifecycleReadinessAction({
        organizationId,
        locationId: location.id,
      }),
    transition: ({ organizationId, location, action, reason }) =>
      transitionLocationLifecycleAction({
        organizationId,
        locationId: location.id,
        action,
        reason,
        // Optimistic-concurrency guard: the state the manager was looking at.
        expectedStatus: getLocationLifecycleStatus(location),
      }),
    loadHistory: (organizationId, location) =>
      listLocationLifecycleEventsAction({
        organizationId,
        locationId: location.id,
      }),
  };
}
