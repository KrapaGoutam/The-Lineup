import { describe, expect, it } from "vitest";

import { generateRandomPasscode } from "./passcode-security";

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
