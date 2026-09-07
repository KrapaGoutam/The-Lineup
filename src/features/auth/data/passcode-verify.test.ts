import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAuthPassword } from "@/lib/passcode-security";

// A fake shaped exactly like the one real call this module makes:
// supabase.auth.signInWithPassword({email, password}). Configured with
// which password (derived, legacy-raw, or neither) it accepts, so a test
// can assert verifyPasscode tries derived first and falls back to legacy,
// without needing a real Supabase client or network call.
function makeFakeSupabase(accepts: "derived" | "legacy" | "neither") {
  const signInWithPassword = vi.fn(
    async ({ password }: { email: string; password: string }) => {
      const organizationId = "org-1";
      const passcode = "1234";
      const derived = createAuthPassword(organizationId, passcode);
      const matches =
        (accepts === "derived" && password === derived) ||
        (accepts === "legacy" && password === passcode);
      return {
        error: matches ? null : { message: "Invalid login credentials" },
      };
    },
  );
  return { supabase: { auth: { signInWithPassword } }, signInWithPassword };
}

describe("verifyPasscode", () => {
  const organizationId = "org-1";
  const syntheticEmail = "abc@passcode.internal";

  beforeEach(() => {
    process.env.APP_PIN_PEPPER = "x".repeat(32);
  });

  it("succeeds via the derived password without ever trying the legacy one", async () => {
    const { verifyPasscode } = await import("./passcode-verify");
    const { supabase, signInWithPassword } = makeFakeSupabase("derived");

    const result = await verifyPasscode(supabase, {
      syntheticEmail,
      organizationId,
      passcode: "1234",
    });

    expect(result).toEqual({ ok: true, verifiedVia: "derived" });
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("falls back to the raw passcode for a not-yet-migrated (legacy) account", async () => {
    const { verifyPasscode } = await import("./passcode-verify");
    const { supabase, signInWithPassword } = makeFakeSupabase("legacy");

    const result = await verifyPasscode(supabase, {
      syntheticEmail,
      organizationId,
      passcode: "1234",
    });

    expect(result).toEqual({ ok: true, verifiedVia: "legacy" });
    expect(signInWithPassword).toHaveBeenCalledTimes(2);
  });

  it("fails when neither the derived nor the legacy password matches", async () => {
    const { verifyPasscode } = await import("./passcode-verify");
    const { supabase } = makeFakeSupabase("neither");

    const result = await verifyPasscode(supabase, {
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

  it("writes the derived password for this passcode", async () => {
    const { migrateLegacyAuthPassword } = await import("./passcode-verify");
    const updateUserById = vi.fn(async () => ({ error: null }));
    const admin = {
      auth: { admin: { updateUserById } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake, not the real client type
    } as any;

    await migrateLegacyAuthPassword(admin, {
      profileId: "profile-1",
      organizationId: "org-1",
      passcode: "1234",
    });

    expect(updateUserById).toHaveBeenCalledWith("profile-1", {
      password: createAuthPassword("org-1", "1234"),
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test fake
      } as any;

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
