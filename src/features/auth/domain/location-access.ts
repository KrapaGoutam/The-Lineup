import type { Database } from "@/types/database.generated";
import type { OrganizationMembership } from "@/features/auth/domain/organization-membership";

import type {
  LocationRole,
  DatabaseLocationRole,
} from "@/features/auth/domain/location-role";
import { isLocationRole } from "@/features/auth/domain/location-role";

export type DatabaseLocationMembership =
  Database["public"]["Tables"]["location_memberships"]["Row"];

/**
 * Canonical domain entity representing a person's explicit access assignment to a location.
 * In The Lineup V2, a person may be assigned to 0..N locations across 1..N organizations.
 * Organization membership is a prerequisite for effective access, but does NOT
 * automatically grant location access.
 */
export interface LocationAccess {
  readonly id: number;
  readonly profileId: string;
  readonly locationId: string;
  readonly organizationId?: string;
  readonly role?: LocationRole;
  readonly active: boolean;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

/**
 * Domain alias for LocationAccess, preserving repository naming conventions.
 */
export type LocationMembership = LocationAccess;

/**
 * Pure predicate verifying whether a location assignment record is currently active.
 */
export function isLocationAccessActive(
  assignment: LocationAccess | null | undefined,
): boolean {
  return Boolean(assignment && assignment.active);
}

/**
 * Returns only active location assignments from a collection.
 */
export function filterActiveLocationAccess(
  assignments: readonly LocationAccess[],
): LocationAccess[] {
  return assignments.filter(isLocationAccessActive);
}

/**
 * Finds a location assignment for a specific locationId from a collection.
 */
export function findLocationAccess(
  assignments: readonly LocationAccess[],
  locationId: string,
): LocationAccess | null {
  if (!locationId) return null;
  return assignments.find((a) => a.locationId === locationId) ?? null;
}

/**
 * Checks whether an array of assignments contains an active assignment for the given locationId.
 */
export function hasActiveLocationAssignment(
  assignments: readonly LocationAccess[],
  locationId: string,
): boolean {
  if (!locationId) return false;
  return assignments.some((a) => a.locationId === locationId && a.active);
}

/**
 * Maps a raw database row from `public.location_memberships` (with optional joined organization_id)
 * to the canonical domain `LocationAccess`.
 */
export function mapLocationMembershipRow(row: {
  id: number;
  location_id: string;
  profile_id: string;
  role?: DatabaseLocationRole | string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
  locations?: {
    organization_id?: string;
  } | null;
  organization_id?: string;
}): LocationAccess {
  const orgId = row.organization_id ?? row.locations?.organization_id;
  const role = isLocationRole(row.role) ? row.role : undefined;
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
 * Inputs required to evaluate effective scoped location access for a standard non-Overall user.
 */
export interface EffectiveLocationAccessInputs {
  readonly organizationMembership?: OrganizationMembership | null;
  readonly locationAssignment?: LocationAccess | null;
  readonly isOrgMemberActive?: boolean;
  readonly isLocationAssignmentActive?: boolean;
}

export type AccessDecision = "ALLOW" | "DENY";

/**
 * Pure capability evaluator determining whether a scoped user has effective access to a location.
 * Invariant: Active Organization Membership + Explicit Active Location Assignment = ALLOW.
 * Inactive organization membership or inactive location assignment strictly evaluates to DENY.
 */
export function evaluateScopedLocationAccess(
  inputs: EffectiveLocationAccessInputs,
): AccessDecision {
  const orgActive =
    inputs.isOrgMemberActive ?? Boolean(inputs.organizationMembership?.active);
  const locActive =
    inputs.isLocationAssignmentActive ??
    Boolean(inputs.locationAssignment?.active);

  if (orgActive && locActive) {
    return "ALLOW";
  }

  return "DENY";
}

/**
 * Boolean wrapper for evaluateScopedLocationAccess.
 */
export function hasEffectiveLocationAccess(
  inputs: EffectiveLocationAccessInputs,
): boolean {
  return evaluateScopedLocationAccess(inputs) === "ALLOW";
}
