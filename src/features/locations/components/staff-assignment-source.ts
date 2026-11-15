import type { LocationRoleAssignment } from "@/features/auth/domain/location-role";
import type { StaffRosterMember } from "@/features/locations/domain/staff-assignment";
import {
  applyStaffLocationChangesAction,
  getEmployeeLocationAssignmentsAction,
  getLocationStaffAction,
  listOrganizationStaffAction,
  type EmployeeLocationAssignmentsView,
  type LocationStaffView,
  type StaffLocationChange,
} from "@/features/locations/actions/staff-assignment-actions";

export type SourceResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error: string;
      readonly code?: string;
      readonly sessionInvalid?: true;
    };

/**
 * Data boundary for the staff assignment UI. The live implementation calls the
 * server actions; the demo implementation (staff-assignment-demo.ts) is fully
 * in-memory and never imports the server actions, so demo mode cannot reach
 * the real assignment RPC.
 */
export interface StaffAssignmentSource {
  readonly kind: "live" | "demo";
  loadOrganizationStaff(
    organizationId: string,
  ): Promise<SourceResult<StaffRosterMember[]>>;
  loadLocationStaff(
    organizationId: string,
    locationId: string,
  ): Promise<SourceResult<LocationStaffView>>;
  loadEmployeeAssignments(
    organizationId: string,
    profileId: string,
  ): Promise<SourceResult<EmployeeLocationAssignmentsView>>;
  applyChanges(
    organizationId: string,
    profileId: string,
    changes: readonly StaffLocationChange[],
  ): Promise<SourceResult<LocationRoleAssignment[]>>;
}

export function createLiveStaffAssignmentSource(): StaffAssignmentSource {
  return {
    kind: "live",
    loadOrganizationStaff: (organizationId) =>
      listOrganizationStaffAction(organizationId),
    loadLocationStaff: (organizationId, locationId) =>
      getLocationStaffAction(organizationId, locationId),
    loadEmployeeAssignments: (organizationId, profileId) =>
      getEmployeeLocationAssignmentsAction(organizationId, profileId),
    applyChanges: (organizationId, profileId, changes) =>
      applyStaffLocationChangesAction({
        organizationId,
        targetProfileId: profileId,
        changes,
      }),
  };
}
