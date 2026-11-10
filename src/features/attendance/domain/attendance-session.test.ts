import { describe, expect, it } from "vitest";
import {
  computeSessionDurationSeconds,
  formatWorkedDuration,
  formatWorkedHours,
} from "./attendance-session";

describe("attendance-session domain helpers", () => {
  it("calculates session duration in seconds minus break seconds", () => {
    const clockIn = new Date("2026-11-09T14:00:00Z");
    const clockOut = new Date("2026-11-09T22:30:00Z"); // 8.5 hours = 30600s
    const totalBreakSeconds = 1800; // 30 mins

    const workedSeconds = computeSessionDurationSeconds(
      clockIn,
      clockOut,
      totalBreakSeconds,
    );
    expect(workedSeconds).toBe(30600 - 1800); // 28800s = 8 hours
  });

  it("handles overnight shifts across midnight in UTC", () => {
    const clockIn = new Date("2026-11-09T23:30:00Z");
    const clockOut = new Date("2026-11-10T04:30:00Z"); // 5 hours = 18000s
    const workedSeconds = computeSessionDurationSeconds(clockIn, clockOut, 0);
    expect(workedSeconds).toBe(18000);
  });

  it("returns 0 if clock-out is before clock-in or invalid", () => {
    const clockIn = new Date("2026-11-09T14:00:00Z");
    const clockOut = new Date("2026-11-09T12:00:00Z");
    expect(computeSessionDurationSeconds(clockIn, clockOut, 0)).toBe(0);
    expect(computeSessionDurationSeconds("invalid", clockOut, 0)).toBe(0);
  });

  it("formats worked hours as decimal strings", () => {
    expect(formatWorkedHours(0)).toBe("0.00");
    expect(formatWorkedHours(null)).toBe("0.00");
    expect(formatWorkedHours(18000)).toBe("5.00");
    expect(formatWorkedHours(27000)).toBe("7.50"); // 7.5 hours
  });

  it("formats worked duration into human-readable strings", () => {
    expect(formatWorkedDuration(0)).toBe("0m");
    expect(formatWorkedDuration(null)).toBe("0m");
    expect(formatWorkedDuration(1800)).toBe("30m");
    expect(formatWorkedDuration(3600)).toBe("1h");
    expect(formatWorkedDuration(5400)).toBe("1h 30m");
    expect(formatWorkedDuration(28800)).toBe("8h");
  });
});
