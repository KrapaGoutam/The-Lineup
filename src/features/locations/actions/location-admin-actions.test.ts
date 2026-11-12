import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  getLocationAdminContextAction,
  listLocationsForAdminAction,
  provisionLocationAction,
  updateLocationDetailsAction,
  getLocationOperatingHoursAction,
  updateLocationOperatingHoursAction,
  verifyLocationAdminAuthority,
} from "./location-admin-actions";

// Mock server-only modules
vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

describe("Location Administration Server Actions", () => {
  const MOCK_PROFILE_ID = "00000000-0000-0000-0000-000000000001";
  const MOCK_ORG_ID_A = "11111111-1111-1111-1111-111111111111";
  const MOCK_ORG_ID_B = "22222222-2222-2222-2222-222222222222";
  const MOCK_LOC_ID_A1 = "33333333-3333-3333-3333-333333333331";

  function createMockSupabase(options: {
    user?: { id: string } | null;
    overallRole?: string | null;
    memberships?: Array<{
      organization_id: string;
      roles: string[];
      active: boolean;
      organizations?: { id: string; name: string; slug: string };
    }>;
    locations?: Array<{
      id: string;
      organization_id: string;
      name: string;
      time_zone: string;
      address: Record<string, unknown>;
      cover_weight: number;
      active: boolean;
      opening_local: string;
      closing_local: string;
      created_at: string;
      updated_at: string;
    }>;
    operatingHours?: Array<{
      id: string;
      organization_id: string;
      location_id: string;
      day_of_week: number;
      opening_local: string | null;
      closing_local: string | null;
      closed: boolean;
      created_at: string;
      updated_at: string;
    }>;
    rpcResult?: unknown;
    rpcError?: { message: string; code?: string } | null;
  }) {
    const user =
      options.user === undefined ? { id: MOCK_PROFILE_ID } : options.user;

    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user },
          error: user ? null : { message: "Unauthenticated" },
        }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "overall_roles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: options.overallRole
                    ? { role: options.overallRole }
                    : null,
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => {
                const makeResult = (filtered: typeof options.memberships) => ({
                  data: filtered,
                  error: null,
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: (filtered ?? [])[0] ?? null,
                    error: null,
                  }),
                  then(resolve: (value: unknown) => unknown) {
                    return Promise.resolve({
                      data: filtered,
                      error: null,
                    }).then(resolve);
                  },
                });

                return {
                  eq: vi
                    .fn()
                    .mockImplementation((col2: string, val2: unknown) => {
                      const filtered = (options.memberships ?? []).filter(
                        (m) => {
                          if (
                            col2 === "organization_id" &&
                            m.organization_id !== val2
                          ) {
                            return false;
                          }
                          if (col2 === "active" && m.active !== val2) {
                            return false;
                          }
                          return true;
                        },
                      );
                      return makeResult(filtered);
                    }),
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: (options.memberships ?? [])[0] ?? null,
                    error: null,
                  }),
                  then(resolve: (value: unknown) => unknown) {
                    return Promise.resolve({
                      data: options.memberships ?? [],
                      error: null,
                    }).then(resolve);
                  },
                };
              }),
            }),
          };
        }

        if (table === "organizations") {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: MOCK_ORG_ID_A,
                      name: "Monks",
                      slug: "monks",
                      created_at: "2026-01-01",
                    },
                    {
                      id: MOCK_ORG_ID_B,
                      name: "Liquor Tap",
                      slug: "liquor-tap",
                      created_at: "2026-01-02",
                    },
                  ],
                  error: null,
                }),
              }),
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: MOCK_ORG_ID_A,
                        name: "Monks",
                        slug: "monks",
                        created_at: "2026-01-01",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === "locations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((col: string, val: unknown) => ({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: (options.locations ?? []).filter(
                      (l) => l.organization_id === val,
                    ),
                    error: null,
                  }),
                }),
                order: vi.fn().mockResolvedValue({
                  data: (options.locations ?? []).filter(
                    (l) => l.organization_id === val,
                  ),
                  error: null,
                }),
                maybeSingle: vi.fn().mockResolvedValue({
                  data:
                    (options.locations ?? []).find((l) => l.id === val) ?? null,
                  error: null,
                }),
              })),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      ...(options.locations ?? [])[0],
                      name: "Updated Branch",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === "operating_hours") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: options.operatingHours ?? [],
                  error: null,
                }),
              }),
            }),
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: options.operatingHours ?? [],
                error: null,
              }),
            }),
          };
        }

        return {};
      }),
      rpc: vi.fn().mockImplementation((name: string) => {
        if (name === "provision_location") {
          return Promise.resolve({
            data: options.rpcResult ?? {
              id: "new-loc-id",
              organization_id: MOCK_ORG_ID_A,
              name: "New Branch",
              time_zone: "America/Chicago",
              address: {},
              cover_weight: 0.25,
              active: true,
              opening_local: "11:00",
              closing_local: "23:00",
              created_at: "2026-11-03",
              updated_at: "2026-11-03",
            },
            error: options.rpcError ?? null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    } as unknown as SupabaseClient<Database>;

    return client;
  }

  describe("verifyLocationAdminAuthority", () => {
    it("returns true for Overall Owner", async () => {
      const client = createMockSupabase({ overallRole: "owner" });
      const auth = await verifyLocationAdminAuthority(
        MOCK_PROFILE_ID,
        MOCK_ORG_ID_A,
        client,
      );
      expect(auth).toBe(true);
    });

    it("returns true for Overall Manager", async () => {
      const client = createMockSupabase({ overallRole: "manager" });
      const auth = await verifyLocationAdminAuthority(
        MOCK_PROFILE_ID,
        MOCK_ORG_ID_A,
        client,
      );
      expect(auth).toBe(true);
    });

    it("returns false for Overall Assistant Manager without org management membership", async () => {
      const client = createMockSupabase({
        overallRole: "assistant_manager",
        memberships: [],
      });
      const auth = await verifyLocationAdminAuthority(
        MOCK_PROFILE_ID,
        MOCK_ORG_ID_A,
        client,
      );
      expect(auth).toBe(false);
    });

    it("returns true for active Org Owner", async () => {
      const client = createMockSupabase({
        overallRole: null,
        memberships: [
          { organization_id: MOCK_ORG_ID_A, roles: ["owner"], active: true },
        ],
      });
      const auth = await verifyLocationAdminAuthority(
        MOCK_PROFILE_ID,
        MOCK_ORG_ID_A,
        client,
      );
      expect(auth).toBe(true);
    });

    it("returns true for active Org General Manager", async () => {
      const client = createMockSupabase({
        overallRole: null,
        memberships: [
          {
            organization_id: MOCK_ORG_ID_A,
            roles: ["general_manager"],
            active: true,
          },
        ],
      });
      const auth = await verifyLocationAdminAuthority(
        MOCK_PROFILE_ID,
        MOCK_ORG_ID_A,
        client,
      );
      expect(auth).toBe(true);
    });

    it("returns false for ordinary staff (server, host, shift_manager)", async () => {
      const client = createMockSupabase({
        overallRole: null,
        memberships: [
          { organization_id: MOCK_ORG_ID_A, roles: ["server"], active: true },
        ],
      });
      const auth = await verifyLocationAdminAuthority(
        MOCK_PROFILE_ID,
        MOCK_ORG_ID_A,
        client,
      );
      expect(auth).toBe(false);
    });

    it("returns false for inactive membership", async () => {
      const client = createMockSupabase({
        overallRole: null,
        memberships: [
          { organization_id: MOCK_ORG_ID_A, roles: ["owner"], active: false },
        ],
      });
      const auth = await verifyLocationAdminAuthority(
        MOCK_PROFILE_ID,
        MOCK_ORG_ID_A,
        client,
      );
      expect(auth).toBe(false);
    });
  });

  describe("getLocationAdminContextAction", () => {
    it("returns all organizations for Overall Owner", async () => {
      const client = createMockSupabase({ overallRole: "owner" });
      const result = await getLocationAdminContextAction(client);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.canAdministerLocations).toBe(true);
        expect(result.data.isOverallAdmin).toBe(true);
        expect(result.data.organizations.length).toBe(2);
      }
    });

    it("returns only authorized organizations for scoped Org General Manager", async () => {
      const client = createMockSupabase({
        overallRole: null,
        memberships: [
          {
            organization_id: MOCK_ORG_ID_A,
            roles: ["general_manager"],
            active: true,
            organizations: { id: MOCK_ORG_ID_A, name: "Monks", slug: "monks" },
          },
        ],
      });
      const result = await getLocationAdminContextAction(client);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.canAdministerLocations).toBe(true);
        expect(result.data.isOverallAdmin).toBe(false);
        expect(result.data.organizations).toHaveLength(1);
        expect(result.data.organizations[0].name).toBe("Monks");
      }
    });

    it("D7 (documents current policy): an org member with no owner/general_manager role is not granted Location Administration, so a location-only manager cannot reach the Kiosks tab", async () => {
      // Backend private.kiosk_can_manage_location() also accepts an active
      // location_memberships.role = manager. This UI capability is org-scoped
      // by design; widening it is an owner policy decision (see HANDOFF.md D7).
      const client = createMockSupabase({
        overallRole: null,
        memberships: [
          {
            organization_id: MOCK_ORG_ID_A,
            roles: ["assistant_manager"],
            active: true,
            organizations: { id: MOCK_ORG_ID_A, name: "Monks", slug: "monks" },
          },
        ],
      });
      const result = await getLocationAdminContextAction(client);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.canAdministerLocations).toBe(false);
      }
    });

    it("returns canAdministerLocations=false for standard staff", async () => {
      const client = createMockSupabase({
        overallRole: null,
        memberships: [
          {
            organization_id: MOCK_ORG_ID_A,
            roles: ["server"],
            active: true,
            organizations: { id: MOCK_ORG_ID_A, name: "Monks", slug: "monks" },
          },
        ],
      });
      const result = await getLocationAdminContextAction(client);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.canAdministerLocations).toBe(false);
        expect(result.data.organizations).toHaveLength(0);
      }
    });
  });

  describe("listLocationsForAdminAction", () => {
    it("returns locations for authorized manager", async () => {
      const client = createMockSupabase({
        overallRole: "owner",
        locations: [
          {
            id: MOCK_LOC_ID_A1,
            organization_id: MOCK_ORG_ID_A,
            name: "Webster Branch",
            time_zone: "America/Chicago",
            address: { line1: "123 Main St", city: "Webster" },
            cover_weight: 0.25,
            active: true,
            opening_local: "11:00",
            closing_local: "23:00",
            created_at: "2026-01-01",
            updated_at: "2026-01-01",
          },
        ],
      });

      const result = await listLocationsForAdminAction(MOCK_ORG_ID_A, client);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe("Webster Branch");
      }
    });

    it("denies access when caller lacks management authority", async () => {
      const client = createMockSupabase({
        overallRole: null,
        memberships: [
          { organization_id: MOCK_ORG_ID_A, roles: ["server"], active: true },
        ],
      });

      const result = await listLocationsForAdminAction(MOCK_ORG_ID_A, client);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Unauthorized");
      }
    });
  });

  describe("provisionLocationAction", () => {
    it("calls provisionNewLocation for authorized manager", async () => {
      const client = createMockSupabase({
        overallRole: "owner",
        rpcResult: {
          id: "new-uuid",
          organization_id: MOCK_ORG_ID_A,
          name: "NASA Branch",
          time_zone: "America/Chicago",
          address: {},
          cover_weight: 0.25,
          active: true,
          opening_local: "11:00",
          closing_local: "23:00",
          created_at: "2026-11-03",
          updated_at: "2026-11-03",
        },
      });

      const result = await provisionLocationAction(
        {
          organizationId: MOCK_ORG_ID_A,
          name: "NASA Branch",
          timeZone: "America/Chicago",
        },
        client,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.name).toBe("NASA Branch");
      }
    });

    it("denies creation when caller is unauthorized staff", async () => {
      const client = createMockSupabase({
        overallRole: null,
        memberships: [
          { organization_id: MOCK_ORG_ID_A, roles: ["server"], active: true },
        ],
      });

      const result = await provisionLocationAction(
        {
          organizationId: MOCK_ORG_ID_A,
          name: "NASA Branch",
          timeZone: "America/Chicago",
        },
        client,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Unauthorized");
      }
    });
  });

  describe("updateLocationDetailsAction (Cross-Org Security)", () => {
    it("blocks cross-organization update (Org A manager targeting Org B location)", async () => {
      const client = createMockSupabase({
        overallRole: null,
        memberships: [
          { organization_id: MOCK_ORG_ID_A, roles: ["owner"], active: true },
        ],
        locations: [
          {
            id: MOCK_LOC_ID_A1,
            organization_id: MOCK_ORG_ID_B, // Location belongs to Org B!
            name: "Liquor Tap NASA",
            time_zone: "America/Chicago",
            address: {},
            cover_weight: 0.25,
            active: true,
            opening_local: "11:00",
            closing_local: "23:00",
            created_at: "2026-01-01",
            updated_at: "2026-01-01",
          },
        ],
      });

      // Org A manager attempting to update with organizationId = Org A, but location is Org B
      const result = await updateLocationDetailsAction(
        {
          locationId: MOCK_LOC_ID_A1,
          organizationId: MOCK_ORG_ID_A,
          name: "Hacked Name",
        },
        client,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Tenant mismatch");
      }
    });
  });

  describe("Operating Hours Actions", () => {
    it("fetches operating hours for location", async () => {
      const client = createMockSupabase({
        overallRole: "owner",
        locations: [
          {
            id: MOCK_LOC_ID_A1,
            organization_id: MOCK_ORG_ID_A,
            name: "Webster",
            time_zone: "America/Chicago",
            address: {},
            cover_weight: 0.25,
            active: true,
            opening_local: "11:00",
            closing_local: "23:00",
            created_at: "2026-01-01",
            updated_at: "2026-01-01",
          },
        ],
        operatingHours: [
          {
            id: "h1",
            organization_id: MOCK_ORG_ID_A,
            location_id: MOCK_LOC_ID_A1,
            day_of_week: 1,
            opening_local: "11:00",
            closing_local: "22:00",
            closed: false,
            created_at: "2026-01-01",
            updated_at: "2026-01-01",
          },
        ],
      });

      const result = await getLocationOperatingHoursAction(
        MOCK_LOC_ID_A1,
        MOCK_ORG_ID_A,
        client,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].dayOfWeek).toBe(1);
      }
    });

    it("updates operating hours with overnight schedule support", async () => {
      const client = createMockSupabase({
        overallRole: "owner",
        locations: [
          {
            id: MOCK_LOC_ID_A1,
            organization_id: MOCK_ORG_ID_A,
            name: "Webster",
            time_zone: "America/Chicago",
            address: {},
            cover_weight: 0.25,
            active: true,
            opening_local: "11:00",
            closing_local: "23:00",
            created_at: "2026-01-01",
            updated_at: "2026-01-01",
          },
        ],
        operatingHours: [
          {
            id: "h5",
            organization_id: MOCK_ORG_ID_A,
            location_id: MOCK_LOC_ID_A1,
            day_of_week: 5,
            opening_local: "17:00",
            closing_local: "02:00",
            closed: false,
            created_at: "2026-01-01",
            updated_at: "2026-01-01",
          },
        ],
      });

      const result = await updateLocationOperatingHoursAction(
        {
          locationId: MOCK_LOC_ID_A1,
          organizationId: MOCK_ORG_ID_A,
          operatingHours: [
            {
              dayOfWeek: 5,
              openingLocal: "17:00",
              closingLocal: "02:00",
              closed: false,
            },
          ],
        },
        client,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data[0].isOvernight).toBe(true);
      }
    });
  });
});
