import type { Database } from "@/types/database.generated";
import type { AppRole, Designation } from "@/features/auth/domain/passcode";
import {
  designationForRoles,
  normalizeDatabaseRole,
} from "@/features/auth/domain/passcode";

export type DatabaseAppRole = Database["public"]["Enums"]["app_role"];

/**
 * Canonical domain entity representing a person's membership in an organization.
 * In The Lineup V2, a person may belong to 0..N organizations simultaneously.
 * Organization membership validates affiliation with a tenant, but does NOT
 * automatically grant location access (which is governed by location assignments in V2-001.003).
 */
export interface OrganizationMembership {
  readonly id: number;
  readonly organizationId: string;
  readonly profileId: string;
  readonly roles: readonly DatabaseAppRole[];
  readonly role: AppRole;
  readonly designation: Designation;
  readonly active: boolean;
  readonly createdAt?: string;
}

/**
 * Pure predicate verifying whether an organization membership record is currently active.
 */
export function isMembershipActive(
  membership: OrganizationMembership | null | undefined,
): boolean {
  return Boolean(membership && membership.active);
}

/**
 * Returns only active memberships from a collection of organization memberships.
 */
export function filterActiveMemberships(
  memberships: readonly OrganizationMembership[],
): OrganizationMembership[] {
  return memberships.filter(isMembershipActive);
}

/**
 * Checks whether an array of memberships contains an active membership for the given organization.
 */
export function hasActiveOrganizationMembership(
  memberships: readonly OrganizationMembership[],
  organizationId: string,
): boolean {
  if (!organizationId) return false;
  return memberships.some(
    (m) => m.organizationId === organizationId && m.active,
  );
}

/**
 * Finds a membership for a specific organization from a collection.
 */
export function findOrganizationMembership(
  memberships: readonly OrganizationMembership[],
  organizationId: string,
): OrganizationMembership | null {
  if (!organizationId) return null;
  return memberships.find((m) => m.organizationId === organizationId) ?? null;
}

/**
 * Maps a raw database row from `public.memberships` to the canonical domain `OrganizationMembership`.
 */
export function mapMembershipRow(row: {
  id: number;
  organization_id: string;
  profile_id: string;
  roles: DatabaseAppRole[] | string[];
  active: boolean;
  created_at?: string;
}): OrganizationMembership {
  const rolesArray = (row.roles ?? []) as DatabaseAppRole[];
  return {
    id: row.id,
    organizationId: row.organization_id,
    profileId: row.profile_id,
    roles: Object.freeze([...rolesArray]),
    role: normalizeDatabaseRole(rolesArray),
    designation: designationForRoles(rolesArray),
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}
