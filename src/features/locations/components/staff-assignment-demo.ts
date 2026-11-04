import type {
  LocationRole,
  LocationRoleAssignment,
} from "@/features/auth/domain/location-role";
import type { StaffRosterMember } from "@/features/locations/domain/staff-assignment";
import { validateLocationAssignmentChanges } from "@/features/auth/domain/location-assignment";
import type {
  SourceResult,
  StaffAssignmentSource,
} from "./staff-assignment-source";

/**
 * Synthetic, in-memory staff assignment source for demo mode.
 * It never imports server actions and never touches the database.
 */

export const DEMO_ORG_ID = "demo-org-1";

export const DEMO_STAFF: readonly StaffRosterMember[] = [
  {
    profileId: "demo-john",
    displayName: "John Carter",
    organizationRoles: ["general_manager"],
    membershipActive: true,
  },
  {
    profileId: "demo-sam",
    displayName: "Sam Ortega",
    organizationRoles: ["server"],
    membershipActive: true,
  },
  {
    profileId: "demo-naveen",
    displayName: "Naveen Rao",
    organizationRoles: ["shift_manager"],
    membershipActive: true,
  },
  {
    profileId: "demo-priya",
    displayName: "Priya Shah",
    organizationRoles: ["host"],
    membershipActive: true,
  },
  {
    profileId: "demo-lee",
    displayName: "Lee Former",
    organizationRoles: ["server"],
    membershipActive: false,
  },
];

function row(
  id: number,
  profileId: string,
  locationId: string,
  role: LocationRole,
  active: boolean,
): LocationRoleAssignment {
  return {
    id,
    profileId,
    locationId,
    organizationId: DEMO_ORG_ID,
    role,
    active,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const INITIAL_ASSIGNMENTS: readonly LocationRoleAssignment[] = [
  row(1, "demo-john", "demo-loc-1", "manager", true),
  row(2, "demo-john", "demo-loc-2", "assistant_manager", true),
  row(3, "demo-sam", "demo-loc-2", "staff", true),
  row(4, "demo-naveen", "demo-loc-2", "assistant_manager", false),
  row(5, "demo-lee", "demo-loc-1", "staff", false),
];

export function createDemoStaffAssignmentSource(): StaffAssignmentSource {
  let assignments: LocationRoleAssignment[] = [...INITIAL_ASSIGNMENTS];
  let nextId = 100;
  const fail = <T>(error: string, code?: string): SourceResult<T> => ({
    ok: false,
    error,
    code,
  });

  return {
    kind: "demo",
    async loadOrganizationStaff() {
      return { ok: true, data: [...DEMO_STAFF] };
    },
    async loadLocationStaff(_orgId, locationId) {
      return {
        ok: true,
        data: {
          roster: [...DEMO_STAFF],
          assignments: assignments.filter((a) => a.locationId === locationId),
        },
      };
    },
    async loadEmployeeAssignments(_orgId, profileId) {
      const member = DEMO_STAFF.find((m) => m.profileId === profileId);
      if (!member)
        return fail("Employee is not a member of this organization.");
      return {
        ok: true,
        data: {
          member,
          assignments: assignments.filter((a) => a.profileId === profileId),
        },
      };
    },
    async applyChanges(_orgId, profileId, changes) {
      const member = DEMO_STAFF.find((m) => m.profileId === profileId);
      if (!member)
        return fail("Employee is not a member of this organization.");
      const validation = validateLocationAssignmentChanges(changes);
      if (!validation.success) return fail(validation.error, validation.code);

      const next = [...assignments];
      const touched: LocationRoleAssignment[] = [];
      for (const c of validation.changes) {
        const idx = next.findIndex(
          (a) => a.profileId === profileId && a.locationId === c.locationId,
        );
        if (c.action !== "deactivate" && !member.membershipActive) {
          return fail(
            "Employee must have an active organization membership before assignment.",
            "MEMBERSHIP_REQUIRED",
          );
        }
        const now = new Date().toISOString();
        if (c.action === "deactivate") {
          if (idx < 0) return fail("No assignment to deactivate.", "NOT_FOUND");
          next[idx] = { ...next[idx], active: false, updatedAt: now };
          touched.push(next[idx]);
        } else if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            role: c.role as LocationRole,
            active: true,
            updatedAt: now,
          };
          touched.push(next[idx]);
        } else {
          const created: LocationRoleAssignment = {
            id: nextId++,
            profileId,
            locationId: c.locationId,
            organizationId: DEMO_ORG_ID,
            role: c.role as LocationRole,
            active: true,
            createdAt: now,
            updatedAt: now,
          };
          next.push(created);
          touched.push(created);
        }
      }
      assignments = next;
      return { ok: true, data: touched };
    },
  };
}
