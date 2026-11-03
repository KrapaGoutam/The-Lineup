import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  currentUserHasLocationAccess,
  getCurrentUserActiveLocationMemberships,
  getCurrentUserLocationMemberships,
  getLocationMembership,
  hasActiveLocationAccess,
  listActiveLocationMemberships,
  listLocationMemberships,
} from "./location-access";

const ORG_MONKS = "00000000-0000-0000-0000-0000000000a1";
const ORG_LIQUOR_TAP = "00000000-0000-0000-0000-0000000000a2";

const WEBSTER = "00000000-0000-0000-0000-000000000001";
const NASA = "00000000-0000-0000-0000-000000000002";
const LEAGUE_CITY = "00000000-0000-0000-0000-000000000003";

const USER_JACK = "00000000-0000-0000-0000-000000000011";
const USER_SAM = "00000000-0000-0000-0000-000000000012";
const USER_TOM = "00000000-0000-0000-0000-000000000013";
const USER_JERRY = "00000000-0000-0000-0000-000000000014";

type LocationMembershipDbRow = {
  id: number;
  location_id: string;
  profile_id: string;
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
              // Can chain another .eq or .order
              return {
                eq: vi
                  .fn()
                  .mockImplementation((col2: string, val2: unknown) => {
                    return {
                      // maybeSingle query: .eq("profile_id", ...).eq("location_id", ...)
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
                      // list active query: .eq("profile_id", ...).eq("active", true).order(...).order(...)
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
                // list all query: .eq("profile_id", ...).order(...).order(...)
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
            eq: vi.fn().mockImplementation((_col: string, val: string) => {
              return {
                maybeSingle: vi.fn().mockImplementation(async () => {
                  const match = locationRows.find((r) => r.location_id === val);
                  if (match?.locations?.organization_id) {
                    return {
                      data: {
                        organization_id: match.locations.organization_id,
                      },
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

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return client as unknown as SupabaseClient<Database>;
}

describe("location-access data readers", () => {
  describe("getLocationMembership", () => {
    it("returns null for empty parameters", async () => {
      const client = createMockSupabase({});
      expect(await getLocationMembership("", NASA, client)).toBeNull();
      expect(await getLocationMembership(USER_JACK, "", client)).toBeNull();
    });

    it("returns mapped assignment with organizationId", async () => {
      const client = createMockSupabase({
        locationRows: [
          {
            id: 101,
            location_id: NASA,
            profile_id: USER_JACK,
            active: true,
            created_at: "2026-11-03T00:00:00Z",
            updated_at: "2026-11-03T00:00:00Z",
            locations: { organization_id: ORG_LIQUOR_TAP },
          },
        ],
      });

      const result = await getLocationMembership(USER_JACK, NASA, client);
      expect(result).toEqual({
        id: 101,
        locationId: NASA,
        profileId: USER_JACK,
        organizationId: ORG_LIQUOR_TAP,
        active: true,
        createdAt: "2026-11-03T00:00:00Z",
        updatedAt: "2026-11-03T00:00:00Z",
      });
    });

    it("returns null when assignment record does not exist", async () => {
      const client = createMockSupabase({ locationRows: [] });
      const result = await getLocationMembership(USER_JACK, NASA, client);
      expect(result).toBeNull();
    });

    it("fails closed (returns null) on query error", async () => {
      const client = createMockSupabase({
        locationError: new Error("DB down"),
      });
      const result = await getLocationMembership(USER_JACK, NASA, client);
      expect(result).toBeNull();
    });
  });

  describe("listLocationMemberships and listActiveLocationMemberships", () => {
    const rows: LocationMembershipDbRow[] = [
      {
        id: 1,
        location_id: WEBSTER,
        profile_id: USER_JACK,
        active: true,
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
        locations: { organization_id: ORG_MONKS },
      },
      {
        id: 2,
        location_id: NASA,
        profile_id: USER_JACK,
        active: true,
        created_at: "2026-11-02T00:00:00Z",
        updated_at: "2026-11-02T00:00:00Z",
        locations: { organization_id: ORG_LIQUOR_TAP },
      },
      {
        id: 3,
        location_id: LEAGUE_CITY,
        profile_id: USER_JACK,
        active: false,
        created_at: "2026-11-03T00:00:00Z",
        updated_at: "2026-11-03T00:00:00Z",
        locations: { organization_id: ORG_LIQUOR_TAP },
      },
    ];

    it("listLocationMemberships returns both active and inactive assignments", async () => {
      const client = createMockSupabase({ locationRows: rows });
      const list = await listLocationMemberships(USER_JACK, client);
      expect(list).toHaveLength(3);
      expect(list.map((l) => l.locationId)).toEqual([
        WEBSTER,
        NASA,
        LEAGUE_CITY,
      ]);
    });

    it("listActiveLocationMemberships returns only active assignments", async () => {
      const client = createMockSupabase({ locationRows: rows });
      const list = await listActiveLocationMemberships(USER_JACK, client);
      expect(list).toHaveLength(2);
      expect(list.map((l) => l.locationId)).toEqual([WEBSTER, NASA]);
    });

    it("returns empty array for unknown user or query error", async () => {
      const client = createMockSupabase({
        locationError: new Error("DB error"),
      });
      expect(await listLocationMemberships(USER_JACK, client)).toEqual([]);
      expect(await listActiveLocationMemberships(USER_JACK, client)).toEqual(
        [],
      );
      expect(await listLocationMemberships("", client)).toEqual([]);
    });
  });

  describe("hasActiveLocationAccess (Permanent Scenarios: Jack, Sam, Tom, Jerry)", () => {
    // Standard setup with organizations and locations
    const orgMemberships: MembershipDbRow[] = [
      // Jack: active in Monks and Liquor Tap
      {
        id: 1,
        organization_id: ORG_MONKS,
        profile_id: USER_JACK,
        roles: ["owner"],
        active: true,
        created_at: "",
      },
      {
        id: 2,
        organization_id: ORG_LIQUOR_TAP,
        profile_id: USER_JACK,
        roles: ["owner"],
        active: true,
        created_at: "",
      },
      // Sam: active only in Liquor Tap
      {
        id: 3,
        organization_id: ORG_LIQUOR_TAP,
        profile_id: USER_SAM,
        roles: ["server"],
        active: true,
        created_at: "",
      },
      // Tom: active only in Monks
      {
        id: 4,
        organization_id: ORG_MONKS,
        profile_id: USER_TOM,
        roles: ["server"],
        active: true,
        created_at: "",
      },
      // Jerry: active in Monks, active in Liquor Tap
      {
        id: 5,
        organization_id: ORG_MONKS,
        profile_id: USER_JERRY,
        roles: ["server"],
        active: true,
        created_at: "",
      },
      {
        id: 6,
        organization_id: ORG_LIQUOR_TAP,
        profile_id: USER_JERRY,
        roles: ["server"],
        active: true,
        created_at: "",
      },
    ];

    const locationMemberships: LocationMembershipDbRow[] = [
      // Jack: Webster, NASA, League City
      {
        id: 10,
        location_id: WEBSTER,
        profile_id: USER_JACK,
        active: true,
        created_at: "",
        updated_at: "",
        locations: { organization_id: ORG_MONKS },
      },
      {
        id: 11,
        location_id: NASA,
        profile_id: USER_JACK,
        active: true,
        created_at: "",
        updated_at: "",
        locations: { organization_id: ORG_LIQUOR_TAP },
      },
      {
        id: 12,
        location_id: LEAGUE_CITY,
        profile_id: USER_JACK,
        active: true,
        created_at: "",
        updated_at: "",
        locations: { organization_id: ORG_LIQUOR_TAP },
      },
      // Sam: NASA only
      {
        id: 13,
        location_id: NASA,
        profile_id: USER_SAM,
        active: true,
        created_at: "",
        updated_at: "",
        locations: { organization_id: ORG_LIQUOR_TAP },
      },
      // Tom: Webster only
      {
        id: 14,
        location_id: WEBSTER,
        profile_id: USER_TOM,
        active: true,
        created_at: "",
        updated_at: "",
        locations: { organization_id: ORG_MONKS },
      },
      // Jerry: Webster and NASA
      {
        id: 15,
        location_id: WEBSTER,
        profile_id: USER_JERRY,
        active: true,
        created_at: "",
        updated_at: "",
        locations: { organization_id: ORG_MONKS },
      },
      {
        id: 16,
        location_id: NASA,
        profile_id: USER_JERRY,
        active: true,
        created_at: "",
        updated_at: "",
        locations: { organization_id: ORG_LIQUOR_TAP },
      },
    ];

    it("Jack: can access Webster, NASA, and League City", async () => {
      const client = createMockSupabase({
        locationRows: locationMemberships,
        orgRows: orgMemberships,
      });
      expect(await hasActiveLocationAccess(USER_JACK, WEBSTER, client)).toBe(
        true,
      );
      expect(await hasActiveLocationAccess(USER_JACK, NASA, client)).toBe(true);
      expect(
        await hasActiveLocationAccess(USER_JACK, LEAGUE_CITY, client),
      ).toBe(true);
    });

    it("Sam: can access NASA, but is DENIED League City and Webster", async () => {
      const client = createMockSupabase({
        locationRows: locationMemberships,
        orgRows: orgMemberships,
      });
      expect(await hasActiveLocationAccess(USER_SAM, NASA, client)).toBe(true);
      expect(await hasActiveLocationAccess(USER_SAM, LEAGUE_CITY, client)).toBe(
        false,
      );
      expect(await hasActiveLocationAccess(USER_SAM, WEBSTER, client)).toBe(
        false,
      );
    });

    it("Tom: can access Webster, but is DENIED NASA and League City", async () => {
      const client = createMockSupabase({
        locationRows: locationMemberships,
        orgRows: orgMemberships,
      });
      expect(await hasActiveLocationAccess(USER_TOM, WEBSTER, client)).toBe(
        true,
      );
      expect(await hasActiveLocationAccess(USER_TOM, NASA, client)).toBe(false);
      expect(await hasActiveLocationAccess(USER_TOM, LEAGUE_CITY, client)).toBe(
        false,
      );
    });

    it("Jerry: can access Webster and NASA, but is DENIED League City", async () => {
      const client = createMockSupabase({
        locationRows: locationMemberships,
        orgRows: orgMemberships,
      });
      expect(await hasActiveLocationAccess(USER_JERRY, WEBSTER, client)).toBe(
        true,
      );
      expect(await hasActiveLocationAccess(USER_JERRY, NASA, client)).toBe(
        true,
      );
      expect(
        await hasActiveLocationAccess(USER_JERRY, LEAGUE_CITY, client),
      ).toBe(false);
    });

    it("Jerry Organization deactivation scenario: Liquor Tap membership deactivated -> NASA access DENIED", async () => {
      const modifiedOrgMemberships = orgMemberships.map((m) =>
        m.profile_id === USER_JERRY && m.organization_id === ORG_LIQUOR_TAP
          ? { ...m, active: false }
          : m,
      );
      const client = createMockSupabase({
        locationRows: locationMemberships,
        orgRows: modifiedOrgMemberships,
      });

      // Monks is still active: Webster remains ALLOW
      expect(await hasActiveLocationAccess(USER_JERRY, WEBSTER, client)).toBe(
        true,
      );

      // Liquor Tap membership is inactive: NASA evaluates to DENY even though location row is persisted
      expect(await hasActiveLocationAccess(USER_JERRY, NASA, client)).toBe(
        false,
      );
    });

    it("Location assignment inactive: active org membership but inactive assignment -> DENY", async () => {
      const modifiedLocMemberships = locationMemberships.map((l) =>
        l.profile_id === USER_SAM && l.location_id === NASA
          ? { ...l, active: false }
          : l,
      );
      const client = createMockSupabase({
        locationRows: modifiedLocMemberships,
        orgRows: orgMemberships,
      });

      expect(await hasActiveLocationAccess(USER_SAM, NASA, client)).toBe(false);
    });

    it("Fails closed on missing parameters or database error", async () => {
      const client = createMockSupabase({
        locationRows: locationMemberships,
        orgRows: orgMemberships,
        locationError: new Error("Crash"),
      });
      expect(await hasActiveLocationAccess("", NASA, client)).toBe(false);
      expect(await hasActiveLocationAccess(USER_JACK, "", client)).toBe(false);
      expect(await hasActiveLocationAccess(USER_JACK, NASA, client)).toBe(
        false,
      );
    });
  });

  describe("Current user helpers", () => {
    it("getCurrentUserLocationMemberships and getCurrentUserActiveLocationMemberships resolve user server-side", async () => {
      const rows: LocationMembershipDbRow[] = [
        {
          id: 1,
          location_id: WEBSTER,
          profile_id: USER_JACK,
          active: true,
          created_at: "",
          updated_at: "",
        },
        {
          id: 2,
          location_id: NASA,
          profile_id: USER_JACK,
          active: false,
          created_at: "",
          updated_at: "",
        },
      ];
      const client = createMockSupabase({
        userId: USER_JACK,
        locationRows: rows,
      });

      const all = await getCurrentUserLocationMemberships(client);
      expect(all).toHaveLength(2);

      const active = await getCurrentUserActiveLocationMemberships(client);
      expect(active).toHaveLength(1);
      expect(active[0].locationId).toBe(WEBSTER);
    });

    it("currentUserHasLocationAccess evaluates authenticated user", async () => {
      const client = createMockSupabase({
        userId: USER_JACK,
        locationRows: [
          {
            id: 1,
            location_id: WEBSTER,
            profile_id: USER_JACK,
            active: true,
            created_at: "",
            updated_at: "",
            locations: { organization_id: ORG_MONKS },
          },
        ],
        orgRows: [
          {
            id: 1,
            organization_id: ORG_MONKS,
            profile_id: USER_JACK,
            roles: ["owner"],
            active: true,
            created_at: "",
          },
        ],
      });

      expect(await currentUserHasLocationAccess(WEBSTER, client)).toBe(true);
      expect(await currentUserHasLocationAccess(NASA, client)).toBe(false);
    });

    it("fails closed when user is unauthenticated", async () => {
      const client = createMockSupabase({ userId: null });
      expect(await getCurrentUserLocationMemberships(client)).toEqual([]);
      expect(await getCurrentUserActiveLocationMemberships(client)).toEqual([]);
      expect(await currentUserHasLocationAccess(WEBSTER, client)).toBe(false);
      expect(await currentUserHasLocationAccess("", client)).toBe(false);
    });
  });
});
