import { Badge } from "@/components/ui/badge";
import type { LocationRole } from "@/features/auth/domain/location-role";
import {
  assignmentStatusLabel,
  locationRoleLabel,
  type StaffAssignmentStatus,
} from "@/features/locations/domain/staff-assignment";

export function LocationRoleBadge({ role }: { readonly role: LocationRole }) {
  return (
    <Badge tone={role === "staff" ? "neutral" : "accent"}>
      {locationRoleLabel(role)}
    </Badge>
  );
}

const STATUS_TONE = {
  assigned: "success",
  inactive_assignment: "warning",
  not_assigned: "neutral",
  membership_inactive: "warning",
} as const;

/** Status is always conveyed as text, never by color alone. */
export function AssignmentStatusBadge({
  status,
}: {
  readonly status: StaffAssignmentStatus;
}) {
  return (
    <Badge tone={STATUS_TONE[status]}>{assignmentStatusLabel(status)}</Badge>
  );
}
