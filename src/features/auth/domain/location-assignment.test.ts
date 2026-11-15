import { describe, expect, it } from "vitest";
import {
  validateLocationAssignmentChanges,
  groupAssignmentsByOrganization,
  findAssignmentForLocation,
  hasActiveLocationAssignment,
  isLocationAssignmentAction,
  LOCATION_ASSIGNMENT_ACTIONS,
} from "./location-assignment";
import type { LocationRoleAssignment } from "./location-role";

describe("location-assignment domain", () => {
  const NASA_ID = "00000000-0000-0000-0000-0000000000b1";
  const LEAGUE_CITY_ID = "00000000-0000-0000-0000-0000000000b2";
  const WEBSTER_ID = "00000000-0000-0000-0000-0000000000b3";

  describe("isLocationAssignmentAction", () => {
    it("recognizes canonical actions", () => {
      for (const action of LOCATION_ASSIGNMENT_ACTIONS) {
        expect(isLocationAssignmentAction(action)).toBe(true);
      }
      expect(isLocationAssignmentAction("delete")).toBe(false);
      expect(isLocationAssignmentAction("remove")).toBe(false);
      expect(isLocationAssignmentAction("")).toBe(false);
      expect(isLocationAssignmentAction(null)).toBe(false);
    });
  });

  describe("validateLocationAssignmentChanges", () => {
    it("DOM-001: validates single assignment change", () => {
      const result = validateLocationAssignmentChanges([
        { locationId: NASA_ID, action: "assign", role: "manager" },
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.changes).toHaveLength(1);
        expect(result.changes[0]).toEqual({
          locationId: NASA_ID,
          action: "assign",
          role: "manager",
          active: true,
        });
      }
    });

    it("DOM-002: validates multi-location batch changes across distinct branches", () => {
      const result = validateLocationAssignmentChanges([
        { locationId: NASA_ID, action: "assign", role: "manager" },
        {
          locationId: LEAGUE_CITY_ID,
          action: "assign",
          role: "assistant_manager",
        },
        { locationId: WEBSTER_ID, action: "assign", role: "manager" },
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.changes).toHaveLength(3);
        expect(result.changes.map((c) => c.locationId)).toEqual([
          NASA_ID,
          LEAGUE_CITY_ID,
          WEBSTER_ID,
        ]);
      }
    });

    it("DOM-003: rejects duplicate locationId in batch (fail closed)", () => {
      const result = validateLocationAssignmentChanges([
        { locationId: NASA_ID, action: "assign", role: "manager" },
        { locationId: NASA_ID, action: "update", role: "staff" },
      ]);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("DUPLICATE_LOCATION");
        expect(result.error).toContain(NASA_ID);
      }
    });

    it("DOM-004: rejects invalid location role", () => {
      const result = validateLocationAssignmentChanges([
        { locationId: NASA_ID, action: "assign", role: "owner" },
      ]);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_ROLE");
        expect(result.error).toContain("owner");
      }
    });

    it("DOM-005: treats empty/null/undefined changes as deterministic no-op", () => {
      expect(validateLocationAssignmentChanges([])).toEqual({
        success: true,
        changes: [],
      });
      expect(validateLocationAssignmentChanges(null)).toEqual({
        success: true,
        changes: [],
      });
      expect(validateLocationAssignmentChanges(undefined)).toEqual({
        success: true,
        changes: [],
      });
    });

    it("DOM-006: validates deactivation instruction with role optional", () => {
      const result = validateLocationAssignmentChanges([
        { locationId: NASA_ID, action: "deactivate" },
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.changes[0]).toEqual({
          locationId: NASA_ID,
          action: "deactivate",
          role: undefined,
          active: false,
        });
      }
    });

    it("DOM-007: validates reactivate instruction with explicit role", () => {
      const result = validateLocationAssignmentChanges([
        { locationId: NASA_ID, action: "reactivate", role: "manager" },
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.changes[0]).toEqual({
          locationId: NASA_ID,
          action: "reactivate",
          role: "manager",
          active: true,
        });
      }
    });

    it("DOM-008: correctly infers actions from state-based inputs", () => {
      const result = validateLocationAssignmentChanges([
        { locationId: NASA_ID, role: "staff", active: true },
        { locationId: LEAGUE_CITY_ID, active: false },
      ]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.changes[0].action).toBe("assign");
        expect(result.changes[0].active).toBe(true);
        expect(result.changes[1].action).toBe("deactivate");
        expect(result.changes[1].active).toBe(false);
      }
    });

    it("rejects non-array or malformed change items", () => {
      expect(validateLocationAssignmentChanges("not-an-array")).toEqual({
        success: false,
        error: "Changes input must be an array",
        code: "INVALID_INPUT",
      });

      expect(validateLocationAssignmentChanges([null])).toEqual({
        success: false,
        error: "Change item at index 0 must be an object",
        code: "INVALID_ITEM",
      });

      expect(
        validateLocationAssignmentChanges([{ locationId: "   " }]),
      ).toEqual({
        success: false,
        error: "Change item at index 0 is missing locationId",
        code: "MISSING_LOCATION_ID",
      });
    });
  });

  describe("assignment collection helpers", () => {
    const ORG_A = "00000000-0000-0000-0000-0000000000a1";
    const ORG_B = "00000000-0000-0000-0000-0000000000a2";

    const mockAssignments: LocationRoleAssignment[] = [
      {
        id: 1,
        profileId: "user-1",
        locationId: NASA_ID,
        organizationId: ORG_A,
        role: "manager",
        active: true,
      },
      {
        id: 2,
        profileId: "user-1",
        locationId: LEAGUE_CITY_ID,
        organizationId: ORG_A,
        role: "assistant_manager",
        active: true,
      },
      {
        id: 3,
        profileId: "user-1",
        locationId: WEBSTER_ID,
        organizationId: ORG_B,
        role: "manager",
        active: false,
      },
    ];

    it("DOM-009: groups assignments by organization ID", () => {
      const grouped = groupAssignmentsByOrganization(mockAssignments);
      expect(grouped.size).toBe(2);
      expect(grouped.get(ORG_A)).toHaveLength(2);
      expect(grouped.get(ORG_B)).toHaveLength(1);
    });

    it("DOM-010: finds assignment by locationId and checks active status", () => {
      expect(findAssignmentForLocation(mockAssignments, NASA_ID)?.role).toBe(
        "manager",
      );
      expect(
        findAssignmentForLocation(mockAssignments, "non-existent"),
      ).toBeNull();

      expect(hasActiveLocationAssignment(mockAssignments, NASA_ID)).toBe(true);
      expect(hasActiveLocationAssignment(mockAssignments, WEBSTER_ID)).toBe(
        false,
      ); // inactive
      expect(hasActiveLocationAssignment(mockAssignments, "unknown")).toBe(
        false,
      );
    });
  });
});
