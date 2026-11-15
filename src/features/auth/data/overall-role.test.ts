import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { getCurrentUserOverallRole, getOverallRole } from "./overall-role";

function createMockSupabase(options: {
  userId?: string | null;
  roleData?: { role: string } | null;
  queryError?: Error | null;
  authError?: Error | null;
}) {
  const maybeSingle = vi.fn().mockImplementation(async () => {
    if (options.queryError) {
      return { data: null, error: options.queryError };
    }
    return { data: options.roleData ?? null, error: null };
  });

  const eqProfileId = vi.fn().mockReturnValue({ maybeSingle });
  const selectRole = vi.fn().mockReturnValue({ eq: eqProfileId });
  const from = vi.fn().mockReturnValue({ select: selectRole });

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
    spies: { from, selectRole, eqProfileId, maybeSingle, getUser },
  };
}

describe("overall-role data reader", () => {
  describe("getOverallRole", () => {
    it("returns null when userId is empty", async () => {
      const { client } = createMockSupabase({});
      expect(await getOverallRole("", client)).toBe(null);
    });

    it("returns null when user has no overall role assigned", async () => {
      const { client, spies } = createMockSupabase({
        roleData: null,
      });

      const role = await getOverallRole("usr-no-role", client);
      expect(role).toBe(null);
      expect(spies.from).toHaveBeenCalledWith("overall_roles");
      expect(spies.eqProfileId).toHaveBeenCalledWith(
        "profile_id",
        "usr-no-role",
      );
    });

    it("returns 'owner' for overall owner", async () => {
      const { client } = createMockSupabase({
        roleData: { role: "owner" },
      });

      const role = await getOverallRole("usr-owner", client);
      expect(role).toBe("owner");
    });

    it("returns 'manager' for overall manager", async () => {
      const { client } = createMockSupabase({
        roleData: { role: "manager" },
      });

      const role = await getOverallRole("usr-mgr", client);
      expect(role).toBe("manager");
    });

    it("returns 'assistant_manager' for overall assistant manager", async () => {
      const { client } = createMockSupabase({
        roleData: { role: "assistant_manager" },
      });

      const role = await getOverallRole("usr-asst-mgr", client);
      expect(role).toBe("assistant_manager");
    });

    it("normalizes prefixed role forms gracefully", async () => {
      const { client } = createMockSupabase({
        roleData: { role: "overall_owner" },
      });

      const role = await getOverallRole("usr-owner-prefixed", client);
      expect(role).toBe("owner");
    });

    it("fails closed on database error", async () => {
      const { client } = createMockSupabase({
        queryError: new Error("connection failure"),
      });

      const role = await getOverallRole("usr-err", client);
      expect(role).toBe(null);
    });

    it("fails closed on invalid/unsupported database value", async () => {
      const { client } = createMockSupabase({
        roleData: { role: "server" },
      });

      const role = await getOverallRole("usr-invalid", client);
      expect(role).toBe(null);
    });
  });

  describe("getCurrentUserOverallRole", () => {
    it("returns null when user is not authenticated", async () => {
      const { client } = createMockSupabase({
        userId: null,
      });

      const role = await getCurrentUserOverallRole(client);
      expect(role).toBe(null);
    });

    it("returns the overall role of the currently authenticated user", async () => {
      const { client } = createMockSupabase({
        userId: "usr-active-owner",
        roleData: { role: "owner" },
      });

      const role = await getCurrentUserOverallRole(client);
      expect(role).toBe("owner");
    });

    it("returns null when auth throws an error", async () => {
      const { client } = createMockSupabase({
        authError: new Error("session expired"),
      });

      const role = await getCurrentUserOverallRole(client);
      expect(role).toBe(null);
    });
  });
});
