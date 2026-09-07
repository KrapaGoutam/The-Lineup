import { beforeEach, describe, expect, it } from "vitest";

import {
  createAuthPassword,
  createPasscodeLocator,
  generateRandomPasscode,
} from "./passcode-security";

describe("generateRandomPasscode", () => {
  it("always returns a zero-padded 4-digit string", () => {
    // Exercised many times specifically to catch the padStart edge case --
    // randomInt(0, 10000) includes values below 1000 that need leading
    // zeros (e.g. 7 -> "0007"), which a naive String(n) would drop.
    for (let i = 0; i < 200; i += 1) {
      const passcode = generateRandomPasscode();
      expect(passcode).toMatch(/^\d{4}$/);
    }
  });
});

describe("createAuthPassword", () => {
  beforeEach(() => {
    process.env.APP_PIN_PEPPER = "x".repeat(32);
  });

  it("is a 64-character hex digest, clearing any reasonable minimum-length password policy", () => {
    const password = createAuthPassword("org-1", "1234");
    expect(password).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same organization and passcode", () => {
    expect(createAuthPassword("org-1", "1234")).toBe(
      createAuthPassword("org-1", "1234"),
    );
  });

  it("never equals the locator for the same organization and passcode", () => {
    // The whole point of the domain-separated ("authpw:") HMAC input: a
    // leaked locator (which legitimately appears in passcode_credentials
    // rows, login-attempt logs, backups) must never also be a working
    // Auth password.
    const organizationId = "org-1";
    const passcode = "1234";
    expect(createAuthPassword(organizationId, passcode)).not.toBe(
      createPasscodeLocator(organizationId, passcode),
    );
  });

  it("differs across organizations for the same passcode", () => {
    expect(createAuthPassword("org-1", "1234")).not.toBe(
      createAuthPassword("org-2", "1234"),
    );
  });
});
