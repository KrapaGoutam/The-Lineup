/**
 * V2-001.006 — Canonical Authorization Resolver
 * Pure, deterministic domain evaluator for user capabilities and effective roles.
 *
 * Combines:
 * - System-wide Overall Roles (`public.overall_roles`: 'owner' | 'manager' | 'assistant_manager')
 * - Tenant Organization Memberships (`public.memberships`: active status, roles)
 * - Independent Per-Location Roles (`public.location_memberships`: 'manager' | 'assistant_manager' | 'staff')
 *
 * Invariants:
 * - Deterministic, pure evaluation without database/network/side-effect calls.
 * - Strict tenant isolation: location.organization_id must match target.organizationId.
 * - Baseline dominance vs local elevation: higher applicable capabilities union safely.
 * - Owner-exclusive capabilities remain strictly reserved for Owner tier.
 * - Inactive scoped memberships fail closed for scoped grants without erasing valid Overall baselines.
 * - Zero reliance on creator bypass (Issue #106 remains open for V2-001.007).
 */

import type { OverallRole } from "@/features/auth/domain/overall-role";
import { isOverallRole } from "@/features/auth/domain/overall-role";
import type { OrganizationMembership } from "@/features/auth/domain/organization-membership";
import type {
  LocationRole,
  LocationRoleAssignment,
} from "@/features/auth/domain/location-role";
import { isLocationRole } from "@/features/auth/domain/location-role";

export const RESOLVER_CAPABILITIES = [
  // Overall system-wide capabilities
  "overall:owner", // Overall Owner authority (tenant creation, owner-exclusive configuration)
  "overall:manage", // Overall Manager authority (global operations management)
  "overall:assistant_manage", // Overall Assistant Manager authority (global assistant management)

  // Organization-scoped capabilities
  "org:admin", // Organization administration (Org Owner / GM)
  "org:member", // Active affiliation / membership in target tenant

  // Location-scoped capabilities
  "location:access", // Explicit or baseline access to location
  "location:manage", // Branch manager authority (schedules, floor management)
  "location:assistant_manage", // Branch assistant manager authority
  "location:operate", // Staff floor operations (rotation entries, shifts, attendance)
] as const;

export type ResolverCapability = (typeof RESOLVER_CAPABILITIES)[number];

export type EffectiveRoleLevel =
  | "owner"
  | "manager"
  | "assistant_manager"
  | "staff"
  | null;

export type AuthoritySource = "overall" | "organization" | "location";

export interface TargetContext {
  readonly organizationId: string;
  readonly locationId?: string | null;
}

export interface VerifiedLocationInfo {
  readonly id: string;
  readonly organizationId: string;
  readonly active?: boolean;
}

export interface AccessResolverFacts {
  /** Target scope requested */
  readonly target: TargetContext;

  /** Verified location metadata if locationId was requested */
  readonly location?: VerifiedLocationInfo | null;

  /** Active Overall Role, if any */
  readonly overallRole?: OverallRole | null;

  /** Organization membership in the target organization, if any */
  readonly organizationMembership?: OrganizationMembership | null;

  /** Location role assignment in the target location, if any */
  readonly locationAssignment?: LocationRoleAssignment | null;
}

export interface AccessResolution {
  readonly allowed: boolean;
  readonly effectiveLevel: EffectiveRoleLevel;
  readonly applicableSources: readonly AuthoritySource[];
  readonly capabilities: readonly ResolverCapability[];
  readonly denialReason?: string;
}

const LEVEL_RANK: Record<NonNullable<EffectiveRoleLevel>, number> = {
  staff: 1,
  assistant_manager: 2,
  manager: 3,
  owner: 4,
};

function maxLevel(
  a: EffectiveRoleLevel,
  b: EffectiveRoleLevel,
): EffectiveRoleLevel {
  if (!a) return b;
  if (!b) return a;
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

/**
 * Pure, deterministic domain resolver calculating user access and capabilities.
 */
export function resolveUserAccess(
  facts: AccessResolverFacts,
): AccessResolution {
  const {
    target,
    location,
    overallRole,
    organizationMembership,
    locationAssignment,
  } = facts;

  // 1. Target validation
  const orgId = (target?.organizationId ?? "").trim();
  if (!orgId) {
    return {
      allowed: false,
      effectiveLevel: null,
      applicableSources: [],
      capabilities: [],
      denialReason: "INVALID_TARGET",
    };
  }

  const locId = (target.locationId ?? "").trim();

  // 2. Tenant integrity verification if location context requested
  if (locId) {
    if (!location) {
      return {
        allowed: false,
        effectiveLevel: null,
        applicableSources: [],
        capabilities: [],
        denialReason: "LOCATION_NOT_FOUND",
      };
    }

    if (location.active === false) {
      return {
        allowed: false,
        effectiveLevel: null,
        applicableSources: [],
        capabilities: [],
        denialReason: "INACTIVE_LOCATION",
      };
    }

    if (location.organizationId !== orgId) {
      return {
        allowed: false,
        effectiveLevel: null,
        applicableSources: [],
        capabilities: [],
        denialReason: "TENANT_MISMATCH",
      };
    }
  }

  // 3. Overall role validation
  const hasOverallInput = overallRole !== undefined && overallRole !== null;
  const isOverallValid = hasOverallInput && isOverallRole(overallRole);

  if (hasOverallInput && !isOverallValid) {
    return {
      allowed: false,
      effectiveLevel: null,
      applicableSources: [],
      capabilities: [],
      denialReason: "INVALID_ROLE",
    };
  }

  const effectiveOverall: OverallRole | null = isOverallValid
    ? (overallRole as OverallRole)
    : null;

  // 4. Scoped prerequisites evaluation
  const isOrgMemberActive = Boolean(
    organizationMembership &&
      organizationMembership.organizationId === orgId &&
      organizationMembership.active,
  );

  const isLocAssignmentActive = Boolean(
    locId &&
      locationAssignment &&
      locationAssignment.locationId === locId &&
      locationAssignment.active,
  );

  // If location assignment has invalid role string, fail closed
  if (
    isLocAssignmentActive &&
    locationAssignment?.role &&
    !isLocationRole(locationAssignment.role)
  ) {
    return {
      allowed: false,
      effectiveLevel: null,
      applicableSources: [],
      capabilities: [],
      denialReason: "INVALID_ROLE",
    };
  }

  // 5. Check if caller has ANY applicable authority
  const hasOverall = effectiveOverall !== null;
  const hasScopedLocation = isOrgMemberActive && isLocAssignmentActive;
  const hasScopedOrgOnly = !locId && isOrgMemberActive;

  if (!hasOverall && !hasScopedLocation && !hasScopedOrgOnly) {
    // Determine accurate failure reason
    if (locId) {
      if (
        !organizationMembership ||
        organizationMembership.organizationId !== orgId
      ) {
        return {
          allowed: false,
          effectiveLevel: null,
          applicableSources: [],
          capabilities: [],
          denialReason: "NO_ORGANIZATION_MEMBERSHIP",
        };
      }
      if (!organizationMembership.active) {
        return {
          allowed: false,
          effectiveLevel: null,
          applicableSources: [],
          capabilities: [],
          denialReason: "INACTIVE_ORGANIZATION_MEMBERSHIP",
        };
      }
      if (!locationAssignment || locationAssignment.locationId !== locId) {
        return {
          allowed: false,
          effectiveLevel: null,
          applicableSources: [],
          capabilities: [],
          denialReason: "NO_LOCATION_ASSIGNMENT",
        };
      }
      if (!locationAssignment.active) {
        return {
          allowed: false,
          effectiveLevel: null,
          applicableSources: [],
          capabilities: [],
          denialReason: "INACTIVE_LOCATION_ASSIGNMENT",
        };
      }
    } else {
      if (
        !organizationMembership ||
        organizationMembership.organizationId !== orgId
      ) {
        return {
          allowed: false,
          effectiveLevel: null,
          applicableSources: [],
          capabilities: [],
          denialReason: "NO_ORGANIZATION_MEMBERSHIP",
        };
      }
      if (!organizationMembership.active) {
        return {
          allowed: false,
          effectiveLevel: null,
          applicableSources: [],
          capabilities: [],
          denialReason: "INACTIVE_ORGANIZATION_MEMBERSHIP",
        };
      }
    }

    return {
      allowed: false,
      effectiveLevel: null,
      applicableSources: [],
      capabilities: [],
      denialReason: "NO_APPLICABLE_AUTHORITY",
    };
  }

  // 6. Calculate capability union and effective level
  const applicableSourcesSet = new Set<AuthoritySource>();
  const capabilitiesSet = new Set<ResolverCapability>();
  let effectiveLevel: EffectiveRoleLevel = null;

  // 6A. Process Overall Role baseline
  if (hasOverall && effectiveOverall) {
    applicableSourcesSet.add("overall");

    if (effectiveOverall === "owner") {
      effectiveLevel = maxLevel(effectiveLevel, "owner");
      capabilitiesSet.add("overall:owner");
      capabilitiesSet.add("overall:manage");
      capabilitiesSet.add("overall:assistant_manage");
      capabilitiesSet.add("org:admin");
      capabilitiesSet.add("org:member");
      capabilitiesSet.add("location:access");
      capabilitiesSet.add("location:manage");
      capabilitiesSet.add("location:assistant_manage");
      capabilitiesSet.add("location:operate");
    } else if (effectiveOverall === "manager") {
      effectiveLevel = maxLevel(effectiveLevel, "manager");
      capabilitiesSet.add("overall:manage");
      capabilitiesSet.add("overall:assistant_manage");
      capabilitiesSet.add("org:admin");
      capabilitiesSet.add("org:member");
      capabilitiesSet.add("location:access");
      capabilitiesSet.add("location:manage");
      capabilitiesSet.add("location:assistant_manage");
      capabilitiesSet.add("location:operate");
    } else if (effectiveOverall === "assistant_manager") {
      effectiveLevel = maxLevel(effectiveLevel, "assistant_manager");
      capabilitiesSet.add("overall:assistant_manage");
      capabilitiesSet.add("org:member");
      capabilitiesSet.add("location:access");
      capabilitiesSet.add("location:assistant_manage");
      capabilitiesSet.add("location:operate");
    }
  }

  // 6B. Process Organization Membership (if active)
  if (isOrgMemberActive) {
    applicableSourcesSet.add("organization");
    capabilitiesSet.add("org:member");

    // Organization owner / GM admin capabilities
    const roles = organizationMembership?.roles ?? [];
    const isOrgAdmin =
      roles.includes("owner") || roles.includes("general_manager");
    const isOrgShiftManager = roles.includes("shift_manager");

    if (isOrgAdmin) {
      capabilitiesSet.add("org:admin");
      if (!locId) {
        effectiveLevel = maxLevel(
          effectiveLevel,
          roles.includes("owner") ? "owner" : "manager",
        );
      }
    } else if (isOrgShiftManager && !locId) {
      effectiveLevel = maxLevel(effectiveLevel, "assistant_manager");
    } else if (!locId && !effectiveLevel) {
      effectiveLevel = maxLevel(effectiveLevel, "staff");
    }
  }

  // 6C. Process Location Assignment (if location requested and assignment active)
  if (
    locId &&
    isOrgMemberActive &&
    isLocAssignmentActive &&
    locationAssignment
  ) {
    applicableSourcesSet.add("location");
    capabilitiesSet.add("location:access");

    const locRole = locationAssignment.role as LocationRole;

    if (locRole === "manager") {
      effectiveLevel = maxLevel(effectiveLevel, "manager");
      capabilitiesSet.add("location:manage");
      capabilitiesSet.add("location:assistant_manage");
      capabilitiesSet.add("location:operate");
    } else if (locRole === "assistant_manager") {
      effectiveLevel = maxLevel(effectiveLevel, "assistant_manager");
      capabilitiesSet.add("location:assistant_manage");
      capabilitiesSet.add("location:operate");
    } else if (locRole === "staff") {
      effectiveLevel = maxLevel(effectiveLevel, "staff");
      capabilitiesSet.add("location:operate");
    }
  }

  // Deterministic array outputs
  const applicableSources = Array.from(applicableSourcesSet);
  const capabilities = Array.from(capabilitiesSet);

  return {
    allowed: true,
    effectiveLevel,
    applicableSources,
    capabilities,
  };
}

/**
 * Pure predicate checking whether an access resolution grants a specific capability.
 */
export function hasCapability(
  resolution: AccessResolution,
  capability: ResolverCapability,
): boolean {
  return resolution.allowed && resolution.capabilities.includes(capability);
}

/**
 * Pure predicate checking whether effective level is Owner.
 */
export function isOwner(resolution: AccessResolution): boolean {
  return resolution.allowed && resolution.effectiveLevel === "owner";
}

/**
 * Pure predicate checking whether effective level is Manager or above.
 */
export function isManagerOrAbove(resolution: AccessResolution): boolean {
  if (!resolution.allowed || !resolution.effectiveLevel) return false;
  return LEVEL_RANK[resolution.effectiveLevel] >= LEVEL_RANK.manager;
}

/**
 * Pure predicate checking whether effective level is Assistant Manager or above.
 */
export function isAssistantManagerOrAbove(
  resolution: AccessResolution,
): boolean {
  if (!resolution.allowed || !resolution.effectiveLevel) return false;
  return LEVEL_RANK[resolution.effectiveLevel] >= LEVEL_RANK.assistant_manager;
}

/**
 * Pure predicate checking whether user has valid location access.
 */
export function canAccessLocation(resolution: AccessResolution): boolean {
  return hasCapability(resolution, "location:access");
}
