import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../actions/kiosk-pairing-actions", () => ({
  pairKioskDeviceAction: vi.fn(),
}));

import {
  isValidPairingCodeFormat,
  PAIRING_CODE_ALPHABET,
} from "../domain/kiosk-device";
import { KEYPAD_ROWS } from "../components/kiosk-pairing-screen";
import { generatePairingCode } from "./kiosk-crypto";

const KEYPAD_CHARS = new Set(KEYPAD_ROWS.flat());

describe("generatePairingCode (D1: alphabet matches the keypad)", () => {
  it("never offers L and has no ambiguous characters in its alphabet", () => {
    expect(PAIRING_CODE_ALPHABET).not.toMatch(/[L01OI]/);
    expect(PAIRING_CODE_ALPHABET).toHaveLength(31);
    expect(new Set(PAIRING_CODE_ALPHABET).size).toBe(31);
  });

  it("alphabet and keypad are exactly the same set of characters", () => {
    expect([...KEYPAD_CHARS].sort()).toEqual([...PAIRING_CODE_ALPHABET].sort());
  });

  it("every possible generator index maps to an enterable character (deterministic)", () => {
    // Force the RNG to every index, six at a time. The old 32-character
    // alphabet put "L" at index 10; that index now yields an enterable key.
    const indices = Array.from(
      { length: PAIRING_CODE_ALPHABET.length },
      (_, i) => i,
    );
    const seen = new Set<string>();
    for (let start = 0; start < indices.length; start += 6) {
      const batch = indices.slice(start, start + 6);
      while (batch.length < 6) batch.push(0);
      let n = 0;
      const code = generatePairingCode(() => batch[n++]);
      expect(code).toHaveLength(6);
      expect(isValidPairingCodeFormat(code)).toBe(true);
      for (const ch of code) {
        expect(KEYPAD_CHARS.has(ch)).toBe(true);
        seen.add(ch);
      }
    }
    expect(seen.size).toBe(31);
    expect(seen.has("L")).toBe(false);
    // Regression: the exact index that used to produce "L" (10).
    expect(generatePairingCode(() => 10)).toBe(
      PAIRING_CODE_ALPHABET[10].repeat(6),
    );
    expect(KEYPAD_CHARS.has(PAIRING_CODE_ALPHABET[10])).toBe(true);
  });

  it("draws indices over the full alphabet length, once per character", () => {
    const calls: number[] = [];
    generatePairingCode((max) => {
      calls.push(max);
      return 0;
    });
    expect(calls).toEqual(Array(6).fill(PAIRING_CODE_ALPHABET.length));
  });

  it("real random output stays 6 characters, all enterable", () => {
    for (let i = 0; i < 2000; i++) {
      const code = generatePairingCode();
      expect(code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    }
  });
});
