import { describe, expect, it } from "vitest";

import {
  calculateGrossElapsed,
  detectBatchOverlaps,
  manualEntryInputSchema,
  validateManualEntryLocalTime,
} from "./attendance-manual-entry";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const OTHER_UUID = "22222222-2222-4222-8222-222222222222";
const TIME_ZONE = "America/Chicago"; // UTC-6 in standard, UTC-5 in daylight

describe("manualEntryInputSchema", () => {
  it("validates a completed shift with required fields", () => {
    const input = {
      profileId: VALID_UUID,
      serviceDate: "2026-11-09",
      clockInAt: "2026-11-09T15:00:00.000Z",
      clockOutAt: "2026-11-09T23:00:00.000Z",
      reason: "Employee forgot to badge in and out.",
      idempotencyKey: "op-key-1",
    };
    const res = manualEntryInputSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  it("permits an open shift (null clockOutAt)", () => {
    const input = {
      profileId: VALID_UUID,
      serviceDate: "2026-11-09",
      clockInAt: "2026-11-09T15:00:00.000Z",
      clockOutAt: null,
      reason: "Clocked in manually at shift start.",
      idempotencyKey: "op-key-open",
    };
    const res = manualEntryInputSchema.safeParse(input);
    expect(res.success).toBe(true);
  });

  it("rejects reason shorter than 3 characters", () => {
    const input = {
      profileId: VALID_UUID,
      serviceDate: "2026-11-09",
      clockInAt: "2026-11-09T15:00:00.000Z",
      clockOutAt: "2026-11-09T23:00:00.000Z",
      reason: "no",
      idempotencyKey: "op-key-1",
    };
    const res = manualEntryInputSchema.safeParse(input);
    expect(res.success).toBe(false);
  });

  it("rejects clockOutAt before clockInAt", () => {
    const input = {
      profileId: VALID_UUID,
      serviceDate: "2026-11-09",
      clockInAt: "2026-11-09T23:00:00.000Z",
      clockOutAt: "2026-11-09T15:00:00.000Z",
      reason: "Misordered times entered.",
      idempotencyKey: "op-key-1",
    };
    const res = manualEntryInputSchema.safeParse(input);
    expect(res.success).toBe(false);
  });

  it("rejects shift exceeding 48 hours", () => {
    const input = {
      profileId: VALID_UUID,
      serviceDate: "2026-11-09",
      clockInAt: "2026-11-09T10:00:00.000Z",
      clockOutAt: "2026-11-11T12:00:00.000Z", // 50 hours
      reason: "Too long duration.",
      idempotencyKey: "op-key-1",
    };
    const res = manualEntryInputSchema.safeParse(input);
    expect(res.success).toBe(false);
  });
});

describe("validateManualEntryLocalTime", () => {
  it("passes when service date matches clock-in in location timezone", () => {
    // 2026-11-09 09:00 in Chicago is 15:00 UTC
    const res = validateManualEntryLocalTime({
      serviceDate: "2026-11-09",
      clockInAt: "2026-11-09T15:00:00.000Z",
      clockOutAt: "2026-11-09T23:00:00.000Z",
      timeZone: TIME_ZONE,
      nowMs: Date.parse("2026-11-10T12:00:00.000Z"),
    });
    expect(res.ok).toBe(true);
  });

  it("fails when service date does not match clock-in in location timezone", () => {
    // 2026-11-09 23:00 Chicago is 2026-11-10 05:00 UTC
    // If serviceDate is given as 2026-11-10, but in Chicago it was 2026-11-09
    const res = validateManualEntryLocalTime({
      serviceDate: "2026-11-10",
      clockInAt: "2026-11-10T04:00:00.000Z", // 22:00 on 2026-11-09 in Chicago!
      clockOutAt: "2026-11-10T08:00:00.000Z",
      timeZone: TIME_ZONE,
      nowMs: Date.parse("2026-11-10T12:00:00.000Z"),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("must match the clock-in date");
    }
  });

  it("rejects future clock-in time beyond tolerance", () => {
    const now = Date.parse("2026-11-10T12:00:00.000Z");
    const futureIn = new Date(now + 120_000).toISOString(); // 2m in future
    const res = validateManualEntryLocalTime({
      serviceDate: "2026-11-10",
      clockInAt: futureIn,
      clockOutAt: null,
      timeZone: "UTC",
      nowMs: now,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("cannot be in the future");
    }
  });

  it("permits clock-in within skew tolerance (e.g. 30 seconds ahead)", () => {
    const now = Date.parse("2026-11-10T12:00:00.000Z");
    const slightFutureIn = new Date(now + 30_000).toISOString();
    const res = validateManualEntryLocalTime({
      serviceDate: "2026-11-10",
      clockInAt: slightFutureIn,
      clockOutAt: null,
      timeZone: "UTC",
      nowMs: now,
    });
    expect(res.ok).toBe(true);
  });

  it("rejects open shift for a past date", () => {
    // Current date in UTC is 2026-11-10
    const now = Date.parse("2026-11-10T12:00:00.000Z");
    const res = validateManualEntryLocalTime({
      serviceDate: "2026-11-08",
      clockInAt: "2026-11-08T15:00:00.000Z",
      clockOutAt: null, // open
      timeZone: "UTC",
      nowMs: now,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Only shifts for today");
    }
  });

  it("permits open shift for today's local date", () => {
    const now = Date.parse("2026-11-10T16:00:00.000Z"); // 10:00 AM Chicago
    const res = validateManualEntryLocalTime({
      serviceDate: "2026-11-10",
      clockInAt: "2026-11-10T15:00:00.000Z", // 09:00 AM Chicago
      clockOutAt: null,
      timeZone: TIME_ZONE,
      nowMs: now,
    });
    expect(res.ok).toBe(true);
  });
});

describe("calculateGrossElapsed", () => {
  it("calculates elapsed seconds accurately", () => {
    const seconds = calculateGrossElapsed(
      "2026-11-10T09:00:00.000Z",
      "2026-11-10T17:30:00.000Z",
    );
    expect(seconds).toBe(8.5 * 3600);
  });

  it("returns null for open shift", () => {
    expect(calculateGrossElapsed("2026-11-10T09:00:00.000Z", null)).toBeNull();
  });
});

describe("detectBatchOverlaps", () => {
  it("detects overlaps for the same employee in a batch", () => {
    const entries = [
      {
        rowId: "row-1",
        profileId: VALID_UUID,
        clockInAt: "2026-11-10T09:00:00.000Z",
        clockOutAt: "2026-11-10T15:00:00.000Z",
      },
      {
        rowId: "row-2",
        profileId: VALID_UUID,
        clockInAt: "2026-11-10T14:00:00.000Z", // overlaps row-1 by 1 hr
        clockOutAt: "2026-11-10T20:00:00.000Z",
      },
      {
        rowId: "row-3",
        profileId: OTHER_UUID,
        clockInAt: "2026-11-10T10:00:00.000Z",
        clockOutAt: "2026-11-10T16:00:00.000Z",
      },
    ];
    const errors = detectBatchOverlaps(entries);
    expect(errors.has("row-1")).toBe(true);
    expect(errors.has("row-2")).toBe(true);
    expect(errors.has("row-3")).toBe(false);
  });

  it("permits non-overlapping shifts for the same employee on the same date", () => {
    const entries = [
      {
        rowId: "row-1",
        profileId: VALID_UUID,
        clockInAt: "2026-11-10T09:00:00.000Z",
        clockOutAt: "2026-11-10T13:00:00.000Z",
      },
      {
        rowId: "row-2",
        profileId: VALID_UUID,
        clockInAt: "2026-11-10T14:00:00.000Z", // gap of 1 hr
        clockOutAt: "2026-11-10T18:00:00.000Z",
      },
    ];
    const errors = detectBatchOverlaps(entries);
    expect(errors.size).toBe(0);
  });
});
