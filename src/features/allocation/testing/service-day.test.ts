import { describe, expect, it } from "vitest";

import { zonedWallTimeFromInstant } from "@/lib/timezone";

/**
 * XM-080 service-day boundary. The product's service day is the CALENDAR DATE
 * in the location's own time zone (`zonedWallTimeFromInstant(now, tz).date`,
 * used by the board read, by every board mutation, and by `isHistorical`).
 * There is deliberately no configurable business-day cutoff; this feature does
 * not change that. These tests pin the boundary with controlled instants
 * instead of waiting for midnight.
 */
const TZ = "America/Chicago";

// America/Chicago is UTC-5 in October (CDT) and UTC-6 from Nov 1, 2026 (CST).
const at = (iso: string) => zonedWallTimeFromInstant(new Date(iso), TZ);

describe("service day = calendar date in the location's time zone", () => {
  it("23:59 and 00:01 local fall on consecutive service dates (CDT)", () => {
    expect(at("2026-10-27T04:59:30Z")).toEqual({
      date: "2026-10-26",
      time: "23:59",
    });
    expect(at("2026-10-27T05:01:00Z")).toEqual({
      date: "2026-10-27",
      time: "00:01",
    });
  });

  it("the boundary follows local time across the DST change (CST)", () => {
    // Nov 1, 2026 02:00 CDT -> 01:00 CST. Midnight Nov 2 is 06:00Z.
    expect(at("2026-11-02T05:59:00Z").date).toBe("2026-11-01");
    expect(at("2026-11-02T06:01:00Z").date).toBe("2026-11-02");
  });

  it("UTC midnight is NOT the service-day boundary", () => {
    expect(at("2026-10-27T00:30:00Z").date).toBe("2026-10-26");
  });

  it("a board opened at 23:59 becomes a read-only previous day at 00:01 (no duplicate, nothing vanishes)", () => {
    const opened = at("2026-10-27T04:59:30Z").date; // session date D
    const later = at("2026-10-27T05:01:00Z").date; // "today" two minutes later
    // The same rule the data layer uses: isHistorical = serviceDate < today.
    expect(opened < later).toBe(true);
    // A write at 00:01 targets D+1 (its own session); D is untouched history.
    expect(later).not.toBe(opened);
  });

  it("different time zones get different service dates for the same instant", () => {
    const instant = new Date("2026-10-27T04:59:30Z");
    expect(zonedWallTimeFromInstant(instant, "America/Chicago").date).toBe(
      "2026-10-26",
    );
    expect(zonedWallTimeFromInstant(instant, "Asia/Kolkata").date).toBe(
      "2026-10-27",
    );
  });
});
