import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listActive: vi.fn(),
  linkSelect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/data/location-access", () => ({
  listActiveLocationMemberships: mocks.listActive,
}));

import { resolveEmployeeLocationProvenance } from "./payroll-provenance";

function mockSupabase(
  linkData: { profile_id: string } | null,
  linkError: unknown = null,
) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "attendance_identity_links") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: linkData,
                  error: linkError,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    }),
  } as unknown as Parameters<typeof resolveEmployeeLocationProvenance>[0];
}

describe("resolveEmployeeLocationProvenance", () => {
  it("returns unassigned when employee has no attendance identity link", async () => {
    const supabase = mockSupabase(null);
    const result = await resolveEmployeeLocationProvenance(
      supabase,
      "org-1",
      101,
    );
    expect(result).toEqual({ status: "unassigned" });
  });

  it("returns unassigned when profile has zero active location assignments", async () => {
    const supabase = mockSupabase({ profile_id: "profile-1" });
    mocks.listActive.mockResolvedValue([]);
    const result = await resolveEmployeeLocationProvenance(
      supabase,
      "org-1",
      101,
    );
    expect(result).toEqual({ status: "unassigned" });
  });

  it("returns single_location when profile has exactly one active location in org", async () => {
    const supabase = mockSupabase({ profile_id: "profile-1" });
    mocks.listActive.mockResolvedValue([
      { locationId: "loc-1", organizationId: "org-1", active: true },
      { locationId: "loc-other-org", organizationId: "org-2", active: true },
    ]);
    const result = await resolveEmployeeLocationProvenance(
      supabase,
      "org-1",
      101,
    );
    expect(result).toEqual({
      status: "single_location",
      locationId: "loc-1",
    });
  });

  it("returns multi_location when profile has multiple active locations in org", async () => {
    const supabase = mockSupabase({ profile_id: "profile-1" });
    mocks.listActive.mockResolvedValue([
      { locationId: "loc-1", organizationId: "org-1", active: true },
      { locationId: "loc-2", organizationId: "org-1", active: true },
    ]);
    const result = await resolveEmployeeLocationProvenance(
      supabase,
      "org-1",
      101,
    );
    expect(result).toEqual({
      status: "multi_location",
      locationIds: ["loc-1", "loc-2"],
    });
  });
});
