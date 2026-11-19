import { describe, expect, it } from "vitest";

import { buildReportingHref, parseReportingSearchParams } from "./report-links";

describe("reporting links", () => {
  it("round-trips filters", () => {
    const href = buildReportingHref({
      view: "attendance",
      organizationIds: ["org-1"],
      locationIds: ["loc-1", "loc-2"],
      employeeKeys: ["profile:abc"],
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });
    expect(href.startsWith("/reporting?")).toBe(true);
    const parsed = parseReportingSearchParams(
      Object.fromEntries(new URL(`http://x${href}`).searchParams),
    );
    expect(parsed).toEqual({
      view: "attendance",
      organizationIds: ["org-1"],
      locationIds: ["loc-1", "loc-2"],
      employeeKeys: ["profile:abc"],
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });
  });

  it("an empty link is the bare route", () => {
    expect(buildReportingHref()).toBe("/reporting");
    expect(buildReportingHref({ view: "combined" })).toBe("/reporting");
  });

  it("drops malformed dates, ids and unknown views instead of trusting them", () => {
    const parsed = parseReportingSearchParams({
      view: "admin",
      org: "ok-1,<script>,x y",
      from: "2026-13",
      to: "yesterday",
      employee: "profile:ok,../../etc",
    });
    expect(parsed.view).toBeUndefined();
    expect(parsed.organizationIds).toEqual(["ok-1"]);
    expect(parsed.startDate).toBeUndefined();
    expect(parsed.endDate).toBeUndefined();
    expect(parsed.employeeKeys).toEqual(["profile:ok"]);
  });

  it("bounds the number of ids taken from a link", () => {
    const many = Array.from({ length: 500 }, (_, i) => `id${i}`).join(",");
    expect(
      parseReportingSearchParams({ location: many }).locationIds,
    ).toHaveLength(50);
  });

  it("builds nothing from a malformed date", () => {
    expect(buildReportingHref({ startDate: "bad" })).toBe("/reporting");
  });
});
