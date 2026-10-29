import { describe, expect, it } from "vitest";
import {
  addCalendarMonths,
  businessDate,
  dateSummary,
  displayInventoryDate,
  expirationStatus,
  manufactureStatus,
  parseInventoryDate,
  type DateLot,
  type FreshnessRule,
} from "./freshness";
const rule: FreshnessRule = {
  id: "r",
  subcategoryId: "s",
  trackingEnabled: true,
  maximumMonths: 9,
  warningMonths: 1,
  active: true,
  version: 1,
  updatedAt: "",
  updatedByName: null,
};
const parse = (v: string, kind: "manufacture" | "expiration" = "expiration") =>
  parseInventoryDate(v, kind);
const lot = (
  id: string,
  expiration: string,
  quantity: number | null = 1,
): DateLot => ({
  id,
  productId: "p",
  expiration: parse(expiration),
  manufacture: parse("01/26", "manufacture"),
  quantity,
  notes: null,
  active: true,
  version: 1,
  updatedAt: "",
  updatedByName: null,
});
describe("calendar date parsing", () => {
  it("keeps an explicit four-digit century through display and edit", () => {
    for (const value of ["12/1999", "01/15/1998", "02/2100"]) {
      const date = parse(value, "manufacture");
      expect(parse(displayInventoryDate(date), "manufacture")).toEqual(date);
    }
    expect(parse("02/1900")?.date).toBe("1900-02-28");
    expect(parse("02/2000")?.date).toBe("2000-02-29");
  });
  it.each([
    ["10/29/26", "2026-10-29", "day"],
    ["10/29/2026", "2026-10-29", "day"],
    ["11/26", "2026-11-30", "month"],
    ["11/2026", "2026-11-30", "month"],
    ["02/24", "2024-02-29", "month"],
    ["02/25", "2025-02-28", "month"],
  ])("normalizes %s preserving precision", (input, date, precision) =>
    expect(parse(input)).toEqual({ date, precision }),
  );
  it.each([
    "02/29/25",
    "04/31/26",
    "00/26",
    "13/26",
    "1/0/26",
    "2026-01-01",
    "abc",
    "01/10000",
  ])("rejects %s", (input) => expect(() => parse(input)).toThrow());
  it("preserves month display and uses beginning of manufacture month", () => {
    expect(parse("03/26", "manufacture")?.date).toBe("2026-03-01");
    expect(displayInventoryDate(parse("11/2026"))).toBe("11/26");
    expect(displayInventoryDate(parse("10/29/26"))).toBe("10/29/26");
    expect(parse(" ")).toBeNull();
  });
  it("uses business zone at UTC rollover and DST boundaries", () => {
    expect(
      businessDate(new Date("2026-10-29T02:00:00Z"), "America/Chicago"),
    ).toBe("2026-10-28");
    expect(
      businessDate(new Date("2026-03-08T07:59:00Z"), "America/Chicago"),
    ).toBe("2026-03-08");
  });
  it("clamps calendar months across leap years and year end", () => {
    expect(addCalendarMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addCalendarMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(addCalendarMonths("2026-12-31", 1)).toBe("2027-01-31");
  });
});
describe("expiration thresholds", () => {
  it.each([
    [31, "normal"],
    [30, "soon"],
    [16, "soon"],
    [15, "warning"],
    [8, "warning"],
    [7, "urgent"],
    [1, "urgent"],
    [0, "today"],
    [-1, "expired"],
  ] as const)("%i days is %s", (days, status) => {
    const date = new Date(Date.UTC(2026, 9, 28 + days))
      .toISOString()
      .slice(0, 10);
    expect(
      expirationStatus({ date, precision: "day" }, "2026-10-28"),
    ).toMatchObject({ days, status });
  });
  it("month expiration remains valid through the last day", () => {
    expect(expirationStatus(parse("02/24"), "2024-02-28").days).toBe(1);
    expect(expirationStatus(parse("02/24"), "2024-02-29").status).toBe("today");
    expect(expirationStatus(parse("02/24"), "2024-03-01").status).toBe(
      "expired",
    );
  });
});
describe("manufacture freshness and coverage", () => {
  it.each([
    ["2026-08-31", "fresh"],
    ["2026-09-01", "aging"],
    ["2026-09-30", "aging"],
    ["2026-10-01", "limit"],
  ] as const)("%s is %s", (today, status) =>
    expect(manufactureStatus(parse("01/26", "manufacture"), rule, today)).toBe(
      status,
    ),
  );
  it("distinguishes absent dates/rules and disabled tracking", () => {
    expect(manufactureStatus(null, rule, "2026-10-28")).toBe("missing");
    expect(
      manufactureStatus(parse("01/26", "manufacture"), null, "2026-10-28"),
    ).toBe("no_rule");
    expect(
      manufactureStatus(
        parse("01/26", "manufacture"),
        { ...rule, trackingEnabled: false },
        "2026-10-28",
      ),
    ).toBe("no_rule");
  });
  it("chooses nearest expiration, sums known quantities and excludes archived groups", () => {
    const summary = dateSummary(
      [
        lot("a", "12/26", 12),
        lot("b", "10/29/26", 1),
        { ...lot("c", "01/26", 100), active: false },
        lot("d", "11/26", 5),
        lot("e", "12/26", null),
      ],
      rule,
      "2026-10-28",
      24,
    );
    expect(summary.nearest?.id).toBe("b");
    expect(summary.datedQuantity).toBe(18);
    expect(summary.withoutDate).toBe(6);
    expect(summary.unknownQuantity).toBe(1);
    expect(summary.manufacture).toBe("limit");
  });
  it("reports overcoverage without changing stock; archived products do not alert", () => {
    expect(
      dateSummary([lot("a", "10/26", 25)], null, "2026-10-28", 20).excess,
    ).toBe(5);
    expect(
      dateSummary([lot("a", "10/26", 25)], rule, "2026-10-28", 20, true).lots,
    ).toEqual([]);
  });
});
