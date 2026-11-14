import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPersonAuthPassword } from "@/lib/passcode-security";
import type { rotatePasscodeCredential } from "./passcode-rotation";

type Credential = { id: string; organization_id: string; locator: string };

function makeFakeAdmin(config: {
  credentials?: Credential[] | null;
  credential?: { id: string; organization_id?: string; locator: string } | null;
  collision?: { id: string } | null;
  setLocatorError?: { code?: string; message?: string } | null;
  revertErrors?: Array<{ message?: string } | null>;
  authUpdateError?: { message?: string } | null;
}) {
  let updateCallCount = 0;

  const credentialsList: Credential[] | null =
    config.credentials !== undefined
      ? config.credentials
      : config.credential
        ? [
            {
              id: config.credential.id,
              organization_id: config.credential.organization_id ?? "org-1",
              locator: config.credential.locator,
            },
          ]
        : null;

  type QueryChain = {
    select: () => QueryChain;
    eq: () => QueryChain;
    neq: () => QueryChain;
    maybeSingle: () => Promise<{ data: unknown; error: null }>;
    then: <TResult1 = unknown, TResult2 = never>(
      onfulfilled?:
        | ((value: {
            data: typeof credentialsList;
            error: null;
          }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ) => Promise<TResult1 | TResult2>;
  };

  function queryChain(): QueryChain {
    const chain: QueryChain = {
      select: () => queryChain(),
      eq: () => queryChain(),
      neq: () => queryChain(),
      maybeSingle: async () => ({
        data: config.collision ?? null,
        error: null,
      }),
      then(onfulfilled, onrejected) {
        return Promise.resolve({
          data: credentialsList,
          error: null,
        }).then(onfulfilled, onrejected);
      },
    };
    return chain;
  }

  function updateChain(callIndex: number) {
    return {
      eq: async () => {
        if (callIndex === 1 && config.setLocatorError) {
          return { error: config.setLocatorError };
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
          select: () => queryChain(),
          update: () => {
            updateCallCount += 1;
            return updateChain(updateCallCount);
          },
        };
      },
      auth: { admin: { updateUserById } },
    } as unknown as Parameters<typeof rotatePasscodeCredential>[0],
    updateUserById,
  };
}

describe("rotatePasscodeCredential", () => {
  const organizationId = "org-1";
  const profileId = "profile-1";

  beforeEach(() => {
    process.env.APP_PIN_PEPPER = "x".repeat(32);
  });

  it("updates the locator and the Auth password with person-level password on full success", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin, updateUserById } = makeFakeAdmin({
      credential: {
        id: "cred-1",
        organization_id: organizationId,
        locator: "old-locator",
      },
    });

    const result = await rotatePasscodeCredential(admin, {
      organizationId,
      profileId,
      newPasscode: "1234",
    });

    expect(result.ok).toBe(true);
    expect(updateUserById).toHaveBeenCalledWith(profileId, {
      password: createPersonAuthPassword("1234"),
    });
    expect(updateUserById).not.toHaveBeenCalledWith(
      profileId,
      expect.objectContaining({ password: "1234" }),
    );
  });

  it("rotates locators across multiple organizations for a multi-org member", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin, updateUserById } = makeFakeAdmin({
      credentials: [
        { id: "cred-1", organization_id: "org-1", locator: "old-loc-1" },
        { id: "cred-2", organization_id: "org-2", locator: "old-loc-2" },
      ],
    });

    const result = await rotatePasscodeCredential(admin, {
      profileId,
      newPasscode: "5678",
    });

    expect(result.ok).toBe(true);
    expect(updateUserById).toHaveBeenCalledWith(profileId, {
      password: createPersonAuthPassword("5678"),
    });
  });

  it("fails clearly when a collision is detected during pre-check", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin, updateUserById } = makeFakeAdmin({
      credential: {
        id: "cred-1",
        organization_id: organizationId,
        locator: "old-locator",
      },
      collision: { id: "other-cred" },
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

  it("fails clearly, with no Auth update attempted, when the locator update collides (23505)", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin, updateUserById } = makeFakeAdmin({
      credential: {
        id: "cred-1",
        organization_id: organizationId,
        locator: "old-locator",
      },
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
      credential: {
        id: "cred-1",
        organization_id: organizationId,
        locator: "old-locator",
      },
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
        credential: {
          id: "cred-1",
          organization_id: organizationId,
          locator: "old-locator",
        },
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

      expect(result).toMatchObject({ ok: false, severity: "locked_out" });
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("fails clearly when there is no credential row for that person", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin, updateUserById } = makeFakeAdmin({ credentials: null });

    const result = await rotatePasscodeCredential(admin, {
      organizationId,
      profileId,
      newPasscode: "1234",
    });

    expect(result).toMatchObject({ ok: false, severity: "recoverable" });
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
