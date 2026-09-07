import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAuthPassword } from "@/lib/passcode-security";

// rotatePasscodeCredential takes its admin client as an argument rather than
// constructing one, so this fake is passed in directly -- no module mock
// needed. It only needs to support the exact chains the function calls:
// select().eq().eq().maybeSingle() to read the row, and update().eq() to
// write it (once to the new locator, then zero or more times reverting back
// to the old one).
type Credential = { id: string; locator: string };

function makeFakeAdmin(config: {
  credential: Credential | null;
  setLocatorError?: { code?: string; message?: string } | null;
  // One entry per revert attempt (rotatePasscodeCredential tries up to two).
  // A missing entry, or an entry of `null`, means that attempt succeeds.
  revertErrors?: Array<{ message?: string } | null>;
  authUpdateError?: { message?: string } | null;
}) {
  let updateCallCount = 0;

  function readChain(): {
    select: () => ReturnType<typeof readChain>;
    eq: () => ReturnType<typeof readChain>;
    maybeSingle: () => Promise<{ data: Credential | null; error: null }>;
  } {
    return {
      select: () => readChain(),
      eq: () => readChain(),
      maybeSingle: async () => ({ data: config.credential, error: null }),
    };
  }

  function updateChain(callIndex: number) {
    return {
      eq: async () => {
        if (callIndex === 1) {
          return { error: config.setLocatorError ?? null };
        }
        const revertIndex = callIndex - 2;
        return { error: config.revertErrors?.[revertIndex] ?? null };
      },
    };
  }

  const updateUserById = vi.fn(async () => ({
    error: config.authUpdateError ?? null,
  }));

  return {
    admin: {
      from(table: string) {
        if (table !== "passcode_credentials") {
          throw new Error(`unexpected table in test fake: ${table}`);
        }
        return {
          select: () => readChain(),
          update: () => {
            updateCallCount += 1;
            return updateChain(updateCallCount);
          },
        };
      },
      auth: { admin: { updateUserById } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake, not the real client type
    } as any,
    updateUserById,
  };
}

describe("rotatePasscodeCredential", () => {
  const organizationId = "org-1";
  const profileId = "profile-1";

  beforeEach(() => {
    process.env.APP_PIN_PEPPER = "x".repeat(32);
  });

  it("updates the locator and the Auth password (derived, never the raw passcode) on full success", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin, updateUserById } = makeFakeAdmin({
      credential: { id: "cred-1", locator: "old-locator" },
    });

    const result = await rotatePasscodeCredential(admin, {
      organizationId,
      profileId,
      newPasscode: "1234",
    });

    expect(result.ok).toBe(true);
    // Never the raw "1234" -- a raw 4-digit value is what got rejected by
    // the real hosted project's password-strength check in the first
    // place (AuthWeakPasswordError). Must be the derived value.
    expect(updateUserById).toHaveBeenCalledWith(profileId, {
      password: createAuthPassword(organizationId, "1234"),
    });
    expect(updateUserById).not.toHaveBeenCalledWith(
      profileId,
      expect.objectContaining({ password: "1234" }),
    );
  });

  it("fails clearly, with no Auth update attempted, when the new locator collides", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin, updateUserById } = makeFakeAdmin({
      credential: { id: "cred-1", locator: "old-locator" },
      setLocatorError: { code: "23505" },
    });

    const result = await rotatePasscodeCredential(admin, {
      organizationId,
      profileId,
      newPasscode: "1234",
    });

    expect(result).toMatchObject({ ok: false, severity: "recoverable" });
    if (!result.ok) expect(result.error).toMatch(/already in use/i);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("reverts the locator and reports recoverable when the Auth update fails but the revert succeeds", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin } = makeFakeAdmin({
      credential: { id: "cred-1", locator: "old-locator" },
      authUpdateError: { message: "auth service unavailable" },
    });

    const result = await rotatePasscodeCredential(admin, {
      organizationId,
      profileId,
      newPasscode: "1234",
    });

    expect(result).toMatchObject({ ok: false, severity: "recoverable" });
  });

  it("reports the locked_out worst case when the Auth update AND both revert attempts fail", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      const { rotatePasscodeCredential } = await import("./passcode-rotation");
      const { admin } = makeFakeAdmin({
        credential: { id: "cred-1", locator: "old-locator" },
        authUpdateError: { message: "auth service unavailable" },
        revertErrors: [
          { message: "revert attempt 1 failed" },
          { message: "revert attempt 2 failed" },
        ],
      });

      const result = await rotatePasscodeCredential(admin, {
        organizationId,
        profileId,
        newPasscode: "1234",
      });

      // This is the case the spec calls out by name: the row now points at
      // the new locator, the Auth password is still the old passcode, and
      // neither passcode will sign this person in until a human resets it
      // again. It must never be reported as "recoverable".
      expect(result).toMatchObject({ ok: false, severity: "locked_out" });
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("fails clearly when there is no credential row for that person", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin, updateUserById } = makeFakeAdmin({ credential: null });

    const result = await rotatePasscodeCredential(admin, {
      organizationId,
      profileId,
      newPasscode: "1234",
    });

    expect(result).toMatchObject({ ok: false, severity: "recoverable" });
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
