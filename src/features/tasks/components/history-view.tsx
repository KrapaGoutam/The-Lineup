"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ListFilter, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  DATE_PRESETS,
  DATE_PRESET_LABELS,
  DEFAULT_HISTORY_FILTERS,
  activeFilterCount,
  assignedToLabel,
  availableMonths,
  filterHistory,
  formatAssignedStamp,
  formatHistoryStamp,
  groupByMonth,
  hasActiveFilters,
  historyTypeLabel,
  peopleIn,
  type DatePreset,
  type HistoryFilters,
  type HistorySort,
  type TaskHistoryData,
  type TaskHistoryEntry,
} from "../domain/task-history";
import type { TaskKind } from "../domain/task-types";
import type { TasksController } from "../hooks/use-tasks-controller";

type Props = {
  controller: TasksController;
};

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: TaskHistoryData };

const TYPE_OPTIONS: { value: "all" | TaskKind; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "task", label: "Regular" },
  { value: "opening", label: "Opening" },
  { value: "closing", label: "Closing" },
];

// Desktop columns: Completed | Task | Assigned To | Completed By | Assigned | Type.
// Below `lg` each record stacks, so nothing ever needs horizontal scrolling.
const ROW_GRID =
  "lg:grid lg:grid-cols-[10rem_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_7.5rem_5.5rem] lg:items-center lg:gap-x-4";

/**
 * Tasks → History. A read-only audit log of completed work, newest first and
 * grouped by the month it was completed. It only displays what is persisted:
 * "Assigned to" and "Completed by" are separate facts, and a missing value is
 * shown as missing rather than filled in from the other.
 */
export function HistoryView({ controller }: Props) {
  const snapshot = controller.snapshot;
  const timeZone = snapshot?.timeZone ?? "UTC";
  const today = snapshot?.today ?? "";

  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [filters, setFilters] = useState<HistoryFilters>(
    DEFAULT_HISTORY_FILTERS,
  );
  const [showFilters, setShowFilters] = useState(false);
  // Only months the user explicitly toggled; the rest follow the default.
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );

  // The loader's identity changes with the controller's snapshot; History
  // fetches on open (and on retry), not every time that happens.
  const loadRef = useRef(controller.loadHistory);
  useEffect(() => {
    loadRef.current = controller.loadHistory;
  }, [controller.loadHistory]);

  const fetchHistory = useCallback(async () => {
    setLoad({ state: "loading" });
    const result = await loadRef.current();
    setLoad(
      result.ok
        ? { state: "ready", data: result.data }
        : { state: "error", message: result.error },
    );
  }, []);

  useEffect(() => {
    // Subscribing to the data source on open; the state update is the result.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchHistory();
  }, [fetchHistory]);

  const entries = useMemo(
    () => (load.state === "ready" ? load.data.entries : []),
    [load],
  );

  const visible = useMemo(
    () => filterHistory(entries, filters, { today, timeZone }),
    [entries, filters, today, timeZone],
  );
  const groups = useMemo(
    () => groupByMonth(visible, timeZone),
    [visible, timeZone],
  );
  const months = useMemo(
    () => availableMonths(entries, timeZone),
    [entries, timeZone],
  );
  const assigners = useMemo(
    () => peopleIn(entries, (e) => e.assignees),
    [entries],
  );
  const completers = useMemo(
    () => peopleIn(entries, (e) => (e.completedBy ? [e.completedBy] : [])),
    [entries],
  );

  const set = <K extends keyof HistoryFilters>(
    key: K,
    value: HistoryFilters[K],
  ) => setFilters((current) => ({ ...current, [key]: value }));

  const filterCount = activeFilterCount(filters);
  const narrowed = hasActiveFilters(filters);
  const newestKey = months[0]?.key;

  const isOpen = (key: string) =>
    toggled.get(key) ?? (narrowed || key === newestKey);
  const toggleMonth = (key: string) =>
    setToggled((current) => new Map(current).set(key, !isOpen(key)));

  if (!snapshot) return null;

  if (load.state === "loading") {
    return (
      <p
        role="status"
        className="text-muted-foreground p-6 text-center text-sm"
      >
        Loading task history…
      </p>
    );
  }

  if (load.state === "error") {
    return (
      <div
        role="alert"
        className="border-border rounded-2xl border p-6 text-center"
      >
        <p className="text-sm">{load.message}</p>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => void fetchHistory()}
        >
          Try again
        </Button>
      </div>
    );
  }

  const emptyText =
    entries.length === 0
      ? "No completed tasks yet."
      : filterCount > 0
        ? "No task history matches these filters."
        : "No completed tasks match your search.";

  return (
    <section aria-label="Completed task history" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            aria-label="Search task history"
            placeholder="Search task history…"
            className="pl-9"
            value={filters.search}
            onChange={(event) => set("search", event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          aria-expanded={showFilters}
          aria-controls="task-history-filters"
          onClick={() => setShowFilters((open) => !open)}
        >
          <ListFilter aria-hidden="true" />
          Filter
          {filterCount > 0 ? (
            <span className="bg-primary text-primary-foreground grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold">
              {filterCount}
            </span>
          ) : null}
        </Button>
        <Select
          aria-label="Sort order"
          className="w-auto min-w-36"
          value={filters.sort}
          onChange={(event) => set("sort", event.target.value as HistorySort)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
        {narrowed ? (
          <Button
            variant="ghost"
            onClick={() =>
              setFilters((current) => ({
                ...DEFAULT_HISTORY_FILTERS,
                sort: current.sort,
              }))
            }
          >
            <X aria-hidden="true" />
            Clear filters
          </Button>
        ) : null}
      </div>

      {showFilters ? (
        <div
          id="task-history-filters"
          role="group"
          aria-label="History filters"
          className="border-border bg-card grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <FilterField label="Assigned to">
            <Select
              value={filters.assignedTo}
              onChange={(event) => set("assignedTo", event.target.value)}
            >
              <option value="all">Anyone</option>
              {assigners.map((p) => (
                <option key={p.profileId} value={p.profileId}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Completed by">
            <Select
              value={filters.completedBy}
              onChange={(event) => set("completedBy", event.target.value)}
            >
              <option value="all">Anyone</option>
              {completers.map((p) => (
                <option key={p.profileId} value={p.profileId}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Task type">
            <Select
              value={filters.type}
              onChange={(event) =>
                set("type", event.target.value as HistoryFilters["type"])
              }
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Completed">
            <Select
              value={filters.datePreset}
              onChange={(event) =>
                set("datePreset", event.target.value as DatePreset)
              }
            >
              {DATE_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {DATE_PRESET_LABELS[preset]}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Month">
            <Select
              value={filters.month}
              onChange={(event) => set("month", event.target.value)}
            >
              <option value="all">All months</option>
              {months.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </Select>
          </FilterField>
          {filters.datePreset === "custom" ? (
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
              <FilterField label="From">
                <Input
                  type="date"
                  value={filters.from}
                  max={filters.to || undefined}
                  onChange={(event) => set("from", event.target.value)}
                />
              </FilterField>
              <FilterField label="To">
                <Input
                  type="date"
                  value={filters.to}
                  min={filters.from || undefined}
                  onChange={(event) => set("to", event.target.value)}
                />
              </FilterField>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-muted-foreground text-sm" aria-live="polite">
        {visible.length === 1
          ? "1 completed task"
          : `${visible.length} completed tasks`}
        {load.data.truncated
          ? ` · showing the most recent ${entries.length} completions`
          : ""}
      </p>

      {groups.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const open = isOpen(group.key);
            const panelId = `task-history-month-${group.key}`;
            return (
              <section
                key={group.key}
                aria-label={group.label}
                className="border-border bg-card rounded-2xl border"
              >
                <h2>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => toggleMonth(group.key)}
                    className="focus-visible:ring-ring flex min-h-12 w-full items-center gap-2 rounded-2xl px-4 text-left text-sm font-semibold outline-none focus-visible:ring-2"
                  >
                    {open ? (
                      <ChevronDown aria-hidden="true" className="size-4" />
                    ) : (
                      <ChevronRight aria-hidden="true" className="size-4" />
                    )}
                    <span>
                      {group.label}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {group.entries.length}{" "}
                        {group.entries.length === 1 ? "task" : "tasks"}
                      </span>
                    </span>
                  </button>
                </h2>
                {open ? (
                  <div id={panelId} className="border-border border-t">
                    <div
                      aria-hidden="true"
                      className={cn(
                        ROW_GRID,
                        "text-muted-foreground hidden px-4 py-2 text-xs font-semibold tracking-wide uppercase",
                      )}
                    >
                      <span>Completed</span>
                      <span>Task</span>
                      <span>Assigned to</span>
                      <span>Completed by</span>
                      <span>Assigned</span>
                      <span>Type</span>
                    </div>
                    <ul className="divide-border divide-y">
                      {group.entries.map((entry) => (
                        <HistoryRow
                          key={entry.id}
                          entry={entry}
                          timeZone={timeZone}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground text-xs font-semibold">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * One completed task. Purely informational: there are no row actions.
 * DOM order is the stacked (mobile / tablet) reading order; on `lg` the
 * `order-*` classes lay the same cells out as table columns.
 */
function HistoryRow({
  entry,
  timeZone,
}: {
  entry: TaskHistoryEntry;
  timeZone: string;
}) {
  return (
    <li className={cn(ROW_GRID, "flex flex-col gap-1 px-4 py-3 text-sm")}>
      <p className="font-semibold lg:order-2">{entry.title}</p>
      <p className="min-w-0 lg:order-3">
        <span className="text-muted-foreground lg:sr-only">Assigned to: </span>
        {assignedToLabel(entry)}
      </p>
      <p className="min-w-0 lg:order-4">
        <span className="text-muted-foreground lg:sr-only">Completed by: </span>
        {entry.completedBy?.name ?? "—"}
      </p>
      <p className="tabular-nums lg:order-1">
        <span className="text-muted-foreground lg:sr-only">Completed: </span>
        {formatHistoryStamp(entry.completedAt, timeZone)}
      </p>
      <p className="tabular-nums lg:order-5">
        <span className="text-muted-foreground lg:sr-only">Assigned: </span>
        {formatAssignedStamp(entry.assignedAt, entry.completedAt, timeZone)}
      </p>
      <p className="lg:order-6">
        <span className="text-muted-foreground lg:sr-only">Type: </span>
        <Badge tone={entry.kind === "task" ? "neutral" : "accent"}>
          {historyTypeLabel(entry.kind)}
        </Badge>
      </p>
    </li>
  );
}
