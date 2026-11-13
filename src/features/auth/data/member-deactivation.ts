import "server-only";

import type { createClient } from "@/lib/supabase/server";

type UserClient = Awaited<ReturnType<typeof createClient>>;

export type SetMemberActiveResult =
  | { ok: true; outcome: "changed" | "already_in_state" }
  | { ok: false; code: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The caller's authenticated client invokes the database's atomic Team transition. */
async function setMemberActive(
  client: UserClient,
  input: {
    organizationId: string;
    profileId: string;
    active: boolean;
    reason: string;
  },
): Promise<SetMemberActiveResult> {
  const reason = input.reason.trim();
  if (
    !UUID.test(input.organizationId) ||
    !UUID.test(input.profileId) ||
    typeof input.active !== "boolean" ||
    reason.length < 3 ||
    reason.length > 500
  ) {
    return { ok: false, code: "22023" };
  }

  const { data, error } = await client.rpc("team_set_member_active", {
    p_organization_id: input.organizationId,
    p_target_profile_id: input.profileId,
    p_active: input.active,
    p_reason: reason,
  });
  if (error) return { ok: false, code: error.code };
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    (data.outcome === "changed" || data.outcome === "already_in_state")
  ) {
    return { ok: true, outcome: data.outcome };
  }
  return { ok: false, code: "P0001" };
}

export function deactivateMember(
  client: UserClient,
  input: { organizationId: string; profileId: string; reason: string },
): Promise<SetMemberActiveResult> {
  return setMemberActive(client, { ...input, active: false });
}

export function reactivateMember(
  client: UserClient,
  input: { organizationId: string; profileId: string; reason: string },
): Promise<SetMemberActiveResult> {
  return setMemberActive(client, { ...input, active: true });
}
