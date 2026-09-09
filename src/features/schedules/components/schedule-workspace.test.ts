import { describe, expect, it } from "vitest";

import {
  monthDayLabel,
  monthLabel,
  weekRangeLabel,
} from "./schedule-workspace";

// Feature 027, real bug found live-testing (see this file's own comment
// where these were made testable): a Date built purely to hand to
// Intl.DateTimeFormat for a month name, without an explicit
// `timeZone: "UTC"`, renders in the *host machine's* own local timezone
// -- on a host west of UTC (this dev machine's own America/Chicago),
// that silently rolled every one of these labels back into the wrong
// month. These tests don't run in any particular timezone themselves,
// but they pin the exact regression date (Sep 1, midnight UTC) that
// reproduced it, so a future change that drops `timeZone: "UTC"` again
// would fail here regardless of what timezone CI or a dev machine
// happens to run in.
describe("monthDayLabel", () => {
  it("labels September correctly, not the host timezone's rolled-back August", () => {
    expect(monthDayLabel("2026-09-01")).toBe("Sep 1");
    expect(monthDayLabel("2026-09-07")).toBe("Sep 7");
  });

  it("labels January correctly, not a rolled-back December", () => {
    expect(monthDayLabel("2026-01-01")).toBe("Jan 1");
  });
});

describe("weekRangeLabel", () => {
  it("labels a week entirely within one month", () => {
    expect(
      weekRangeLabel([
        "2026-09-07",
        "2026-09-08",
        "2026-09-09",
        "2026-09-10",
        "2026-09-11",
        "2026-09-12",
        "2026-09-13",
      ]),
    ).toBe("Sep 7–13");
  });

  it("labels a week crossing a month boundary with both month names", () => {
    expect(
      weekRangeLabel([
        "2026-08-31",
        "2026-09-01",
        "2026-09-02",
        "2026-09-03",
        "2026-09-04",
        "2026-09-05",
        "2026-09-06",
      ]),
    ).toBe("Aug 31–Sep 6");
  });
});

describe("monthLabel", () => {
  it("labels September 2026 correctly, not a rolled-back August", () => {
    expect(monthLabel("2026-09-14")).toBe("September 2026");
  });

  it("labels January correctly, not a rolled-back December of the prior year", () => {
    expect(monthLabel("2026-01-05")).toBe("January 2026");
  });
});
