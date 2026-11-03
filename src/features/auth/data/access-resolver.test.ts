import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  resolveCurrentUserAccess,
  resolveUserAccessForProfile,
} from "./access-resolver";

const ORG_MONKS = "00000000-0000-0000-0000-0000000000a1";
const ORG_LIQUOR_TAP = "00000000-0000-0000-0000-0000000000a2";

const LOC_WEBSTER = "00000000-0000-0000-0000-000000000001";
const LOC_NASA = "00000000-0000-0000-0000-000000000002";
const LOC_LEAGUE_CITY = "00000000-0000-0000-0000-000000000003";

const USER_CALLER = "00000000-0000-0000-0000-000000000010";
const USER_OTHER = "00000000-0000-0000-0000-000000000020";

type OverallRoleDbRow = {
  profile_id: string;
  role: Database["public"]["Enums"]["overall_role"];
};

type MembershipDbRow = {
  id: number;
  organization_id: string;
  profile_id: string;
  roles: Database["public"]["Enums"]["app_role"][];
  active: boolean;
  created_at?: string;
};

type LocationMembershipDbRow = {
  id: number;
  location_id: string;
  profile_id: string;
  role: Database["public"]["Enums"]["location_role"];
  active: boolean;
  created_at?: string;
  updated_at?: string;
  locations?: {
    organization_id: string;
  };
};

type LocationDbRow = {
  id: string;
  organization_id: string;
  active: boolean;
};

function createMockSupabase(options: {
  callerId?: string | null;
  overallRows?: OverallRoleDbRow[];
  orgRows?: MembershipDbRow[];
  locRows?: LocationDbRow[];
  locAssignmentRows?: LocationMembershipDbRow[];
  authError?: Error | null;
  queryError?: Error | null;
}) {
  const overallRows = options.overallRows ?? [];
  const orgRows = options.orgRows ?? [];
  const locRows = options.locRows ?? [
    { id: LOC_WEBSTER, organization_id: ORG_MONKS, active: true },
    { id: LOC_NASA, organization_id: ORG_LIQUOR_TAP, active: true },
    { id: LOC_LEAGUE_CITY, organization_id: ORG_LIQUOR_TAP, active: true },
  ];
  const locAssignmentRows = options.locAssignmentRows ?? [];

  const client = {
    auth: {
      getUser: vi.fn().mockImplementation(async () => {
        if (options.authError) {
          return { data: { user: null }, error: options.authError };
        }
        if (!options.callerId) {
          return { data: { user: null }, error: null };
        }
        return { data: { user: { id: options.callerId } }, error: null };
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (options.queryError) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: options.queryError,
                }),
              }),
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: options.queryError,
              }),
            }),
          }),
        };
      }

      if (table === "locations") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: unknown) => ({
              maybeSingle: vi.fn().mockImplementation(async () => {
                const match = locRows.find((r) => r.id === val);
                return { data: match ?? null, error: null };
              }),
            })),
          }),
        };
      }

      if (table === "overall_roles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: unknown) => ({
              maybeSingle: vi.fn().mockImplementation(async () => {
                const match = overallRows.find((r) => r.profile_id === val);
                return {
                  data: match ? { role: match.role } : null,
                  error: null,
                };
              }),
            })),
          }),
        };
      }

      if (table === "memberships") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col1: string, val1: unknown) => ({
              eq: vi.fn().mockImplementation((col2: string, val2: unknown) => ({
                maybeSingle: vi.fn().mockImplementation(async () => {
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
              })),
            })),
          }),
        };
      }

      if (table === "location_memberships") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col1: string, val1: unknown) => ({
              eq: vi.fn().mockImplementation((col2: string, val2: unknown) => ({
                maybeSingle: vi.fn().mockImplementation(async () => {
                  const match = locAssignmentRows.find(
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
              })),
            })),
          }),
        };
      }

      throw new Error(`Unexpected table ${table} in mockSupabase`);
    }),
  };

  return client as unknown as SupabaseClient<Database>;
}

describe("Canonical Authorization Resolver — Server Data Loader Tests", () => {
  describe("resolveCurrentUserAccess", () => {
    it("fails closed when caller is unauthenticated", async () => {
      const client = createMockSupabase({ callerId: null });
      const res = await resolveCurrentUserAccess(
        { organizationId: ORG_MONKS, locationId: LOC_WEBSTER },
        client,
      );
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("UNAUTHENTICATED");
    });

    it("fails closed on auth error", async () => {
      const client = createMockSupabase({
        authError: new Error("JWT expired"),
      });
      const res = await resolveCurrentUserAccess(
        { organizationId: ORG_MONKS, locationId: LOC_WEBSTER },
        client,
      );
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("UNAUTHENTICATED");
    });

    it("fails closed on invalid target organization", async () => {
      const client = createMockSupabase({ callerId: USER_CALLER });
      const res = await resolveCurrentUserAccess(
        { organizationId: "" },
        client,
      );
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("INVALID_TARGET");
    });

    it("resolves Overall Owner access across valid organization and location", async () => {
      const client = createMockSupabase({
        callerId: USER_CALLER,
        overallRows: [{ profile_id: USER_CALLER, role: "owner" }],
      });
      const res = await resolveCurrentUserAccess(
        { organizationId: ORG_MONKS, locationId: LOC_WEBSTER },
        client,
      );
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("owner");
      expect(res.applicableSources).toEqual(["overall"]);
      expect(res.capabilities).toContain("overall:owner");
      expect(res.capabilities).toContain("location:manage");
    });

    it("resolves Overall Manager access (without owner-exclusive capability)", async () => {
      const client = createMockSupabase({
        callerId: USER_CALLER,
        overallRows: [{ profile_id: USER_CALLER, role: "manager" }],
      });
      const res = await resolveCurrentUserAccess(
        { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA },
        client,
      );
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("manager");
      expect(res.capabilities).toContain("overall:manage");
      expect(res.capabilities).not.toContain("overall:owner");
    });

    it("resolves Overall Assistant Manager with branch elevation to Manager", async () => {
      const client = createMockSupabase({
        callerId: USER_CALLER,
        overallRows: [{ profile_id: USER_CALLER, role: "assistant_manager" }],
        orgRows: [
          {
            id: 1,
            organization_id: ORG_LIQUOR_TAP,
            profile_id: USER_CALLER,
            roles: ["server"],
            active: true,
          },
        ],
        locAssignmentRows: [
          {
            id: 10,
            location_id: LOC_NASA,
            profile_id: USER_CALLER,
            role: "manager",
            active: true,
          },
        ],
      });
      const res = await resolveCurrentUserAccess(
        { organizationId: ORG_LIQUOR_TAP, locationId: LOC_NASA },
        client,
      );
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("manager");
      expect(res.applicableSources).toContain("overall");
      expect(res.applicableSources).toContain("location");
      expect(res.capabilities).toContain("location:manage");
      expect(res.capabilities).not.toContain("overall:manage");
    });

    it("resolves scoped Staff member correctly", async () => {
      const client = createMockSupabase({
        callerId: USER_CALLER,
        orgRows: [
          {
            id: 1,
            organization_id: ORG_MONKS,
            profile_id: USER_CALLER,
            roles: ["server"],
            active: true,
          },
        ],
        locAssignmentRows: [
          {
            id: 10,
            location_id: LOC_WEBSTER,
            profile_id: USER_CALLER,
            role: "staff",
            active: true,
          },
        ],
      });
      const res = await resolveCurrentUserAccess(
        { organizationId: ORG_MONKS, locationId: LOC_WEBSTER },
        client,
      );
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("staff");
      expect(res.applicableSources).toEqual(["organization", "location"]);
      expect(res.capabilities).toContain("location:operate");
      expect(res.capabilities).not.toContain("location:manage");
    });

    it("fails closed on tenant mismatch (Monks org + NASA location)", async () => {
      const client = createMockSupabase({
        callerId: USER_CALLER,
        overallRows: [{ profile_id: USER_CALLER, role: "owner" }],
      });
      const res = await resolveCurrentUserAccess(
        { organizationId: ORG_MONKS, locationId: LOC_NASA },
        client,
      );
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("TENANT_MISMATCH");
    });

    it("fails closed on nonexistent location", async () => {
      const client = createMockSupabase({
        callerId: USER_CALLER,
        overallRows: [{ profile_id: USER_CALLER, role: "owner" }],
      });
      const res = await resolveCurrentUserAccess(
        {
          organizationId: ORG_MONKS,
          locationId: "00000000-0000-0000-0000-999999999999",
        },
        client,
      );
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("LOCATION_NOT_FOUND");
    });

    it("fails closed on query error", async () => {
      const client = createMockSupabase({
        callerId: USER_CALLER,
        queryError: new Error("Database connection dropped"),
      });
      const res = await resolveCurrentUserAccess(
        { organizationId: ORG_MONKS, locationId: LOC_WEBSTER },
        client,
      );
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("QUERY_ERROR");
    });
  });

  describe("resolveUserAccessForProfile (privileged inspection)", () => {
    it("fails closed when caller is unauthenticated", async () => {
      const client = createMockSupabase({ callerId: null });
      const res = await resolveUserAccessForProfile(
        USER_OTHER,
        { organizationId: ORG_MONKS },
        client,
      );
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("UNAUTHENTICATED");
    });

    it("allows caller to inspect their own access without administrative check", async () => {
      const client = createMockSupabase({
        callerId: USER_CALLER,
        orgRows: [
          {
            id: 1,
            organization_id: ORG_MONKS,
            profile_id: USER_CALLER,
            roles: ["server"],
            active: true,
          },
        ],
      });
      const res = await resolveUserAccessForProfile(
        USER_CALLER,
        { organizationId: ORG_MONKS },
        client,
      );
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("staff");
    });

    it("denies unauthorized inspection when staff caller attempts to inspect another user", async () => {
      const client = createMockSupabase({
        callerId: USER_CALLER,
        // Caller has staff membership only
        orgRows: [
          {
            id: 1,
            organization_id: ORG_MONKS,
            profile_id: USER_CALLER,
            roles: ["server"],
            active: true,
          },
          {
            id: 2,
            organization_id: ORG_MONKS,
            profile_id: USER_OTHER,
            roles: ["owner"],
            active: true,
          },
        ],
      });
      const res = await resolveUserAccessForProfile(
        USER_OTHER,
        { organizationId: ORG_MONKS },
        client,
      );
      expect(res.allowed).toBe(false);
      expect(res.denialReason).toBe("UNAUTHORIZED_INSPECTION");
    });

    it("allows Overall Manager caller to inspect another user", async () => {
      const client = createMockSupabase({
        callerId: USER_CALLER,
        overallRows: [{ profile_id: USER_CALLER, role: "manager" }],
        orgRows: [
          {
            id: 2,
            organization_id: ORG_MONKS,
            profile_id: USER_OTHER,
            roles: ["server"],
            active: true,
          },
        ],
      });
      const res = await resolveUserAccessForProfile(
        USER_OTHER,
        { organizationId: ORG_MONKS },
        client,
      );
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("staff");
    });

    it("allows Organization Owner caller to inspect another user in the same organization", async () => {
      const client = createMockSupabase({
        callerId: USER_CALLER,
        orgRows: [
          {
            id: 1,
            organization_id: ORG_MONKS,
            profile_id: USER_CALLER,
            roles: ["owner"],
            active: true,
          },
          {
            id: 2,
            organization_id: ORG_MONKS,
            profile_id: USER_OTHER,
            roles: ["server"],
            active: true,
          },
        ],
      });
      const res = await resolveUserAccessForProfile(
        USER_OTHER,
        { organizationId: ORG_MONKS },
        client,
      );
      expect(res.allowed).toBe(true);
      expect(res.effectiveLevel).toBe("staff");
    });
  });
});
