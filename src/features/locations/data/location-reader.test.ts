import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  getCurrentUserAccessibleLocations,
  getLocationById,
  getLocationOperatingHours,
  listActiveLocationsByOrganization,
  listLocationsByOrganization,
} from "./location-reader";

describe("Location Readers (V2-002.002)", () => {
  const mockLocationNASA = {
    id: "loc-nasa-1",
    organization_id: "org-liquor-tap",
    name: "NASA",
    time_zone: "America/Chicago",
    address: { city: "Houston", region: "TX" },
    cover_weight: 0.25,
    active: true,
    opening_local: "11:00",
    closing_local: "23:00",
    created_at: "2026-11-03T10:00:00Z",
    updated_at: "2026-11-03T10:00:00Z",
  };

  const mockLocationLeagueCity = {
    id: "loc-lc-2",
    organization_id: "org-liquor-tap",
    name: "League City",
    time_zone: "America/Chicago",
    address: { city: "League City", region: "TX" },
    cover_weight: 0.25,
    active: true,
    opening_local: "11:00",
    closing_local: "23:00",
    created_at: "2026-11-03T11:00:00Z",
    updated_at: "2026-11-03T11:00:00Z",
  };

  const mockLocationInactive = {
    id: "loc-inactive-3",
    organization_id: "org-liquor-tap",
    name: "Old Kemah",
    time_zone: "America/Chicago",
    address: {},
    cover_weight: 0.25,
    active: false,
    opening_local: "11:00",
    closing_local: "23:00",
    created_at: "2026-11-03T09:00:00Z",
    updated_at: "2026-11-03T09:00:00Z",
  };

  const mockLocationWebster = {
    id: "loc-webster-4",
    organization_id: "org-monks",
    name: "Webster",
    time_zone: "America/Chicago",
    address: { city: "Webster", region: "TX" },
    cover_weight: 0.25,
    active: true,
    opening_local: "11:00",
    closing_local: "23:00",
    created_at: "2026-11-03T08:00:00Z",
    updated_at: "2026-11-03T08:00:00Z",
  };

  describe("getLocationById (READ-001, READ-002, READ-011, READ-012)", () => {
    it("READ-001: returns mapped location when found", async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockLocationNASA,
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>;

      const result = await getLocationById("loc-nasa-1", mockClient);
      expect(result).not.toBeNull();
      expect(result?.id).toBe("loc-nasa-1");
      expect(result?.name).toBe("NASA");
      expect(result?.organizationId).toBe("org-liquor-tap");
    });

    it("READ-002: returns null when location is not found", async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>;

      const result = await getLocationById("non-existent-id", mockClient);
      expect(result).toBeNull();
    });

    it("READ-011: returns null on malformed or empty location ID", async () => {
      expect(await getLocationById("")).toBeNull();
      expect(await getLocationById("   ")).toBeNull();
      expect(await getLocationById(null as unknown as string)).toBeNull();
    });

    it("READ-012: fails closed on database query error", async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "Database connection failed", code: "57P01" },
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>;

      const result = await getLocationById("loc-nasa-1", mockClient);
      expect(result).toBeNull();
    });
  });

  describe("listLocationsByOrganization (READ-003, READ-004, READ-005)", () => {
    it("READ-003 & READ-005: returns all locations for Liquor Tap without single-location truncation", async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  mockLocationNASA,
                  mockLocationLeagueCity,
                  mockLocationInactive,
                ],
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>;

      const results = await listLocationsByOrganization(
        "org-liquor-tap",
        mockClient,
      );
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.name)).toEqual([
        "NASA",
        "League City",
        "Old Kemah",
      ]);
    });

    it("READ-004: returns locations for Monks isolated from Liquor Tap", async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [mockLocationWebster],
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>;

      const results = await listLocationsByOrganization(
        "org-monks",
        mockClient,
      );
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Webster");
      expect(results[0].organizationId).toBe("org-monks");
    });
  });

  describe("listActiveLocationsByOrganization (READ-006)", () => {
    it("READ-006: filters out inactive locations", async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [mockLocationNASA, mockLocationLeagueCity],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>;

      const results = await listActiveLocationsByOrganization(
        "org-liquor-tap",
        mockClient,
      );
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.active)).toBe(true);
    });
  });

  describe("getCurrentUserAccessibleLocations (READ-007, READ-008, READ-009, READ-010)", () => {
    it("READ-009: Overall Owner can access all active locations across organization", async () => {
      const mockClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "profile-owner" } },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === "overall_roles") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { role: "owner" },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "memberships") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: null,
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "locations") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                      data: [mockLocationNASA, mockLocationLeagueCity],
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as unknown as SupabaseClient<Database>;

      const results = await getCurrentUserAccessibleLocations(
        "org-liquor-tap",
        mockClient,
      );
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.name)).toContain("NASA");
      expect(results.map((r) => r.name)).toContain("League City");
    });

    it("READ-008: Ordinary staff receives only explicit active assigned locations", async () => {
      const mockClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "profile-sam" } },
            error: null,
          }),
        },
        from: vi.fn((table: string) => {
          if (table === "overall_roles") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "memberships") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { roles: ["server"], active: true },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "location_memberships") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      eq: vi.fn().mockResolvedValue({
                        // Sam is assigned to NASA only, not League City
                        data: [
                          {
                            location_id: "loc-nasa-1",
                            active: true,
                            locations: mockLocationNASA,
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as unknown as SupabaseClient<Database>;

      const results = await getCurrentUserAccessibleLocations(
        "org-liquor-tap",
        mockClient,
      );
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("NASA");
    });

    it("READ-010: Unauthenticated or non-member caller receives empty list", async () => {
      const mockClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: "Not signed in" },
          }),
        },
      } as unknown as SupabaseClient<Database>;

      const results = await getCurrentUserAccessibleLocations(
        "org-liquor-tap",
        mockClient,
      );
      expect(results).toHaveLength(0);
    });
  });

  describe("getLocationOperatingHours", () => {
    it("returns weekly operating hours sorted by day of week", async () => {
      const mockHours = [
        {
          id: 1,
          organization_id: "org-liquor-tap",
          location_id: "loc-nasa-1",
          day_of_week: 1,
          opening_local: "11:00",
          closing_local: "22:00",
          closed: false,
          created_at: "2026-11-03T10:00:00Z",
          updated_at: "2026-11-03T10:00:00Z",
        },
        {
          id: 2,
          organization_id: "org-liquor-tap",
          location_id: "loc-nasa-1",
          day_of_week: 5,
          opening_local: "17:00",
          closing_local: "02:00",
          closed: false,
          created_at: "2026-11-03T10:00:00Z",
          updated_at: "2026-11-03T10:00:00Z",
        },
      ];

      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: mockHours,
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient<Database>;

      const results = await getLocationOperatingHours("loc-nasa-1", mockClient);
      expect(results).toHaveLength(2);
      expect(results[0].dayOfWeek).toBe(1);
      expect(results[0].isOvernight).toBe(false);
      expect(results[1].dayOfWeek).toBe(5);
      expect(results[1].isOvernight).toBe(true);
    });
  });
});
