import { describe, expect, it } from "vitest";
import {
  signKioskSession,
  verifyKioskSession,
  type KioskEmployeeSession,
} from "./kiosk-cookie";

describe("kiosk-cookie session signing and verification", () => {
  const mockSession: KioskEmployeeSession = {
    profileId: "00000000-0000-0000-0000-000000000001",
    displayName: "Alex Host",
    deviceId: "00000000-0000-0000-0000-000000000002",
    organizationId: "00000000-0000-0000-0000-000000000003",
    locationId: "00000000-0000-0000-0000-000000000004",
    accessToken: "jwt.access.token.123",
    expiresAt: Date.now() + 180_000,
  };

  it("signs and successfully verifies a valid session", () => {
    const token = signKioskSession(mockSession);
    expect(typeof token).toBe("string");
    expect(token).toContain(".");

    const verified = verifyKioskSession(token);
    expect(verified).not.toBeNull();
    expect(verified?.profileId).toBe(mockSession.profileId);
    expect(verified?.displayName).toBe(mockSession.displayName);
    expect(verified?.deviceId).toBe(mockSession.deviceId);
    expect(verified?.accessToken).toBe(mockSession.accessToken);
  });

  it("rejects expired sessions", () => {
    const expiredSession: KioskEmployeeSession = {
      ...mockSession,
      expiresAt: Date.now() - 1000, // 1 second in the past
    };
    const token = signKioskSession(expiredSession);
    expect(verifyKioskSession(token)).toBeNull();
  });

  it("rejects tampered tokens", () => {
    const token = signKioskSession(mockSession);
    const [, signature] = token.split(".");
    // Tamper with payload
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        ...mockSession,
        profileId: "00000000-0000-0000-0000-000000000999",
      }),
    ).toString("base64url");
    const tamperedToken = `${tamperedPayload}.${signature}`;

    expect(verifyKioskSession(tamperedToken)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyKioskSession("")).toBeNull();
    expect(verifyKioskSession("not-a-token")).toBeNull();
    expect(verifyKioskSession("a.b.c")).toBeNull();
  });
});
