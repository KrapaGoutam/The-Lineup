import { describe, expect, it } from "vitest";
import type { DatabaseAppRole } from "./organization-membership";
import {
  filterActiveMemberships,
  findOrganizationMembership,
  hasActiveOrganizationMembership,
  isMembershipActive,
  mapMembershipRow,
  type OrganizationMembership,
} from "./organization-membership";

const ORG_MONKS = "00000000-0000-0000-0000-0000000000a1";
const ORG_LIQUOR_TAP = "00000000-0000-0000-0000-0000000000a2";

const USER_JACK = "00000000-0000-0000-0000-000000000001";
const USER_SAM = "00000000-0000-0000-0000-000000000002";
const USER_TOM = "00000000-0000-0000-0000-000000000003";
const USER_JERRY = "00000000-0000-0000-0000-000000000004";

describe("organization-membership domain model", () => {
  describe("mapMembershipRow", () => {
    it("maps raw database row to canonical domain OrganizationMembership", () => {
      const membership = mapMembershipRow({
        id: 101,
        organization_id: ORG_MONKS,
        profile_id: USER_JACK,
        roles: ["general_manager" as DatabaseAppRole],
        active: true,
        created_at: "2026-11-02T12:00:00Z",
      });

      expect(membership).toEqual({
        id: 101,
        organizationId: ORG_MONKS,
        profileId: USER_JACK,
        roles: ["general_manager"],
        role: "manager",
        designation: "manager",
        active: true,
        createdAt: "2026-11-02T12:00:00Z",
      });
      expect(Object.isFrozen(membership.roles)).toBe(true);
    });

    it("correctly derives role and designation for owner, shift_manager, and server", () => {
      const ownerMem = mapMembershipRow({
        id: 1,
        organization_id: ORG_MONKS,
        profile_id: USER_JACK,
        roles: ["owner"],
        active: true,
      });
      expect(ownerMem.role).toBe("owner");
      expect(ownerMem.designation).toBe("owner");

      const asstMem = mapMembershipRow({
        id: 2,
        organization_id: ORG_MONKS,
        profile_id: USER_JACK,
        roles: ["shift_manager"],
        active: true,
      });
      expect(asstMem.role).toBe("manager");
      expect(asstMem.designation).toBe("assistant_manager");

      const staffMem = mapMembershipRow({
        id: 3,
        organization_id: ORG_MONKS,
        profile_id: USER_JACK,
        roles: ["server"],
        active: true,
      });
      expect(staffMem.role).toBe("server");
      expect(staffMem.designation).toBe("staff");
    });
  });

  describe("isMembershipActive", () => {
    it("returns true only when membership is defined and active is true", () => {
      const activeMem: OrganizationMembership = {
        id: 1,
        organizationId: ORG_MONKS,
        profileId: USER_JACK,
        roles: ["owner"],
        role: "owner",
        designation: "owner",
        active: true,
      };
      const inactiveMem: OrganizationMembership = {
        ...activeMem,
        active: false,
      };

      expect(isMembershipActive(activeMem)).toBe(true);
      expect(isMembershipActive(inactiveMem)).toBe(false);
      expect(isMembershipActive(null)).toBe(false);
      expect(isMembershipActive(undefined)).toBe(false);
    });
  });

  describe("filterActiveMemberships", () => {
    it("returns only active memberships", () => {
      const list: OrganizationMembership[] = [
        {
          id: 1,
          organizationId: ORG_MONKS,
          profileId: USER_JACK,
          roles: ["owner"],
          role: "owner",
          designation: "owner",
          active: true,
        },
        {
          id: 2,
          organizationId: ORG_LIQUOR_TAP,
          profileId: USER_JACK,
          roles: ["server"],
          role: "server",
          designation: "staff",
          active: false,
        },
      ];

      const activeList = filterActiveMemberships(list);
      expect(activeList).toHaveLength(1);
      expect(activeList[0].organizationId).toBe(ORG_MONKS);
    });
  });

  describe("hasActiveOrganizationMembership", () => {
    it("returns true if active membership exists for the specified organization", () => {
      const list: OrganizationMembership[] = [
        {
          id: 1,
          organizationId: ORG_MONKS,
          profileId: USER_JACK,
          roles: ["owner"],
          role: "owner",
          designation: "owner",
          active: true,
        },
        {
          id: 2,
          organizationId: ORG_LIQUOR_TAP,
          profileId: USER_JACK,
          roles: ["server"],
          role: "server",
          designation: "staff",
          active: false,
        },
      ];

      expect(hasActiveOrganizationMembership(list, ORG_MONKS)).toBe(true);
      expect(hasActiveOrganizationMembership(list, ORG_LIQUOR_TAP)).toBe(false);
      expect(
        hasActiveOrganizationMembership(list, "00000000-0000-0000-0000-none"),
      ).toBe(false);
      expect(hasActiveOrganizationMembership(list, "")).toBe(false);
    });
  });

  describe("findOrganizationMembership", () => {
    it("locates membership for target organization regardless of active status", () => {
      const inactiveMem: OrganizationMembership = {
        id: 2,
        organizationId: ORG_LIQUOR_TAP,
        profileId: USER_JACK,
        roles: ["server"],
        role: "server",
        designation: "staff",
        active: false,
      };
      const list: OrganizationMembership[] = [inactiveMem];

      expect(findOrganizationMembership(list, ORG_LIQUOR_TAP)).toEqual(
        inactiveMem,
      );
      expect(findOrganizationMembership(list, ORG_MONKS)).toBe(null);
      expect(findOrganizationMembership(list, "")).toBe(null);
    });
  });

  describe("Permanent Acceptance Scenarios (Jack, Sam, Tom, Jerry)", () => {
    it("Jack: holds active memberships in both Monks and Liquor Tap", () => {
      const jackMemberships: OrganizationMembership[] = [
        mapMembershipRow({
          id: 11,
          organization_id: ORG_MONKS,
          profile_id: USER_JACK,
          roles: ["general_manager"],
          active: true,
        }),
        mapMembershipRow({
          id: 12,
          organization_id: ORG_LIQUOR_TAP,
          profile_id: USER_JACK,
          roles: ["server"],
          active: true,
        }),
      ];

      expect(filterActiveMemberships(jackMemberships)).toHaveLength(2);
      expect(hasActiveOrganizationMembership(jackMemberships, ORG_MONKS)).toBe(
        true,
      );
      expect(
        hasActiveOrganizationMembership(jackMemberships, ORG_LIQUOR_TAP),
      ).toBe(true);
      // Independent organization roles
      expect(
        findOrganizationMembership(jackMemberships, ORG_MONKS)?.designation,
      ).toBe("manager");
      expect(
        findOrganizationMembership(jackMemberships, ORG_LIQUOR_TAP)
          ?.designation,
      ).toBe("staff");
    });

    it("Sam: holds active membership in Liquor Tap ONLY", () => {
      const samMemberships: OrganizationMembership[] = [
        mapMembershipRow({
          id: 21,
          organization_id: ORG_LIQUOR_TAP,
          profile_id: USER_SAM,
          roles: ["server"],
          active: true,
        }),
      ];

      expect(filterActiveMemberships(samMemberships)).toHaveLength(1);
      expect(
        hasActiveOrganizationMembership(samMemberships, ORG_LIQUOR_TAP),
      ).toBe(true);
      expect(hasActiveOrganizationMembership(samMemberships, ORG_MONKS)).toBe(
        false,
      );
    });

    it("Tom: holds active membership in Monks ONLY", () => {
      const tomMemberships: OrganizationMembership[] = [
        mapMembershipRow({
          id: 31,
          organization_id: ORG_MONKS,
          profile_id: USER_TOM,
          roles: ["server"],
          active: true,
        }),
      ];

      expect(filterActiveMemberships(tomMemberships)).toHaveLength(1);
      expect(hasActiveOrganizationMembership(tomMemberships, ORG_MONKS)).toBe(
        true,
      );
      expect(
        hasActiveOrganizationMembership(tomMemberships, ORG_LIQUOR_TAP),
      ).toBe(false);
    });

    it("Jerry: holds active memberships in both Monks and Liquor Tap", () => {
      const jerryMemberships: OrganizationMembership[] = [
        mapMembershipRow({
          id: 41,
          organization_id: ORG_MONKS,
          profile_id: USER_JERRY,
          roles: ["server"],
          active: true,
        }),
        mapMembershipRow({
          id: 42,
          organization_id: ORG_LIQUOR_TAP,
          profile_id: USER_JERRY,
          roles: ["server"],
          active: true,
        }),
      ];

      expect(filterActiveMemberships(jerryMemberships)).toHaveLength(2);
      expect(hasActiveOrganizationMembership(jerryMemberships, ORG_MONKS)).toBe(
        true,
      );
      expect(
        hasActiveOrganizationMembership(jerryMemberships, ORG_LIQUOR_TAP),
      ).toBe(true);
    });
  });
});
