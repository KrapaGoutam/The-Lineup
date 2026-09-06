import { describe, expect, it } from "vitest";

import { nextPublishedVersion } from "./schedule-versioning";

describe("nextPublishedVersion", () => {
  it("returns 1 for a location/year that has never been published", () => {
    // A brand-new draft row, never published: only its own default 0
    // exists yet.
    expect(nextPublishedVersion([0])).toBe(1);
  });

  it("returns 1 when there are no periods at all yet", () => {
    expect(nextPublishedVersion([])).toBe(1);
  });

  it("publishing the same period twice does not repeat a version", () => {
    // First publish: only the original draft (0) exists -> version 1.
    const firstPublish = nextPublishedVersion([0]);
    expect(firstPublish).toBe(1);

    // Shifts get added again after that publish -- getOrCreateDraftPeriod
    // forks a brand-new draft row (also starting at 0), alongside the
    // now-published row (which is at 1). The next publish must see both.
    const secondPublish = nextPublishedVersion([0, firstPublish]);
    expect(secondPublish).toBe(2);
    expect(secondPublish).not.toBe(firstPublish);
  });

  it("keeps advancing across further publish cycles", () => {
    let versions = [0];
    for (const expected of [1, 2, 3, 4]) {
      const next = nextPublishedVersion(versions);
      expect(next).toBe(expected);
      versions = [...versions, next];
    }
  });

  it("is unaffected by input order", () => {
    expect(nextPublishedVersion([3, 0, 1, 2])).toBe(4);
  });
});
