import { describe, expect, it } from "vitest";
import type { LocationAccess } from "@/features/auth/domain/location-access";
import {
  evaluateScopedLocationAccess,
  filterActiveLocationAccess,
  findLocationAccess,
  hasActiveLocationAssignment,
  hasEffectiveLocationAccess,
  isLocationAccessActive,
  mapLocationMembershipRow,
} from "@/features/auth/domain/location-access";
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
    roles: ["server"],
    role: "server",
    designation: "staff",
    active,
  };
}

function createMockLocationAccess(
  locationId: string,
  orgId?: string,
  active = true,
): LocationAccess {
  return {
    id: 10,
    profileId: "profile-1",
    locationId,
    organizationId: orgId,
    active,
  };
}

describe("location-access domain", () => {
  describe("isLocationAccessActive", () => {
    it("returns true for active assignment", () => {
      expect(
        isLocationAccessActive(
          createMockLocationAccess(WEBSTER, ORG_MONKS, true),
        ),
      ).toBe(true);
    });

    it("returns false for inactive assignment", () => {
      expect(
        isLocationAccessActive(
          createMockLocationAccess(WEBSTER, ORG_MONKS, false),
        ),
      ).toBe(false);
    });

    it("returns false for null or undefined", () => {
      expect(isLocationAccessActive(null)).toBe(false);
      expect(isLocationAccessActive(undefined)).toBe(false);
    });
  });

  describe("filterActiveLocationAccess", () => {
    it("filters out inactive assignments", () => {
      const assignments: LocationAccess[] = [
        createMockLocationAccess(WEBSTER, ORG_MONKS, true),
        createMockLocationAccess(NASA, ORG_LIQUOR_TAP, false),
        createMockLocationAccess(LEAGUE_CITY, ORG_LIQUOR_TAP, true),
      ];

      const active = filterActiveLocationAccess(assignments);
      expect(active).toHaveLength(2);
      expect(active.map((a) => a.locationId)).toEqual([WEBSTER, LEAGUE_CITY]);
    });

    it("returns empty array for empty inputs", () => {
      expect(filterActiveLocationAccess([])).toEqual([]);
    });
  });

  describe("findLocationAccess and hasActiveLocationAssignment", () => {
    const assignments: LocationAccess[] = [
      createMockLocationAccess(WEBSTER, ORG_MONKS, true),
      createMockLocationAccess(NASA, ORG_LIQUOR_TAP, false),
    ];

    it("finds assignment by locationId", () => {
      expect(findLocationAccess(assignments, WEBSTER)?.locationId).toBe(
        WEBSTER,
      );
      expect(findLocationAccess(assignments, LEAGUE_CITY)).toBeNull();
      expect(findLocationAccess(assignments, "")).toBeNull();
    });

    it("checks active assignment correctly", () => {
      expect(hasActiveLocationAssignment(assignments, WEBSTER)).toBe(true);
      expect(hasActiveLocationAssignment(assignments, NASA)).toBe(false); // exists but inactive
      expect(hasActiveLocationAssignment(assignments, LEAGUE_CITY)).toBe(false);
      expect(hasActiveLocationAssignment(assignments, "")).toBe(false);
    });
  });

  describe("mapLocationMembershipRow", () => {
    it("maps raw database row with joined organization_id", () => {
      const row = {
        id: 42,
        location_id: WEBSTER,
        profile_id: "profile-123",
        active: true,
        created_at: "2026-11-03T00:00:00Z",
        updated_at: "2026-11-03T00:00:00Z",
        locations: {
          organization_id: ORG_MONKS,
        },
      };

      const mapped = mapLocationMembershipRow(row);
      expect(mapped).toEqual({
        id: 42,
        locationId: WEBSTER,
        profileId: "profile-123",
        organizationId: ORG_MONKS,
        active: true,
        createdAt: "2026-11-03T00:00:00Z",
        updatedAt: "2026-11-03T00:00:00Z",
      });
    });

    it("handles row without joined locations", () => {
      const row = {
        id: 43,
        location_id: NASA,
        profile_id: "profile-456",
        active: false,
      };

      const mapped = mapLocationMembershipRow(row);
      expect(mapped.id).toBe(43);
      expect(mapped.locationId).toBe(NASA);
      expect(mapped.active).toBe(false);
      expect(mapped.organizationId).toBeUndefined();
    });
  });

  describe("Permanent Acceptance Matrix (Jack, Sam, Tom, Jerry)", () => {
    it("Jack: assigned to Webster (Monks), NASA (Liquor Tap), League City (Liquor Tap) -> ALLOW for all three", () => {
      const monksOrg = createMockOrgMembership(ORG_MONKS, true);
      const liquorTapOrg = createMockOrgMembership(ORG_LIQUOR_TAP, true);

      const websterAccess = createMockLocationAccess(WEBSTER, ORG_MONKS, true);
      const nasaAccess = createMockLocationAccess(NASA, ORG_LIQUOR_TAP, true);
      const leagueCityAccess = createMockLocationAccess(
        LEAGUE_CITY,
        ORG_LIQUOR_TAP,
        true,
      );

      expect(
        evaluateScopedLocationAccess({
          organizationMembership: monksOrg,
          locationAssignment: websterAccess,
        }),
      ).toBe("ALLOW");

      expect(
        evaluateScopedLocationAccess({
          organizationMembership: liquorTapOrg,
          locationAssignment: nasaAccess,
        }),
      ).toBe("ALLOW");

      expect(
        evaluateScopedLocationAccess({
          organizationMembership: liquorTapOrg,
          locationAssignment: leagueCityAccess,
        }),
      ).toBe("ALLOW");
    });

    it("Sam: assigned to Liquor Tap / NASA -> NASA ALLOW, League City DENY, Webster DENY", () => {
      const liquorTapOrg = createMockOrgMembership(ORG_LIQUOR_TAP, true);
      const nasaAccess = createMockLocationAccess(NASA, ORG_LIQUOR_TAP, true);

      // NASA: active org + active assignment -> ALLOW
      expect(
        evaluateScopedLocationAccess({
          organizationMembership: liquorTapOrg,
          locationAssignment: nasaAccess,
        }),
      ).toBe("ALLOW");

      // League City: active org + NO assignment -> DENY
      expect(
        evaluateScopedLocationAccess({
          organizationMembership: liquorTapOrg,
          locationAssignment: null,
        }),
      ).toBe("DENY");

      // Webster: NO Monks org membership + NO assignment -> DENY
      expect(
        evaluateScopedLocationAccess({
          organizationMembership: null,
          locationAssignment: null,
        }),
      ).toBe("DENY");
    });

    it("Tom: assigned to Monks / Webster -> Webster ALLOW, NASA DENY, League City DENY", () => {
      const monksOrg = createMockOrgMembership(ORG_MONKS, true);
      const websterAccess = createMockLocationAccess(WEBSTER, ORG_MONKS, true);

      // Webster: ALLOW
      expect(
        evaluateScopedLocationAccess({
          organizationMembership: monksOrg,
          locationAssignment: websterAccess,
        }),
      ).toBe("ALLOW");

      // NASA: NO Liquor Tap membership -> DENY
      expect(
        evaluateScopedLocationAccess({
          organizationMembership: null,
          locationAssignment: null,
        }),
      ).toBe("DENY");
    });

    it("Jerry: assigned to Monks / Webster and Liquor Tap / NASA -> Webster ALLOW, NASA ALLOW, League City DENY", () => {
      const monksOrg = createMockOrgMembership(ORG_MONKS, true);
      const liquorTapOrg = createMockOrgMembership(ORG_LIQUOR_TAP, true);

      const websterAccess = createMockLocationAccess(WEBSTER, ORG_MONKS, true);
      const nasaAccess = createMockLocationAccess(NASA, ORG_LIQUOR_TAP, true);

      expect(
        evaluateScopedLocationAccess({
          organizationMembership: monksOrg,
          locationAssignment: websterAccess,
        }),
      ).toBe("ALLOW");

      expect(
        evaluateScopedLocationAccess({
          organizationMembership: liquorTapOrg,
          locationAssignment: nasaAccess,
        }),
      ).toBe("ALLOW");

      // League City: has Liquor Tap membership, but NO League City location assignment -> DENY
      expect(
        evaluateScopedLocationAccess({
          organizationMembership: liquorTapOrg,
          locationAssignment: null,
        }),
      ).toBe("DENY");
    });

    it("Organization deactivation scenario: Jerry's Liquor Tap membership is deactivated while NASA assignment remains persisted -> DENY", () => {
      const inactiveLiquorTapOrg = createMockOrgMembership(
        ORG_LIQUOR_TAP,
        false,
      );
      const persistedNasaAccess = createMockLocationAccess(
        NASA,
        ORG_LIQUOR_TAP,
        true,
      );

      expect(
        evaluateScopedLocationAccess({
          organizationMembership: inactiveLiquorTapOrg,
          locationAssignment: persistedNasaAccess,
        }),
      ).toBe("DENY");
      expect(
        hasEffectiveLocationAccess({
          organizationMembership: inactiveLiquorTapOrg,
          locationAssignment: persistedNasaAccess,
        }),
      ).toBe(false);
    });

    it("Location assignment deactivation scenario: active org membership with inactive location assignment -> DENY", () => {
      const activeOrg = createMockOrgMembership(ORG_LIQUOR_TAP, true);
      const inactiveAccess = createMockLocationAccess(
        NASA,
        ORG_LIQUOR_TAP,
        false,
      );

      expect(
        evaluateScopedLocationAccess({
          organizationMembership: activeOrg,
          locationAssignment: inactiveAccess,
        }),
      ).toBe("DENY");
    });

    it("Both inactive -> DENY", () => {
      const inactiveOrg = createMockOrgMembership(ORG_LIQUOR_TAP, false);
      const inactiveAccess = createMockLocationAccess(
        NASA,
        ORG_LIQUOR_TAP,
        false,
      );

      expect(
        evaluateScopedLocationAccess({
          organizationMembership: inactiveOrg,
          locationAssignment: inactiveAccess,
        }),
      ).toBe("DENY");
    });
  });
});
