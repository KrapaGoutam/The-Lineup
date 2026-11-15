import { describe, expect, it } from "vitest";
import type { LocationRoleAssignment } from "@/features/auth/domain/location-role";
import {
  LOCATION_ROLE_OPTIONS,
  buildAssignmentChangeSet,
  dedupeAssignments,
  deriveAssignmentStatus,
  filterAssignmentsToLocations,
  filterRosterByName,
  sortRoster,
  type AssignableLocation,
} from "./staff-assignment";

const WEBSTER = "loc-webster";
const NASA = "loc-nasa";
const LEAGUE = "loc-league";
const INACTIVE = "loc-closed";

const LOCATIONS: AssignableLocation[] = [
  { id: NASA, name: "NASA", active: true },
  { id: LEAGUE, name: "League City", active: true },
  { id: INACTIVE, name: "Closed Branch", active: false },
];

function a(
  id: number,
  locationId: string,
  role: LocationRoleAssignment["role"],
  active = true,
): LocationRoleAssignment {
  return { id, profileId: "john", locationId, role, active };
}

describe("staff-assignment domain", () => {
  it("DOM-001: role options are exactly manager, assistant_manager, staff", () => {
    expect(LOCATION_ROLE_OPTIONS.map((o) => o.value)).toEqual([
      "manager",
      "assistant_manager",
      "staff",
    ]);
    expect(LOCATION_ROLE_OPTIONS.map((o) => o.label)).toEqual([
      "Manager",
      "Assistant Manager",
      "Staff",
    ]);
  });

  it("DOM-002: invalid role is rejected", () => {
    const res = buildAssignmentChangeSet({
      baseline: [],
      desired: [
        {
          locationId: NASA,
          assigned: true,
          role: "general_manager" as never,
        },
      ],
      editableLocations: LOCATIONS,
    });
    expect(res).toMatchObject({ success: false, code: "INVALID_ROLE" });
  });

  it("DOM-003: duplicate location instructions are rejected", () => {
    const res = buildAssignmentChangeSet({
      baseline: [],
      desired: [
        { locationId: NASA, assigned: true, role: "staff" },
        { locationId: NASA, assigned: true, role: "manager" },
      ],
      editableLocations: LOCATIONS,
    });
    expect(res).toMatchObject({ success: false, code: "DUPLICATE_LOCATION" });
  });

  it("DOM-004: empty desired set is a deterministic no-op", () => {
    const res = buildAssignmentChangeSet({
      baseline: [a(1, NASA, "manager")],
      desired: [],
      editableLocations: LOCATIONS,
    });
    expect(res).toEqual({ success: true, changes: [] });
  });

  it("DOM-005: unchanged assignments are omitted", () => {
    const res = buildAssignmentChangeSet({
      baseline: [a(1, NASA, "manager"), a(2, LEAGUE, "staff", false)],
      desired: [
        { locationId: NASA, assigned: true, role: "manager" },
        { locationId: LEAGUE, assigned: false, role: "staff" },
      ],
      editableLocations: LOCATIONS,
    });
    expect(res).toEqual({ success: true, changes: [] });
  });

  it("DOM-006: deactivation is explicit and carries active=false", () => {
    const res = buildAssignmentChangeSet({
      baseline: [a(1, NASA, "manager")],
      desired: [{ locationId: NASA, assigned: false }],
      editableLocations: LOCATIONS,
    });
    expect(res).toEqual({
      success: true,
      changes: [
        {
          locationId: NASA,
          action: "deactivate",
          role: "manager",
          active: false,
        },
      ],
    });
  });

  it("DOM-007: reactivation requires and carries a valid role", () => {
    const ok = buildAssignmentChangeSet({
      baseline: [a(1, NASA, "staff", false)],
      desired: [
        { locationId: NASA, assigned: true, role: "assistant_manager" },
      ],
      editableLocations: LOCATIONS,
    });
    expect(ok).toEqual({
      success: true,
      changes: [
        {
          locationId: NASA,
          action: "reactivate",
          role: "assistant_manager",
          active: true,
        },
      ],
    });
    const bad = buildAssignmentChangeSet({
      baseline: [a(1, NASA, "staff", false)],
      desired: [{ locationId: NASA, assigned: true }],
      editableLocations: LOCATIONS,
    });
    expect(bad).toMatchObject({ success: false, code: "INVALID_ROLE" });
  });

  it("DOM-008/DOM-009: locations not listed are never implicitly deactivated (cross-org preserved)", () => {
    // John also holds an active Webster assignment in ANOTHER organization.
    const baseline = [
      a(1, WEBSTER, "manager"),
      a(2, NASA, "manager"),
      a(3, LEAGUE, "assistant_manager"),
    ];
    const res = buildAssignmentChangeSet({
      baseline,
      desired: [{ locationId: NASA, assigned: true, role: "staff" }],
      editableLocations: LOCATIONS,
    });
    expect(res).toEqual({
      success: true,
      changes: [
        { locationId: NASA, action: "update", role: "staff", active: true },
      ],
    });
    // Webster/League City untouched.
    if (res.success) {
      expect(res.changes.some((c) => c.locationId === WEBSTER)).toBe(false);
      expect(res.changes.some((c) => c.locationId === LEAGUE)).toBe(false);
    }
  });

  it("DOM-009: a location outside the editable scope is rejected, not dropped", () => {
    const res = buildAssignmentChangeSet({
      baseline: [a(1, WEBSTER, "manager")],
      desired: [{ locationId: WEBSTER, assigned: false }],
      editableLocations: LOCATIONS,
    });
    expect(res).toMatchObject({
      success: false,
      code: "LOCATION_OUT_OF_SCOPE",
    });
  });

  it("DOM-010: change set is deterministic (sorted, order independent)", () => {
    const desired = [
      { locationId: NASA, assigned: true, role: "manager" as const },
      {
        locationId: LEAGUE,
        assigned: true,
        role: "assistant_manager" as const,
      },
    ];
    const one = buildAssignmentChangeSet({
      baseline: [],
      desired,
      editableLocations: LOCATIONS,
    });
    const two = buildAssignmentChangeSet({
      baseline: [],
      desired: [...desired].reverse(),
      editableLocations: LOCATIONS,
    });
    expect(one).toEqual(two);
    expect(one.success && one.changes.map((c) => c.locationId)).toEqual(
      [LEAGUE, NASA].sort(),
    );
  });

  it("DOM-011: multiple locations carry independent roles", () => {
    const res = buildAssignmentChangeSet({
      baseline: [],
      desired: [
        { locationId: NASA, assigned: true, role: "manager" },
        { locationId: LEAGUE, assigned: true, role: "assistant_manager" },
      ],
      editableLocations: LOCATIONS,
    });
    expect(res.success && res.changes).toEqual([
      {
        locationId: LEAGUE,
        action: "assign",
        role: "assistant_manager",
        active: true,
      },
      { locationId: NASA, action: "assign", role: "manager", active: true },
    ]);
  });

  it("DOM-012: duplicate assignment rows collapse to one per location/profile", () => {
    const rows = dedupeAssignments([
      { ...a(1, NASA, "staff"), updatedAt: "2026-01-01" },
      { ...a(2, NASA, "manager"), updatedAt: "2026-02-01" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("manager");
  });

  it("SEC-011: inactive locations cannot be a new assignment target or edited", () => {
    const assign = buildAssignmentChangeSet({
      baseline: [],
      desired: [{ locationId: INACTIVE, assigned: true, role: "staff" }],
      editableLocations: LOCATIONS,
    });
    expect(assign).toMatchObject({ success: false, code: "LOCATION_INACTIVE" });
    const remove = buildAssignmentChangeSet({
      baseline: [a(1, INACTIVE, "staff")],
      desired: [{ locationId: INACTIVE, assigned: false }],
      editableLocations: LOCATIONS,
    });
    expect(remove).toMatchObject({ success: false, code: "LOCATION_INACTIVE" });
  });

  it("derives unambiguous statuses; inactive membership always wins", () => {
    const active = { membershipActive: true };
    const inactive = { membershipActive: false };
    expect(deriveAssignmentStatus(active, null)).toBe("not_assigned");
    expect(deriveAssignmentStatus(active, { active: true })).toBe("assigned");
    expect(deriveAssignmentStatus(active, { active: false })).toBe(
      "inactive_assignment",
    );
    expect(deriveAssignmentStatus(inactive, { active: true })).toBe(
      "membership_inactive",
    );
    expect(deriveAssignmentStatus(inactive, null)).toBe("membership_inactive");
  });

  it("sorts roster deterministically and filters by name", () => {
    const roster = [
      {
        profileId: "3",
        displayName: "Zed",
        organizationRoles: [],
        membershipActive: false,
      },
      {
        profileId: "2",
        displayName: "amy",
        organizationRoles: [],
        membershipActive: true,
      },
      {
        profileId: "1",
        displayName: "Amy",
        organizationRoles: [],
        membershipActive: true,
      },
    ];
    expect(sortRoster(roster).map((m) => m.profileId)).toEqual(["1", "2", "3"]);
    expect(filterRosterByName(roster, "  AM ").map((m) => m.profileId)).toEqual(
      ["2", "1"],
    );
    expect(filterRosterByName(roster, "")).toHaveLength(3);
  });

  it("restricts assignments to the given organization's locations", () => {
    const out = filterAssignmentsToLocations(
      [a(1, WEBSTER, "manager"), a(2, NASA, "staff")],
      new Set([NASA]),
    );
    expect(out.map((x) => x.locationId)).toEqual([NASA]);
  });
});
