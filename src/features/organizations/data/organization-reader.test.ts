import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  getCurrentUserOrganizations,
  getOrganizationById,
  getOrganizationBySlug,
  getUserOrganizationSummaries,
  listUserOrganizations,
} from "./organization-reader";

const MONKS_ORG_ID = "00000000-0000-0000-0000-000000000001";
const LIQUOR_TAP_ORG_ID = "00000000-0000-0000-0000-000000000002";

const monksRow = {
  id: MONKS_ORG_ID,
  name: "The Monks",
  slug: "the-monks",
  created_by: "00000000-0000-0000-0000-0000000000aa",
  settings: {
    branding: {
      primaryColor: "#1a2b3c",
      accentColor: "#f4a261",
      displayName: "Monks Pub",
    },
  },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const liquorTapRow = {
  id: LIQUOR_TAP_ORG_ID,
  name: "Liquor Tap",
  slug: "liquor-tap",
  created_by: "00000000-0000-0000-0000-0000000000aa",
  settings: {
    branding: {
      primaryColor: "#333333",
    },
  },
  created_at: "2026-01-02T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

type MockOrgRow = {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function createMockSupabase(handlers: {
  getOrgById?: (id: string) => { data: MockOrgRow | null; error: unknown };
  getOrgBySlug?: (slug: string) => {
    data: MockOrgRow | null;
    error: unknown;
  };
  getOverallRole?: (profileId: string) => {
    data: { role: string } | null;
    error: unknown;
  };
  getMemberships?: (profileId: string) => {
    data: Array<{
      organization_id: string;
      roles?: string[];
      active: boolean;
    }> | null;
    error: unknown;
  };
  getAllOrgs?: () => { data: MockOrgRow[] | null; error: unknown };
  getOrgsByIds?: (ids: string[]) => {
    data: MockOrgRow[] | null;
    error: unknown;
  };
  getUser?: () => { data: { user: { id: string } | null }; error: unknown };
}) {
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "organizations") {
      let filterType: "id" | "slug" | "in" | "all" = "all";
      let filterValue: string | string[] = "";

      const queryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((column: string, val: string) => {
          if (column === "id") {
            filterType = "id";
            filterValue = val;
          } else if (column === "slug") {
            filterType = "slug";
            filterValue = val;
          }
          return queryBuilder;
        }),
        in: vi.fn().mockImplementation((column: string, values: string[]) => {
          if (column === "id") {
            filterType = "in";
            filterValue = values;
          }
          return queryBuilder;
        }),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockImplementation(async () => {
          if (filterType === "id" && handlers.getOrgById) {
            return handlers.getOrgById(filterValue as string);
          }
          if (filterType === "slug" && handlers.getOrgBySlug) {
            return handlers.getOrgBySlug(filterValue as string);
          }
          return { data: null, error: null };
        }),
        then: (resolve: (val: unknown) => unknown) => {
          if (filterType === "in" && handlers.getOrgsByIds) {
            return Promise.resolve(
              handlers.getOrgsByIds(filterValue as string[]),
            ).then(resolve);
          }
          if (handlers.getAllOrgs) {
            return Promise.resolve(handlers.getAllOrgs()).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };

      return queryBuilder;
    }

    if (table === "overall_roles") {
      let profileId = "";
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((col: string, val: string) => {
          if (col === "profile_id") profileId = val;
          return builder;
        }),
        maybeSingle: vi.fn().mockImplementation(async () => {
          if (handlers.getOverallRole) {
            return handlers.getOverallRole(profileId);
          }
          return { data: null, error: null };
        }),
      };
      return builder;
    }

    if (table === "memberships") {
      let profileId = "";
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((col: string, val: string) => {
          if (col === "profile_id") profileId = val;
          return builder;
        }),
        then: (resolve: (val: unknown) => unknown) => {
          if (handlers.getMemberships) {
            return Promise.resolve(handlers.getMemberships(profileId)).then(
              resolve,
            );
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return builder;
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  const auth = {
    getUser: vi.fn().mockImplementation(async () => {
      if (handlers.getUser) {
        return handlers.getUser();
      }
      return { data: { user: null }, error: null };
    }),
  };

  return { from, auth } as unknown as SupabaseClient<Database>;
}

describe("organization-reader data layer", () => {
  describe("getOrganizationById", () => {
    it("READ-001: returns canonical Organization for valid ID", async () => {
      const client = createMockSupabase({
        getOrgById: (id) => ({
          data: id === MONKS_ORG_ID ? monksRow : null,
          error: null,
        }),
      });

      const result = await getOrganizationById(MONKS_ORG_ID, client);
      expect(result).not.toBeNull();
      expect(result?.id).toBe(MONKS_ORG_ID);
      expect(result?.name).toBe("The Monks");
      expect(result?.slug).toBe("the-monks");
      expect(result?.settings.branding?.primaryColor).toBe("#1a2b3c");
      expect(result?.settings.branding?.displayName).toBe("Monks Pub");
    });

    it("READ-003: returns null when organization ID is empty or whitespace", async () => {
      const client = createMockSupabase({});
      expect(await getOrganizationById("", client)).toBeNull();
      expect(await getOrganizationById("   ", client)).toBeNull();
      expect(
        await getOrganizationById(null as unknown as string, client),
      ).toBeNull();
    });

    it("READ-008: returns null when organization is not found or denied by RLS", async () => {
      const client = createMockSupabase({
        getOrgById: () => ({ data: null, error: null }),
      });

      const result = await getOrganizationById("non-existent-id", client);
      expect(result).toBeNull();
    });

    it("READ-010: fails closed to null on database error", async () => {
      const client = createMockSupabase({
        getOrgById: () => ({
          data: null,
          error: new Error("PostgREST query error"),
        }),
      });

      const result = await getOrganizationById(MONKS_ORG_ID, client);
      expect(result).toBeNull();
    });
  });

  describe("getOrganizationBySlug", () => {
    it("READ-002: returns canonical Organization for valid slug", async () => {
      const client = createMockSupabase({
        getOrgBySlug: (slug) => ({
          data: slug === "the-monks" ? monksRow : null,
          error: null,
        }),
      });

      const result = await getOrganizationBySlug("The-Monks", client);
      expect(result).not.toBeNull();
      expect(result?.slug).toBe("the-monks");
      expect(result?.name).toBe("The Monks");
    });

    it("READ-003: returns null when slug is empty or whitespace", async () => {
      const client = createMockSupabase({});
      expect(await getOrganizationBySlug("", client)).toBeNull();
      expect(await getOrganizationBySlug("   ", client)).toBeNull();
      expect(
        await getOrganizationBySlug(undefined as unknown as string, client),
      ).toBeNull();
    });

    it("READ-010: fails closed to null on database error", async () => {
      const client = createMockSupabase({
        getOrgBySlug: () => ({
          data: null,
          error: { message: "connection dropped" },
        }),
      });

      const result = await getOrganizationBySlug("the-monks", client);
      expect(result).toBeNull();
    });
  });

  describe("listUserOrganizations", () => {
    it("READ-004: user with active Monks membership receives Monks only", async () => {
      const profileId = "profile-monks-staff";
      const client = createMockSupabase({
        getOverallRole: () => ({ data: null, error: null }),
        getMemberships: () => ({
          data: [{ organization_id: MONKS_ORG_ID, active: true }],
          error: null,
        }),
        getOrgsByIds: (ids) => ({
          data: ids.includes(MONKS_ORG_ID) ? [monksRow] : [],
          error: null,
        }),
      });

      const orgs = await listUserOrganizations(profileId, client);
      expect(orgs).toHaveLength(1);
      expect(orgs[0].id).toBe(MONKS_ORG_ID);
      expect(orgs[0].slug).toBe("the-monks");
    });

    it("READ-005: user with active Liquor Tap membership receives Liquor Tap", async () => {
      const profileId = "profile-liquor-gm";
      const client = createMockSupabase({
        getOverallRole: () => ({ data: null, error: null }),
        getMemberships: () => ({
          data: [{ organization_id: LIQUOR_TAP_ORG_ID, active: true }],
          error: null,
        }),
        getOrgsByIds: (ids) => ({
          data: ids.includes(LIQUOR_TAP_ORG_ID) ? [liquorTapRow] : [],
          error: null,
        }),
      });

      const orgs = await listUserOrganizations(profileId, client);
      expect(orgs).toHaveLength(1);
      expect(orgs[0].id).toBe(LIQUOR_TAP_ORG_ID);
      expect(orgs[0].slug).toBe("liquor-tap");
    });

    it("READ-006: multi-org user (Jack) receives both Monks and Liquor Tap without limit(1) truncation", async () => {
      const profileId = "profile-jack-multiorg";
      const client = createMockSupabase({
        getOverallRole: () => ({ data: null, error: null }),
        getMemberships: () => ({
          data: [
            { organization_id: MONKS_ORG_ID, active: true },
            { organization_id: LIQUOR_TAP_ORG_ID, active: true },
          ],
          error: null,
        }),
        getOrgsByIds: (ids) => ({
          data: [monksRow, liquorTapRow].filter((r) => ids.includes(r.id)),
          error: null,
        }),
      });

      const orgs = await listUserOrganizations(profileId, client);
      expect(orgs).toHaveLength(2);
      expect(orgs.map((o) => o.slug)).toEqual(["the-monks", "liquor-tap"]);
    });

    it("READ-007: inactive scoped membership does not grant access", async () => {
      const profileId = "profile-inactive-user";
      const client = createMockSupabase({
        getOverallRole: () => ({ data: null, error: null }),
        getMemberships: () => ({
          data: [], // filtered out because eq("active", true) returns empty
          error: null,
        }),
      });

      const orgs = await listUserOrganizations(profileId, client);
      expect(orgs).toEqual([]);
    });

    it("READ-009: Overall authorized user resolves organizations globally without synthetic memberships", async () => {
      const profileId = "profile-overall-owner";
      const client = createMockSupabase({
        getOverallRole: () => ({ data: { role: "owner" }, error: null }),
        getAllOrgs: () => ({
          data: [monksRow, liquorTapRow],
          error: null,
        }),
      });

      const orgs = await listUserOrganizations(profileId, client);
      expect(orgs).toHaveLength(2);
      expect(orgs.map((o) => o.id)).toEqual([MONKS_ORG_ID, LIQUOR_TAP_ORG_ID]);
    });

    it("READ-010: returns empty array when profileId is empty or on database error", async () => {
      const client = createMockSupabase({});
      expect(await listUserOrganizations("", client)).toEqual([]);
      expect(await listUserOrganizations("   ", client)).toEqual([]);

      const errorClient = createMockSupabase({
        getOverallRole: () => ({
          data: null,
          error: new Error("network timeout"),
        }),
      });
      expect(await listUserOrganizations("profile-1", errorClient)).toEqual([]);
    });
  });

  describe("getCurrentUserOrganizations", () => {
    it("returns empty array when no authenticated session exists", async () => {
      const client = createMockSupabase({
        getUser: () => ({ data: { user: null }, error: null }),
      });

      const orgs = await getCurrentUserOrganizations(client);
      expect(orgs).toEqual([]);
    });

    it("returns user organizations when authenticated", async () => {
      const client = createMockSupabase({
        getUser: () => ({ data: { user: { id: "user-123" } }, error: null }),
        getOverallRole: () => ({ data: null, error: null }),
        getMemberships: () => ({
          data: [{ organization_id: MONKS_ORG_ID, active: true }],
          error: null,
        }),
        getOrgsByIds: () => ({
          data: [monksRow],
          error: null,
        }),
      });

      const orgs = await getCurrentUserOrganizations(client);
      expect(orgs).toHaveLength(1);
      expect(orgs[0].id).toBe(MONKS_ORG_ID);
    });
  });

  describe("getUserOrganizationSummaries", () => {
    it("correctly identifies overall role authority and maps summaries", async () => {
      const client = createMockSupabase({
        getOverallRole: () => ({ data: { role: "manager" }, error: null }),
        getAllOrgs: () => ({
          data: [monksRow, liquorTapRow],
          error: null,
        }),
      });

      const summaries = await getUserOrganizationSummaries(
        "overall-manager-id",
        client,
      );
      expect(summaries).toHaveLength(2);
      expect(summaries[0]).toEqual({
        organizationId: MONKS_ORG_ID,
        name: "The Monks",
        slug: "the-monks",
        role: "manager",
        isOverallAuthorized: true,
      });
      expect(summaries[1].isOverallAuthorized).toBe(true);
    });

    it("maps scoped membership roles for standard multi-org users", async () => {
      const client = createMockSupabase({
        getOverallRole: () => ({ data: null, error: null }),
        getMemberships: () => ({
          data: [
            {
              organization_id: MONKS_ORG_ID,
              roles: ["general_manager"],
              active: true,
            },
            {
              organization_id: LIQUOR_TAP_ORG_ID,
              roles: ["staff"],
              active: true,
            },
          ],
          error: null,
        }),
        getOrgsByIds: (ids) => ({
          data: [monksRow, liquorTapRow].filter((r) => ids.includes(r.id)),
          error: null,
        }),
      });

      const summaries = await getUserOrganizationSummaries(
        "scoped-user-id",
        client,
      );
      expect(summaries).toHaveLength(2);
      expect(summaries[0].role).toBe("general_manager");
      expect(summaries[0].isOverallAuthorized).toBe(false);
      expect(summaries[1].role).toBe("staff");
      expect(summaries[1].isOverallAuthorized).toBe(false);
    });
  });
});
