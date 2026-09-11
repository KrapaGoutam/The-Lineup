import { describe, expect, it } from "vitest";

import {
  formatBusinessDate,
  formatBusinessDateTime,
  formatBusinessTime,
} from "./date-time";

// Regression coverage for the actual reported bug: an 11:06 AM clock-in
// displaying as 6:06 AM (a 5-hour offset) once this formatting reaches a
// viewer whose own environment isn't America/Chicago. Both a summer (CDT,
// UTC-5) and a winter (CST, UTC-6) instant are covered deliberately --
// asserting only one offset would let a hardcoded "-5 hours" fix pass
// these tests while still being wrong for half the year.
describe("formatBusinessTime", () => {
  it("renders a summer (CDT, UTC-5) instant as its correct Chicago wall-clock time", () => {
    // 2026-07-15T16:06:00Z is 11:06 AM in America/Chicago during CDT.
    expect(
      formatBusinessTime("2026-07-15T16:06:00.000Z", "America/Chicago"),
    ).toBe("11:06 AM");
  });

  it("renders a winter (CST, UTC-6) instant as its correct Chicago wall-clock time", () => {
    // 2026-01-15T17:06:00Z is 11:06 AM in America/Chicago during CST --
    // the same wall-clock reading as the CDT case above, from a UTC
    // instant one hour later, proving the offset isn't hardcoded.
    expect(
      formatBusinessTime("2026-01-15T17:06:00.000Z", "America/Chicago"),
    ).toBe("11:06 AM");
  });

  it("never falls back to a bare UTC/offset reading of the same instant", () => {
    // The exact bug this module exists to fix: naively formatting
    // 16:06 UTC without an explicit business timeZone would show
    // "4:06 PM" (UTC) or some other viewer-local reading -- never the
    // correct 11:06 AM Chicago time.
    const formatted = formatBusinessTime(
      "2026-07-15T16:06:00.000Z",
      "America/Chicago",
    );
    expect(formatted).not.toBe("4:06 PM");
    expect(formatted).toBe("11:06 AM");
  });

  it("formats midnight and noon boundaries correctly", () => {
    expect(
      formatBusinessTime("2026-07-15T05:00:00.000Z", "America/Chicago"),
    ).toBe("12:00 AM");
    expect(
      formatBusinessTime("2026-07-15T17:00:00.000Z", "America/Chicago"),
    ).toBe("12:00 PM");
  });

  it("respects a different explicit timezone, not just America/Chicago", () => {
    expect(formatBusinessTime("2026-07-15T16:06:00.000Z", "UTC")).toBe(
      "4:06 PM",
    );
  });
});

describe("formatBusinessDate", () => {
  it("renders the correct calendar date for the business timezone, including near a UTC day boundary", () => {
    // 2026-07-16T02:00:00Z is still 2026-07-15 (9:00 PM) in Chicago --
    // a naive UTC-date read would report the 16th instead.
    expect(
      formatBusinessDate("2026-07-16T02:00:00.000Z", "America/Chicago"),
    ).toBe("Jul 15, 2026");
  });
});

describe("formatBusinessDateTime", () => {
  it("combines the date and time in the business timezone", () => {
    expect(
      formatBusinessDateTime("2026-07-15T16:06:00.000Z", "America/Chicago"),
    ).toBe("Jul 15, 2026, 11:06 AM");
  });
});
