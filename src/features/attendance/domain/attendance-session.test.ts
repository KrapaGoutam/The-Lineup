import { describe, expect, it } from "vitest";
import {
  computeGrossElapsedSeconds,
  formatWorkedDuration,
  formatWorkedHours,
  summarizeSessionBreakPay,
} from "./attendance-session";

describe("computeGrossElapsedSeconds", () => {
  it("returns elapsed seconds without subtracting any break", () => {
    const clockIn = new Date("2026-11-09T14:00:00Z");
    const clockOut = new Date("2026-11-09T22:30:00Z");
    expect(computeGrossElapsedSeconds(clockIn, clockOut)).toBe(30600);
  });

  it("handles overnight shifts across midnight in UTC", () => {
    expect(
      computeGrossElapsedSeconds(
        "2026-11-09T23:30:00Z",
        "2026-11-10T04:30:00Z",
      ),
    ).toBe(18000);
  });

  it("measures real elapsed time across the US fall-back DST transition", () => {
    // 2026-11-01 05:00Z..09:00Z in America/Chicago: wall clocks show 00:00 CDT -> 03:00 CST
    // (3 wall hours) but 4 real hours elapse.
    expect(
      computeGrossElapsedSeconds(
        "2026-11-01T05:00:00Z",
        "2026-11-01T09:00:00Z",
      ),
    ).toBe(4 * 3600);
  });

  it("measures real elapsed time across the US spring-forward DST transition", () => {
    // 2026-03-08 06:00Z..10:00Z: 00:00 CST -> 05:00 CDT (5 wall hours) but 4 real hours.
    expect(
      computeGrossElapsedSeconds(
        "2026-03-08T06:00:00Z",
        "2026-03-08T10:00:00Z",
      ),
    ).toBe(4 * 3600);
  });

  it("returns null (not zero) for a negative or invalid interval", () => {
    expect(
      computeGrossElapsedSeconds(
        "2026-11-09T14:00:00Z",
        "2026-11-09T12:00:00Z",
      ),
    ).toBeNull();
    expect(
      computeGrossElapsedSeconds("invalid", "2026-11-09T12:00:00Z"),
    ).toBeNull();
  });
});

describe("summarizeSessionBreakPay (policy-neutral break handling)", () => {
  const closed = { status: "completed" as const, grossElapsedSeconds: 28800 };

  it("treats a session with no breaks as resolved: net equals gross", () => {
    const s = summarizeSessionBreakPay({ ...closed, breaks: [] });
    expect(s.breakPolicyResolved).toBe(true);
    expect(s.netPayableSeconds).toBe(28800);
  });

  it("never counts an unclassified break as unpaid: net is null", () => {
    const s = summarizeSessionBreakPay({
      ...closed,
      breaks: [
        {
          durationSeconds: 1800,
          endTime: "2026-11-09T18:30:00Z",
          payClassification: "unclassified",
        },
      ],
    });
    expect(s.unclassifiedBreakSeconds).toBe(1800);
    expect(s.unpaidBreakSeconds).toBe(0);
    expect(s.breakPolicyResolved).toBe(false);
    expect(s.netPayableSeconds).toBeNull();
  });

  it("subtracts only confirmed-unpaid breaks once everything is classified", () => {
    const s = summarizeSessionBreakPay({
      ...closed,
      breaks: [
        {
          durationSeconds: 600,
          endTime: "2026-11-09T16:10:00Z",
          payClassification: "paid",
        },
        {
          durationSeconds: 1800,
          endTime: "2026-11-09T18:30:00Z",
          payClassification: "unpaid",
        },
      ],
    });
    expect(s.paidBreakSeconds).toBe(600);
    expect(s.unpaidBreakSeconds).toBe(1800);
    expect(s.breakPolicyResolved).toBe(true);
    expect(s.netPayableSeconds).toBe(28800 - 1800);
  });

  it("stays unresolved while the session is open or a break is open", () => {
    expect(
      summarizeSessionBreakPay({
        status: "active",
        grossElapsedSeconds: null,
        breaks: [],
      }).netPayableSeconds,
    ).toBeNull();
    expect(
      summarizeSessionBreakPay({
        ...closed,
        breaks: [
          {
            durationSeconds: null,
            endTime: null,
            payClassification: "paid",
          },
        ],
      }).netPayableSeconds,
    ).toBeNull();
  });

  it("never produces a payable figure for a voided session", () => {
    expect(
      summarizeSessionBreakPay({
        status: "voided",
        grossElapsedSeconds: 28800,
        breaks: [],
      }).netPayableSeconds,
    ).toBeNull();
  });
});

describe("attendance formatting", () => {
  it("formats worked hours as decimal strings and unknown as a dash", () => {
    expect(formatWorkedHours(0)).toBe("0.00");
    expect(formatWorkedHours(18000)).toBe("5.00");
    expect(formatWorkedHours(27000)).toBe("7.50");
    expect(formatWorkedHours(null)).toBe("—");
    expect(formatWorkedHours(undefined)).toBe("—");
  });

  it("formats worked duration into human-readable strings and unknown as a dash", () => {
    expect(formatWorkedDuration(0)).toBe("0m");
    expect(formatWorkedDuration(1800)).toBe("30m");
    expect(formatWorkedDuration(3600)).toBe("1h");
    expect(formatWorkedDuration(5400)).toBe("1h 30m");
    expect(formatWorkedDuration(28800)).toBe("8h");
    expect(formatWorkedDuration(null)).toBe("—");
  });
});
