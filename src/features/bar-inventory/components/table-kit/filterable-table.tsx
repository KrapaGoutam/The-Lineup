"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Filter,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  activeFilterCount,
  applyFilters,
  describeFilter,
  EMPTY_TABLE_STATE,
  isFilterActive,
  parseTableState,
  selectOptions,
  serializeTableState,
  sortRows,
  toggleSort,
  type ColumnSpec,
  type FilterValue,
  type SortKey,
  type TableState,
} from "../../domain/table-filters";
import { ColumnFilterControl } from "./column-filter-controls";
import { EmptyState } from "./empty-state";
import { Sheet } from "./sheet";
import { useOutsideDismiss } from "./use-outside-dismiss";

export type TableColumn<Row> = ColumnSpec<Row> & {
  render: (row: Row) => ReactNode;
  align?: "right";
  /** Hidden on tablets (md..lg); still reachable via the column chooser. */
  tabletHidden?: boolean;
  /** No filter control (kept sortable if `sortable`). */
  noFilter?: boolean;
};

export type SortPreset = { label: string; keys: SortKey[] };

type Props<Row> = {
  /** Namespaces the URL parameters and the stored column choice. */
  tableKey: string;
  /** Filters from another organization are never applied (stale-URL guard). */
  restaurantSlug: string;
  label: string;
  rows: readonly Row[];
  columns: TableColumn<Row>[];
  /** Sortable but not shown (e.g. status severity, distance to cutoff). */
  sortOnlyColumns?: ColumnSpec<Row>[];
  getRowId: (row: Row) => string;
  timeZone: string;
  defaultSort?: SortKey[];
  sortPresets?: SortPreset[];
  /** Phone layout: one card per row instead of the table. */
  renderCard?: (row: Row) => ReactNode;
  /** Trailing actions cell for each row. */
  rowActions?: (row: Row) => ReactNode;
  emptyMessage: string;
  emptyAction?: ReactNode;
  toolbarExtras?: ReactNode;
  /** The filtered + sorted rows (exports re-run the spec on the server). */
  onVisibleRows?: (rows: Row[], state: TableState) => void;
  /** Row id to highlight (e.g. just edited). */
  className?: string;
};

const SLUG_PARAM = "bi.org";

/**
 * Drops table state that belongs to another organization (a shared or stale
 * URL). Run once when the module mounts, before any table reads its state, so
 * a filter written for one restaurant is never applied to another.
 */
export function dropForeignTableState(slug: string) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const owner = params.get(SLUG_PARAM);
  if (!owner || owner === slug) return;
  [...params.keys()]
    .filter((key) => key === SLUG_PARAM || /.(f.[^.]+|q|sort)$/.test(key))
    .forEach((key) => params.delete(key));
  const query = params.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  );
}

function readState(
  tableKey: string,
  slug: string,
  columns: Pick<ColumnSpec<unknown>, "id" | "type">[],
): TableState {
  if (typeof window === "undefined") return EMPTY_TABLE_STATE;
  const params = new URLSearchParams(window.location.search);
  const owner = params.get(SLUG_PARAM);
  if (owner && owner !== slug) return EMPTY_TABLE_STATE;
  const own = new URLSearchParams();
  const prefix = `${tableKey}.`;
  params.forEach((value, key) => {
    if (key.startsWith(prefix)) own.set(key.slice(prefix.length), value);
  });
  return parseTableState(own, columns);
}

/**
 * Writes one table's state into the URL, replacing only that table's own
 * parameters. Also how the Dashboard opens the Inventory table pre-filtered:
 * a table reads this state when it mounts.
 */
export function writeTableState(
  tableKey: string,
  slug: string,
  state: TableState,
) {
  const params = new URLSearchParams(window.location.search);
  const prefix = `${tableKey}.`;
  [...params.keys()]
    .filter((key) => key.startsWith(prefix))
    .forEach((key) => params.delete(key));
  serializeTableState(state).forEach((value, key) =>
    params.set(`${prefix}${key}`, value),
  );
  const hasOurs = [...params.keys()].some((key) =>
    /\.(f\.[^.]+|q|sort)$/.test(key),
  );
  if (hasOurs) params.set(SLUG_PARAM, slug);
  else params.delete(SLUG_PARAM);
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", url);
}

/** Filter / sort / search state mirrored to the URL so refresh and back keep it. */
function useTableUrlState(
  tableKey: string,
  slug: string,
  columns: Pick<ColumnSpec<unknown>, "id" | "type">[],
) {
  const [state, setState] = useState<TableState>(() =>
    readState(tableKey, slug, columns),
  );
  useEffect(() => {
    writeTableState(tableKey, slug, state);
  }, [state, tableKey, slug]);
  return [state, setState] as const;
}

function storedHidden(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function HeaderFilter<Row>({
  column,
  value,
  options,
  onChange,
}: {
  column: ColumnSpec<Row>;
  value: FilterValue | undefined;
  options: ReturnType<typeof selectOptions>;
  onChange: (next: FilterValue | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const active = isFilterActive(value);
  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);
  useOutsideDismiss(open, [buttonRef, panelRef], close);

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Filter ${column.label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2",
          active
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        <Filter aria-hidden="true" className="size-3.5" />
        {active ? <span className="sr-only">(active)</span> : null}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={`${column.label} filter`}
          className="border-border bg-popover text-popover-foreground absolute top-full left-0 z-30 mt-1 flex w-64 flex-col gap-3 rounded-xl border p-3 shadow-xl"
        >
          <ColumnFilterControl
            column={column}
            value={value}
            options={options}
            onChange={onChange}
          />
          <div className="flex justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(undefined)}
            >
              Clear filter
            </Button>
            <Button size="sm" variant="secondary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </span>
  );
}

/**
 * The shared table surface for Bar Inventory: per-column type-appropriate
 * filters (header popovers on desktop, one sheet on phones), removable chips,
 * Clear filter / Clear all, global search that adds to the column filters,
 * sortable headers with presets, a column chooser, URL-synced state, and a
 * card layout below `md`.
 */
export function FilterableTable<Row>({
  tableKey,
  restaurantSlug,
  label,
  rows,
  columns,
  sortOnlyColumns = [],
  getRowId,
  timeZone,
  defaultSort = [],
  sortPresets = [],
  renderCard,
  rowActions,
  emptyMessage,
  emptyAction,
  toolbarExtras,
  onVisibleRows,
  className,
}: Props<Row>) {
  const idBase = useId();
  const specColumns = useMemo<ColumnSpec<Row>[]>(
    () => [...columns, ...sortOnlyColumns],
    [columns, sortOnlyColumns],
  );
  const [state, setState] = useTableUrlState(
    tableKey,
    restaurantSlug,
    specColumns,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const storageKey = `bi.cols.${tableKey}`;
  const [hidden, setHidden] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : storedHidden(storageKey),
  );
  const [chooserOpen, setChooserOpen] = useState(false);
  const chooserButton = useRef<HTMLButtonElement>(null);
  const chooserPanel = useRef<HTMLDivElement>(null);
  const closeChooser = useCallback(() => setChooserOpen(false), []);
  useOutsideDismiss(chooserOpen, [chooserButton, chooserPanel], closeChooser);

  const toggleColumn = (id: string) => {
    const next = hidden.includes(id)
      ? hidden.filter((h) => h !== id)
      : [...hidden, id];
    setHidden(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Storage can be blocked (private window); the choice just isn't kept.
    }
  };

  const ctx = useMemo(() => ({ timeZone, now: new Date() }), [timeZone]);
  const sortKeys = state.sort.length > 0 ? state.sort : defaultSort;

  const visible = useMemo(
    () =>
      sortRows(
        applyFilters(rows, specColumns, state, ctx),
        specColumns,
        sortKeys,
      ),
    [rows, specColumns, state, ctx, sortKeys],
  );
  useEffect(
    () => onVisibleRows?.(visible, state),
    [visible, state, onVisibleRows],
  );

  const optionsFor = useCallback(
    (column: ColumnSpec<Row>) =>
      column.type === "select" ? selectOptions(rows, column) : [],
    [rows],
  );

  const setFilter = (id: string, next: FilterValue | undefined) =>
    setState((current) => {
      const filters = { ...current.filters };
      if (!next || !isFilterActive(next)) {
        // Keep an in-progress (inactive) filter so controls stay controlled.
        if (next) filters[id] = next;
        else delete filters[id];
      } else filters[id] = next;
      return { ...current, filters };
    });

  const chips = Object.entries(state.filters)
    .filter(([, filter]) => isFilterActive(filter))
    .map(([id, filter]) => {
      const column = specColumns.find((c) => c.id === id);
      return column ? { id, text: describeFilter(column.label, filter) } : null;
    })
    .filter((chip): chip is { id: string; text: string } => chip !== null);
  const activeCount = activeFilterCount(state);

  const shownColumns = columns.filter((column) => !hidden.includes(column.id));
  const filterable = columns.filter((column) => !column.noFilter);

  const clearAll = () =>
    setState((current) => ({ ...current, filters: {}, search: "" }));

  const header = (column: TableColumn<Row>) => {
    const dir = sortKeys.find((key) => key.id === column.id)?.dir;
    return (
      <th
        key={column.id}
        scope="col"
        aria-sort={
          dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"
        }
        className={cn(
          "text-muted-foreground px-2 py-1 text-xs font-semibold whitespace-nowrap",
          column.align === "right" ? "text-right" : "text-left",
          column.tabletHidden && "hidden lg:table-cell",
        )}
      >
        <span
          className={cn(
            "inline-flex items-center gap-0.5",
            column.align === "right" && "flex-row-reverse",
          )}
        >
          {column.sortable ? (
            <button
              type="button"
              onClick={(event) =>
                setState((current) => ({
                  ...current,
                  sort: toggleSort(
                    current.sort.length > 0 ? current.sort : defaultSort,
                    column.id,
                    event.shiftKey,
                  ),
                }))
              }
              className="hover:bg-muted focus-visible:ring-ring inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 outline-none focus-visible:ring-2"
              title="Sort (Shift-click adds a secondary sort)"
            >
              {column.label}
              {dir === "asc" ? (
                <ArrowUp aria-hidden="true" className="size-3.5" />
              ) : dir === "desc" ? (
                <ArrowDown aria-hidden="true" className="size-3.5" />
              ) : (
                <ArrowUpDown aria-hidden="true" className="size-3 opacity-40" />
              )}
            </button>
          ) : (
            <span className="px-1.5">{column.label}</span>
          )}
          {!column.noFilter ? (
            <HeaderFilter
              column={column}
              value={state.filters[column.id]}
              options={optionsFor(column)}
              onChange={(next) => setFilter(column.id, next)}
            />
          ) : null}
        </span>
      </th>
    );
  };

  const presetValue = sortPresets.findIndex(
    (preset) => JSON.stringify(preset.keys) === JSON.stringify(sortKeys),
  );

  return (
    <div
      className={cn("flex w-full max-w-full min-w-0 flex-col gap-3", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          aria-label={`Search ${label}`}
          placeholder="Search…"
          className="max-w-xs min-w-40 flex-1"
          value={state.search}
          onChange={(event) =>
            setState((current) => ({ ...current, search: event.target.value }))
          }
        />
        <Button
          variant="secondary"
          className="md:hidden"
          onClick={() => setSheetOpen(true)}
        >
          <SlidersHorizontal aria-hidden="true" /> Filters
          {activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
        {sortPresets.length > 0 ? (
          <Select
            aria-label="Sort order"
            className="w-auto max-w-56"
            value={presetValue >= 0 ? String(presetValue) : ""}
            onChange={(event) => {
              const preset = sortPresets[Number(event.target.value)];
              setState((current) => ({
                ...current,
                sort: preset ? preset.keys : [],
              }));
            }}
          >
            <option value="" disabled={presetValue >= 0}>
              Sort: custom
            </option>
            {sortPresets.map((preset, index) => (
              <option key={preset.label} value={index}>
                {preset.label}
              </option>
            ))}
          </Select>
        ) : null}
        <span className="relative hidden md:inline-flex">
          <button
            ref={chooserButton}
            type="button"
            className={buttonVariants({ variant: "ghost" })}
            aria-haspopup="dialog"
            aria-expanded={chooserOpen}
            onClick={() => setChooserOpen((v) => !v)}
          >
            <Columns3 aria-hidden="true" /> Columns
          </button>
          {chooserOpen ? (
            <div
              ref={chooserPanel}
              role="dialog"
              aria-label="Choose columns"
              className="border-border bg-popover text-popover-foreground absolute top-full right-0 z-30 mt-1 w-56 rounded-xl border p-2 shadow-xl"
            >
              {columns.map((column) => (
                <label
                  key={column.id}
                  className="hover:bg-muted flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={!hidden.includes(column.id)}
                    onChange={() => toggleColumn(column.id)}
                  />
                  {column.label}
                </label>
              ))}
            </div>
          ) : null}
        </span>
        {toolbarExtras}
      </div>

      {chips.length > 0 || state.search.trim() !== "" ? (
        <ul
          className="flex flex-wrap items-center gap-2"
          aria-label="Active filters"
        >
          {state.search.trim() !== "" ? (
            <li>
              <button
                type="button"
                className="border-border bg-muted hover:bg-muted/70 inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-xs"
                onClick={() =>
                  setState((current) => ({ ...current, search: "" }))
                }
                aria-label={`Remove search “${state.search.trim()}”`}
              >
                Search: “{state.search.trim()}”{" "}
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ) : null}
          {chips.map((chip) => (
            <li key={chip.id}>
              <button
                type="button"
                className="border-border bg-muted hover:bg-muted/70 inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-xs"
                onClick={() => setFilter(chip.id, undefined)}
                aria-label={`Remove filter ${chip.text}`}
              >
                {chip.text} <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
          <li>
            <Button size="sm" variant="ghost" onClick={clearAll}>
              Clear all ({activeCount})
            </Button>
          </li>
        </ul>
      ) : null}

      <p
        className="text-muted-foreground text-xs"
        role="status"
        aria-live="polite"
      >
        {visible.length === rows.length
          ? `${rows.length} ${rows.length === 1 ? "row" : "rows"}`
          : `${visible.length} of ${rows.length} rows match`}
      </p>

      {rows.length === 0 ? (
        <EmptyState message={emptyMessage}>{emptyAction}</EmptyState>
      ) : (
        <>
          {renderCard && visible.length > 0 ? (
            <ul
              className="flex flex-col gap-2 md:hidden"
              aria-label={`${label} list`}
            >
              {visible.map((row) => (
                <li key={getRowId(row)}>{renderCard(row)}</li>
              ))}
            </ul>
          ) : null}
          <div
            className={cn(
              "border-border relative w-full max-w-full min-w-0 overflow-x-auto rounded-xl border",
              renderCard && "hidden md:block",
            )}
          >
            <table
              aria-label={label}
              className="w-full min-w-[44rem] border-collapse"
            >
              <thead className="bg-muted/40">
                <tr>
                  {shownColumns.map(header)}
                  {rowActions ? (
                    <th scope="col" className="px-2 py-1">
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {/* The header (and its filter controls) stays when nothing matches. */}
                {visible.map((row) => (
                  <tr key={getRowId(row)} className="border-border border-t">
                    {shownColumns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "px-2 py-1.5 align-middle text-sm",
                          column.align === "right" && "text-right tabular-nums",
                          column.tabletHidden && "hidden lg:table-cell",
                        )}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                    {rowActions ? (
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {rowActions(row)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible.length === 0 ? (
            <EmptyState message="No items match these filters.">
              <Button variant="secondary" onClick={clearAll}>
                Clear all filters
              </Button>
            </EmptyState>
          ) : null}
        </>
      )}

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filters"
        description="Every column has its own filter."
      >
        {sheetOpen ? (
          <div className="flex flex-col gap-4">
            {filterable.map((column) => (
              <fieldset
                key={column.id}
                className="border-border flex flex-col gap-2 rounded-xl border p-3"
              >
                <legend className="px-1 text-sm font-semibold">
                  {column.label}
                </legend>
                <ColumnFilterControl
                  column={column}
                  value={state.filters[column.id]}
                  options={optionsFor(column)}
                  onChange={(next) => setFilter(column.id, next)}
                />
              </fieldset>
            ))}
            <div
              className="flex justify-between gap-2"
              id={`${idBase}-sheet-actions`}
            >
              <Button variant="ghost" onClick={clearAll}>
                Clear all
              </Button>
              <Button onClick={() => setSheetOpen(false)}>
                Show {visible.length} {visible.length === 1 ? "row" : "rows"}
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
