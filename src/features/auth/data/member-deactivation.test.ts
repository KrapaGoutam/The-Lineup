import { describe, expect, it, vi } from "vitest";

import { deactivateMember, reactivateMember } from "./member-deactivation";

type UserClient = Parameters<typeof deactivateMember>[0];

const organizationId = "00000000-0000-4000-8000-000000000001";
const profileId = "00000000-0000-4000-8000-000000000002";
const input = { organizationId, profileId, reason: "Team lifecycle change" };

function fakeClient(outcome: "changed" | "already_in_state" = "changed") {
  const rpc = vi.fn(async () => ({ data: { outcome }, error: null }));
  const updateUserById = vi.fn();
  const client = {
    rpc,
    auth: { admin: { updateUserById } },
  } as unknown as UserClient;
  return { client, rpc, updateUserById };
}

describe("transactional Team transition", () => {
  it("deactivates through the caller's RPC with organization scope and reason", async () => {
    const { client, rpc } = fakeClient();
    expect(await deactivateMember(client, input)).toEqual({
      ok: true,
      outcome: "changed",
    });
    expect(rpc).toHaveBeenCalledWith("team_set_member_active", {
      p_organization_id: organizationId,
      p_target_profile_id: profileId,
      p_active: false,
      p_reason: input.reason,
    });
  });

  it("reactivates through the same atomic RPC", async () => {
    const { client, rpc } = fakeClient();
    expect(await reactivateMember(client, input)).toEqual({
      ok: true,
      outcome: "changed",
    });
    expect(rpc).toHaveBeenCalledWith(
      "team_set_member_active",
      expect.objectContaining({ p_active: true }),
    );
  });

  it("never invokes an account-wide Auth write during deactivation", async () => {
    const { client, updateUserById } = fakeClient();
    await deactivateMember(client, input);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("never invokes an account-wide Auth write during reactivation", async () => {
    const { client, updateUserById } = fakeClient();
    await reactivateMember(client, input);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("does not claim success when the credential transaction fails", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "P0001", message: "credential write failed" },
    }));
    const client = { rpc } as unknown as UserClient;
    const result = await reactivateMember(client, input);
    expect(result).toEqual({ ok: false, code: "P0001" });
  });

  it("returns the database convergence outcome", async () => {
    const { client } = fakeClient("already_in_state");
    expect(await deactivateMember(client, input)).toEqual({
      ok: true,
      outcome: "already_in_state",
    });
  });

  it("rejects malformed input before invoking the RPC", async () => {
    const { client, rpc } = fakeClient();
    expect(
      await deactivateMember(client, { ...input, profileId: "bad" }),
    ).toEqual({ ok: false, code: "22023" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not fabricate a successful outcome from a malformed response", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const client = { rpc } as unknown as UserClient;
    expect(await deactivateMember(client, input)).toEqual({
      ok: false,
      code: "P0001",
    });
  });
});
