import type { Location } from "@/features/locations/domain/location";
import {
  EMPTY_RETAINED_COUNTS,
  evaluateLocationLifecycle,
  getLocationLifecycleStatus,
  validateLifecycleReason,
  validateLifecycleTransition,
  type LifecycleBlocker,
  type LocationLifecycleEvent,
  type LocationLifecycleReadiness,
} from "@/features/locations/domain/location-lifecycle";
import type {
  LifecycleSourceResult,
  LocationLifecycleSource,
} from "./location-lifecycle-source";

/**
 * Isolated in-memory lifecycle source for Demo Mode. It deliberately imports
 * nothing from the server actions, so demo lifecycle changes can never contact
 * the hosted database. State lives in the closure and is NOT persisted: it is
 * a demonstration, not database verification.
 */
export const DEMO_LIFECYCLE_BLOCKERS: Readonly<
  Record<string, readonly LifecycleBlocker[]>
> = {
  "demo-loc-1": [
    {
      code: "ACTIVE_SERVICE_SESSIONS",
      count: 1,
      capped: false,
      deactivate: "hard",
      archive: "hard",
    },
    {
      code: "OPEN_TASKS",
      count: 2,
      capped: false,
      deactivate: "warning",
      archive: "hard",
    },
  ],
};

export function createDemoLocationLifecycleSource(): LocationLifecycleSource {
  const events: LocationLifecycleEvent[] = [];
  let nextEventId = 1;

  return {
    kind: "demo",

    async loadReadiness(organizationId, location) {
      const status = getLocationLifecycleStatus(location);
      const blockers = DEMO_LIFECYCLE_BLOCKERS[location.id] ?? [];
      const base = { status, blockers };
      const readiness: LocationLifecycleReadiness = {
        locationId: location.id,
        organizationId,
        status,
        canDeactivate: evaluateLocationLifecycle(base, "deactivate").allowed,
        canReactivate: status === "inactive",
        canArchive: evaluateLocationLifecycle(base, "archive").allowed,
        canRestoreArchive: status === "archived",
        blockers,
        retained: {
          ...EMPTY_RETAINED_COUNTS,
          locationAssignments: 3,
          closedServiceSessions: 12,
          shifts: 48,
          finalizedTipPools: 12,
        },
      };
      return { ok: true, data: readiness };
    },

    async transition({
      organizationId,
      location,
      action,
      reason,
    }): Promise<LifecycleSourceResult<Location>> {
      const reasonCheck = validateLifecycleReason(reason);
      if (!reasonCheck.valid) {
        return {
          ok: false,
          error: reasonCheck.errors[0] ?? "A reason is required.",
          code: "INVALID_INPUT",
          kind: "INVALID_INPUT",
        };
      }
      const previous = getLocationLifecycleStatus(location);
      const transition = validateLifecycleTransition(previous, action);
      if (!transition.valid || !transition.nextStatus) {
        return {
          ok: false,
          error: transition.error ?? "Invalid lifecycle transition.",
          code: "INVALID_TRANSITION",
          kind: "INVALID_TRANSITION",
        };
      }
      const blockers = DEMO_LIFECYCLE_BLOCKERS[location.id] ?? [];
      const evaluation = evaluateLocationLifecycle(
        { status: previous, blockers },
        action,
      );
      if (evaluation.hardBlockers.length > 0) {
        return {
          ok: false,
          error: `Cannot ${action} this location while unresolved operational work exists`,
          code: "BLOCKED",
          kind: "BLOCKED",
          blockers: evaluation.hardBlockers,
        };
      }

      const now = new Date().toISOString();
      const next = transition.nextStatus;
      const updated: Location = {
        ...location,
        active: next === "active",
        archivedAt: next === "archived" ? now : null,
        updatedAt: now,
      };
      events.unshift({
        id: nextEventId++,
        locationId: location.id,
        organizationId,
        actorProfileId: "demo-user",
        action,
        previousState: previous,
        newState: next,
        reason: reason.trim(),
        changedAt: now,
      });
      return { ok: true, data: updated };
    },

    async loadHistory(_organizationId, location) {
      return {
        ok: true,
        data: events.filter((e) => e.locationId === location.id),
      };
    },
  };
}
