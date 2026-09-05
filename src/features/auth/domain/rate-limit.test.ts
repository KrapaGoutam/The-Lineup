import { describe, expect, it } from "vitest";

import {
  FINGERPRINT_MAX_FAILURES,
  ORGANIZATION_MAX_FAILURES,
  organizationCountWindowStart,
  shouldLockFingerprint,
  shouldLockOrganization,
} from "./rate-limit";

describe("per-fingerprint threshold", () => {
  it("stays open below the threshold", () => {
    expect(shouldLockFingerprint(FINGERPRINT_MAX_FAILURES - 1)).toBe(false);
  });

  it("locks at and beyond the threshold", () => {
    expect(shouldLockFingerprint(FINGERPRINT_MAX_FAILURES)).toBe(true);
    expect(shouldLockFingerprint(FINGERPRINT_MAX_FAILURES + 1)).toBe(true);
  });
});

describe("organization-wide threshold", () => {
  it("stays open below the threshold", () => {
    expect(
      shouldLockOrganization({
        failureCountInWindow: ORGANIZATION_MAX_FAILURES - 1,
        fingerprintSucceededRecently: false,
      }),
    ).toBe(false);
  });

  it("locks at and beyond the threshold when the fingerprint has no recent success", () => {
    expect(
      shouldLockOrganization({
        failureCountInWindow: ORGANIZATION_MAX_FAILURES,
        fingerprintSucceededRecently: false,
      }),
    ).toBe(true);
    expect(
      shouldLockOrganization({
        failureCountInWindow: ORGANIZATION_MAX_FAILURES + 1,
        fingerprintSucceededRecently: false,
      }),
    ).toBe(true);
  });

  it("exempts a fingerprint with a recent successful login regardless of the org count", () => {
    expect(
      shouldLockOrganization({
        failureCountInWindow: ORGANIZATION_MAX_FAILURES + 100,
        fingerprintSucceededRecently: true,
      }),
    ).toBe(false);
  });
});

describe("organization count window with a reset", () => {
  const windowStart = new Date("2026-09-05T18:00:00Z");

  it("uses the rolling window start when there has been no reset", () => {
    expect(
      organizationCountWindowStart({ windowStart, lastResetAt: null }),
    ).toEqual(windowStart);
  });

  it("uses the reset time when it is more recent than the window start", () => {
    const lastResetAt = new Date("2026-09-05T18:05:00Z");
    expect(organizationCountWindowStart({ windowStart, lastResetAt })).toEqual(
      lastResetAt,
    );
  });

  it("uses the window start when the reset is older than the window", () => {
    const lastResetAt = new Date("2026-09-05T17:00:00Z");
    expect(organizationCountWindowStart({ windowStart, lastResetAt })).toEqual(
      windowStart,
    );
  });
});
