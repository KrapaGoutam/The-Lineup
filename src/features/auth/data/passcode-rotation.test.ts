import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPersonAuthPassword } from "@/lib/passcode-security";
import type { rotatePasscodeCredential } from "./passcode-rotation";

type Credential = {
  id: string;
  organization_id: string;
  locator: string;
  synthetic_email?: string;
};

function makeFakeAdmin(config: {
  credentials?: Credential[] | null;
  credential?: {
    id: string;
    organization_id?: string;
    locator: string;
    synthetic_email?: string;
  } | null;
  collision?: { id: string } | null;
  setLocatorError?: { code?: string; message?: string } | null;
  setLocatorErrors?: Array<{ code?: string; message?: string } | null>;
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
              synthetic_email:
                config.credential.synthetic_email ??
                "profile-1@passcode.internal",
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

  function updateChain() {
    updateCallCount += 1;
    const currentCall = updateCallCount;
    const chain = {
      eq: () => chain,
      select: async () => {
        if (currentCall === 1 && config.setLocatorError) {
          return { data: null, error: config.setLocatorError };
        }
        if (
          config.setLocatorErrors &&
          currentCall <= config.setLocatorErrors.length
        ) {
          const err = config.setLocatorErrors[currentCall - 1];
          if (err) return { data: null, error: err };
          return { data: [{ id: 1 }], error: null };
        }
        const revertIdx = config.setLocatorErrors
          ? currentCall - config.setLocatorErrors.length - 1
          : currentCall - 2;
        if (config.revertErrors && config.revertErrors[revertIdx]) {
          return { data: null, error: config.revertErrors[revertIdx] };
        }
        return { data: [{ id: 1 }], error: null };
      },
    };
    return chain;
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
          update: () => updateChain(),
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

  it("updates the locator and the Auth password with person-level password bound to profileId on full success", async () => {
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
      password: createPersonAuthPassword(profileId, "1234"),
    });
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
      password: createPersonAuthPassword(profileId, "5678"),
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

  // F-1 focused failure injection: later org locator fails, earlier revert succeeds
  it("F-1: reverts earlier locator and returns recoverable when later org locator update fails and revert succeeds", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin, updateUserById } = makeFakeAdmin({
      credentials: [
        { id: "cred-1", organization_id: "org-1", locator: "old-loc-1" },
        { id: "cred-2", organization_id: "org-2", locator: "old-loc-2" },
      ],
      // First update (cred-1) succeeds, second update (cred-2) fails
      setLocatorErrors: [null, { message: "database timeout on org-2" }],
    });

    const result = await rotatePasscodeCredential(admin, {
      profileId,
      newPasscode: "1234",
    });

    expect(result).toMatchObject({ ok: false, severity: "recoverable" });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  // F-1 focused failure injection: later org locator fails, earlier revert ALSO fails
  it("F-1: returns locked_out when later org locator fails AND compensating revert fails", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin, updateUserById } = makeFakeAdmin({
      credentials: [
        { id: "cred-1", organization_id: "org-1", locator: "old-loc-1" },
        { id: "cred-2", organization_id: "org-2", locator: "old-loc-2" },
      ],
      // First update succeeds, second fails
      setLocatorErrors: [null, { message: "database timeout on org-2" }],
      // Revert of cred-1 also fails
      revertErrors: [{ message: "connection dropped during revert" }],
    });

    const result = await rotatePasscodeCredential(admin, {
      profileId,
      newPasscode: "1234",
    });

    expect(result).toMatchObject({ ok: false, severity: "locked_out" });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  // F-3: Ambiguous Auth update reconciled by probe confirming new password applied
  it("F-3: reconciles ambiguous Auth update error when probe confirms new password was applied", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin } = makeFakeAdmin({
      credential: {
        id: "cred-1",
        organization_id: organizationId,
        locator: "old-locator",
      },
      authUpdateError: { message: "504 Gateway Timeout" },
    });

    // Probe confirms the new password actually is active in GoTrue
    const authProber = vi.fn(async () => ({ ok: true }));

    const result = await rotatePasscodeCredential(admin, {
      organizationId,
      profileId,
      newPasscode: "1234",
      authProber,
    });

    expect(result.ok).toBe(true);
    expect(authProber).toHaveBeenCalled();
  });

  // F-3: Auth update error with probe confirming not applied -> safe revert -> recoverable
  it("F-3: reverts locators and returns recoverable when probe confirms new password was NOT applied", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin } = makeFakeAdmin({
      credential: {
        id: "cred-1",
        organization_id: organizationId,
        locator: "old-locator",
      },
      authUpdateError: { message: "User not found" },
    });

    // Probe confirms new password is not active
    const authProber = vi.fn(async () => ({
      ok: false,
      isConfirmedInvalid: true,
    }));

    const result = await rotatePasscodeCredential(admin, {
      organizationId,
      profileId,
      newPasscode: "1234",
      authProber,
    });

    expect(result).toMatchObject({ ok: false, severity: "recoverable" });
  });

  // F-3: Auth update error with indeterminate probe -> fails closed as locked_out
  it("F-3: returns locked_out when Auth update error state is indeterminate", async () => {
    const { rotatePasscodeCredential } = await import("./passcode-rotation");
    const { admin } = makeFakeAdmin({
      credential: {
        id: "cred-1",
        organization_id: organizationId,
        locator: "old-locator",
      },
      authUpdateError: { message: "502 Bad Gateway" },
    });

    // Probe fails with network error (neither confirmed active nor confirmed invalid)
    const authProber = vi.fn(async () => ({
      ok: false,
      isConfirmedInvalid: false,
    }));

    const result = await rotatePasscodeCredential(admin, {
      organizationId,
      profileId,
      newPasscode: "1234",
      authProber,
    });

    expect(result).toMatchObject({ ok: false, severity: "locked_out" });
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
