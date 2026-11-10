import { describe, expect, it } from "vitest";
import {
  computeServiceDate,
  isTimestampSane,
  validateClockTransition,
} from "./clock-integrity";

describe("clock-integrity domain rules", () => {
  describe("validateClockTransition", () => {
    it("allows clock_in when no session is active or status is completed", () => {
      expect(validateClockTransition("clock_in", null).allowed).toBe(true);
      expect(validateClockTransition("clock_in", "completed").allowed).toBe(
        true,
      );
      expect(
        validateClockTransition("clock_in", "auto_clocked_out").allowed,
      ).toBe(true);
    });

    it("rejects duplicate clock_in when already active or on_break", () => {
      const activeRes = validateClockTransition("clock_in", "active");
      expect(activeRes.allowed).toBe(false);
      expect(activeRes.reason).toContain("already has an open");

      const breakRes = validateClockTransition("clock_in", "on_break");
      expect(breakRes.allowed).toBe(false);
    });

    it("allows clock_out when active or on_break", () => {
      expect(validateClockTransition("clock_out", "active").allowed).toBe(true);
      expect(validateClockTransition("clock_out", "on_break").allowed).toBe(
        true,
      );
    });

    it("rejects clock_out when no session is open", () => {
      const res = validateClockTransition("clock_out", null);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("No active attendance session found");

      expect(validateClockTransition("clock_out", "completed").allowed).toBe(
        false,
      );
    });

    it("allows break_start only when active", () => {
      expect(validateClockTransition("break_start", "active").allowed).toBe(
        true,
      );
      expect(validateClockTransition("break_start", "on_break").allowed).toBe(
        false,
      );
      expect(validateClockTransition("break_start", null).allowed).toBe(false);
    });

    it("allows break_end only when on_break", () => {
      expect(validateClockTransition("break_end", "on_break").allowed).toBe(
        true,
      );
      expect(validateClockTransition("break_end", "active").allowed).toBe(
        false,
      );
      expect(validateClockTransition("break_end", null).allowed).toBe(false);
    });
  });

  describe("computeServiceDate in timezone", () => {
    it("computes the correct calendar date in location timezone", () => {
      // 2026-11-09 18:00 UTC = 12:00 PM CST (same day in Chicago)
      const middayUtc = new Date("2026-11-09T18:00:00Z");
      expect(computeServiceDate(middayUtc, "America/Chicago")).toBe(
        "2026-11-09",
      );

      // 2026-11-10 03:00 UTC = 9:00 PM CST Nov 9 (still Nov 9 in Chicago)
      const eveningUtc = new Date("2026-11-10T03:00:00Z");
      expect(computeServiceDate(eveningUtc, "America/Chicago")).toBe(
        "2026-11-09",
      );
    });
  });

  describe("isTimestampSane", () => {
    it("accepts past or present timestamps", () => {
      const now = new Date("2026-11-09T20:00:00Z");
      const past = new Date("2026-11-09T19:59:00Z");
      expect(isTimestampSane(past, now)).toBe(true);
      expect(isTimestampSane(now, now)).toBe(true);
    });

    it("accepts timestamps within 60s tolerance for clock skew", () => {
      const now = new Date("2026-11-09T20:00:00Z");
      const slightFuture = new Date("2026-11-09T20:00:45Z");
      expect(isTimestampSane(slightFuture, now)).toBe(true);
    });

    it("rejects timestamps too far in the future", () => {
      const now = new Date("2026-11-09T20:00:00Z");
      const distantFuture = new Date("2026-11-09T20:05:00Z");
      expect(isTimestampSane(distantFuture, now)).toBe(false);
    });
  });
});
