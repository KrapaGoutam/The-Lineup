import { describe, expect, it, vi } from "vitest";

import { upsertAttendanceIdentityLink } from "./identity-links";

type ExistingRow = {
  profile_id: string;
  neon_user_id: number;
  linked_by: string;
  linked_at: string;
} | null;

function makeClient({
  existing = null,
  auditError = null,
}: {
  existing?: ExistingRow;
  auditError?: { message: string } | null;
}) {
  const linkUpserts: unknown[] = [];
  const auditInserts: unknown[] = [];
  const linkDeletes: string[] = [];

  const client = {
    from(table: string) {
      if (table === "audit_events") {
        return {
          insert: async (value: unknown) => {
            auditInserts.push(value);
            return { error: auditError };
          },
        };
      }
      if (table !== "attendance_identity_links") {
        throw new Error(`Unexpected test table: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: existing, error: null }),
            }),
          }),
        }),
        upsert: async (value: unknown) => {
          linkUpserts.push(value);
          return { error: null };
        },
        delete: () => ({
          eq: () => ({
            eq: async (_column: string, value: string) => {
              linkDeletes.push(value);
              return { error: null };
            },
          }),
        }),
      };
    },
  };

  return {
    // The fake intentionally implements only the fluent calls exercised by
    // this data function; the real Supabase type is validated at its source.
    client: client as never,
    linkUpserts,
    auditInserts,
    linkDeletes,
  };
}

const input = {
  organizationId: "00000000-0000-0000-0000-000000019101",
  targetProfileId: "00000000-0000-0000-0000-000000019103",
  neonUserId: 42,
  actorProfileId: "00000000-0000-0000-0000-000000019102",
};

describe("attendance identity-link auditing", () => {
  it("records attribution and before/after identity state", async () => {
    const existing = {
      profile_id: input.targetProfileId,
      neon_user_id: 41,
      linked_by: input.actorProfileId,
      linked_at: "2026-09-07T12:00:00.000Z",
    };
    const { client, auditInserts, linkUpserts } = makeClient({ existing });

    await expect(upsertAttendanceIdentityLink(client, input)).resolves.toEqual({
      ok: true,
      data: null,
    });

    expect(linkUpserts).toHaveLength(1);
    expect(auditInserts).toEqual([
      expect.objectContaining({
        organization_id: input.organizationId,
        actor_profile_id: input.actorProfileId,
        action: "attendance_identity_linked",
        entity_type: "attendance_identity_link",
        entity_id: input.targetProfileId,
        before_state: { neon_user_id: 41 },
        after_state: { neon_user_id: 42 },
      }),
    ]);
  });

  it("removes a newly-created link when its audit event fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      const { client, linkDeletes } = makeClient({
        auditError: { message: "audit unavailable" },
      });

      await expect(
        upsertAttendanceIdentityLink(client, input),
      ).resolves.toEqual({
        ok: false,
        error: "Unable to record the attendance-link audit event.",
      });
      expect(linkDeletes).toEqual([input.targetProfileId]);
    } finally {
      consoleError.mockRestore();
    }
  });
});
