import type {
  LocationRole,
  LocationRoleAssignment,
} from "@/features/auth/domain/location-role";
import {
  LOCATION_ROLES,
  isLocationRole,
} from "@/features/auth/domain/location-role";
import type { LocationAssignmentChangeInput } from "@/features/auth/domain/location-assignment";
import { validateLocationAssignmentChanges } from "@/features/auth/domain/location-assignment";

/**
 * V2-002.004 — Staff Assignment Management (pure domain helpers).
 *
 * Three role vocabularies exist and MUST NOT be mixed:
 * - Overall roles (`public.overall_roles`): owner | manager | assistant_manager
 * - Organization roles (`public.memberships.roles`): owner | general_manager | shift_manager | host | server
 * - Location roles (`public.location_memberships.role`): manager | assistant_manager | staff
 *
 * Only the third vocabulary is ever offered by the assignment UI.
 */

export interface LocationRoleOption {
  readonly value: LocationRole;
  readonly label: string;
}

const LOCATION_ROLE_LABELS: Readonly<Record<LocationRole, string>> = {
  manager: "Manager",
  assistant_manager: "Assistant Manager",
  staff: "Staff",
};

/** Exactly the three canonical location roles, in display order. */
export const LOCATION_ROLE_OPTIONS: readonly LocationRoleOption[] =
  LOCATION_ROLES.map((value) => ({
    value,
    label: LOCATION_ROLE_LABELS[value],
  }));

export function locationRoleLabel(role: LocationRole): string {
  return LOCATION_ROLE_LABELS[role];
}

/** Default role pre-selected when assigning an employee to a new location. */
export const DEFAULT_LOCATION_ROLE: LocationRole = "staff";

/**
 * A person with a membership in the organization being administered.
 * Sourced from `public.memberships` joined to `public.profiles` and keyed by
 * the stable `profileId` (display names are not unique).
 * Never carries passcodes, credentials or attendance identifiers.
 */
export interface StaffRosterMember {
  readonly profileId: string;
  readonly displayName: string;
  /** Organization-level roles (public.memberships.roles) — NOT location roles. */
  readonly organizationRoles: readonly string[];
  /** Whether the organization membership is active. */
  readonly membershipActive: boolean;
}

export type StaffAssignmentStatus =
  | "assigned"
  | "inactive_assignment"
  | "not_assigned"
  | "membership_inactive";

const STATUS_LABELS: Readonly<Record<StaffAssignmentStatus, string>> = {
  assigned: "Assigned",
  inactive_assignment: "Inactive Assignment",
  not_assigned: "Not Assigned",
  membership_inactive: "Organization Membership Inactive",
};

export function assignmentStatusLabel(status: StaffAssignmentStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Derives the unambiguous assignment status for a member at one location.
 * "Organization Membership Inactive" always wins: an inactive member is never
 * presented as eligible, regardless of historical assignment rows.
 */
export function deriveAssignmentStatus(
  member: Pick<StaffRosterMember, "membershipActive">,
  assignment: Pick<LocationRoleAssignment, "active"> | null | undefined,
): StaffAssignmentStatus {
  if (!member.membershipActive) return "membership_inactive";
  if (!assignment) return "not_assigned";
  return assignment.active ? "assigned" : "inactive_assignment";
}

const ORG_ROLE_LABELS: Readonly<Record<string, string>> = {
  owner: "Owner",
  general_manager: "General Manager",
  shift_manager: "Shift Manager",
  host: "Host",
  server: "Server",
};

export function organizationRoleLabel(role: string): string {
  return ORG_ROLE_LABELS[role] ?? role;
}

/** Deterministic roster ordering: active members first, then name, then id. */
export function sortRoster(
  roster: readonly StaffRosterMember[],
): StaffRosterMember[] {
  return [...roster].sort((a, b) => {
    if (a.membershipActive !== b.membershipActive) {
      return a.membershipActive ? -1 : 1;
    }
    const byName = a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    });
    if (byName !== 0) return byName;
    return a.profileId.localeCompare(b.profileId);
  });
}

/** Case-insensitive name search. Blank query returns the roster unchanged. */
export function filterRosterByName<T extends { displayName: string }>(
  roster: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...roster];
  return roster.filter((m) => m.displayName.toLowerCase().includes(q));
}

/** A location an administrator may edit assignments for. */
export interface AssignableLocation {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
}

/** The requested end state for one location in the multi-location editor. */
export interface DesiredLocationAssignment {
  readonly locationId: string;
  /** True → employee should hold an active assignment at this location. */
  readonly assigned: boolean;
  /** Required when `assigned` is true. */
  readonly role?: LocationRole;
}

export type ChangeSetResult =
  | {
      readonly success: true;
      readonly changes: readonly LocationAssignmentChangeInput[];
    }
  | { readonly success: false; readonly error: string; readonly code: string };

/**
 * Generates the minimal, deterministic change set for ONE employee.
 *
 * Invariants:
 * - Only locations present in `desired` can be touched. A location absent from
 *   `desired` is NEVER implicitly deactivated (no implicit revocation).
 * - Unchanged assignments are omitted.
 * - Locations outside `editableLocations` (other organizations) or inactive
 *   locations are rejected, never silently dropped.
 * - Duplicate instructions for one location are rejected.
 * - Output is sorted by locationId and passes `validateLocationAssignmentChanges`.
 */
export function buildAssignmentChangeSet(params: {
  readonly baseline: readonly LocationRoleAssignment[];
  readonly desired: readonly DesiredLocationAssignment[];
  readonly editableLocations: readonly AssignableLocation[];
}): ChangeSetResult {
  const { baseline, desired, editableLocations } = params;
  const editable = new Map(editableLocations.map((l) => [l.id, l]));
  const baselineByLocation = new Map(baseline.map((a) => [a.locationId, a]));
  const seen = new Set<string>();
  const changes: LocationAssignmentChangeInput[] = [];

  for (const want of desired) {
    const locationId = (want.locationId ?? "").trim();
    if (!locationId) {
      return {
        success: false,
        error: "A change is missing its location.",
        code: "MISSING_LOCATION_ID",
      };
    }
    if (seen.has(locationId)) {
      return {
        success: false,
        error: "Each location may only be changed once per save.",
        code: "DUPLICATE_LOCATION",
      };
    }
    seen.add(locationId);

    const location = editable.get(locationId);
    if (!location) {
      return {
        success: false,
        error: "A selected location is outside your management scope.",
        code: "LOCATION_OUT_OF_SCOPE",
      };
    }

    const current = baselineByLocation.get(locationId) ?? null;

    if (want.assigned) {
      if (!want.role || !isLocationRole(want.role)) {
        return {
          success: false,
          error: "Choose Manager, Assistant Manager or Staff.",
          code: "INVALID_ROLE",
        };
      }
      if (current?.active && current.role === want.role) continue; // unchanged
      if (!location.active) {
        return {
          success: false,
          error: `${location.name} is inactive and cannot receive assignments.`,
          code: "LOCATION_INACTIVE",
        };
      }
      const action = !current
        ? "assign"
        : current.active
          ? "update"
          : "reactivate";
      changes.push({ locationId, action, role: want.role, active: true });
    } else {
      // Not assigned: only meaningful when an active assignment exists.
      if (!current || !current.active) continue;
      if (!location.active) {
        return {
          success: false,
          error: `${location.name} is inactive; its assignments are read-only.`,
          code: "LOCATION_INACTIVE",
        };
      }
      changes.push({
        locationId,
        action: "deactivate",
        role: current.role,
        active: false,
      });
    }
  }

  changes.sort((a, b) => a.locationId.localeCompare(b.locationId));

  const validation = validateLocationAssignmentChanges(changes);
  if (!validation.success) return validation;

  return { success: true, changes };
}

/** Human-readable summary line for a generated change (review step). */
export function describeChange(
  change: LocationAssignmentChangeInput,
  locationName: string,
): string {
  switch (change.action) {
    case "assign":
      return `Assign to ${locationName} as ${locationRoleLabel(change.role ?? DEFAULT_LOCATION_ROLE)}`;
    case "update":
      return `Change role at ${locationName} to ${locationRoleLabel(change.role ?? DEFAULT_LOCATION_ROLE)}`;
    case "reactivate":
      return `Reactivate ${locationName} as ${locationRoleLabel(change.role ?? DEFAULT_LOCATION_ROLE)}`;
    case "deactivate":
      return `Remove assigned access to ${locationName}`;
    default:
      return `Update ${locationName}`;
  }
}

/** Keeps only assignments belonging to the given organization's locations. */
export function filterAssignmentsToLocations(
  assignments: readonly LocationRoleAssignment[],
  locationIds: ReadonlySet<string>,
): LocationRoleAssignment[] {
  return assignments.filter((a) => locationIds.has(a.locationId));
}

/**
 * Collapses assignments to one row per (location, profile), preferring the
 * most recently updated row. Mirrors `UNIQUE(location_id, profile_id)`.
 */
export function dedupeAssignments(
  assignments: readonly LocationRoleAssignment[],
): LocationRoleAssignment[] {
  const byKey = new Map<string, LocationRoleAssignment>();
  for (const a of assignments) {
    const key = `${a.locationId}:${a.profileId}`;
    const prev = byKey.get(key);
    if (!prev || (a.updatedAt ?? "") > (prev.updatedAt ?? "")) {
      byKey.set(key, a);
    }
  }
  return [...byKey.values()];
}
