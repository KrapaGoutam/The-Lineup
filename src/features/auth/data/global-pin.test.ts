import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { createHmac } from "node:crypto";
import {
  createGlobalPasscodeLocator,
  createPasscodeLocator,
  createPersonAuthPassword,
} from "@/lib/passcode-security";
import {
  rotateGlobalPersonalPin,
  reservePinAttempt,
  PIN_IN_USE,
} from "./global-pin";
import { rotatePasscodeCredential } from "./passcode-rotation";

vi.mock("./passcode-rotation", () => ({ rotatePasscodeCredential: vi.fn() }));
const rpc = vi.fn();
const admin = {
  rpc,
  auth: {
    admin: {
      getUserById: async (id: string) => ({
        data: { user: { id, email: "test@internal.invalid" } },
        error: null,
      }),
    },
  },
} as unknown as SupabaseClient<Database>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(
    "APP_PIN_PEPPER",
    "b5-test-only-pepper-with-at-least-32-characters",
  );
  rpc.mockResolvedValue({ data: "operation", error: null });
});

describe("global personal PIN lifecycle", () => {
  it("domain separates lookup from every Auth and organization locator", () => {
    const locator = createGlobalPasscodeLocator("0007");
    expect(locator).toBe(
      createHmac("sha256", process.env.APP_PIN_PEPPER!)
        .update("global-pin:v1:0007")
        .digest("hex"),
    );
    expect(locator).not.toBe(createPersonAuthPassword("profile", "0007"));
    expect(locator).not.toBe(createPasscodeLocator("org", "0007"));
    expect(locator).not.toBe(createGlobalPasscodeLocator("0070"));
  });
  it("collision cannot reach Auth or existing locator writes", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect(
      await rotateGlobalPersonalPin(admin, {
        profileId: "person",
        newPasscode: "0007",
      }),
    ).toEqual({ ok: false, error: PIN_IN_USE, severity: "recoverable" });
    expect(rotatePasscodeCredential).not.toHaveBeenCalled();
  });
  it("an interrupted or uncertain reservation is not reported as recoverable", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "55000" } });
    expect(
      await rotateGlobalPersonalPin(admin, {
        profileId: "person",
        newPasscode: "0007",
      }),
    ).toMatchObject({ ok: false, severity: "locked_out" });
    expect(rotatePasscodeCredential).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "finalizes only confirmed success or verified compensation (apply=%s)",
    async (ok) => {
      vi.mocked(rotatePasscodeCredential).mockResolvedValue(
        ok
          ? { ok: true }
          : { ok: false, error: "rolled back", severity: "recoverable" },
      );
      await rotateGlobalPersonalPin(admin, {
        profileId: "person",
        newPasscode: "0007",
        actorProfileId: "owner",
      });
      expect(rpc).toHaveBeenLastCalledWith("finish_personal_pin_change", {
        p_profile_id: "person",
        p_operation_id: "operation",
        p_apply: ok,
      });
      expect(rpc.mock.calls[0][1]).toMatchObject({
        p_actor_profile_id: "owner",
      });
    },
  );
  it("uncertain Auth update retains the operation and both reservations", async () => {
    vi.mocked(rotatePasscodeCredential).mockResolvedValue({
      ok: false,
      error: "uncertain",
      severity: "locked_out",
    });
    expect(
      (
        await rotateGlobalPersonalPin(admin, {
          profileId: "person",
          newPasscode: "0007",
        })
      ).ok,
    ).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("network exceptions never blindly release reserved ownership", async () => {
    vi.mocked(rotatePasscodeCredential).mockRejectedValue(new Error("timeout"));
    expect(
      await rotateGlobalPersonalPin(admin, {
        profileId: "person",
        newPasscode: "0007",
      }),
    ).toMatchObject({ ok: false, severity: "locked_out" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("finalization failure reports locked-out even after Auth succeeds", async () => {
    vi.mocked(rotatePasscodeCredential).mockResolvedValue({ ok: true });
    rpc
      .mockResolvedValueOnce({ data: "operation", error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "network" } });
    expect(
      await rotateGlobalPersonalPin(admin, {
        profileId: "person",
        newPasscode: "0007",
      }),
    ).toMatchObject({ ok: false, severity: "locked_out" });
  });
  it("limiter errors fail closed and exhaustion supplies Retry-After", async () => {
    const request = new Request("https://example.test");
    rpc.mockResolvedValueOnce({ data: null, error: {} });
    expect(
      (await reservePinAttempt(admin, request, "login")).response?.status,
    ).toBe(503);
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const result = await reservePinAttempt(admin, request, "register");
    expect(result.response?.status).toBe(429);
    expect(result.response?.headers.get("retry-after")).toBe("3600");
  });
});
