import { describe, expect, it } from "vitest";
import {
  formatPairingCode,
  isValidPairingCodeFormat,
  normalizePairingCode,
} from "./kiosk-device";
import {
  generateDeviceToken,
  generatePairingCode,
  hashDeviceToken,
  hashPairingCode,
} from "../data/kiosk-crypto";

describe("kiosk-device domain helpers", () => {
  it("generates a 6-character uppercase alphanumeric code", () => {
    const code = generatePairingCode();
    expect(code).toHaveLength(6);
    expect(isValidPairingCodeFormat(code)).toBe(true);
  });

  it("normalizes pairing codes by trimming whitespace and hyphens", () => {
    expect(normalizePairingCode("k9x-2m4")).toBe("K9X2M4");
    expect(normalizePairingCode("  k9x 2m4  ")).toBe("K9X2M4");
    expect(normalizePairingCode("K9X2M4")).toBe("K9X2M4");
  });

  it("formats pairing codes with a middle hyphen", () => {
    expect(formatPairingCode("k9x2m4")).toBe("K9X-2M4");
    expect(formatPairingCode("K9X-2M4")).toBe("K9X-2M4");
    expect(formatPairingCode("invalid")).toBe("invalid");
  });

  it("validates pairing code format correctly", () => {
    expect(isValidPairingCodeFormat("K9X2M4")).toBe(true);
    expect(isValidPairingCodeFormat("k9x-2m4")).toBe(true);
    expect(isValidPairingCodeFormat("123456")).toBe(true);
    expect(isValidPairingCodeFormat("12345")).toBe(false);
    expect(isValidPairingCodeFormat("1234567")).toBe(false);
    expect(isValidPairingCodeFormat("K9X#M4")).toBe(false);
  });

  it("hashes pairing code deterministically using SHA-256", () => {
    const hash1 = hashPairingCode("K9X2M4");
    const hash2 = hashPairingCode("k9x-2m4");
    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });

  it("generates 64-character hex device bearer tokens", () => {
    const token = generateDeviceToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  it("hashes device tokens deterministically", () => {
    const token = generateDeviceToken();
    const hash1 = hashDeviceToken(token);
    const hash2 = hashDeviceToken(`  ${token}  `);
    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
  });
});
