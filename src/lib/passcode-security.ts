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

/**
 * Feature 016 (revised): the string actually sent to Supabase Auth as a
 * person's password, in place of the raw 4-digit passcode. Two things
 * forced this:
 *
 * 1. Supabase's hosted Auth enforces a hard 6-character password minimum
 *    that cannot be lowered from the dashboard -- a raw 4-digit passcode
 *    is rejected outright by `admin.auth.admin.updateUserById` (confirmed
 *    live against the hosted project; `createUser`/`signInWithPassword`
 *    happened not to enforce it, which is why login and registration ever
 *    worked, but that was never something to keep relying on). A 64-hex-char
 *    HMAC digest clears any minimum a password policy could reasonably set.
 * 2. It must NOT be `createPasscodeLocator`'s output. The locator is a
 *    lookup key that legitimately appears in a `passcode_credentials` row,
 *    a support screenshot of the login-attempt table, a database backup --
 *    none of those should also hand someone a working Auth password. A
 *    second HMAC with its own domain-separated input (`"authpw:"` prefix,
 *    where the locator has none) guarantees the two outputs can never
 *    collide for the same input, even though both derive from the same
 *    pepper, organization, and passcode.
 *
 * `organizationId` is included for the same reason the locator includes
 * it: this is derived, not stored, so nothing requires it, but keeping
 * the two functions symmetric costs nothing and means the same passcode
 * in two different organizations never derives the same Auth password
 * either.
 *
 * See "How the HMAC locator and the Supabase Auth password stay in sync"
 * in docs/features/016-passcode-management.md for the migration this
 * required for every credential that predates this function.
 */
export function createAuthPassword(organizationId: string, passcode: string) {
  return createHmac("sha256", getPepper())
    .update(`authpw:${organizationId}:${passcode}`)
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
