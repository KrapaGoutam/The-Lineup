import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAuthPassword,
  createPersonAuthPassword,
} from "@/lib/passcode-security";
import type { createAdminClient } from "@/lib/supabase/admin";

function makeFakeSupabase(
  accepts: "person" | "derived" | "legacy" | "neither",
  returnedUserId = "profile-1",
) {
  const signOut = vi.fn(async () => ({}));
  const signInWithPassword = vi.fn(
    async ({ password }: { email: string; password: string }) => {
      const organizationId = "org-1";
      const passcode = "1234";
      const profileId = "profile-1";
      const person = createPersonAuthPassword(profileId, passcode);
      const derived = createAuthPassword(organizationId, passcode);
      const matches =
        (accepts === "person" && password === person) ||
        (accepts === "derived" && password === derived) ||
        (accepts === "legacy" && password === passcode);
      return {
        data: matches
          ? {
              user: { id: returnedUserId },
              session: {
                user: { id: returnedUserId },
                access_token: "fake-jwt",
              } as unknown as Session,
            }
          : null,
        error: matches ? null : { message: "Invalid login credentials" },
      };
    },
  );
  return {
    supabase: { auth: { signInWithPassword, signOut } },
    signInWithPassword,
    signOut,
  };
}

describe("verifyPasscode", () => {
  const organizationId = "org-1";
  const profileId = "profile-1";
  const syntheticEmail = "abc@passcode.internal";

  beforeEach(() => {
    process.env.APP_PIN_PEPPER = "x".repeat(32);
  });

  it("succeeds via the person password without trying derived or legacy", async () => {
    const { verifyPasscode } = await import("./passcode-verify");
    const { supabase, signInWithPassword } = makeFakeSupabase("person");

    const result = await verifyPasscode(supabase, {
      profileId,
      syntheticEmail,
      organizationId,
      passcode: "1234",
    });

    expect(result.ok).toBe(true);
    expect(result.verifiedVia).toBe("person");
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("fails closed when authenticated user id does not match expected profileId (identity binding failure)", async () => {
    const { verifyPasscode } = await import("./passcode-verify");
    // Returns another user's ID
    const { supabase, signOut } = makeFakeSupabase(
      "person",
      "malicious-user-id",
    );

    const result = await verifyPasscode(supabase, {
      profileId,
      syntheticEmail,
      organizationId,
      passcode: "1234",
    });

    expect(result).toEqual({ ok: false, verifiedVia: null });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("proves two profiles using the same passcode derive different person-level Auth passwords (F-5)", () => {
    const passcode = "1234";
    const pw1 = createPersonAuthPassword("user-alpha", passcode);
    const pw2 = createPersonAuthPassword("user-beta", passcode);

    expect(pw1).not.toBe(pw2);
    expect(pw1).toHaveLength(64);
    expect(pw2).toHaveLength(64);
  });

  it("falls back to the organization-derived password for a pre-B3 migrated account", async () => {
    const { verifyPasscode } = await import("./passcode-verify");
    const { supabase, signInWithPassword } = makeFakeSupabase("derived");

    const result = await verifyPasscode(supabase, {
      profileId,
      syntheticEmail,
      organizationId,
      passcode: "1234",
    });

    expect(result.ok).toBe(true);
    expect(result.verifiedVia).toBe("derived");
    expect(signInWithPassword).toHaveBeenCalledTimes(2);
  });

  it("falls back to the raw passcode for a not-yet-migrated (legacy) account", async () => {
    const { verifyPasscode } = await import("./passcode-verify");
    const { supabase, signInWithPassword } = makeFakeSupabase("legacy");

    const result = await verifyPasscode(supabase, {
      profileId,
      syntheticEmail,
      organizationId,
      passcode: "1234",
    });

    expect(result.ok).toBe(true);
    expect(result.verifiedVia).toBe("legacy");
    expect(signInWithPassword).toHaveBeenCalledTimes(3);
  });

  it("fails when neither the person, derived, nor legacy password matches", async () => {
    const { verifyPasscode } = await import("./passcode-verify");
    const { supabase } = makeFakeSupabase("neither");

    const result = await verifyPasscode(supabase, {
      profileId,
      syntheticEmail,
      organizationId,
      passcode: "1234",
    });

    expect(result).toEqual({ ok: false, verifiedVia: null });
  });
});

describe("migrateLegacyAuthPassword", () => {
  beforeEach(() => {
    process.env.APP_PIN_PEPPER = "x".repeat(32);
  });

  it("writes the person-level password bound to profileId for this passcode", async () => {
    const { migrateLegacyAuthPassword } = await import("./passcode-verify");
    const updateUserById = vi.fn(async () => ({ error: null }));
    const admin = {
      auth: { admin: { updateUserById } },
    } as unknown as ReturnType<typeof createAdminClient>;

    await migrateLegacyAuthPassword(admin, {
      profileId: "profile-1",
      organizationId: "org-1",
      passcode: "1234",
    });

    expect(updateUserById).toHaveBeenCalledWith("profile-1", {
      password: createPersonAuthPassword("profile-1", "1234"),
    });
  });

  it("logs and swallows a failed migration rather than throwing", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      const { migrateLegacyAuthPassword } = await import("./passcode-verify");
      const admin = {
        auth: {
          admin: {
            updateUserById: vi.fn(async () => ({
              error: { message: "unavailable" },
            })),
          },
        },
      } as unknown as ReturnType<typeof createAdminClient>;

      await expect(
        migrateLegacyAuthPassword(admin, {
          profileId: "profile-1",
          organizationId: "org-1",
          passcode: "1234",
        }),
      ).resolves.toBeUndefined();
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
