import "server-only";

import { createHmac, randomInt } from "node:crypto";

function getPepper() {
  const pepper = process.env.APP_PIN_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error("APP_PIN_PEPPER must contain at least 32 characters.");
  }
  return pepper;
}

export function createPasscodeLocator(
  organizationId: string,
  passcode: string,
) {
  return createHmac("sha256", getPepper())
    .update(`${organizationId}:${passcode}`)
    .digest("hex");
}

export function createRequestFingerprint(value: string) {
  return createHmac("sha256", getPepper())
    .update(`request:${value}`)
    .digest("hex");
}

/**
 * Feature 016: extracted from bootstrap-owner.mjs's identical inline logic
 * (`String(randomInt(0, 10000)).padStart(4, "0")`) so a manager-initiated
 * passcode reset can offer the same "leave it blank, get a random one"
 * path bootstrap already established, without a second implementation of
 * the same four lines. `randomInt` (not `Math.random`) for the same reason
 * bootstrap already chose it: cryptographically secure, not just
 * statistically uniform.
 */
export function generateRandomPasscode(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}
