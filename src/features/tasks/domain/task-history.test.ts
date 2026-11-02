import { describe, expect, it } from "vitest";

import {
  DEFAULT_HISTORY_FILTERS,
  activeFilterCount,
  assignedToLabel,
  availableMonths,
  demoHistoryEntries,
  filterHistory,
  formatAssignedStamp,
  formatHistoryStamp,
  groupByMonth,
  hasActiveFilters,
  historyTypeLabel,
  presetRange,
  type HistoryFilters,
  type TaskHistoryEntry,
} from "./task-history";

const TZ = "America/Chicago";
const ann = { profileId: "ann", name: "Ann" };
const bea = { profileId: "bea", name: "Bea" };
const mona = { profileId: "mona", name: "Mona" };

function entry(
  id: string,
  completedAt: string,
  overrides: Partial<TaskHistoryEntry> = {},
): TaskHistoryEntry {
  return {
    id,
    title: `Task ${id}`,
    kind: "task",
    assignmentMode: "individual",
    assignees: [ann],
    completedBy: ann,
    completedAt,
    assignedAt: null,
    ...overrides,
  };
}

const ENTRIES = [
  entry("a", "2026-09-30T20:00:00Z", { title: "Polish bar" }),
  entry("b", "2026-11-02T03:42:00Z", {
    title: "Restock tequila shelf",
    kind: "closing",
    assignees: [bea],
    completedBy: mona,
  }),
  entry("c", "2026-10-15T18:00:00Z", { title: "Clean espresso station" }),
  entry("d", "2026-11-01T15:00:00Z", {
    title: "Open patio",
    kind: "opening",
    assignees: [],
    assignmentMode: "all_team",
  }),
];
const CTX = { today: "2026-11-02", timeZone: TZ };
const f = (over: Partial<HistoryFilters> = {}): HistoryFilters => ({
  ...DEFAULT_HISTORY_FILTERS,
  ...over,
});

describe("filterHistory ordering", () => {
  it("is newest completion first by default, oldest on request", () => {
    expect(filterHistory(ENTRIES, f(), CTX).map((e) => e.id)).toEqual([
      "b",
      "d",
      "c",
      "a",
    ]);
    expect(
      filterHistory(ENTRIES, f({ sort: "oldest" }), CTX).map((e) => e.id),
    ).toEqual(["a", "c", "d", "b"]);
  });

  it("does not mutate its input", () => {
    const copy = [...ENTRIES];
    filterHistory(ENTRIES, f(), CTX);
    expect(ENTRIES).toEqual(copy);
  });
});

describe("groupByMonth", () => {
  it("groups by location-local completion month, newest month first", () => {
    const groups = groupByMonth(filterHistory(ENTRIES, f(), CTX), TZ);
    expect(groups.map((g) => [g.key, g.label])).toEqual([
      // 2026-11-02T03:42Z is still Nov 1 evening in Chicago (CST after DST).
      ["2026-11", "November 2026"],
      ["2026-10", "October 2026"],
      ["2026-09", "September 2026"],
    ]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["b", "d"]);
  });

  it("uses the restaurant time zone, not UTC, for month boundaries", () => {
    // 2026-11-01T03:30Z is Oct 31 10:30 PM in Chicago (CDT).
    const lateOctober = entry("x", "2026-11-01T03:30:00Z");
    expect(groupByMonth([lateOctober], TZ)[0].key).toBe("2026-10");
    expect(groupByMonth([lateOctober], "UTC")[0].key).toBe("2026-11");
  });

  it("follows the entry order, so oldest-first lists the oldest month first", () => {
    const groups = groupByMonth(
      filterHistory(ENTRIES, f({ sort: "oldest" }), CTX),
      TZ,
    );
    expect(groups.map((g) => g.key)).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("lists available months newest first", () => {
    expect(availableMonths(ENTRIES, TZ).map((m) => m.key)).toEqual([
      "2026-11",
      "2026-10",
      "2026-09",
    ]);
  });
});

describe("filterHistory filters", () => {
  const ids = (over: Partial<HistoryFilters>) =>
    filterHistory(ENTRIES, f(over), CTX).map((e) => e.id);

  it("searches the title (case-insensitive)", () => {
    expect(ids({ search: "TEQUILA" })).toEqual(["b"]);
    expect(ids({ search: "  espresso " })).toEqual(["c"]);
  });

  it("also finds people by name", () => {
    expect(ids({ search: "mona" })).toEqual(["b"]);
  });

  it("filters by assigned-to and completed-by independently", () => {
    expect(ids({ assignedTo: "bea" })).toEqual(["b"]);
    expect(ids({ completedBy: "mona" })).toEqual(["b"]);
    expect(ids({ assignedTo: "bea", completedBy: "ann" })).toEqual([]);
  });

  it("filters by task type", () => {
    expect(ids({ type: "closing" })).toEqual(["b"]);
    expect(ids({ type: "opening" })).toEqual(["d"]);
    expect(ids({ type: "task" })).toEqual(["c", "a"]);
  });

  it("filters by month", () => {
    expect(ids({ month: "2026-10" })).toEqual(["c"]);
  });

  it("filters by date presets in local days", () => {
    // Today (Nov 2) has nothing: "b" finished Nov 1 at 10:42 PM local.
    expect(ids({ datePreset: "today" })).toEqual([]);
    expect(ids({ datePreset: "yesterday" })).toEqual(["b", "d"]);
    expect(ids({ datePreset: "last7" })).toEqual(["b", "d"]);
    expect(ids({ datePreset: "last30" })).toEqual(["b", "d", "c"]);
    expect(ids({ datePreset: "thisMonth" })).toEqual(["b", "d"]);
  });

  it("filters by an inclusive custom range, open on either side", () => {
    expect(
      ids({ datePreset: "custom", from: "2026-10-15", to: "2026-11-01" }),
    ).toEqual(["b", "d", "c"]);
    expect(ids({ datePreset: "custom", from: "2026-11-01" })).toEqual([
      "b",
      "d",
    ]);
    expect(ids({ datePreset: "custom", to: "2026-09-30" })).toEqual(["a"]);
  });

  it("exposes the preset ranges", () => {
    expect(presetRange("all", "2026-11-02", { from: "", to: "" })).toBeNull();
    expect(presetRange("last7", "2026-11-02", { from: "", to: "" })).toEqual({
      from: "2026-10-27",
      to: "2026-11-02",
    });
  });
});

describe("filter state helpers", () => {
  it("counts only narrowing filters, not search or sort", () => {
    expect(activeFilterCount(f({ search: "x", sort: "oldest" }))).toBe(0);
    expect(hasActiveFilters(f({ search: "x" }))).toBe(true);
    expect(hasActiveFilters(f({ sort: "oldest" }))).toBe(false);
    expect(activeFilterCount(f({ type: "task", month: "2026-10" }))).toBe(2);
  });
});

describe("labels and stamps", () => {
  it("labels the existing task kinds", () => {
    expect(historyTypeLabel("task")).toBe("Regular");
    expect(historyTypeLabel("opening")).toBe("Opening");
    expect(historyTypeLabel("closing")).toBe("Closing");
  });

  it("keeps Assigned To honest for shared work", () => {
    expect(assignedToLabel(ENTRIES[3])).toBe("Whole team");
    expect(assignedToLabel({ assignmentMode: "anyone", assignees: [] })).toBe(
      "Anyone",
    );
    expect(
      assignedToLabel({ assignees: [ann, bea], assignmentMode: "multiple" }),
    ).toBe("Ann, Bea");
  });

  it("formats stamps in the business time zone", () => {
    expect(formatHistoryStamp("2026-11-02T03:42:00Z", TZ)).toBe(
      "Nov 1 · 9:42 PM",
    );
  });

  it("shows only the clock when assigned the same day, else the full stamp", () => {
    expect(
      formatAssignedStamp("2026-11-02T01:10:00Z", "2026-11-02T03:42:00Z", TZ),
    ).toBe("7:10 PM");
    expect(
      formatAssignedStamp("2026-10-30T15:00:00Z", "2026-11-02T03:42:00Z", TZ),
    ).toBe("Oct 30 · 10:00 AM");
    expect(formatAssignedStamp(null, "2026-11-02T03:42:00Z", TZ)).toBe("—");
  });
});

describe("demoHistoryEntries", () => {
  it("keeps completed tasks only and never invents an assigned time", () => {
    const done = {
      id: "t1",
      title: "Done",
      kind: "task" as const,
      assignmentMode: "individual" as const,
      assignees: [ann],
      completedBy: mona,
      completedAt: "2026-10-01T00:00:00Z",
      status: "completed",
    };
    const open = { ...done, id: "t2", status: "open", completedAt: null };
    const out = demoHistoryEntries(
      [done, open],
      [
        { taskId: "t1", type: "created", createdAt: "2026-09-30T00:00:00Z" },
        { taskId: "t1", type: "reassigned", createdAt: "2026-09-30T12:00:00Z" },
        { taskId: "t1", type: "completed", createdAt: "2026-10-01T00:00:00Z" },
      ],
    );
    expect(out).toHaveLength(1);
    expect(out[0].completedBy).toEqual(mona);
    expect(out[0].assignees).toEqual([ann]);
    expect(out[0].assignedAt).toBe("2026-09-30T12:00:00Z");
    expect(demoHistoryEntries([done], [])[0].assignedAt).toBeNull();
  });
});
