import type { Database } from "@/types/database.generated";
import type { OrganizationMembership } from "@/features/auth/domain/organization-membership";
import type { LocationAccess } from "@/features/auth/domain/location-access";

export type DatabaseLocationRole = Database["public"]["Enums"]["location_role"];

/**
 * Canonical location role tiers.
 * - 'manager': Location-level manager (branch manager).
 * - 'assistant_manager': Location-level assistant manager.
 * - 'staff': Location-level operational staff (servers, hosts, runners).
 * Note: There is NO "branch owner". Overall Owner or Organization Owner remains the top tier.
 */
export type LocationRole = DatabaseLocationRole;

export const LOCATION_ROLES: readonly LocationRole[] = [
  "manager",
  "assistant_manager",
  "staff",
] as const;

/**
 * Pure type guard checking if an arbitrary value is a valid LocationRole.
 */
export function isLocationRole(value: unknown): value is LocationRole {
  return (
    typeof value === "string" && LOCATION_ROLES.includes(value as LocationRole)
  );
}

/**
 * Canonical domain entity representing a person's role assignment at a specific location.
 * In The Lineup V2, a person may hold distinct, independent roles across branches:
 * e.g. Manager at NASA, Assistant Manager at League City, Manager at Webster.
 */
export interface LocationRoleAssignment {
  readonly id: number;
  readonly profileId: string;
  readonly locationId: string;
  readonly organizationId?: string;
  readonly role: LocationRole;
  readonly active: boolean;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/**
 * Pure predicate verifying whether a location role assignment is Manager.
 */
export function isLocationManager(
  role: LocationRole | null | undefined,
): boolean {
  return role === "manager";
}

/**
 * Pure predicate verifying whether a location role assignment is Assistant Manager.
 */
export function isLocationAssistantManager(
  role: LocationRole | null | undefined,
): boolean {
  return role === "assistant_manager";
}

/**
 * Pure predicate verifying whether a location role assignment is Staff.
 */
export function isLocationStaff(
  role: LocationRole | null | undefined,
): boolean {
  return role === "staff";
}

/**
 * Pure predicate checking whether a location role matches a required role exactly.
 */
export function hasExplicitLocationRole(
  role: LocationRole | null | undefined,
  requiredRole: LocationRole,
): boolean {
  if (!role || !requiredRole) return false;
  return role === requiredRole;
}

/**
 * Maps a raw database row from `public.location_memberships` to the canonical domain `LocationRoleAssignment`.
 */
export function mapLocationRoleRow(row: {
  id: number;
  location_id: string;
  profile_id: string;
  role: DatabaseLocationRole | string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
  locations?: {
    organization_id?: string;
  } | null;
  organization_id?: string;
}): LocationRoleAssignment {
  const orgId = row.organization_id ?? row.locations?.organization_id;
  const role: LocationRole = isLocationRole(row.role) ? row.role : "staff";

  return {
    id: row.id,
    locationId: row.location_id,
    profileId: row.profile_id,
    organizationId: orgId,
    role,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Inputs required to evaluate an effective location role for a scoped user.
 */
export interface EffectiveLocationRoleInputs {
  readonly organizationMembership?: OrganizationMembership | null;
  readonly locationMembership?: LocationRoleAssignment | LocationAccess | null;
  readonly isOrgMemberActive?: boolean;
  readonly isLocationActive?: boolean;
  readonly role?: LocationRole | null;
}

/**
 * Pure evaluator deriving effective location role for a scoped user.
 * Invariant: Active Organization Membership + Active Location Assignment = Effective Location Role.
 * If either is inactive or missing, evaluates strictly to null (fail closed).
 */
export function evaluateEffectiveLocationRole(
  inputs: EffectiveLocationRoleInputs,
): LocationRole | null {
  const orgActive =
    inputs.isOrgMemberActive ?? Boolean(inputs.organizationMembership?.active);
  const locActive =
    inputs.isLocationActive ?? Boolean(inputs.locationMembership?.active);

  if (!orgActive || !locActive) {
    return null;
  }

  const role =
    inputs.role ??
    (inputs.locationMembership && "role" in inputs.locationMembership
      ? (inputs.locationMembership.role as LocationRole)
      : null);

  if (!role || !isLocationRole(role)) {
    return null;
  }

  return role;
}
