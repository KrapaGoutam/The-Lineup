import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  getCurrentUserActiveOrganizationMemberships,
  getCurrentUserOrganizationMemberships,
  getOrganizationMembership,
  listActiveOrganizationMemberships,
  listOrganizationMemberships,
} from "./organization-membership";

const ORG_MONKS = "00000000-0000-0000-0000-0000000000a1";
const ORG_LIQUOR_TAP = "00000000-0000-0000-0000-0000000000a2";

const USER_JACK = "00000000-0000-0000-0000-000000000001";
const USER_SAM = "00000000-0000-0000-0000-000000000002";
const USER_TOM = "00000000-0000-0000-0000-000000000003";
const USER_JERRY = "00000000-0000-0000-0000-000000000004";

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
  rows?: MembershipDbRow[];
  singleRow?: MembershipDbRow | null;
  queryError?: Error | null;
  authError?: Error | null;
}) {
  const maybeSingle = vi.fn().mockImplementation(async () => {
    if (options.queryError) {
      return { data: null, error: options.queryError };
    }
    return { data: options.singleRow ?? null, error: null };
  });

  const eqOrgId = vi.fn().mockReturnValue({ maybeSingle });

  // For queries chaining: .eq("profile_id", ...).eq("active", ...).order(...).order(...)
  // or .eq("profile_id", ...).order(...).order(...)
  const orderSecond = vi.fn().mockImplementation(async () => {
    if (options.queryError) {
      return { data: null, error: options.queryError };
    }
    return { data: options.rows ?? [], error: null };
  });

  const orderFirst = vi.fn().mockReturnValue({ order: orderSecond });

  const eqActive = vi.fn().mockReturnValue({ order: orderFirst });

  const eqProfileId = vi.fn().mockImplementation(() => {
    return {
      eq: vi.fn().mockImplementation((col2: string, val2: unknown) => {
        if (col2 === "organization_id") {
          return eqOrgId(col2, val2);
        }
        if (col2 === "active") {
          return eqActive(col2, val2);
        }
        return { maybeSingle, order: orderFirst };
      }),
      order: orderFirst,
      maybeSingle,
    };
  });

  const select = vi.fn().mockReturnValue({ eq: eqProfileId });
  const from = vi.fn().mockReturnValue({ select });

  const getUser = vi.fn().mockImplementation(async () => {
    if (options.authError) {
      return { data: { user: null }, error: options.authError };
    }
    if (!options.userId) {
      return { data: { user: null }, error: null };
    }
    return { data: { user: { id: options.userId } }, error: null };
  });

  return {
    client: {
      from,
      auth: { getUser },
    } as unknown as SupabaseClient<Database>,
    spies: {
      from,
      select,
      eqProfileId,
      eqOrgId,
      orderFirst,
      orderSecond,
      getUser,
    },
  };
}

describe("organization-membership data readers", () => {
  describe("getOrganizationMembership", () => {
    it("returns null when profileId or organizationId is empty", async () => {
      const { client } = createMockSupabase({});
      expect(await getOrganizationMembership("", ORG_MONKS, client)).toBe(null);
      expect(await getOrganizationMembership(USER_JACK, "", client)).toBe(null);
    });

    it("returns null when membership is not found", async () => {
      const { client } = createMockSupabase({ singleRow: null });
      const result = await getOrganizationMembership(
        USER_JACK,
        ORG_MONKS,
        client,
      );
      expect(result).toBe(null);
    });

    it("returns mapped OrganizationMembership for active member", async () => {
      const { client } = createMockSupabase({
        singleRow: {
          id: 10,
          organization_id: ORG_MONKS,
          profile_id: USER_JACK,
          roles: ["general_manager"],
          active: true,
          created_at: "2026-11-02T10:00:00Z",
        },
      });

      const result = await getOrganizationMembership(
        USER_JACK,
        ORG_MONKS,
        client,
      );
      expect(result).toEqual({
        id: 10,
        organizationId: ORG_MONKS,
        profileId: USER_JACK,
        roles: ["general_manager"],
        role: "manager",
        designation: "manager",
        active: true,
        createdAt: "2026-11-02T10:00:00Z",
      });
    });

    it("returns mapped OrganizationMembership for inactive member (persisted but active=false)", async () => {
      const { client } = createMockSupabase({
        singleRow: {
          id: 11,
          organization_id: ORG_MONKS,
          profile_id: USER_JACK,
          roles: ["server"],
          active: false,
          created_at: "2026-11-02T10:00:00Z",
        },
      });

      const result = await getOrganizationMembership(
        USER_JACK,
        ORG_MONKS,
        client,
      );
      expect(result).not.toBeNull();
      expect(result?.active).toBe(false);
      expect(result?.designation).toBe("staff");
    });

    it("fails closed on database error", async () => {
      const { client } = createMockSupabase({
        queryError: new Error("connection failure"),
      });
      expect(
        await getOrganizationMembership(USER_JACK, ORG_MONKS, client),
      ).toBe(null);
    });
  });

  describe("listOrganizationMemberships", () => {
    it("returns empty array when profileId is empty", async () => {
      const { client } = createMockSupabase({});
      expect(await listOrganizationMemberships("", client)).toEqual([]);
    });

    it("returns both active and inactive memberships", async () => {
      const rows: MembershipDbRow[] = [
        {
          id: 1,
          organization_id: ORG_MONKS,
          profile_id: USER_JACK,
          roles: ["owner"],
          active: true,
          created_at: "2026-11-01T00:00:00Z",
        },
        {
          id: 2,
          organization_id: ORG_LIQUOR_TAP,
          profile_id: USER_JACK,
          roles: ["server"],
          active: false,
          created_at: "2026-11-02T00:00:00Z",
        },
      ];
      const { client } = createMockSupabase({ rows });

      const result = await listOrganizationMemberships(USER_JACK, client);
      expect(result).toHaveLength(2);
      expect(result[0].organizationId).toBe(ORG_MONKS);
      expect(result[0].active).toBe(true);
      expect(result[1].organizationId).toBe(ORG_LIQUOR_TAP);
      expect(result[1].active).toBe(false);
    });

    it("fails closed on database error", async () => {
      const { client } = createMockSupabase({
        queryError: new Error("DB down"),
      });
      expect(await listOrganizationMemberships(USER_JACK, client)).toEqual([]);
    });
  });

  describe("listActiveOrganizationMemberships", () => {
    it("returns only active memberships", async () => {
      const rows: MembershipDbRow[] = [
        {
          id: 1,
          organization_id: ORG_MONKS,
          profile_id: USER_JACK,
          roles: ["general_manager"],
          active: true,
          created_at: "2026-11-01T00:00:00Z",
        },
        {
          id: 2,
          organization_id: ORG_LIQUOR_TAP,
          profile_id: USER_JACK,
          roles: ["server"],
          active: true,
          created_at: "2026-11-02T00:00:00Z",
        },
      ];
      const { client } = createMockSupabase({ rows });

      const result = await listActiveOrganizationMemberships(USER_JACK, client);
      expect(result).toHaveLength(2);
      expect(result.every((m) => m.active)).toBe(true);
    });

    it("returns empty array when user has no active memberships", async () => {
      const { client } = createMockSupabase({ rows: [] });
      const result = await listActiveOrganizationMemberships(USER_JACK, client);
      expect(result).toEqual([]);
    });
  });

  describe("getCurrentUserOrganizationMemberships and Active variant", () => {
    it("returns empty array when user is unauthenticated", async () => {
      const { client } = createMockSupabase({ userId: null });
      expect(await getCurrentUserOrganizationMemberships(client)).toEqual([]);
      expect(await getCurrentUserActiveOrganizationMemberships(client)).toEqual(
        [],
      );
    });

    it("returns memberships for authenticated user", async () => {
      const rows: MembershipDbRow[] = [
        {
          id: 1,
          organization_id: ORG_MONKS,
          profile_id: USER_JACK,
          roles: ["owner"],
          active: true,
          created_at: "2026-11-01T00:00:00Z",
        },
      ];
      const { client } = createMockSupabase({
        userId: USER_JACK,
        rows,
      });

      const result = await getCurrentUserActiveOrganizationMemberships(client);
      expect(result).toHaveLength(1);
      expect(result[0].organizationId).toBe(ORG_MONKS);
    });
  });

  describe("Permanent Scenarios Data Access Verification", () => {
    it("Jack: Multi-org reader returns both Monks and Liquor Tap", async () => {
      const jackRows: MembershipDbRow[] = [
        {
          id: 1,
          organization_id: ORG_MONKS,
          profile_id: USER_JACK,
          roles: ["general_manager"],
          active: true,
          created_at: "2026-11-01T00:00:00Z",
        },
        {
          id: 2,
          organization_id: ORG_LIQUOR_TAP,
          profile_id: USER_JACK,
          roles: ["shift_manager"],
          active: true,
          created_at: "2026-11-02T00:00:00Z",
        },
      ];
      const { client } = createMockSupabase({ rows: jackRows });

      const memberships = await listActiveOrganizationMemberships(
        USER_JACK,
        client,
      );
      expect(memberships).toHaveLength(2);
      expect(memberships.map((m) => m.organizationId)).toEqual([
        ORG_MONKS,
        ORG_LIQUOR_TAP,
      ]);
      expect(memberships.map((m) => m.designation)).toEqual([
        "manager",
        "assistant_manager",
      ]);
    });

    it("Sam: Single-org reader returns Liquor Tap only", async () => {
      const samRows: MembershipDbRow[] = [
        {
          id: 3,
          organization_id: ORG_LIQUOR_TAP,
          profile_id: USER_SAM,
          roles: ["server"],
          active: true,
          created_at: "2026-11-01T00:00:00Z",
        },
      ];
      const { client } = createMockSupabase({ rows: samRows });

      const memberships = await listActiveOrganizationMemberships(
        USER_SAM,
        client,
      );
      expect(memberships).toHaveLength(1);
      expect(memberships[0].organizationId).toBe(ORG_LIQUOR_TAP);
    });

    it("Tom: Single-org reader returns Monks only", async () => {
      const tomRows: MembershipDbRow[] = [
        {
          id: 4,
          organization_id: ORG_MONKS,
          profile_id: USER_TOM,
          roles: ["server"],
          active: true,
          created_at: "2026-11-01T00:00:00Z",
        },
      ];
      const { client } = createMockSupabase({ rows: tomRows });

      const memberships = await listActiveOrganizationMemberships(
        USER_TOM,
        client,
      );
      expect(memberships).toHaveLength(1);
      expect(memberships[0].organizationId).toBe(ORG_MONKS);
    });

    it("Jerry: Multi-org reader returns both Monks and Liquor Tap", async () => {
      const jerryRows: MembershipDbRow[] = [
        {
          id: 5,
          organization_id: ORG_MONKS,
          profile_id: USER_JERRY,
          roles: ["server"],
          active: true,
          created_at: "2026-11-01T00:00:00Z",
        },
        {
          id: 6,
          organization_id: ORG_LIQUOR_TAP,
          profile_id: USER_JERRY,
          roles: ["server"],
          active: true,
          created_at: "2026-11-02T00:00:00Z",
        },
      ];
      const { client } = createMockSupabase({ rows: jerryRows });

      const memberships = await listActiveOrganizationMemberships(
        USER_JERRY,
        client,
      );
      expect(memberships).toHaveLength(2);
      expect(memberships.map((m) => m.organizationId)).toEqual([
        ORG_MONKS,
        ORG_LIQUOR_TAP,
      ]);
    });
  });
});
