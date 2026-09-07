import { describe, expect, it, vi } from "vitest";

import { deactivateMember, reactivateMember } from "./member-deactivation";

// setMemberActive (the shared implementation behind both exports) calls
// exactly two chained .eq() filters after .update() on each of two
// tables, with the second .eq() awaited directly -- matching that exact
// shape rather than a generic mock keeps this test honest about what
// the real code actually calls.
function makeFakeAdmin(config: {
  membershipError?: { message: string } | null;
  credentialError?: { message: string } | null;
  banError?: { message: string } | null;
}) {
  function updateChain(resultError: { message: string } | null) {
    return {
      eq: () => ({
        eq: async () => ({ error: resultError }),
      }),
    };
  }

  const updateUserById = vi.fn(async () => ({
    error: config.banError ?? null,
  }));

  return {
    admin: {
      from(table: string) {
        if (table === "memberships") {
          return { update: () => updateChain(config.membershipError ?? null) };
        }
        if (table === "passcode_credentials") {
          return {
            update: () => updateChain(config.credentialError ?? null),
          };
        }
        throw new Error(`unexpected table in test fake: ${table}`);
      },
      auth: { admin: { updateUserById } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake, not the real client type
    } as any,
    updateUserById,
  };
}

describe("deactivateMember", () => {
  const organizationId = "org-1";
  const profileId = "profile-1";

  it("succeeds and bans with a long, effectively-permanent duration", async () => {
    const { admin, updateUserById } = makeFakeAdmin({});

    const result = await deactivateMember(admin, { organizationId, profileId });

    expect(result).toEqual({ ok: true });
    expect(updateUserById).toHaveBeenCalledWith(profileId, {
      ban_duration: "876000h",
    });
  });

  it("attempts every write even after an earlier one fails, and reports exactly which succeeded", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      const { admin, updateUserById } = makeFakeAdmin({
        credentialError: { message: "credential update unavailable" },
      });

      const result = await deactivateMember(admin, {
        organizationId,
        profileId,
      });

      // This is the "best-effort, no revert" decision from the approved
      // spec: membership and the ban still land even though the
      // credential write failed in between them.
      expect(result).toMatchObject({
        ok: false,
        writes: { membership: true, credential: false, ban: true },
      });
      expect(updateUserById).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("reports all three as failed when every write fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      const { admin } = makeFakeAdmin({
        membershipError: { message: "unavailable" },
        credentialError: { message: "unavailable" },
        banError: { message: "unavailable" },
      });

      const result = await deactivateMember(admin, {
        organizationId,
        profileId,
      });

      expect(result).toMatchObject({
        ok: false,
        writes: { membership: false, credential: false, ban: false },
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("reactivateMember", () => {
  const organizationId = "org-1";
  const profileId = "profile-1";

  it("succeeds and lifts the ban with 'none'", async () => {
    const { admin, updateUserById } = makeFakeAdmin({});

    const result = await reactivateMember(admin, { organizationId, profileId });

    expect(result).toEqual({ ok: true });
    expect(updateUserById).toHaveBeenCalledWith(profileId, {
      ban_duration: "none",
    });
  });
});
