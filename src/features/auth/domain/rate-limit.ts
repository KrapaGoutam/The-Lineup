/**
 * Pure passcode rate-limit policy. Kept independent of Supabase/route
 * plumbing so the thresholds are unit-testable without a database.
 *
 * Two layers:
 * - Per-fingerprint: a hard block, proportionate blast radius (one device).
 * - Per-organization: a soft signal that exempts devices with a recent
 *   successful login, so it degrades instead of denying the whole
 *   restaurant. See docs/features/006-four-digit-passcodes.md.
 */

export const FINGERPRINT_MAX_FAILURES = 5;
export const FINGERPRINT_WINDOW_MINUTES = 15;

export const ORGANIZATION_MAX_FAILURES = 30;
export const ORGANIZATION_WINDOW_MINUTES = 15;

/** How recently a fingerprint must have succeeded to be exempt from the org-wide cap. */
export const RECENT_SUCCESS_EXEMPTION_HOURS = 24;

export function shouldLockFingerprint(failureCountInWindow: number): boolean {
  return failureCountInWindow >= FINGERPRINT_MAX_FAILURES;
}

export function shouldLockOrganization(input: {
  failureCountInWindow: number;
  fingerprintSucceededRecently: boolean;
}): boolean {
  if (input.fingerprintSucceededRecently) return false;
  return input.failureCountInWindow >= ORGANIZATION_MAX_FAILURES;
}

/**
 * A lockout reset moves the counting boundary forward without deleting any
 * `passcode_login_attempts` history (audit rows stay append-only). Only
 * failures strictly after the most recent reset (if any) count toward the
 * organization-wide threshold.
 */
export function organizationCountWindowStart(input: {
  windowStart: Date;
  lastResetAt: Date | null;
}): Date {
  if (!input.lastResetAt) return input.windowStart;
  return input.lastResetAt > input.windowStart
    ? input.lastResetAt
    : input.windowStart;
}
