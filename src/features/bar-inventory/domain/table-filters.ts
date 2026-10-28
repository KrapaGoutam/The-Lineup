import { zonedWallTimeFromInstant } from "@/lib/timezone";

/**
 * The shared filter / sort engine for every Bar Inventory table (owner
 * requirement: a type-appropriate filter for each relevant column). Pure and
 * framework-free: the same functions run in the browser for instant response
 * and (BI-8) on the server to re-execute a filter spec for exports, so a
 * client can never decide which rows an export contains.
 */

export type ColumnType = "text" | "select" | "number" | "date";
export type TextOp = "contains" | "startsWith" | "equals";
export type NumberOp = "eq" | "lt" | "lte" | "gt" | "gte" | "between";
export type DatePreset = "today" | "7d" | "30d" | "custom";

export const TEXT_OPS: TextOp[] = ["contains", "startsWith", "equals"];
export const NUMBER_OPS: NumberOp[] = [
  "eq",
  "lt",
  "lte",
  "gt",
  "gte",
  "between",
];
export const DATE_PRESETS: DatePreset[] = ["today", "7d", "30d", "custom"];

/** The select-filter value that stands for a blank / missing cell. */
export const NONE_VALUE = "__none__";

export type FilterValue =
  | { type: "text"; op: TextOp; value: string }
  | { type: "select"; values: string[] }
  | { type: "number"; op: NumberOp; value: number; to?: number }
  | { type: "date"; preset: DatePreset; from?: string; to?: string };

/** Column id -> its filter. AND across columns, OR within a select. */
export type FilterState = Record<string, FilterValue>;

export type SortKey = { id: string; dir: "asc" | "desc" };

export type TableState = {
  filters: FilterState;
  sort: SortKey[];
  /** Global search; ANDs with (never replaces) the column filters. */
  search: string;
};

export const EMPTY_TABLE_STATE: TableState = {
  filters: {},
  sort: [],
  search: "",
};

export type ColumnSpec<Row> = {
  id: string;
  label: string;
  type: ColumnType;
  /**
   * text / select: string | null; number: number | null;
   * date: ISO instant | null.
   */
  get: (row: Row) => string | number | null;
  sortable?: boolean;
  /** Included in the global search box. */
  searchable?: boolean;
};

export type FilterContext = { timeZone: string; now: Date };

// ---------------------------------------------------------------------
// Activity and matching
// ---------------------------------------------------------------------
export function isFilterActive(filter: FilterValue | undefined): boolean {
  if (!filter) return false;
  switch (filter.type) {
    case "text":
      return filter.value.trim() !== "";
    case "select":
      return filter.values.length > 0;
    case "number":
      return (
        Number.isFinite(filter.value) &&
        (filter.op !== "between" || Number.isFinite(filter.to))
      );
    case "date":
      return (
        filter.preset !== "custom" || Boolean(filter.from) || Boolean(filter.to)
      );
  }
}

export function activeFilterCount(state: TableState): number {
  return (
    Object.values(state.filters).filter(isFilterActive).length +
    (state.search.trim() !== "" ? 1 : 0)
  );
}

// 4-decimal integers: exact for 2-decimal quantities and for typed filter
// values, with no IEEE surprises at the boundaries.
const fixed = (value: number) => Math.round(value * 10_000);

function matchesNumber(
  cell: string | number | null,
  filter: Extract<FilterValue, { type: "number" }>,
): boolean {
  if (typeof cell !== "number" || !Number.isFinite(cell)) return false;
  const c = fixed(cell);
  const a = fixed(filter.value);
  switch (filter.op) {
    case "eq":
      return c === a;
    case "lt":
      return c < a;
    case "lte":
      return c <= a;
    case "gt":
      return c > a;
    case "gte":
      return c >= a;
    case "between": {
      const b = fixed(filter.to ?? filter.value);
      return c >= Math.min(a, b) && c <= Math.max(a, b);
    }
  }
}

function matchesText(
  cell: string | number | null,
  filter: Extract<FilterValue, { type: "text" }>,
): boolean {
  if (cell === null || cell === undefined) return false;
  const haystack = String(cell).trim().toLowerCase();
  const needle = filter.value.trim().toLowerCase();
  switch (filter.op) {
    case "contains":
      return haystack.includes(needle);
    case "startsWith":
      return haystack.startsWith(needle);
    case "equals":
      return haystack === needle;
  }
}

function matchesSelect(
  cell: string | number | null,
  filter: Extract<FilterValue, { type: "select" }>,
): boolean {
  const key = cell === null || cell === "" ? NONE_VALUE : String(cell);
  return filter.values.includes(key);
}

/** yyyy-mm-dd arithmetic without a time zone (calendar days only). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/** The location-local calendar date of an instant. */
export function localDate(iso: string, timeZone: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return zonedWallTimeFromInstant(parsed, timeZone).date;
}

function matchesDate(
  cell: string | number | null,
  filter: Extract<FilterValue, { type: "date" }>,
  ctx: FilterContext,
): boolean {
  if (typeof cell !== "string") return false;
  const date = localDate(cell, ctx.timeZone);
  if (date === null) return false;
  const today = zonedWallTimeFromInstant(ctx.now, ctx.timeZone).date;
  switch (filter.preset) {
    case "today":
      return date === today;
    case "7d":
      return date >= shiftDate(today, -6) && date <= today;
    case "30d":
      return date >= shiftDate(today, -29) && date <= today;
    case "custom": {
      if (filter.from && date < filter.from) return false;
      if (filter.to && date > filter.to) return false;
      return true;
    }
  }
}

export function matchesFilter<Row>(
  row: Row,
  column: ColumnSpec<Row>,
  filter: FilterValue,
  ctx: FilterContext,
): boolean {
  const cell = column.get(row);
  switch (filter.type) {
    case "text":
      return matchesText(cell, filter);
    case "select":
      return matchesSelect(cell, filter);
    case "number":
      return matchesNumber(cell, filter);
    case "date":
      return matchesDate(cell, filter, ctx);
  }
}

export function applyFilters<Row>(
  rows: readonly Row[],
  columns: readonly ColumnSpec<Row>[],
  state: Pick<TableState, "filters" | "search">,
  ctx: FilterContext,
): Row[] {
  const byId = new Map(columns.map((column) => [column.id, column]));
  const active = Object.entries(state.filters).filter(
    ([id, filter]) => byId.has(id) && isFilterActive(filter),
  );
  const needle = state.search.trim().toLowerCase();
  const searchable = columns.filter((column) => column.searchable);

  return rows.filter((row) => {
    for (const [id, filter] of active) {
      if (!matchesFilter(row, byId.get(id)!, filter, ctx)) return false;
    }
    if (needle !== "") {
      return searchable.some((column) => {
        const cell = column.get(row);
        return cell !== null && String(cell).toLowerCase().includes(needle);
      });
    }
    return true;
  });
}

// ---------------------------------------------------------------------
// Select options and sorting
// ---------------------------------------------------------------------
export type SelectOption = { value: string; label: string; count: number };

/** Distinct values of a select column with counts; blanks become "(none)". */
export function selectOptions<Row>(
  rows: readonly Row[],
  column: ColumnSpec<Row>,
): SelectOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const cell = column.get(row);
    const key = cell === null || cell === "" ? NONE_VALUE : String(cell);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const collator = new Intl.Collator("en", {
    sensitivity: "base",
    numeric: true,
  });
  return [...counts.entries()]
    .map(([value, count]) => ({
      value,
      label: value === NONE_VALUE ? "(none)" : value,
      count,
    }))
    .sort((a, b) => {
      if (a.value === NONE_VALUE) return 1;
      if (b.value === NONE_VALUE) return -1;
      return collator.compare(a.label, b.label);
    });
}

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

function compareCells(
  a: string | number | null,
  b: string | number | null,
): number {
  // Blanks always sort last, in either direction (applied by the caller).
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/** Stable multi-key sort; blank cells are always last. */
export function sortRows<Row>(
  rows: readonly Row[],
  columns: readonly ColumnSpec<Row>[],
  keys: readonly SortKey[],
): Row[] {
  const byId = new Map(columns.map((column) => [column.id, column]));
  const usable = keys.filter((key) => byId.has(key.id));
  if (usable.length === 0) return [...rows];
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      for (const key of usable) {
        const column = byId.get(key.id)!;
        const a = column.get(x.row);
        const b = column.get(y.row);
        const aBlank = a === null || a === "";
        const bBlank = b === null || b === "";
        if (aBlank || bBlank) {
          if (aBlank && bBlank) continue;
          return aBlank ? 1 : -1;
        }
        const result = compareCells(a, b);
        if (result !== 0) return key.dir === "asc" ? result : -result;
      }
      return x.index - y.index;
    })
    .map(({ row }) => row);
}

/** Click on a header: asc -> desc -> off; shift keeps other sort keys. */
export function toggleSort(
  keys: readonly SortKey[],
  id: string,
  additive: boolean,
): SortKey[] {
  const existing = keys.find((key) => key.id === id);
  const others = additive ? keys.filter((key) => key.id !== id) : [];
  if (!existing) return [...others, { id, dir: "asc" }];
  if (existing.dir === "asc") return [...others, { id, dir: "desc" }];
  return others;
}

// ---------------------------------------------------------------------
// URL (de)serialization: refresh / back / share keep the table state
// ---------------------------------------------------------------------
const FILTER_PREFIX = "f.";

function encodeFilter(filter: FilterValue): string {
  switch (filter.type) {
    case "text":
      return `t:${filter.op}:${encodeURIComponent(filter.value)}`;
    case "select":
      return `s:${filter.values.map(encodeURIComponent).join("|")}`;
    case "number":
      return filter.op === "between"
        ? `n:between:${filter.value}:${filter.to ?? filter.value}`
        : `n:${filter.op}:${filter.value}`;
    case "date":
      return filter.preset === "custom"
        ? `d:custom:${filter.from ?? ""}:${filter.to ?? ""}`
        : `d:${filter.preset}`;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function decodeFilter(raw: string, type: ColumnType): FilterValue | null {
  const [kind, ...rest] = raw.split(":");
  try {
    if (kind === "t" && type === "text") {
      const op = rest[0] as TextOp;
      if (!TEXT_OPS.includes(op)) return null;
      return {
        type: "text",
        op,
        value: decodeURIComponent(rest.slice(1).join(":")),
      };
    }
    if (kind === "s" && type === "select") {
      const values = rest
        .join(":")
        .split("|")
        .filter(Boolean)
        .map(decodeURIComponent);
      return { type: "select", values };
    }
    if (kind === "n" && type === "number") {
      const op = rest[0] as NumberOp;
      if (!NUMBER_OPS.includes(op)) return null;
      const value = Number(rest[1]);
      if (!Number.isFinite(value)) return null;
      if (op === "between") {
        const to = Number(rest[2]);
        return Number.isFinite(to) ? { type: "number", op, value, to } : null;
      }
      return { type: "number", op, value };
    }
    if (kind === "d" && type === "date") {
      const preset = rest[0] as DatePreset;
      if (!DATE_PRESETS.includes(preset)) return null;
      if (preset !== "custom") return { type: "date", preset };
      const from = DATE_RE.test(rest[1] ?? "") ? rest[1] : undefined;
      const to = DATE_RE.test(rest[2] ?? "") ? rest[2] : undefined;
      return { type: "date", preset, from, to };
    }
  } catch {
    return null;
  }
  return null;
}

/** Only active filters, a non-empty search and a sort are written. */
export function serializeTableState(state: TableState): URLSearchParams {
  const params = new URLSearchParams();
  for (const [id, filter] of Object.entries(state.filters)) {
    if (isFilterActive(filter))
      params.set(`${FILTER_PREFIX}${id}`, encodeFilter(filter));
  }
  if (state.search.trim() !== "") params.set("q", state.search.trim());
  if (state.sort.length > 0) {
    params.set(
      "sort",
      state.sort.map((key) => `${key.id}:${key.dir}`).join(","),
    );
  }
  return params;
}

/** Unknown columns and malformed values are dropped, never trusted. */
export function parseTableState(
  params: URLSearchParams,
  columns: readonly Pick<ColumnSpec<unknown>, "id" | "type">[],
): TableState {
  const types = new Map(columns.map((column) => [column.id, column.type]));
  const filters: FilterState = {};
  params.forEach((value, key) => {
    if (!key.startsWith(FILTER_PREFIX)) return;
    const id = key.slice(FILTER_PREFIX.length);
    const type = types.get(id);
    if (!type) return;
    const filter = decodeFilter(value, type);
    if (filter && isFilterActive(filter)) filters[id] = filter;
  });
  const sort: SortKey[] = (params.get("sort") ?? "")
    .split(",")
    .map((part) => part.split(":"))
    .filter(([id, dir]) => types.has(id) && (dir === "asc" || dir === "desc"))
    .map(([id, dir]) => ({ id, dir: dir as "asc" | "desc" }));
  return { filters, sort, search: params.get("q") ?? "" };
}

// ---------------------------------------------------------------------
// Chip text
// ---------------------------------------------------------------------
const NUMBER_SYMBOL: Record<NumberOp, string> = {
  eq: "=",
  lt: "<",
  lte: "≤",
  gt: ">",
  gte: "≥",
  between: "between",
};
const TEXT_PHRASE: Record<TextOp, string> = {
  contains: "contains",
  startsWith: "starts with",
  equals: "is",
};
export const DATE_PRESET_LABEL: Record<DatePreset, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom range",
};

export function describeFilter(label: string, filter: FilterValue): string {
  switch (filter.type) {
    case "text":
      return `${label} ${TEXT_PHRASE[filter.op]} “${filter.value.trim()}”`;
    case "select": {
      const shown = filter.values.map((v) => (v === NONE_VALUE ? "(none)" : v));
      return `${label}: ${shown.length > 3 ? `${shown.slice(0, 3).join(", ")} +${shown.length - 3}` : shown.join(", ")}`;
    }
    case "number":
      return filter.op === "between"
        ? `${label} ${filter.value}–${filter.to}`
        : `${label} ${NUMBER_SYMBOL[filter.op]} ${filter.value}`;
    case "date":
      return filter.preset === "custom"
        ? `${label}: ${filter.from ?? "…"} to ${filter.to ?? "…"}`
        : `${label}: ${DATE_PRESET_LABEL[filter.preset]}`;
  }
}
