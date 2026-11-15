import { describe, it, expect } from "vitest";
import {
  resolveUserAccess,
  hasCapability,
  isOwner,
  isManagerOrAbove,
  isAssistantManagerOrAbove,
  canAccessLocation,
} from "./access-resolver";
import type { VerifiedLocationInfo } from "./access-resolver";
import type { OverallRole } from "@/features/auth/domain/overall-role";
import type { OrganizationMembership } from "@/features/auth/domain/organization-membership";
import type {
  LocationRole,
  LocationRoleAssignment,
} from "@/features/auth/domain/location-role";

describe("Canonical Authorization Resolver — Domain Unit Tests", () => {
  // Deterministic Synthetic Fixture Identifiers
  const ORG_MONKS = "org-00000000-0000-4000-8000-000000000001";
  const ORG_LIQUOR_TAP = "org-00000000-0000-4000-8000-000000000002";

  const LOC_WEBSTER: VerifiedLocationInfo = {
    id: "loc-00000000-0000-4000-8000-000000000001",
    organizationId: ORG_MONKS,
    active: true,
  };

  const LOC_NASA: VerifiedLocationInfo = {
    id: "loc-00000000-0000-4000-8000-000000000002",
    organizationId: ORG_LIQUOR_TAP,
    active: true,
  };

  const LOC_LEAGUE_CITY: VerifiedLocationInfo = {
    id: "loc-00000000-0000-4000-8000-000000000003",
    organizationId: ORG_LIQUOR_TAP,
    active: true,
  };

  const USER_JACK = "usr-00000000-0000-4000-8000-000000000001";
  const USER_SAM = "usr-00000000-0000-4000-8000-000000000002";
  const USER_TOM = "usr-00000000-0000-4000-8000-000000000003";
  const USER_JERRY = "usr-00000000-0000-4000-8000-000000000004";
  const USER_JOHN = "usr-00000000-0000-4000-8000-000000000005";

  // Helper factory for synthetic memberships
  function makeOrgMembership(
    profileId: string,
    organizationId: string,
    active = true,
    roles: Array<
      "owner" | "general_manager" | "shift_manager" | "host" | "server"
    > = ["server"],
  ): OrganizationMembership {
    return {
      id: 101,
      profileId,
      organizationId,
      roles,
      role: roles.includes("owner")
        ? "owner"
        : roles.includes("general_manager")
          ? "manager"
          : "server",
      designation: roles.includes("owner") ? "owner" : "staff",
      active,
    };
  }

  function makeLocationAssignment(
    profileId: string,
    locationId: string,
    role: "manager" | "assistant_manager" | "staff" = "staff",
    active = true,
    organizationId?: string,
  ): LocationRoleAssignment {
    return {
      id: 201,
      profileId,
      locationId,
      organizationId,
      role,
      active,
    };
  }

  // ==========================================
  // 1. Overall Role Tests (OVR-001 - OVR-012)
  // ==========================================
  describe("Overall Role Tests (OVR)", () => {
    it("OVR-001: Overall Owner applies to valid organization", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS },
        overallRole: "owner",
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("owner");
      expect(res.applicableSources).toContain("overall");
      expect(hasCapability(res, "overall:owner")).toBe(true);
      expect(hasCapability(res, "org:admin")).toBe(true);
    });

    it("OVR-002: Overall Owner applies across valid locations", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        overallRole: "owner",
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("owner");
      expect(hasCapability(res, "overall:owner")).toBe(true);
      expect(hasCapability(res, "location:access")).toBe(true);
      expect(hasCapability(res, "location:manage")).toBe(true);
    });

    it("OVR-003: Overall Owner does not need synthetic membership rows", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        overallRole: "owner",
        organizationMembership: null,
        locationAssignment: null,
      });
      expect(res.allowed).toBe(true);
      expect(res.applicableSources).toEqual(["overall"]);
      expect(res.effectiveLevel).toBe("owner");
    });

    it("OVR-004: Overall Manager applies to all valid locations", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        overallRole: "manager",
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("manager");
      expect(hasCapability(res, "overall:manage")).toBe(true);
      expect(hasCapability(res, "location:manage")).toBe(true);
    });

    it("OVR-005: Overall Manager cannot receive Owner-exclusive capabilities", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        overallRole: "manager",
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("manager");
      expect(hasCapability(res, "overall:owner")).toBe(false);
      expect(isOwner(res)).toBe(false);
      expect(isManagerOrAbove(res)).toBe(true);
    });

    it("OVR-006: Overall Assistant Manager applies to all valid locations", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        overallRole: "assistant_manager",
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("assistant_manager");
      expect(hasCapability(res, "overall:assistant_manage")).toBe(true);
      expect(hasCapability(res, "location:assistant_manage")).toBe(true);
    });

    it("OVR-007: Overall Assistant Manager cannot receive Manager-exclusive capabilities", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        overallRole: "assistant_manager",
      });
      expect(res.allowed).toBe(true);
      expect(hasCapability(res, "overall:manage")).toBe(false);
      expect(hasCapability(res, "location:manage")).toBe(false);
      expect(isManagerOrAbove(res)).toBe(false);
      expect(isAssistantManagerOrAbove(res)).toBe(true);
    });

    it("OVR-008: Overall Assistant Manager cannot receive Owner-exclusive capabilities", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        overallRole: "assistant_manager",
      });
      expect(res.allowed).toBe(true);
      expect(hasCapability(res, "overall:owner")).toBe(false);
    });

    it("OVR-009: Missing Overall Role is valid and falls back to scoped rules", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        overallRole: null,
        organizationMembership: makeOrgMembership(USER_JACK, ORG_MONKS, true),
        locationAssignment: makeLocationAssignment(
          USER_JACK,
          LOC_WEBSTER.id,
          "staff",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("staff");
      expect(res.applicableSources).toEqual(["organization", "location"]);
    });

    it("OVR-010: Unsupported Overall Role strings do not grant access", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        overallRole: "super_admin" as unknown as OverallRole,
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("INVALID_ROLE");
    });

    it("OVR-011: Overall role is NOT inferred from creator identity", () => {
      // Simulating a creator who has NO active overall role or scoped assignment
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        overallRole: null,
        organizationMembership: null,
        locationAssignment: null,
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("NO_ORGANIZATION_MEMBERSHIP");
    });

    it("OVR-012: Inactive ordinary memberships do not erase valid Overall-role authority", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        overallRole: "manager",
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          false,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_NASA.id,
          "staff",
          false,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("manager");
      expect(res.applicableSources).toEqual(["overall"]);
    });
  });

  // ==========================================
  // 2. Organization Role Tests (ORG-001 - ORG-008)
  // ==========================================
  describe("Organization Role Tests (ORG)", () => {
    it("ORG-001: Active organization membership is considered", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS },
        organizationMembership: makeOrgMembership(USER_JACK, ORG_MONKS, true),
      });
      expect(res.allowed).toBe(true);
      expect(hasCapability(res, "org:member")).toBe(true);
      expect(res.applicableSources).toContain("organization");
    });

    it("ORG-002: Inactive organization membership grants no organization-scoped authority", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS },
        organizationMembership: makeOrgMembership(USER_JACK, ORG_MONKS, false),
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("INACTIVE_ORGANIZATION_MEMBERSHIP");
    });

    it("ORG-003: Membership in Monks does not grant Liquor Tap authority", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP },
        organizationMembership: makeOrgMembership(USER_JACK, ORG_MONKS, true),
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("NO_ORGANIZATION_MEMBERSHIP");
    });

    it("ORG-004: Membership in Liquor Tap does not grant Monks authority", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS },
        organizationMembership: makeOrgMembership(
          USER_SAM,
          ORG_LIQUOR_TAP,
          true,
        ),
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("NO_ORGANIZATION_MEMBERSHIP");
    });

    it("ORG-005: Ordinary organization membership does not automatically grant every location", () => {
      const res = resolveUserAccess({
        target: {
          organizationId: ORG_LIQUOR_TAP,
          locationId: LOC_LEAGUE_CITY.id,
        },
        location: LOC_LEAGUE_CITY,
        organizationMembership: makeOrgMembership(
          USER_SAM,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: null,
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("NO_LOCATION_ASSIGNMENT");
    });

    it("ORG-006: Organization Owner/GM receives org:admin capability", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS },
        organizationMembership: makeOrgMembership(USER_JACK, ORG_MONKS, true, [
          "owner",
        ]),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("owner");
      expect(hasCapability(res, "org:admin")).toBe(true);
    });

    it("ORG-007: No organization role is inferred from creator identity", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS },
        organizationMembership: null,
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("NO_ORGANIZATION_MEMBERSHIP");
    });

    it("ORG-008: Unsupported legacy/unknown role values fail closed", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        organizationMembership: makeOrgMembership(USER_JACK, ORG_MONKS, true),
        locationAssignment: {
          id: 1,
          profileId: USER_JACK,
          locationId: LOC_WEBSTER.id,
          role: "arbitrary_elevated_role" as unknown as LocationRole,
          active: true,
        },
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("INVALID_ROLE");
    });
  });

  // ==========================================
  // 3. Location Role Tests (LOC-001 - LOC-010)
  // ==========================================
  describe("Location Role Tests (LOC)", () => {
    it("LOC-001: Active org membership + active location assignment + staff role resolves Staff", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        organizationMembership: makeOrgMembership(USER_JACK, ORG_MONKS, true),
        locationAssignment: makeLocationAssignment(
          USER_JACK,
          LOC_WEBSTER.id,
          "staff",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("staff");
      expect(hasCapability(res, "location:operate")).toBe(true);
      expect(hasCapability(res, "location:manage")).toBe(false);
    });

    it("LOC-002: Matching Manager role resolves Manager-level location authority", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_NASA.id,
          "manager",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("manager");
      expect(hasCapability(res, "location:manage")).toBe(true);
      expect(hasCapability(res, "overall:manage")).toBe(false); // Scoped, not overall!
    });

    it("LOC-003: Matching Assistant Manager resolves Assistant Manager location authority", () => {
      const res = resolveUserAccess({
        target: {
          organizationId: ORG_LIQUOR_TAP,
          locationId: LOC_LEAGUE_CITY.id,
        },
        location: LOC_LEAGUE_CITY,
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_LEAGUE_CITY.id,
          "assistant_manager",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("assistant_manager");
      expect(hasCapability(res, "location:assistant_manage")).toBe(true);
      expect(hasCapability(res, "location:manage")).toBe(false);
    });

    it("LOC-004: Inactive organization membership invalidates the location-scoped grant", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        organizationMembership: makeOrgMembership(
          USER_SAM,
          ORG_LIQUOR_TAP,
          false,
        ),
        locationAssignment: makeLocationAssignment(
          USER_SAM,
          LOC_NASA.id,
          "manager",
          true,
        ),
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("INACTIVE_ORGANIZATION_MEMBERSHIP");
    });

    it("LOC-005: Inactive location assignment invalidates the location-scoped grant", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        organizationMembership: makeOrgMembership(
          USER_SAM,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_SAM,
          LOC_NASA.id,
          "manager",
          false,
        ),
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("INACTIVE_LOCATION_ASSIGNMENT");
    });

    it("LOC-006: Missing location assignment denies ordinary scoped location access", () => {
      const res = resolveUserAccess({
        target: {
          organizationId: ORG_LIQUOR_TAP,
          locationId: LOC_LEAGUE_CITY.id,
        },
        location: LOC_LEAGUE_CITY,
        organizationMembership: makeOrgMembership(
          USER_SAM,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: null,
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("NO_LOCATION_ASSIGNMENT");
    });

    it("LOC-007: NASA Manager role does not imply League City Manager", () => {
      // User John at League City has assistant_manager, not manager
      const res = resolveUserAccess({
        target: {
          organizationId: ORG_LIQUOR_TAP,
          locationId: LOC_LEAGUE_CITY.id,
        },
        location: LOC_LEAGUE_CITY,
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_LEAGUE_CITY.id,
          "assistant_manager",
          true,
        ),
      });
      expect(res.effectiveLevel).toBe("assistant_manager");
      expect(hasCapability(res, "location:manage")).toBe(false);
    });

    it("LOC-008: Webster Manager role does not imply NASA Manager", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_NASA.id,
          "staff",
          true,
        ),
      });
      expect(res.effectiveLevel).toBe("staff");
      expect(hasCapability(res, "location:manage")).toBe(false);
    });

    it("LOC-009: Location role changes are independently reflected", () => {
      const before = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_NASA.id,
          "manager",
          true,
        ),
      });
      expect(before.effectiveLevel).toBe("manager");

      const after = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_NASA.id,
          "staff",
          true,
        ),
      });
      expect(after.effectiveLevel).toBe("staff");
    });

    it("LOC-010: One location role does not grant unrelated organization authority", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        organizationMembership: null, // No membership in Monks
        locationAssignment: makeLocationAssignment(
          USER_SAM,
          LOC_NASA.id,
          "manager",
          true,
        ),
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("NO_ORGANIZATION_MEMBERSHIP");
    });
  });

  // ==========================================
  // 4. Role Combination Tests (COMBO-001 - COMBO-008)
  // ==========================================
  describe("Role Combination Tests (COMBO)", () => {
    it("COMBO-001: Overall Assistant Manager + NASA Manager -> NASA Manager capability (elevation)", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        overallRole: "assistant_manager",
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_NASA.id,
          "manager",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("manager");
      expect(res.applicableSources).toContain("overall");
      expect(res.applicableSources).toContain("location");
      expect(hasCapability(res, "location:manage")).toBe(true);
      expect(hasCapability(res, "overall:assistant_manage")).toBe(true);
      expect(hasCapability(res, "overall:manage")).toBe(false);
    });

    it("COMBO-002: Same user at unassigned League City -> Overall Assistant Manager baseline", () => {
      const res = resolveUserAccess({
        target: {
          organizationId: ORG_LIQUOR_TAP,
          locationId: LOC_LEAGUE_CITY.id,
        },
        location: LOC_LEAGUE_CITY,
        overallRole: "assistant_manager",
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: null, // unassigned
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("assistant_manager");
      expect(hasCapability(res, "location:manage")).toBe(false);
      expect(hasCapability(res, "location:assistant_manage")).toBe(true);
    });

    it("COMBO-003: Overall Manager + explicit Staff -> Overall Manager baseline remains (dominance)", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        overallRole: "manager",
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_NASA.id,
          "staff",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("manager");
      expect(hasCapability(res, "location:manage")).toBe(true);
      expect(hasCapability(res, "overall:manage")).toBe(true);
      expect(hasCapability(res, "overall:owner")).toBe(false);
    });

    it("COMBO-004: Overall Owner + explicit Assistant Manager -> Overall Owner baseline remains", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        overallRole: "owner",
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_NASA.id,
          "assistant_manager",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("owner");
      expect(hasCapability(res, "overall:owner")).toBe(true);
    });

    it("COMBO-005: Ordinary organization member + NASA Manager -> Manager at NASA only", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        overallRole: null,
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_NASA.id,
          "manager",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("manager");
      expect(hasCapability(res, "location:manage")).toBe(true);
      expect(hasCapability(res, "overall:manage")).toBe(false);
    });

    it("COMBO-006: Inactive location role + active Overall Manager -> Overall Manager baseline remains", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        overallRole: "manager",
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_NASA.id,
          "manager",
          false,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("manager");
      expect(res.applicableSources).toEqual(["overall", "organization"]);
    });

    it("COMBO-007: No overall role + no applicable org/location authority -> DENY", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        overallRole: null,
        organizationMembership: null,
        locationAssignment: null,
      });
      expect(res.allowed).toBe(false);
      expect(res.effectiveLevel).toBeNull();
      expect(res.capabilities).toEqual([]);
    });

    it("COMBO-008: Overall Manager does not inherit Overall Owner-exclusive privileges from unrelated org data", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        overallRole: "manager",
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
          ["owner"],
        ),
      });
      expect(res.allowed).toBe(true);
      // Even if org owner, overall:owner remains strictly reserved for system Overall Owner
      expect(hasCapability(res, "overall:owner")).toBe(false);
    });
  });

  // ==========================================
  // 5. Tenant Safety Tests (TENANT-001 - TENANT-010)
  // ==========================================
  describe("Tenant Safety Tests (TENANT)", () => {
    it("TENANT-001: Monks org + NASA location mismatch is DENIED fail-closed", () => {
      // NASA belongs to Liquor Tap, requested context targets Monks
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_NASA.id },
        location: LOC_NASA, // organizationId is ORG_LIQUOR_TAP
        overallRole: "owner", // Even Overall Owner must be rejected on mismatch!
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("TENANT_MISMATCH");
    });

    it("TENANT-002: Liquor Tap org + Webster location mismatch is DENIED fail-closed", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER, // organizationId is ORG_MONKS
        overallRole: "manager",
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("TENANT_MISMATCH");
    });

    it("TENANT-003: Nonexistent location is DENIED fail-closed", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: "loc-nonexistent" },
        location: null,
        overallRole: "owner",
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("LOCATION_NOT_FOUND");
    });

    it("TENANT-004: Inactive location is DENIED fail-closed", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: { ...LOC_WEBSTER, active: false },
        overallRole: "owner",
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("INACTIVE_LOCATION");
    });

    it("TENANT-005: Empty organizationId is DENIED fail-closed", () => {
      const res = resolveUserAccess({
        target: { organizationId: "" },
        overallRole: "owner",
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("INVALID_TARGET");
    });

    it("TENANT-006: Corrupted overallRole fails closed with INVALID_ROLE", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS },
        overallRole: "not_a_real_role" as unknown as OverallRole,
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("INVALID_ROLE");
    });

    it("TENANT-007: Corrupted location assignment role fails closed with INVALID_ROLE", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        organizationMembership: makeOrgMembership(USER_JACK, ORG_MONKS, true),
        locationAssignment: {
          id: 1,
          profileId: USER_JACK,
          locationId: LOC_WEBSTER.id,
          role: "invalid_staff_tier" as unknown as LocationRole,
          active: true,
        },
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("INVALID_ROLE");
    });

    it("TENANT-008: Missing organization membership when locationId is requested fails closed", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        organizationMembership: null,
        locationAssignment: makeLocationAssignment(
          USER_JACK,
          LOC_WEBSTER.id,
          "staff",
          true,
        ),
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("NO_ORGANIZATION_MEMBERSHIP");
    });

    it("TENANT-009: Inactive organization membership when locationId is requested fails closed", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        organizationMembership: makeOrgMembership(USER_JACK, ORG_MONKS, false),
        locationAssignment: makeLocationAssignment(
          USER_JACK,
          LOC_WEBSTER.id,
          "staff",
          true,
        ),
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("INACTIVE_ORGANIZATION_MEMBERSHIP");
    });

    it("TENANT-010: Zero reliance on created_by attribute", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        overallRole: null,
        organizationMembership: null,
        locationAssignment: null,
      });
      expect(res.allowed).toBe(false);
    });
  });

  // ==========================================
  // 6. Canonical Permanent Acceptance Matrix (Jack, Sam, Tom, Jerry)
  // ==========================================
  describe("Permanent Acceptance Matrix (Jack, Sam, Tom, Jerry)", () => {
    // Jack: Monks/Webster, Liquor Tap/NASA, Liquor Tap/League City
    it("Jack at Monks / Webster -> ALLOW (Staff)", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        organizationMembership: makeOrgMembership(USER_JACK, ORG_MONKS, true),
        locationAssignment: makeLocationAssignment(
          USER_JACK,
          LOC_WEBSTER.id,
          "staff",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("staff");
      expect(canAccessLocation(res)).toBe(true);
    });

    it("Jack at Liquor Tap / NASA -> ALLOW (Staff)", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        organizationMembership: makeOrgMembership(
          USER_JACK,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JACK,
          LOC_NASA.id,
          "staff",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("staff");
      expect(canAccessLocation(res)).toBe(true);
    });

    it("Jack at Liquor Tap / League City -> ALLOW (Staff)", () => {
      const res = resolveUserAccess({
        target: {
          organizationId: ORG_LIQUOR_TAP,
          locationId: LOC_LEAGUE_CITY.id,
        },
        location: LOC_LEAGUE_CITY,
        organizationMembership: makeOrgMembership(
          USER_JACK,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JACK,
          LOC_LEAGUE_CITY.id,
          "staff",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("staff");
      expect(canAccessLocation(res)).toBe(true);
    });

    // Sam: Explicitly assigned to NASA only in Liquor Tap
    it("Sam at Monks / Webster -> DENY (No membership)", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        organizationMembership: null,
        locationAssignment: null,
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("NO_ORGANIZATION_MEMBERSHIP");
    });

    it("Sam at Liquor Tap / NASA -> ALLOW (Staff)", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        organizationMembership: makeOrgMembership(
          USER_SAM,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_SAM,
          LOC_NASA.id,
          "staff",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("staff");
    });

    it("Sam at Liquor Tap / League City -> DENY (Belonging to Liquor Tap does NOT grant League City)", () => {
      const res = resolveUserAccess({
        target: {
          organizationId: ORG_LIQUOR_TAP,
          locationId: LOC_LEAGUE_CITY.id,
        },
        location: LOC_LEAGUE_CITY,
        organizationMembership: makeOrgMembership(
          USER_SAM,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: null, // No assignment at League City
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("NO_LOCATION_ASSIGNMENT");
    });

    // Tom: Explicitly assigned to Monks / Webster only
    it("Tom at Monks / Webster -> ALLOW (Staff)", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        organizationMembership: makeOrgMembership(USER_TOM, ORG_MONKS, true),
        locationAssignment: makeLocationAssignment(
          USER_TOM,
          LOC_WEBSTER.id,
          "staff",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("staff");
    });

    it("Tom at Liquor Tap / NASA -> DENY (No membership in Liquor Tap)", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        organizationMembership: null,
        locationAssignment: null,
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("NO_ORGANIZATION_MEMBERSHIP");
    });

    // Jerry: Monks / Webster and Liquor Tap / NASA (not League City)
    it("Jerry at Monks / Webster -> ALLOW (Staff)", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        organizationMembership: makeOrgMembership(USER_JERRY, ORG_MONKS, true),
        locationAssignment: makeLocationAssignment(
          USER_JERRY,
          LOC_WEBSTER.id,
          "staff",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("staff");
    });

    it("Jerry at Liquor Tap / NASA -> ALLOW (Staff)", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        organizationMembership: makeOrgMembership(
          USER_JERRY,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JERRY,
          LOC_NASA.id,
          "staff",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("staff");
    });

    it("Jerry at Liquor Tap / League City -> DENY (No assignment at League City)", () => {
      const res = resolveUserAccess({
        target: {
          organizationId: ORG_LIQUOR_TAP,
          locationId: LOC_LEAGUE_CITY.id,
        },
        location: LOC_LEAGUE_CITY,
        organizationMembership: makeOrgMembership(
          USER_JERRY,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: null,
      });
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("NO_LOCATION_ASSIGNMENT");
    });
  });

  // ==========================================
  // 7. John Mixed-Role Matrix
  // ==========================================
  describe("John Mixed-Role Matrix", () => {
    it("John at Liquor Tap / NASA -> Manager", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_NASA.id,
          "manager",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("manager");
      expect(hasCapability(res, "location:manage")).toBe(true);
    });

    it("John at Liquor Tap / League City -> Assistant Manager", () => {
      const res = resolveUserAccess({
        target: {
          organizationId: ORG_LIQUOR_TAP,
          locationId: LOC_LEAGUE_CITY.id,
        },
        location: LOC_LEAGUE_CITY,
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_LEAGUE_CITY.id,
          "assistant_manager",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("assistant_manager");
      expect(hasCapability(res, "location:manage")).toBe(false);
      expect(hasCapability(res, "location:assistant_manage")).toBe(true);
    });

    it("John at Monks / Webster -> Manager", () => {
      const res = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        organizationMembership: makeOrgMembership(USER_JOHN, ORG_MONKS, true),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_WEBSTER.id,
          "manager",
          true,
        ),
      });
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("manager");
      expect(hasCapability(res, "location:manage")).toBe(true);
    });

    it("Updating John at NASA to Staff does not propagate to League City or Webster", () => {
      const resNasa = resolveUserAccess({
        target: { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA.id },
        location: LOC_NASA,
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_NASA.id,
          "staff",
          true,
        ),
      });
      expect(resNasa.effectiveLevel).toBe("staff");

      const resLeagueCity = resolveUserAccess({
        target: {
          organizationId: ORG_LIQUOR_TAP,
          locationId: LOC_LEAGUE_CITY.id,
        },
        location: LOC_LEAGUE_CITY,
        organizationMembership: makeOrgMembership(
          USER_JOHN,
          ORG_LIQUOR_TAP,
          true,
        ),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_LEAGUE_CITY.id,
          "assistant_manager",
          true,
        ),
      });
      expect(resLeagueCity.effectiveLevel).toBe("assistant_manager");

      const resWebster = resolveUserAccess({
        target: { organizationId: ORG_MONKS, locationId: LOC_WEBSTER.id },
        location: LOC_WEBSTER,
        organizationMembership: makeOrgMembership(USER_JOHN, ORG_MONKS, true),
        locationAssignment: makeLocationAssignment(
          USER_JOHN,
          LOC_WEBSTER.id,
          "manager",
          true,
        ),
      });
      expect(resWebster.effectiveLevel).toBe("manager");
    });
  });
});
