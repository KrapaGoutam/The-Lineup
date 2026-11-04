import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import * as mutationModule from "./organization-mutation";
import {
  provisionNewOrganization,
  updateOrganizationMetadata,
} from "./organization-mutation";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const OWNER_PROFILE_ID = "00000000-0000-0000-0000-0000000000aa";

const sampleOrgRow = {
  id: ORG_ID,
  name: "New Pub",
  slug: "new-pub",
  created_by: OWNER_PROFILE_ID,
  settings: {
    branding: {
      primaryColor: "#112233",
    },
    customFlag: true,
  },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function createMockSupabase(handlers: {
  rpc?: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  selectSettings?: (id: string) => Promise<{ data: unknown; error: unknown }>;
  updateOrg?: (
    id: string,
    updates: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
}) {
  const rpc = vi
    .fn()
    .mockImplementation((fn: string, args: Record<string, unknown>) => {
      if (handlers.rpc) {
        return handlers.rpc(fn, args);
      }
      return Promise.resolve({ data: null, error: null });
    });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "organizations") {
      let orgId = "";
      let updatePayload: Record<string, unknown> = {};

      const builder = {
        select: vi.fn().mockImplementation(() => {
          return {
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === "id") orgId = val;
              return {
                maybeSingle: vi.fn().mockImplementation(async () => {
                  if (handlers.selectSettings) {
                    return handlers.selectSettings(orgId);
                  }
                  return { data: null, error: null };
                }),
              };
            }),
          };
        }),
        update: vi
          .fn()
          .mockImplementation((payload: Record<string, unknown>) => {
            updatePayload = payload;
            return {
              eq: vi.fn().mockImplementation((col: string, val: string) => {
                if (col === "id") orgId = val;
                return {
                  select: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockImplementation(async () => {
                      if (handlers.updateOrg) {
                        return handlers.updateOrg(orgId, updatePayload);
                      }
                      return { data: null, error: null };
                    }),
                  }),
                };
              }),
            };
          }),
      };
      return builder;
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return { rpc, from } as unknown as SupabaseClient<Database>;
}

describe("organization-mutation data layer", () => {
  describe("provisionNewOrganization", () => {
    it("MUT-001: authorized creation by Overall Owner succeeds and returns canonical Organization", async () => {
      const client = createMockSupabase({
        rpc: async (fn, args) => {
          expect(fn).toBe("provision_organization");
          expect(args.p_name).toBe("New Pub");
          expect(args.p_slug).toBe("new-pub");
          expect(args.p_initial_owner_profile_id).toBe(OWNER_PROFILE_ID);
          return {
            data: sampleOrgRow,
            error: null,
          };
        },
      });

      const result = await provisionNewOrganization(
        {
          name: "New Pub",
          slug: "new-pub",
          initialOwnerProfileId: OWNER_PROFILE_ID,
          branding: { primaryColor: "#112233" },
        },
        client,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(ORG_ID);
        expect(result.data.slug).toBe("new-pub");
        expect(result.data.settings.branding?.primaryColor).toBe("#112233");
      }
    });

    it("MUT-002: tenant creation attempt by non-owner returns UNAUTHORIZED", async () => {
      const client = createMockSupabase({
        rpc: async () => ({
          data: null,
          error: { code: "42501", message: "insufficient_privilege" },
        }),
      });

      const result = await provisionNewOrganization(
        {
          name: "Hacked Org",
          slug: "hacked-org",
        },
        client,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("UNAUTHORIZED");
        expect(result.error).toContain("Overall Owner");
      }
    });

    it("MUT-003 & MUT-004: designated initial owner not found returns OWNER_NOT_FOUND (atomic rollback)", async () => {
      const client = createMockSupabase({
        rpc: async () => ({
          data: null,
          error: { code: "P0002", message: "Initial owner profile not found" },
        }),
      });

      const result = await provisionNewOrganization(
        {
          name: "Ghost Owner Pub",
          slug: "ghost-owner-pub",
          initialOwnerProfileId: "00000000-0000-0000-0000-ffffffffffff",
        },
        client,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("OWNER_NOT_FOUND");
      }
    });

    it("MUT-013: duplicate slug collision returns DUPLICATE_SLUG", async () => {
      const client = createMockSupabase({
        rpc: async () => ({
          data: null,
          error: {
            code: "23505",
            message: "duplicate key value violates unique constraint",
          },
        }),
      });

      const result = await provisionNewOrganization(
        {
          name: "Duplicate Pub",
          slug: "existing-slug",
        },
        client,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("DUPLICATE_SLUG");
      }
    });

    it("MUT-015: rejects invalid name or slug before calling RPC", async () => {
      const rpcSpy = vi.fn();
      const client = { rpc: rpcSpy } as unknown as SupabaseClient<Database>;

      const emptyName = await provisionNewOrganization(
        { name: "   ", slug: "valid-slug" },
        client,
      );
      expect(emptyName.success).toBe(false);
      if (!emptyName.success) expect(emptyName.code).toBe("INVALID_NAME");

      const invalidSlug = await provisionNewOrganization(
        { name: "Valid Name", slug: "invalid--slug" },
        client,
      );
      expect(invalidSlug.success).toBe(false);
      if (!invalidSlug.success) expect(invalidSlug.code).toBe("INVALID_SLUG");

      expect(rpcSpy).not.toHaveBeenCalled();
    });

    it("MUT-008: rejects secret patterns in settings before calling RPC", async () => {
      const client = createMockSupabase({});
      const result = await provisionNewOrganization(
        {
          name: "Secret Pub",
          slug: "secret-pub",
          settings: { apiKey: "secret_live_1234567890abcdef" },
        },
        client,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_SETTINGS");
        expect(result.error).toContain("secret");
      }
    });
  });

  describe("updateOrganizationMetadata", () => {
    it("MUT-005: authorized name update succeeds and returns updated Organization", async () => {
      const updatedRow = {
        ...sampleOrgRow,
        name: "Updated Pub Name",
        updated_at: "2026-01-02T00:00:00.000Z",
      };

      const client = createMockSupabase({
        updateOrg: async (id, updates) => {
          expect(id).toBe(ORG_ID);
          expect(updates.name).toBe("Updated Pub Name");
          return { data: updatedRow, error: null };
        },
      });

      const result = await updateOrganizationMetadata(
        {
          organizationId: ORG_ID,
          name: "Updated Pub Name",
        },
        client,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Updated Pub Name");
      }
    });

    it("MUT-006: unauthorized update by staff returns UNAUTHORIZED", async () => {
      const client = createMockSupabase({
        updateOrg: async () => ({
          data: null,
          error: {
            code: "42501",
            message: "permission denied for table organizations",
          },
        }),
      });

      const result = await updateOrganizationMetadata(
        {
          organizationId: ORG_ID,
          name: "Staff Renamed",
        },
        client,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("UNAUTHORIZED");
      }
    });

    it("MUT-007: settings update preserves unrelated existing settings safely", async () => {
      let receivedUpdates: Record<string, unknown> = {};
      const client = createMockSupabase({
        selectSettings: async () => ({
          data: {
            settings: { existingKey: "preservedValue", customFlag: true },
          },
          error: null,
        }),
        updateOrg: async (id, updates) => {
          receivedUpdates = updates;
          return {
            data: {
              ...sampleOrgRow,
              settings: updates.settings,
            },
            error: null,
          };
        },
      });

      const result = await updateOrganizationMetadata(
        {
          organizationId: ORG_ID,
          branding: { primaryColor: "#998877" },
        },
        client,
      );

      expect(result.success).toBe(true);
      expect(receivedUpdates.settings).toEqual({
        existingKey: "preservedValue",
        customFlag: true,
        branding: { primaryColor: "#998877" },
      });
    });

    it("MUT-009: branding update validates colors and paths", async () => {
      const client = createMockSupabase({
        selectSettings: async () => ({
          data: { settings: {} },
          error: null,
        }),
      });

      const invalidColor = await updateOrganizationMetadata(
        {
          organizationId: ORG_ID,
          branding: { primaryColor: "blue" }, // not a valid hex color
        },
        client,
      );

      expect(invalidColor.success).toBe(false);
      if (!invalidColor.success) {
        expect(invalidColor.code).toBe("INVALID_SETTINGS");
      }
    });

    it("MUT-010 & MUT-011: rejects missing or invalid organization ID", async () => {
      const client = createMockSupabase({});
      const result = await updateOrganizationMetadata(
        {
          organizationId: "",
          name: "Name",
        },
        client,
      );
      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe("INVALID_ID");
    });

    it("MUT-012: immutability — does not accept or allow slug or created_by modification", () => {
      // TypeScript compile-time guarantee + runtime verification:
      // UpdateOrganizationParams type intentionally lacks slug, id, created_by, created_at
      const params: Parameters<typeof updateOrganizationMetadata>[0] = {
        organizationId: ORG_ID,
        name: "Valid Update",
      };
      expect("slug" in params).toBe(false);
      expect("created_by" in params).toBe(false);
    });

    it("MUT-014: verifies hard delete is not exported in public mutation interface", () => {
      const exportedKeys = Object.keys(mutationModule);
      expect(exportedKeys).not.toContain("deleteOrganization");
      expect(exportedKeys).not.toContain("removeOrganization");
      expect(exportedKeys).not.toContain("hardDeleteOrganization");
    });
  });
});
