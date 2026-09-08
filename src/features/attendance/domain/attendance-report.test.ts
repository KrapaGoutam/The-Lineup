import { describe, expect, it } from "vitest";

import {
  aggregateHours,
  buildDisplayLabels,
  resolvePeriodRange,
} from "./attendance-report";

describe("resolvePeriodRange", () => {
  it("resolves this-month to the full calendar month containing today", () => {
    expect(resolvePeriodRange({ type: "this-month" }, "2026-09-15")).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
  });

  it("resolves previous-month to the prior calendar month", () => {
    expect(
      resolvePeriodRange({ type: "previous-month" }, "2026-09-15"),
    ).toEqual({ start: "2026-08-01", end: "2026-08-31" });
  });

  it("rolls a January previous-month back to December of the prior year", () => {
    expect(
      resolvePeriodRange({ type: "previous-month" }, "2026-01-10"),
    ).toEqual({ start: "2025-12-01", end: "2025-12-31" });
  });

  it("handles February's day count, including a leap year", () => {
    expect(resolvePeriodRange({ type: "this-month" }, "2028-02-05")).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
    expect(resolvePeriodRange({ type: "this-month" }, "2026-02-05")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });

  it("passes a custom range through unchanged", () => {
    expect(
      resolvePeriodRange(
        { type: "custom", start: "2026-03-05", end: "2026-04-12" },
        "2026-09-15",
      ),
    ).toEqual({ start: "2026-03-05", end: "2026-04-12" });
  });

  // Feature 025: the month/year navigator's own selection -- independent
  // of todayLocalDate entirely, which is the whole point of being able to
  // browse to an arbitrary past month, not just "this" or "previous".
  it("resolves an explicit month/year selection, ignoring todayLocalDate", () => {
    expect(
      resolvePeriodRange({ type: "month", year: 2025, month: 3 }, "2026-09-15"),
    ).toEqual({ start: "2025-03-01", end: "2025-03-31" });
  });

  it("handles a leap-year February via the month type", () => {
    expect(
      resolvePeriodRange({ type: "month", year: 2028, month: 2 }, "2026-09-15"),
    ).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(
      resolvePeriodRange({ type: "month", year: 2026, month: 2 }, "2026-09-15"),
    ).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("resolves December via the month type without rolling into next year", () => {
    expect(
      resolvePeriodRange(
        { type: "month", year: 2025, month: 12 },
        "2026-09-15",
      ),
    ).toEqual({ start: "2025-12-01", end: "2025-12-31" });
  });

  // Same intent as the existing "rolls a January previous-month back"
  // test above, but exercised via the direct month type instead --
  // proves resolvePeriodRange's shared monthRange helper handles the
  // month-type caller identically to previous-month's own rollback.
  it("resolves January directly via the month type", () => {
    expect(
      resolvePeriodRange({ type: "month", year: 2026, month: 1 }, "2026-09-15"),
    ).toEqual({ start: "2026-01-01", end: "2026-01-31" });
  });
});

describe("buildDisplayLabels", () => {
  it("labels a unique name with just the role", () => {
    const labels = buildDisplayLabels([
      { id: 1, fullName: "Mia Chen", role: "Server" },
    ]);
    expect(labels.get(1)).toBe("Mia Chen (Server)");
  });

  it("disambiguates two same-named people by their (different) roles", () => {
    const labels = buildDisplayLabels([
      { id: 1, fullName: "Anil", role: "Server" },
      { id: 2, fullName: "Anil", role: "Host" },
    ]);
    expect(labels.get(1)).toBe("Anil (Server)");
    expect(labels.get(2)).toBe("Anil (Host)");
  });

  it("falls back to an id suffix only when name AND role both collide", () => {
    const labels = buildDisplayLabels([
      { id: 11, fullName: "Anil", role: "Server" },
      { id: 12, fullName: "Anil", role: "Server" },
    ]);
    expect(labels.get(11)).toBe("Anil (Server) #11");
    expect(labels.get(12)).toBe("Anil (Server) #12");
    // Never confusable, even though the base label is identical.
    expect(labels.get(11)).not.toBe(labels.get(12));
  });

  it("displays a messy free-text role verbatim (trimmed, never corrected)", () => {
    const labels = buildDisplayLabels([
      { id: 1, fullName: "Tanya", role: "  server " },
    ]);
    expect(labels.get(1)).toBe("Tanya (server)");
  });

  it("falls back to just the name when role is empty", () => {
    const labels = buildDisplayLabels([
      { id: 1, fullName: "Conan", role: "   " },
    ]);
    expect(labels.get(1)).toBe("Conan");
  });
});

describe("aggregateHours", () => {
  it("sums normal rows exactly, with zero exclusions", () => {
    expect(
      aggregateHours([
        { hoursWorked: 4 },
        { hoursWorked: 3.5 },
        { hoursWorked: 8 },
      ]),
    ).toEqual({ totalHours: 15.5, excludedRowCount: 0 });
  });

  it("excludes a null hours_worked row from the total but counts it", () => {
    expect(aggregateHours([{ hoursWorked: 4 }, { hoursWorked: null }])).toEqual(
      { totalHours: 4, excludedRowCount: 1 },
    );
  });

  it("never breaks on an all-null row set", () => {
    expect(
      aggregateHours([{ hoursWorked: null }, { hoursWorked: null }]),
    ).toEqual({ totalHours: 0, excludedRowCount: 2 });
  });

  it("returns zero for an empty row set", () => {
    expect(aggregateHours([])).toEqual({ totalHours: 0, excludedRowCount: 0 });
  });
});
