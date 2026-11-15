import type {
  LocationRole,
  LocationRoleAssignment,
} from "@/features/auth/domain/location-role";
import { isLocationRole } from "@/features/auth/domain/location-role";

export type LocationAssignmentAction =
  | "assign"
  | "update"
  | "deactivate"
  | "reactivate";

export const LOCATION_ASSIGNMENT_ACTIONS: readonly LocationAssignmentAction[] =
  ["assign", "update", "deactivate", "reactivate"] as const;

export function isLocationAssignmentAction(
  value: unknown,
): value is LocationAssignmentAction {
  return (
    typeof value === "string" &&
    LOCATION_ASSIGNMENT_ACTIONS.includes(value as LocationAssignmentAction)
  );
}

/**
 * Raw change input passed into assignment mutation workflows.
 * Supports either explicit action (`action: 'assign' | 'update' | 'deactivate' | 'reactivate'`)
 * or state-based desired fields (`role: 'manager', active: true`).
 */
export interface LocationAssignmentChangeInput {
  readonly locationId: string;
  readonly action?: LocationAssignmentAction;
  readonly role?: LocationRole;
  readonly active?: boolean;
}

/**
 * Normalized and validated change instruction ready for server-authoritative execution.
 */
export interface ValidatedLocationAssignmentChange {
  readonly locationId: string;
  readonly action: LocationAssignmentAction;
  readonly role?: LocationRole;
  readonly active: boolean;
}

export type AssignmentValidationResult =
  | {
      readonly success: true;
      readonly changes: readonly ValidatedLocationAssignmentChange[];
    }
  | { readonly success: false; readonly error: string; readonly code: string };

/**
 * Pure validator verifying and normalizing an array of location assignment change instructions.
 * Invariants:
 * 1. Empty change set returns a deterministic no-op ({ success: true, changes: [] }).
 * 2. Duplicate locationId entries within a single batch are strictly rejected.
 * 3. Non-empty string locationId is required.
 * 4. Allowed roles are strictly manager, assistant_manager, staff.
 * 5. Deactivation instructions explicitly record active = false.
 */
export function validateLocationAssignmentChanges(
  changes: unknown,
): AssignmentValidationResult {
  if (changes == null) {
    return { success: true, changes: [] };
  }

  if (!Array.isArray(changes)) {
    return {
      success: false,
      error: "Changes input must be an array",
      code: "INVALID_INPUT",
    };
  }

  if (changes.length === 0) {
    return { success: true, changes: [] };
  }

  const seenLocationIds = new Set<string>();
  const validatedChanges: ValidatedLocationAssignmentChange[] = [];

  for (let i = 0; i < changes.length; i++) {
    const raw = changes[i];
    if (typeof raw !== "object" || raw === null) {
      return {
        success: false,
        error: `Change item at index ${i} must be an object`,
        code: "INVALID_ITEM",
      };
    }

    const item = raw as Partial<LocationAssignmentChangeInput>;
    const locId = (item.locationId ?? "").trim();
    if (!locId) {
      return {
        success: false,
        error: `Change item at index ${i} is missing locationId`,
        code: "MISSING_LOCATION_ID",
      };
    }

    if (seenLocationIds.has(locId)) {
      return {
        success: false,
        error: `Duplicate locationId ${locId} in change batch`,
        code: "DUPLICATE_LOCATION",
      };
    }
    seenLocationIds.add(locId);

    // Determine action and active flag
    let action: LocationAssignmentAction;
    if (item.action) {
      if (!isLocationAssignmentAction(item.action)) {
        return {
          success: false,
          error: `Invalid action "${item.action}" at index ${i}`,
          code: "INVALID_ACTION",
        };
      }
      action = item.action;
    } else if (item.active === false) {
      action = "deactivate";
    } else {
      action = "assign";
    }

    if (action === "deactivate") {
      // Role is optional for deactivation, but if supplied must be valid
      if (item.role != null && !isLocationRole(item.role)) {
        return {
          success: false,
          error: `Invalid role "${item.role}" for deactivation at index ${i}`,
          code: "INVALID_ROLE",
        };
      }

      validatedChanges.push({
        locationId: locId,
        action: "deactivate",
        role: item.role,
        active: false,
      });
    } else {
      // assign, update, reactivate: role is required and must be valid
      if (!item.role || !isLocationRole(item.role)) {
        return {
          success: false,
          error: `Invalid or missing location role "${item.role}" at index ${i}`,
          code: "INVALID_ROLE",
        };
      }

      validatedChanges.push({
        locationId: locId,
        action,
        role: item.role,
        active: true,
      });
    }
  }

  return {
    success: true,
    changes: validatedChanges,
  };
}

/**
 * Pure helper grouping an array of location role assignments by owning organization ID.
 */
export function groupAssignmentsByOrganization(
  assignments: readonly LocationRoleAssignment[],
): Map<string, LocationRoleAssignment[]> {
  const map = new Map<string, LocationRoleAssignment[]>();
  for (const a of assignments) {
    const orgId = a.organizationId ?? "unscoped";
    const group = map.get(orgId) ?? [];
    group.push(a);
    map.set(orgId, group);
  }
  return map;
}

/**
 * Pure helper finding an assignment for a specific locationId in a collection.
 */
export function findAssignmentForLocation(
  assignments: readonly LocationRoleAssignment[],
  locationId: string,
): LocationRoleAssignment | null {
  if (!locationId) return null;
  return assignments.find((a) => a.locationId === locationId) ?? null;
}

/**
 * Pure predicate checking whether a collection of assignments contains an active assignment for locationId.
 */
export function hasActiveLocationAssignment(
  assignments: readonly LocationRoleAssignment[],
  locationId: string,
): boolean {
  if (!locationId) return false;
  return assignments.some((a) => a.locationId === locationId && a.active);
}
