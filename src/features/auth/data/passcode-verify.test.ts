import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAuthPassword,
  createPersonAuthPassword,
} from "@/lib/passcode-security";

// A fake shaped exactly like the one real call this module makes:
// supabase.auth.signInWithPassword({email, password}). Configured with
// which password (person, derived, legacy-raw, or neither) it accepts, so a test
// can assert verifyPasscode tries person first, falls back to derived, then legacy,
// without needing a real Supabase client or network call.
function makeFakeSupabase(
  accepts: "person" | "derived" | "legacy" | "neither",
) {
  const signInWithPassword = vi.fn(
    async ({ password }: { email: string; password: string }) => {
      const organizationId = "org-1";
      const passcode = "1234";
      const person = createPersonAuthPassword(passcode);
      const derived = createAuthPassword(organizationId, passcode);
      const matches =
        (accepts === "person" && password === person) ||
        (accepts === "derived" && password === derived) ||
        (accepts === "legacy" && password === passcode);
      return {
        data: matches
          ? { session: { access_token: "fake-jwt" } as unknown as Session }
          : null,
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

  it("succeeds via the person password without trying derived or legacy", async () => {
    const { verifyPasscode } = await import("./passcode-verify");
    const { supabase, signInWithPassword } = makeFakeSupabase("person");

    const result = await verifyPasscode(supabase, {
      syntheticEmail,
      organizationId,
      passcode: "1234",
    });

    expect(result).toEqual({
      ok: true,
      verifiedVia: "person",
      session: { access_token: "fake-jwt" },
    });
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("falls back to the organization-derived password for a pre-B3 migrated account", async () => {
    const { verifyPasscode } = await import("./passcode-verify");
    const { supabase, signInWithPassword } = makeFakeSupabase("derived");

    const result = await verifyPasscode(supabase, {
      syntheticEmail,
      organizationId,
      passcode: "1234",
    });

    expect(result).toEqual({
      ok: true,
      verifiedVia: "derived",
      session: { access_token: "fake-jwt" },
    });
    expect(signInWithPassword).toHaveBeenCalledTimes(2);
  });

  it("falls back to the raw passcode for a not-yet-migrated (legacy) account", async () => {
    const { verifyPasscode } = await import("./passcode-verify");
    const { supabase, signInWithPassword } = makeFakeSupabase("legacy");

    const result = await verifyPasscode(supabase, {
      syntheticEmail,
      organizationId,
      passcode: "1234",
    });

    expect(result).toEqual({
      ok: true,
      verifiedVia: "legacy",
      session: { access_token: "fake-jwt" },
    });
    expect(signInWithPassword).toHaveBeenCalledTimes(3);
  });

  it("fails when neither the person, derived, nor legacy password matches", async () => {
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

  it("writes the person-level password for this passcode", async () => {
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
      password: createPersonAuthPassword("1234"),
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
