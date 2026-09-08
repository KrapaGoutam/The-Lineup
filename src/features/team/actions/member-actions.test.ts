import { beforeEach, describe, expect, it, vi } from "vitest";

// Same shape of fake as schedule-actions.publish.test.ts's makeFakeSupabase
// -- a chainable query builder closely enough matching supabase-js's real
// one (awaitable without a terminal call) that a regression in which
// table/column this action writes would show up here, not just in
// isValidDisplayName's own tests.
type ProfileRow = { id: string; display_name: string };
type AuditRow = Record<string, unknown>;

function makeFakeSupabase(profiles: ProfileRow[], auditRows: AuditRow[]) {
  function from(table: string) {
    if (table === "profiles") {
      const filters: Array<(row: ProfileRow) => boolean> = [];
      let updatePayload: Partial<ProfileRow> | null = null;
      const builder = {
        update(payload: Partial<ProfileRow>) {
          updatePayload = payload;
          return builder;
        },
        eq(field: keyof ProfileRow, value: unknown) {
          filters.push((row) => row[field] === value);
          return builder;
        },
        then(
          onFulfilled: (value: { data: unknown; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          const matches = profiles.filter((row) =>
            filters.every((predicate) => predicate(row)),
          );
          for (const row of matches) Object.assign(row, updatePayload);
          return Promise.resolve({ data: matches, error: null }).then(
            onFulfilled,
            onRejected,
          );
        },
      };
      return builder;
    }
    if (table === "audit_events") {
      return {
        insert(row: AuditRow) {
          auditRows.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table in test fake: ${table}`);
  }

  return {
    from,
    auth: {
      getUser: async () => ({
        data: { user: { id: "00000000-0000-0000-0000-000000024002" } },
      }),
    },
  };
}

let profiles: ProfileRow[];
let auditRows: AuditRow[];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeFakeSupabase(profiles, auditRows),
}));

describe("renameTeamMemberAction", () => {
  beforeEach(() => {
    profiles = [{ id: "target-1", display_name: "Old Name" }];
    auditRows = [];
  });

  const baseInput = {
    restaurantSlug: "the-monks",
    organizationId: "00000000-0000-0000-0000-000000024101",
    targetProfileId: "target-1",
    previousDisplayName: "Old Name",
  };

  it("rejects an empty name without touching the database", async () => {
    const { renameTeamMemberAction } = await import("./member-actions");
    const result = await renameTeamMemberAction({
      ...baseInput,
      nextDisplayName: "",
    });
    expect(result.ok).toBe(false);
    expect(profiles[0].display_name).toBe("Old Name");
    expect(auditRows).toHaveLength(0);
  });

  it("rejects a whitespace-only name", async () => {
    const { renameTeamMemberAction } = await import("./member-actions");
    const result = await renameTeamMemberAction({
      ...baseInput,
      nextDisplayName: "   ",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a name over 100 characters", async () => {
    const { renameTeamMemberAction } = await import("./member-actions");
    const result = await renameTeamMemberAction({
      ...baseInput,
      nextDisplayName: "A".repeat(101),
    });
    expect(result.ok).toBe(false);
    expect(profiles[0].display_name).toBe("Old Name");
  });

  it("accepts a name at the 100-character boundary", async () => {
    const { renameTeamMemberAction } = await import("./member-actions");
    const result = await renameTeamMemberAction({
      ...baseInput,
      nextDisplayName: "A".repeat(100),
    });
    expect(result.ok).toBe(true);
    expect(profiles[0].display_name).toBe("A".repeat(100));
  });

  it("trims, saves the new name, and writes an audit event with before/after state", async () => {
    const { renameTeamMemberAction } = await import("./member-actions");
    const result = await renameTeamMemberAction({
      ...baseInput,
      nextDisplayName: "  New Name  ",
    });
    expect(result).toEqual({ ok: true, data: null });
    expect(profiles[0].display_name).toBe("New Name");
    expect(auditRows).toEqual([
      expect.objectContaining({
        organization_id: baseInput.organizationId,
        actor_profile_id: "00000000-0000-0000-0000-000000024002",
        action: "team_member_renamed",
        entity_type: "profile",
        entity_id: "target-1",
        before_state: { display_name: "Old Name" },
        after_state: { display_name: "New Name" },
      }),
    ]);
  });
});
