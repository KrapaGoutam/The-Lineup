import { describe, expect, it } from "vitest";
import type { LocationRoleAssignment, LocationRole } from "./location-role";
import {
  evaluateEffectiveLocationRole,
  hasExplicitLocationRole,
  isLocationAssistantManager,
  isLocationManager,
  isLocationRole,
  isLocationStaff,
  LOCATION_ROLES,
  mapLocationRoleRow,
} from "./location-role";
import type { OrganizationMembership } from "@/features/auth/domain/organization-membership";

const WEBSTER = "00000000-0000-0000-0000-000000000001";
const NASA = "00000000-0000-0000-0000-000000000002";
const LEAGUE_CITY = "00000000-0000-0000-0000-000000000003";

const ORG_MONKS = "10000000-0000-0000-0000-000000000001";
const ORG_LIQUOR_TAP = "10000000-0000-0000-0000-000000000002";

function createMockOrgMembership(
  orgId: string,
  active = true,
): OrganizationMembership {
  return {
    id: 1,
    organizationId: orgId,
    profileId: "profile-1",
    roles: ["general_manager"],
    role: "manager",
    designation: "manager",
    active,
  };
}

function createMockLocationRole(
  locationId: string,
  role: LocationRole,
  orgId?: string,
  active = true,
): LocationRoleAssignment {
  return {
    id: 10,
    profileId: "profile-1",
    locationId,
    organizationId: orgId,
    role,
    active,
  };
}

describe("location-role domain", () => {
  describe("isLocationRole", () => {
    it("returns true for all canonical location roles", () => {
      expect(isLocationRole("manager")).toBe(true);
      expect(isLocationRole("assistant_manager")).toBe(true);
      expect(isLocationRole("staff")).toBe(true);
    });

    it("returns false for invalid and non-location roles", () => {
      expect(isLocationRole("owner")).toBe(false);
      expect(isLocationRole("lead")).toBe(false);
      expect(isLocationRole("server")).toBe(false);
      expect(isLocationRole("host")).toBe(false);
      expect(isLocationRole("overall_owner")).toBe(false);
      expect(isLocationRole("")).toBe(false);
      expect(isLocationRole(null)).toBe(false);
      expect(isLocationRole(undefined)).toBe(false);
      expect(isLocationRole(123)).toBe(false);
    });

    it("matches LOCATION_ROLES constant", () => {
      expect(LOCATION_ROLES).toEqual(["manager", "assistant_manager", "staff"]);
    });
  });

  describe("predicates", () => {
    it("isLocationManager returns true only for manager", () => {
      expect(isLocationManager("manager")).toBe(true);
      expect(isLocationManager("assistant_manager")).toBe(false);
      expect(isLocationManager("staff")).toBe(false);
      expect(isLocationManager(null)).toBe(false);
    });

    it("isLocationAssistantManager returns true only for assistant_manager", () => {
      expect(isLocationAssistantManager("assistant_manager")).toBe(true);
      expect(isLocationAssistantManager("manager")).toBe(false);
      expect(isLocationAssistantManager("staff")).toBe(false);
      expect(isLocationAssistantManager(null)).toBe(false);
    });

    it("isLocationStaff returns true only for staff", () => {
      expect(isLocationStaff("staff")).toBe(true);
      expect(isLocationStaff("manager")).toBe(false);
      expect(isLocationStaff("assistant_manager")).toBe(false);
      expect(isLocationStaff(null)).toBe(false);
    });

    it("hasExplicitLocationRole verifies exact required role", () => {
      expect(hasExplicitLocationRole("manager", "manager")).toBe(true);
      expect(hasExplicitLocationRole("manager", "assistant_manager")).toBe(
        false,
      );
      expect(
        hasExplicitLocationRole("assistant_manager", "assistant_manager"),
      ).toBe(true);
      expect(hasExplicitLocationRole(null, "manager")).toBe(false);
    });
  });

  describe("mapLocationRoleRow", () => {
    it("maps a raw database row with joined organization_id correctly", () => {
      const row = {
        id: 42,
        location_id: NASA,
        profile_id: "profile-1",
        role: "manager",
        active: true,
        created_at: "2026-11-03T00:00:00Z",
        updated_at: "2026-11-03T01:00:00Z",
        locations: {
          organization_id: ORG_LIQUOR_TAP,
        },
      };

      const mapped = mapLocationRoleRow(row);
      expect(mapped).toEqual({
        id: 42,
        locationId: NASA,
        profileId: "profile-1",
        organizationId: ORG_LIQUOR_TAP,
        role: "manager",
        active: true,
        createdAt: "2026-11-03T00:00:00Z",
        updatedAt: "2026-11-03T01:00:00Z",
      });
    });

    it("defaults invalid role values to staff defensively", () => {
      const row = {
        id: 43,
        location_id: WEBSTER,
        profile_id: "profile-1",
        role: "unrecognized_role",
        active: true,
      };

      const mapped = mapLocationRoleRow(row);
      expect(mapped.role).toBe("staff");
    });
  });

  describe("evaluateEffectiveLocationRole (Permanent John Acceptance Matrix)", () => {
    const liquorTapOrg = createMockOrgMembership(ORG_LIQUOR_TAP, true);
    const monksOrg = createMockOrgMembership(ORG_MONKS, true);

    const johnNasa = createMockLocationRole(
      NASA,
      "manager",
      ORG_LIQUOR_TAP,
      true,
    );
    const johnLeagueCity = createMockLocationRole(
      LEAGUE_CITY,
      "assistant_manager",
      ORG_LIQUOR_TAP,
      true,
    );
    const johnWebster = createMockLocationRole(
      WEBSTER,
      "manager",
      ORG_MONKS,
      true,
    );

    it("John: evaluates Manager role at NASA", () => {
      expect(
        evaluateEffectiveLocationRole({
          organizationMembership: liquorTapOrg,
          locationMembership: johnNasa,
        }),
      ).toBe("manager");
    });

    it("John: simultaneously evaluates Assistant Manager role at League City", () => {
      expect(
        evaluateEffectiveLocationRole({
          organizationMembership: liquorTapOrg,
          locationMembership: johnLeagueCity,
        }),
      ).toBe("assistant_manager");
    });

    it("John: simultaneously evaluates Manager role at Webster (across organizations)", () => {
      expect(
        evaluateEffectiveLocationRole({
          organizationMembership: monksOrg,
          locationMembership: johnWebster,
        }),
      ).toBe("manager");
    });

    it("proves independence: modifying League City role does not alter NASA or Webster", () => {
      const updatedLeagueCity = createMockLocationRole(
        LEAGUE_CITY,
        "staff",
        ORG_LIQUOR_TAP,
        true,
      );

      expect(
        evaluateEffectiveLocationRole({
          organizationMembership: liquorTapOrg,
          locationMembership: johnNasa,
        }),
      ).toBe("manager");

      expect(
        evaluateEffectiveLocationRole({
          organizationMembership: liquorTapOrg,
          locationMembership: updatedLeagueCity,
        }),
      ).toBe("staff");

      expect(
        evaluateEffectiveLocationRole({
          organizationMembership: monksOrg,
          locationMembership: johnWebster,
        }),
      ).toBe("manager");
    });

    it("fails closed when organization membership is inactive", () => {
      const inactiveLiquorTap = createMockOrgMembership(ORG_LIQUOR_TAP, false);

      expect(
        evaluateEffectiveLocationRole({
          organizationMembership: inactiveLiquorTap,
          locationMembership: johnNasa,
        }),
      ).toBeNull();
    });

    it("fails closed when location assignment is inactive", () => {
      const inactiveNasa = createMockLocationRole(
        NASA,
        "manager",
        ORG_LIQUOR_TAP,
        false,
      );

      expect(
        evaluateEffectiveLocationRole({
          organizationMembership: liquorTapOrg,
          locationMembership: inactiveNasa,
        }),
      ).toBeNull();
    });

    it("fails closed when both are inactive", () => {
      const inactiveLiquorTap = createMockOrgMembership(ORG_LIQUOR_TAP, false);
      const inactiveNasa = createMockLocationRole(
        NASA,
        "manager",
        ORG_LIQUOR_TAP,
        false,
      );

      expect(
        evaluateEffectiveLocationRole({
          organizationMembership: inactiveLiquorTap,
          locationMembership: inactiveNasa,
        }),
      ).toBeNull();
    });

    it("fails closed on null or undefined inputs", () => {
      expect(evaluateEffectiveLocationRole({})).toBeNull();
      expect(
        evaluateEffectiveLocationRole({
          organizationMembership: liquorTapOrg,
          locationMembership: null,
        }),
      ).toBeNull();
    });
  });
});
