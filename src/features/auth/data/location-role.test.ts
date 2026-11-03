import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  getCurrentUserLocationRole,
  getCurrentUserLocationRoles,
  getLocationRole,
  getLocationRoleAssignment,
  hasEffectiveLocationRole,
  isLocationAssistantManagerRole,
  isLocationManagerRole,
  listActiveLocationRoles,
  listLocationRoles,
} from "./location-role";

const ORG_MONKS = "00000000-0000-0000-0000-0000000000a1";
const ORG_LIQUOR_TAP = "00000000-0000-0000-0000-0000000000a2";

const WEBSTER = "00000000-0000-0000-0000-000000000001";
const NASA = "00000000-0000-0000-0000-000000000002";
const LEAGUE_CITY = "00000000-0000-0000-0000-000000000003";

const USER_JOHN = "00000000-0000-0000-0000-000000000011";
const USER_SAM = "00000000-0000-0000-0000-000000000012";

type LocationMembershipDbRow = {
  id: number;
  location_id: string;
  profile_id: string;
  role: Database["public"]["Enums"]["location_role"];
  active: boolean;
  created_at: string;
  updated_at: string;
  locations?: {
    organization_id: string;
  };
};

type MembershipDbRow = {
  id: number;
  organization_id: string;
  profile_id: string;
  roles: Database["public"]["Enums"]["app_role"][];
  active: boolean;
  created_at: string;
};

function createMockSupabase(options: {
  userId?: string | null;
  locationRows?: LocationMembershipDbRow[];
  orgRows?: MembershipDbRow[];
  locationError?: Error | null;
  orgError?: Error | null;
  authError?: Error | null;
}) {
  const locationRows = options.locationRows ?? [];
  const orgRows = options.orgRows ?? [];

  const client = {
    auth: {
      getUser: vi.fn().mockImplementation(async () => {
        if (options.authError)
          return { data: { user: null }, error: options.authError };
        if (!options.userId) return { data: { user: null }, error: null };
        return { data: { user: { id: options.userId } }, error: null };
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "location_memberships") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col1: string, val1: unknown) => {
              return {
                eq: vi
                  .fn()
                  .mockImplementation((col2: string, val2: unknown) => {
                    return {
                      maybeSingle: vi.fn().mockImplementation(async () => {
                        if (options.locationError) {
                          return { data: null, error: options.locationError };
                        }
                        const match = locationRows.find(
                          (r) =>
                            (col1 === "profile_id"
                              ? r.profile_id === val1
                              : r.location_id === val1) &&
                            (col2 === "location_id"
                              ? r.location_id === val2
                              : r.profile_id === val2),
                        );
                        return { data: match ?? null, error: null };
                      }),
                      order: vi.fn().mockReturnValue({
                        order: vi.fn().mockImplementation(async () => {
                          if (options.locationError) {
                            return { data: null, error: options.locationError };
                          }
                          const filtered = locationRows.filter(
                            (r) =>
                              r.profile_id ===
                                (col1 === "profile_id" ? val1 : val2) &&
                              r.active === (col1 === "active" ? val1 : val2),
                          );
                          return { data: filtered, error: null };
                        }),
                      }),
                    };
                  }),
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockImplementation(async () => {
                    if (options.locationError) {
                      return { data: null, error: options.locationError };
                    }
                    const filtered = locationRows.filter(
                      (r) => r.profile_id === val1,
                    );
                    return { data: filtered, error: null };
                  }),
                }),
              };
            }),
          }),
        };
      }

      if (table === "memberships") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col1: string, val1: unknown) => {
              return {
                eq: vi
                  .fn()
                  .mockImplementation((col2: string, val2: unknown) => {
                    return {
                      maybeSingle: vi.fn().mockImplementation(async () => {
                        if (options.orgError) {
                          return { data: null, error: options.orgError };
                        }
                        const match = orgRows.find(
                          (r) =>
                            (col1 === "profile_id"
                              ? r.profile_id === val1
                              : r.organization_id === val1) &&
                            (col2 === "organization_id"
                              ? r.organization_id === val2
                              : r.profile_id === val2),
                        );
                        return { data: match ?? null, error: null };
                      }),
                    };
                  }),
              };
            }),
          }),
        };
      }

      if (table === "locations") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: unknown) => {
              return {
                maybeSingle: vi.fn().mockImplementation(async () => {
                  if (val === NASA || val === LEAGUE_CITY) {
                    return {
                      data: { organization_id: ORG_LIQUOR_TAP },
                      error: null,
                    };
                  }
                  if (val === WEBSTER) {
                    return {
                      data: { organization_id: ORG_MONKS },
                      error: null,
                    };
                  }
                  return { data: null, error: null };
                }),
              };
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient<Database>;

  return client;
}

describe("location-role data readers", () => {
  const johnLocationRows: LocationMembershipDbRow[] = [
    {
      id: 1,
      profile_id: USER_JOHN,
      location_id: NASA,
      role: "manager",
      active: true,
      created_at: "2026-11-03T00:00:00Z",
      updated_at: "2026-11-03T00:00:00Z",
      locations: { organization_id: ORG_LIQUOR_TAP },
    },
    {
      id: 2,
      profile_id: USER_JOHN,
      location_id: LEAGUE_CITY,
      role: "assistant_manager",
      active: true,
      created_at: "2026-11-03T00:01:00Z",
      updated_at: "2026-11-03T00:01:00Z",
      locations: { organization_id: ORG_LIQUOR_TAP },
    },
    {
      id: 3,
      profile_id: USER_JOHN,
      location_id: WEBSTER,
      role: "manager",
      active: true,
      created_at: "2026-11-03T00:02:00Z",
      updated_at: "2026-11-03T00:02:00Z",
      locations: { organization_id: ORG_MONKS },
    },
  ];

  const johnOrgRows: MembershipDbRow[] = [
    {
      id: 101,
      profile_id: USER_JOHN,
      organization_id: ORG_LIQUOR_TAP,
      roles: ["general_manager"],
      active: true,
      created_at: "2026-11-03T00:00:00Z",
    },
    {
      id: 102,
      profile_id: USER_JOHN,
      organization_id: ORG_MONKS,
      roles: ["general_manager"],
      active: true,
      created_at: "2026-11-03T00:00:00Z",
    },
  ];

  describe("getLocationRole & getLocationRoleAssignment (John Mixed-Role Matrix)", () => {
    it("READ-001: John holds Manager role at NASA", async () => {
      const client = createMockSupabase({
        locationRows: johnLocationRows,
        orgRows: johnOrgRows,
      });

      const role = await getLocationRole(USER_JOHN, NASA, client);
      expect(role).toBe("manager");
    });

    it("READ-001b: Different users have different roles at NASA (Sam is Staff)", async () => {
      const samLocationRows: LocationMembershipDbRow[] = [
        ...johnLocationRows,
        {
          id: 4,
          profile_id: USER_SAM,
          location_id: NASA,
          role: "staff",
          active: true,
          created_at: "2026-11-03T00:03:00Z",
          updated_at: "2026-11-03T00:03:00Z",
          locations: { organization_id: ORG_LIQUOR_TAP },
        },
      ];
      const samOrgRows: MembershipDbRow[] = [
        ...johnOrgRows,
        {
          id: 103,
          profile_id: USER_SAM,
          organization_id: ORG_LIQUOR_TAP,
          roles: ["server"],
          active: true,
          created_at: "2026-11-03T00:00:00Z",
        },
      ];
      const client = createMockSupabase({
        locationRows: samLocationRows,
        orgRows: samOrgRows,
      });

      expect(await getLocationRole(USER_JOHN, NASA, client)).toBe("manager");
      expect(await getLocationRole(USER_SAM, NASA, client)).toBe("staff");
    });

    it("READ-002: John simultaneously holds Assistant Manager role at League City", async () => {
      const client = createMockSupabase({
        locationRows: johnLocationRows,
        orgRows: johnOrgRows,
      });

      const role = await getLocationRole(USER_JOHN, LEAGUE_CITY, client);
      expect(role).toBe("assistant_manager");
    });

    it("READ-003: John simultaneously holds Manager role at Webster", async () => {
      const client = createMockSupabase({
        locationRows: johnLocationRows,
        orgRows: johnOrgRows,
      });

      const role = await getLocationRole(USER_JOHN, WEBSTER, client);
      expect(role).toBe("manager");
    });

    it("READ-004: returns null for an unassigned location", async () => {
      const client = createMockSupabase({
        locationRows: johnLocationRows,
        orgRows: johnOrgRows,
      });

      const role = await getLocationRole(
        USER_JOHN,
        "00000000-0000-0000-0000-000000000099",
        client,
      );
      expect(role).toBeNull();
    });

    it("READ-005: returns null when parent organization membership is inactive", async () => {
      const inactiveOrgRows: MembershipDbRow[] = [
        {
          id: 101,
          profile_id: USER_JOHN,
          organization_id: ORG_LIQUOR_TAP,
          roles: ["general_manager"],
          active: false,
          created_at: "2026-11-03T00:00:00Z",
        },
      ];

      const client = createMockSupabase({
        locationRows: johnLocationRows,
        orgRows: inactiveOrgRows,
      });

      const role = await getLocationRole(USER_JOHN, NASA, client);
      expect(role).toBeNull();
    });

    it("READ-006: returns null when location assignment itself is inactive", async () => {
      const inactiveLocationRows: LocationMembershipDbRow[] = [
        {
          ...johnLocationRows[0],
          active: false,
        },
      ];

      const client = createMockSupabase({
        locationRows: inactiveLocationRows,
        orgRows: johnOrgRows,
      });

      const role = await getLocationRole(USER_JOHN, NASA, client);
      expect(role).toBeNull();
    });

    it("fails closed on database query error", async () => {
      const client = createMockSupabase({
        locationError: new Error("connection failure"),
      });

      const role = await getLocationRole(USER_JOHN, NASA, client);
      expect(role).toBeNull();
    });

    it("fails closed on empty profileId or locationId", async () => {
      const client = createMockSupabase({});
      expect(await getLocationRole("", NASA, client)).toBeNull();
      expect(await getLocationRole(USER_JOHN, "", client)).toBeNull();
    });

    it("getLocationRoleAssignment returns raw assignment record", async () => {
      const client = createMockSupabase({
        locationRows: johnLocationRows,
      });

      const assignment = await getLocationRoleAssignment(
        USER_JOHN,
        NASA,
        client,
      );
      expect(assignment).toEqual({
        id: 1,
        locationId: NASA,
        profileId: USER_JOHN,
        organizationId: ORG_LIQUOR_TAP,
        role: "manager",
        active: true,
        createdAt: "2026-11-03T00:00:00Z",
        updatedAt: "2026-11-03T00:00:00Z",
      });
    });
  });

  describe("listLocationRoles & listActiveLocationRoles", () => {
    it("listLocationRoles returns all assignments for a profile", async () => {
      const client = createMockSupabase({
        locationRows: johnLocationRows,
      });

      const assignments = await listLocationRoles(USER_JOHN, client);
      expect(assignments).toHaveLength(3);
      expect(assignments.map((a) => a.role)).toEqual([
        "manager",
        "assistant_manager",
        "manager",
      ]);
    });

    it("listActiveLocationRoles filters out inactive assignments", async () => {
      const mixedRows: LocationMembershipDbRow[] = [
        johnLocationRows[0],
        { ...johnLocationRows[1], active: false },
        johnLocationRows[2],
      ];

      const client = createMockSupabase({
        locationRows: mixedRows,
      });

      const activeAssignments = await listActiveLocationRoles(
        USER_JOHN,
        client,
      );
      expect(activeAssignments).toHaveLength(2);
      expect(activeAssignments.map((a) => a.locationId)).toEqual([
        NASA,
        WEBSTER,
      ]);
    });

    it("returns empty array for empty profileId or on error", async () => {
      const client = createMockSupabase({
        locationError: new Error("fail"),
      });

      expect(await listLocationRoles("", client)).toEqual([]);
      expect(await listLocationRoles(USER_JOHN, client)).toEqual([]);
      expect(await listActiveLocationRoles("", client)).toEqual([]);
      expect(await listActiveLocationRoles(USER_JOHN, client)).toEqual([]);
    });
  });

  describe("current user reader functions", () => {
    it("getCurrentUserLocationRole returns role for authenticated caller", async () => {
      const client = createMockSupabase({
        userId: USER_JOHN,
        locationRows: johnLocationRows,
        orgRows: johnOrgRows,
      });

      const role = await getCurrentUserLocationRole(NASA, client);
      expect(role).toBe("manager");
    });

    it("getCurrentUserLocationRole returns null when unauthenticated", async () => {
      const client = createMockSupabase({
        userId: null,
      });

      const role = await getCurrentUserLocationRole(NASA, client);
      expect(role).toBeNull();
    });

    it("getCurrentUserLocationRoles returns all active roles for caller", async () => {
      const client = createMockSupabase({
        userId: USER_JOHN,
        locationRows: johnLocationRows,
      });

      const roles = await getCurrentUserLocationRoles(client);
      expect(roles).toHaveLength(3);
    });

    it("getCurrentUserLocationRoles returns empty array when unauthenticated", async () => {
      const client = createMockSupabase({
        userId: null,
      });

      const roles = await getCurrentUserLocationRoles(client);
      expect(roles).toEqual([]);
    });
  });

  describe("predicates & role checks", () => {
    it("hasEffectiveLocationRole evaluates exact required role", async () => {
      const client = createMockSupabase({
        locationRows: johnLocationRows,
        orgRows: johnOrgRows,
      });

      expect(
        await hasEffectiveLocationRole(USER_JOHN, NASA, "manager", client),
      ).toBe(true);
      expect(
        await hasEffectiveLocationRole(
          USER_JOHN,
          NASA,
          "assistant_manager",
          client,
        ),
      ).toBe(false);
      expect(
        await hasEffectiveLocationRole(
          USER_JOHN,
          LEAGUE_CITY,
          "assistant_manager",
          client,
        ),
      ).toBe(true);
      expect(
        await hasEffectiveLocationRole(
          USER_JOHN,
          LEAGUE_CITY,
          "manager",
          client,
        ),
      ).toBe(false);
    });

    it("isLocationManagerRole convenience helper", async () => {
      const client = createMockSupabase({
        locationRows: johnLocationRows,
        orgRows: johnOrgRows,
      });

      expect(await isLocationManagerRole(USER_JOHN, NASA, client)).toBe(true);
      expect(await isLocationManagerRole(USER_JOHN, LEAGUE_CITY, client)).toBe(
        false,
      );
    });

    it("isLocationAssistantManagerRole convenience helper", async () => {
      const client = createMockSupabase({
        locationRows: johnLocationRows,
        orgRows: johnOrgRows,
      });

      expect(
        await isLocationAssistantManagerRole(USER_JOHN, LEAGUE_CITY, client),
      ).toBe(true);
      expect(
        await isLocationAssistantManagerRole(USER_JOHN, NASA, client),
      ).toBe(false);
    });
  });
});
