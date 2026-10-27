import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  applyFilters,
  describeFilter,
  EMPTY_TABLE_STATE,
  NONE_VALUE,
  parseTableState,
  selectOptions,
  serializeTableState,
  shiftDate,
  sortRows,
  toggleSort,
  type ColumnSpec,
  type FilterValue,
  type TableState,
} from "./table-filters";

type Row = {
  id: number;
  name: string;
  vendor: string | null;
  total: number | null;
  updated: string | null;
};

const rows: Row[] = [
  {
    id: 1,
    name: "Tito's Handmade Vodka",
    vendor: "Faust",
    total: 3,
    updated: "2026-10-26T20:00:00Z",
  },
  {
    id: 2,
    name: "Titos 1.75 L",
    vendor: "Faust",
    total: 0.3,
    updated: "2026-10-20T15:00:00Z",
  },
  {
    id: 3,
    name: "Casamigos Blanco",
    vendor: "Del Papa",
    total: 12,
    updated: "2026-09-01T12:00:00Z",
  },
  { id: 4, name: "Modelo Especial", vendor: null, total: null, updated: null },
  {
    id: 5,
    name: "Bulleit Bourbon",
    vendor: "del papa",
    total: 6,
    updated: "2026-10-27T03:30:00Z",
  },
];

const columns: ColumnSpec<Row>[] = [
  {
    id: "name",
    label: "Name",
    type: "text",
    get: (r) => r.name,
    sortable: true,
    searchable: true,
  },
  {
    id: "vendor",
    label: "Vendor",
    type: "select",
    get: (r) => r.vendor,
    sortable: true,
    searchable: true,
  },
  {
    id: "total",
    label: "Total",
    type: "number",
    get: (r) => r.total,
    sortable: true,
  },
  {
    id: "updated",
    label: "Updated",
    type: "date",
    get: (r) => r.updated,
    sortable: true,
  },
];

// 2026-10-26 22:00 in New York (EDT); 03:30Z Oct 27 is still Oct 26 locally.
const ctx = {
  timeZone: "America/New_York",
  now: new Date("2026-10-27T02:00:00Z"),
};
const ids = (list: Row[]) => list.map((r) => r.id);
const run = (filters: Record<string, FilterValue>, search = "") =>
  ids(applyFilters(rows, columns, { filters, search }, ctx));

describe("text filters (BI-FLT-001)", () => {
  it("contains / starts with / equals, case-insensitive and trimmed", () => {
    expect(
      run({ name: { type: "text", op: "contains", value: " TITO" } }),
    ).toEqual([1, 2]);
    expect(
      run({ name: { type: "text", op: "startsWith", value: "casa" } }),
    ).toEqual([3]);
    expect(
      run({ name: { type: "text", op: "equals", value: "modelo especial" } }),
    ).toEqual([4]);
    expect(
      run({ name: { type: "text", op: "equals", value: "modelo" } }),
    ).toEqual([]);
  });

  it("an empty needle is an inactive filter", () => {
    expect(
      run({ name: { type: "text", op: "contains", value: "  " } }),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("blank cells never match a text filter", () => {
    expect(
      run({ vendor: { type: "text", op: "contains", value: "" } }),
    ).toHaveLength(5);
    expect(
      ids(
        applyFilters(
          rows,
          [{ ...columns[1], type: "text" }],
          {
            filters: { vendor: { type: "text", op: "contains", value: "a" } },
            search: "",
          },
          ctx,
        ),
      ),
    ).not.toContain(4);
  });
});

describe("select filters (BI-FLT-002)", () => {
  it("any-of within a column, exact match on the stored text", () => {
    expect(run({ vendor: { type: "select", values: ["Faust"] } })).toEqual([
      1, 2,
    ]);
    expect(
      run({ vendor: { type: "select", values: ["Faust", "Del Papa"] } }),
    ).toEqual([1, 2, 3]);
  });

  it("(none) selects blank cells", () => {
    expect(run({ vendor: { type: "select", values: [NONE_VALUE] } })).toEqual([
      4,
    ]);
    expect(
      run({ vendor: { type: "select", values: [NONE_VALUE, "Faust"] } }),
    ).toEqual([1, 2, 4]);
  });

  it("builds options with counts, sorted, (none) last", () => {
    expect(selectOptions(rows, columns[1])).toEqual([
      { value: "Del Papa", label: "Del Papa", count: 1 },
      { value: "del papa", label: "del papa", count: 1 },
      { value: "Faust", label: "Faust", count: 2 },
      { value: NONE_VALUE, label: "(none)", count: 1 },
    ]);
  });
});

describe("numeric filters (BI-FLT-003)", () => {
  const num = (op: "eq" | "lt" | "lte" | "gt" | "gte", value: number) =>
    run({ total: { type: "number", op, value } });

  it("= < <= > >= with exact decimals", () => {
    expect(num("eq", 3)).toEqual([1]);
    expect(num("eq", 0.3)).toEqual([2]);
    expect(num("lt", 3)).toEqual([2]);
    expect(num("lte", 3)).toEqual([1, 2]);
    expect(num("gt", 6)).toEqual([3]);
    expect(num("gte", 6)).toEqual([3, 5]);
  });

  it("between is inclusive and order-insensitive", () => {
    expect(
      run({ total: { type: "number", op: "between", value: 3, to: 6 } }),
    ).toEqual([1, 5]);
    expect(
      run({ total: { type: "number", op: "between", value: 6, to: 3 } }),
    ).toEqual([1, 5]);
  });

  it("blank cells are excluded from every numeric operator", () => {
    for (const op of ["eq", "lt", "lte", "gt", "gte"] as const) {
      expect(num(op, 0)).not.toContain(4);
    }
    expect(
      run({ total: { type: "number", op: "lte", value: 1000 } }),
    ).not.toContain(4);
  });

  it("a NaN value is an inactive filter", () => {
    expect(
      run({ total: { type: "number", op: "eq", value: Number.NaN } }),
    ).toHaveLength(5);
  });
});

describe("date filters in the location time zone (BI-FLT-004)", () => {
  it("Today uses the local calendar day, not UTC", () => {
    // 03:30Z on Oct 27 is 23:30 on Oct 26 in New York; 'now' is also Oct 26 local.
    expect(run({ updated: { type: "date", preset: "today" } })).toEqual([1, 5]);
  });

  it("Last 7 / 30 days are inclusive of today", () => {
    expect(run({ updated: { type: "date", preset: "7d" } })).toEqual([1, 2, 5]);
    expect(run({ updated: { type: "date", preset: "30d" } })).toEqual([
      1, 2, 5,
    ]);
    // Oct 20 is exactly 6 days before Oct 26: inside the 7-day window
    expect(shiftDate("2026-10-26", -6)).toBe("2026-10-20");
  });

  it("custom ranges are inclusive and may be open-ended", () => {
    expect(
      run({
        updated: {
          type: "date",
          preset: "custom",
          from: "2026-09-01",
          to: "2026-10-20",
        },
      }),
    ).toEqual([2, 3]);
    expect(
      run({ updated: { type: "date", preset: "custom", from: "2026-10-26" } }),
    ).toEqual([1, 5]);
    expect(
      run({ updated: { type: "date", preset: "custom", to: "2026-09-30" } }),
    ).toEqual([3]);
  });

  it("a custom range with no bounds is inactive; blank dates never match", () => {
    expect(run({ updated: { type: "date", preset: "custom" } })).toHaveLength(
      5,
    );
    expect(run({ updated: { type: "date", preset: "30d" } })).not.toContain(4);
  });

  it("handles the DST fall-back day", () => {
    const dst = {
      timeZone: "America/New_York",
      now: new Date("2026-11-01T17:00:00Z"),
    };
    const sample: Row[] = [
      {
        id: 9,
        name: "late",
        vendor: null,
        total: 1,
        updated: "2026-11-02T04:30:00Z",
      },
    ];
    expect(
      applyFilters(
        sample,
        columns,
        { filters: { updated: { type: "date", preset: "today" } }, search: "" },
        dst,
      ),
    ).toHaveLength(1);
  });
});

describe("combination, search, chips (BI-FLT-005/006)", () => {
  it("ANDs across columns and ORs within a select", () => {
    expect(
      run({
        vendor: { type: "select", values: ["Faust"] },
        total: { type: "number", op: "gte", value: 1 },
      }),
    ).toEqual([1]);
  });

  it("global search ANDs with column filters and searches the searchable columns", () => {
    expect(run({}, "faust")).toEqual([1, 2]);
    expect(
      run({ total: { type: "number", op: "lt", value: 1 } }, "faust"),
    ).toEqual([2]);
    expect(run({}, "zzz")).toEqual([]);
  });

  it("counts active filters including the search box", () => {
    const state: TableState = {
      filters: {
        name: { type: "text", op: "contains", value: "x" },
        vendor: { type: "select", values: [] },
      },
      sort: [],
      search: "q",
    };
    expect(activeFilterCount(state)).toBe(2);
    expect(activeFilterCount(EMPTY_TABLE_STATE)).toBe(0);
  });

  it("ignores filters for unknown columns", () => {
    expect(
      run({ ghost: { type: "text", op: "contains", value: "x" } }),
    ).toHaveLength(5);
  });

  it("describes each filter for its chip", () => {
    expect(
      describeFilter("Name", { type: "text", op: "startsWith", value: "ti" }),
    ).toBe("Name starts with “ti”");
    expect(
      describeFilter("Vendor", {
        type: "select",
        values: ["A", "B", "C", "D"],
      }),
    ).toBe("Vendor: A, B, C +1");
    expect(
      describeFilter("Total", { type: "number", op: "lte", value: 5 }),
    ).toBe("Total ≤ 5");
    expect(
      describeFilter("Total", {
        type: "number",
        op: "between",
        value: 2,
        to: 9,
      }),
    ).toBe("Total 2–9");
    expect(describeFilter("Updated", { type: "date", preset: "7d" })).toBe(
      "Updated: Last 7 days",
    );
    expect(
      describeFilter("Vendor", { type: "select", values: [NONE_VALUE] }),
    ).toBe("Vendor: (none)");
  });
});

describe("sorting (BI-FLT-008)", () => {
  it("sorts text naturally and numbers numerically, blanks last in both directions", () => {
    expect(ids(sortRows(rows, columns, [{ id: "total", dir: "asc" }]))).toEqual(
      [2, 1, 5, 3, 4],
    );
    expect(
      ids(sortRows(rows, columns, [{ id: "total", dir: "desc" }])),
    ).toEqual([3, 5, 1, 2, 4]);
    expect(
      ids(sortRows(rows, columns, [{ id: "vendor", dir: "asc" }])),
    ).toEqual([3, 5, 1, 2, 4]);
  });

  it("is stable and supports secondary keys", () => {
    const sorted = sortRows(rows, columns, [
      { id: "vendor", dir: "asc" },
      { id: "total", dir: "desc" },
    ]);
    expect(ids(sorted)).toEqual([3, 5, 1, 2, 4]);
    expect(ids(sortRows(rows, columns, []))).toEqual([1, 2, 3, 4, 5]);
  });

  it("cycles asc -> desc -> off, additive keeps other keys", () => {
    let keys = toggleSort([], "name", false);
    expect(keys).toEqual([{ id: "name", dir: "asc" }]);
    keys = toggleSort(keys, "name", false);
    expect(keys).toEqual([{ id: "name", dir: "desc" }]);
    keys = toggleSort(keys, "name", false);
    expect(keys).toEqual([]);
    keys = toggleSort([{ id: "name", dir: "asc" }], "total", true);
    expect(keys).toEqual([
      { id: "name", dir: "asc" },
      { id: "total", dir: "asc" },
    ]);
  });
});

describe("URL state (BI-FLT-007)", () => {
  const state: TableState = {
    filters: {
      name: { type: "text", op: "contains", value: "titos & co: 100%" },
      vendor: {
        type: "select",
        values: ["Faust", "Del Papa|North", NONE_VALUE],
      },
      total: { type: "number", op: "between", value: 2.5, to: 9 },
      updated: {
        type: "date",
        preset: "custom",
        from: "2026-10-01",
        to: "2026-10-31",
      },
    },
    sort: [
      { id: "total", dir: "asc" },
      { id: "name", dir: "desc" },
    ],
    search: "bar & grill",
  };

  it("round-trips every filter type, the sort and the search", () => {
    const params = new URLSearchParams(serializeTableState(state).toString());
    expect(parseTableState(params, columns)).toEqual(state);
  });

  it("writes nothing for an empty state and skips inactive filters", () => {
    expect(serializeTableState(EMPTY_TABLE_STATE).toString()).toBe("");
    const inert: TableState = {
      filters: { name: { type: "text", op: "contains", value: "" } },
      sort: [],
      search: "  ",
    };
    expect(serializeTableState(inert).toString()).toBe("");
  });

  it("drops unknown columns, type mismatches and malformed values", () => {
    const params = new URLSearchParams({
      "f.ghost": "t:contains:x",
      "f.total": "t:contains:x",
      "f.name": "n:lt:5",
      "f.vendor": "s:",
      "f.updated": "d:custom:nope:also-nope",
      sort: "ghost:asc,name:sideways,total:desc",
    });
    expect(parseTableState(params, columns)).toEqual({
      filters: {},
      sort: [{ id: "total", dir: "desc" }],
      search: "",
    });
  });

  it("survives hostile percent-encoding", () => {
    const params = new URLSearchParams({ "f.name": "t:contains:%E0%A4%A" });
    expect(parseTableState(params, columns).filters).toEqual({});
  });
});
