import { describe, expect, it } from "vitest";

import { resolveTipsPeriod } from "@/features/tips/domain/tips-period";

const range = (
  preset: Parameters<typeof resolveTipsPeriod>[0],
  today: string,
) => {
  const result = resolveTipsPeriod(preset, today);
  if (!result.ok) throw new Error(result.error);
  return [result.period.from, result.period.to];
};

describe("resolveTipsPeriod", () => {
  // 2026-11-18 is a Wednesday.
  it("today and yesterday", () => {
    expect(range("today", "2026-11-18")).toEqual(["2026-11-18", "2026-11-18"]);
    expect(range("yesterday", "2026-11-18")).toEqual([
      "2026-11-17",
      "2026-11-17",
    ]);
    expect(range("yesterday", "2026-03-01")).toEqual([
      "2026-02-28",
      "2026-02-28",
    ]);
  });

  it("this week runs Monday to Sunday", () => {
    expect(range("this-week", "2026-11-18")).toEqual([
      "2026-11-16",
      "2026-11-22",
    ]);
    expect(range("this-week", "2026-11-16")).toEqual([
      "2026-11-16",
      "2026-11-22",
    ]); // Monday
    expect(range("this-week", "2026-11-22")).toEqual([
      "2026-11-16",
      "2026-11-22",
    ]); // Sunday
    expect(range("this-week", "2026-01-01")).toEqual([
      "2025-12-29",
      "2026-01-04",
    ]); // across the year
  });

  it("this month and previous month, including the year boundary and February", () => {
    expect(range("this-month", "2026-11-18")).toEqual([
      "2026-11-01",
      "2026-11-30",
    ]);
    expect(range("previous-month", "2026-11-18")).toEqual([
      "2026-10-01",
      "2026-10-31",
    ]);
    expect(range("previous-month", "2026-01-05")).toEqual([
      "2025-12-01",
      "2025-12-31",
    ]);
    expect(range("previous-month", "2028-03-10")).toEqual([
      "2028-02-01",
      "2028-02-29",
    ]);
  });

  it("labels always carry the year", () => {
    const result = resolveTipsPeriod("previous-month", "2026-11-18");
    expect(result.ok && result.period.label).toBe("October 2026");
  });

  it("custom ranges are validated", () => {
    const ok = resolveTipsPeriod("custom", "2026-11-18", {
      from: "2026-11-01",
      to: "2026-11-10",
    });
    expect(ok.ok && [ok.period.from, ok.period.to]).toEqual([
      "2026-11-01",
      "2026-11-10",
    ]);
    expect(resolveTipsPeriod("custom", "2026-11-18")).toMatchObject({
      ok: false,
    });
    expect(
      resolveTipsPeriod("custom", "2026-11-18", {
        from: "2026-11-10",
        to: "2026-11-01",
      }),
    ).toMatchObject({ ok: false });
    expect(
      resolveTipsPeriod("custom", "2026-11-18", {
        from: "2026-02-30",
        to: "2026-03-01",
      }),
    ).toMatchObject({ ok: false });
    expect(
      resolveTipsPeriod("custom", "2026-11-18", {
        from: "2025-01-01",
        to: "2026-11-18",
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects an invalid today", () => {
    expect(resolveTipsPeriod("today", "nope")).toMatchObject({ ok: false });
  });
});
