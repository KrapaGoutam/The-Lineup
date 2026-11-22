"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ListFilter, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { summarizeRun } from "../domain/chore-cycles";
import { isBoardLive } from "../domain/chore-rules";
import { RUN_STATUS_LABELS, type ChoreRunSummary } from "../domain/chore-types";
import {
  DEFAULT_FEED_FILTERS,
  HISTORY_SCOPE_LABELS,
  activeFeedFilterCount,
  basisLabel,
  buildHistoryItems,
  feedMonths,
  feedStatusOptions,
  filterHistoryItems,
  groupHistoryItems,
  type FeedFilters,
  type FeedTask,
  type HistoryItem,
  type HistoryScope,
} from "../domain/history-feed";
import {
  assignedToLabel,
  formatAssignedStamp,
  formatHistoryStamp,
  historyTypeLabel,
  peopleIn,
} from "../domain/task-history";
import { STATUS_LABELS } from "../domain/task-rules";
import type { TaskCommand } from "../domain/task-commands";
import type { TaskEventView, TaskView } from "../domain/task-types";
import type { ChoreController } from "../hooks/use-chore-controller";
import type {
  TaskRunResult,
  TasksController,
} from "../hooks/use-tasks-controller";
import { RowActions, statusCommand } from "./all-tasks-view";
import { ChoreRunDetailDialog } from "./chore-run-detail";
import { formatBusinessDate, formatRunStamp } from "./chore-run-format";

export type HistoryPreset = { scope?: HistoryScope; boardId?: string };

type Props = {
  controller: TasksController;
  /** Chore Wheel data source; absent: the Chore Wheel scope is not offered. */
  chores?: ChoreController;
  categoryName: (slug: string) => string;
  execute: (command: TaskCommand) => Promise<TaskRunResult>;
  onOpen: (task: TaskView) => void;
  onEdit: (task: TaskView) => void;
  onReassign: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
  /** Hands the activity of older tasks to the shared detail dialog. */
  onFeedEvents?: (events: TaskEventView[]) => void;
  /** Jump to the live board of an in-progress run. */
  onOpenBoard?: (boardId: string) => void;
  /** Opened from a board's "Run history" button. */
  preset?: HistoryPreset | null;
};

type TaskLoad =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; tasks: FeedTask[]; truncated: boolean };
type RunLoad =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; runs: ChoreRunSummary[]; truncated: boolean };

// Desktop columns: Date | Task | Assigned To | Completed By | Assigned | Type.
// Below `lg` each record stacks, so nothing ever needs horizontal scrolling.
const ROW_GRID =
  "lg:grid lg:grid-cols-[10rem_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_7.5rem_5.5rem] lg:items-center lg:gap-x-4";

/**
 * Tasks → History: ordinary tasks and chore-wheel runs in one place, grouped by
 * month and then Completed / Not completed. The task rows are the same rows as All
 * Tasks (same status control, edit, reassign and delete, same server rules); run
 * rows open the frozen snapshot of that run. The grouping rule for each kind is in
 * `domain/history-feed.ts` and is stated on every row ("Completed", "Due",
 * "Created", "Business day").
 */
export function HistoryView({
  controller,
  chores,
  categoryName,
  execute,
  onOpen,
  onEdit,
  onReassign,
  onDelete,
  onFeedEvents,
  onOpenBoard,
  preset = null,
}: Props) {
  const snapshot = controller.snapshot;
  const timeZone = snapshot?.timeZone ?? "UTC";
  const manager = controller.viewer.designation !== "staff";

  const [filters, setFilters] = useState<FeedFilters>(() => ({
    ...DEFAULT_FEED_FILTERS,
    scope: preset?.scope ?? "all",
    boardId: preset?.boardId ?? "all",
  }));
  const [showFilters, setShowFilters] = useState(false);
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  const [taskLoad, setTaskLoad] = useState<TaskLoad>({ state: "loading" });
  const [runLoad, setRunLoad] = useState<RunLoad>({ state: "idle" });
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [known, setKnown] = useState<ReadonlySet<string>>(() => new Set());
  const [retry, setRetry] = useState(0);

  const monthParam = filters.month === "all" ? null : filters.month;
  const boardParam = filters.boardId === "all" ? null : filters.boardId;
  const wantTasks = filters.scope !== "chores";
  const wantRuns = chores !== undefined && filters.scope !== "tasks";

  // The loaders' identity changes with their controllers; History re-reads when the
  // inputs change or after the Tasks snapshot was refreshed (every mutation does).
  const feedLoader = useRef(controller.loadHistoryFeed);
  const runLoader = useRef(chores?.loadHistory);
  const eventsSink = useRef(onFeedEvents);
  useEffect(() => {
    feedLoader.current = controller.loadHistoryFeed;
    runLoader.current = chores?.loadHistory;
    eventsSink.current = onFeedEvents;
  });

  useEffect(() => {
    if (!wantTasks) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTaskLoad((current) =>
      current.state === "ready" ? current : { state: "loading" },
    );
    void feedLoader.current(monthParam).then((result) => {
      if (!live) return;
      if (result.ok) {
        eventsSink.current?.(result.data.events);
        setTaskLoad({
          state: "ready",
          tasks: result.data.tasks,
          truncated: result.data.truncated,
        });
      } else {
        setTaskLoad({ state: "error", message: result.error });
      }
    });
    return () => {
      live = false;
    };
  }, [wantTasks, monthParam, snapshot, retry]);

  useEffect(() => {
    chores?.ensureLoaded();
  }, [chores]);
  const choreSnapshot = chores?.snapshot ?? null;
  useEffect(() => {
    if (!wantRuns) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRunLoad((current) =>
      current.state === "ready" ? current : { state: "loading" },
    );
    void runLoader
      .current?.({ month: monthParam, boardId: boardParam })
      .then((result) => {
        if (!live) return;
        setRunLoad(
          result.ok
            ? {
                state: "ready",
                runs: result.data.runs,
                truncated: result.data.truncated,
              }
            : { state: "error", message: result.error },
        );
      });
    return () => {
      live = false;
    };
  }, [wantRuns, monthParam, boardParam, choreSnapshot, retry]);

  // In-progress runs come from the live Chore Wheel snapshot (same counting rules).
  const openRuns = useMemo<ChoreRunSummary[]>(() => {
    if (!wantRuns || !choreSnapshot) return [];
    return choreSnapshot.boards
      .filter(
        (b) =>
          b.cycle !== null &&
          !b.archived &&
          (manager || isBoardLive(b)) &&
          (boardParam === null || b.id === boardParam),
      )
      .map((b) => summarizeRun(b, null, false));
  }, [wantRuns, choreSnapshot, boardParam, manager]);

  const tasks = useMemo<FeedTask[]>(
    () => (wantTasks && taskLoad.state === "ready" ? taskLoad.tasks : []),
    [wantTasks, taskLoad],
  );
  const finishedRuns = useMemo<ChoreRunSummary[]>(
    () => (wantRuns && runLoad.state === "ready" ? runLoad.runs : []),
    [wantRuns, runLoad],
  );
  const items = useMemo(
    () =>
      buildHistoryItems({
        tasks,
        runs: [...openRuns, ...finishedRuns],
        timeZone,
      }),
    [tasks, openRuns, finishedRuns, timeZone],
  );

  // Months seen so far stay selectable after a month filter narrows the read.
  useEffect(() => {
    const months = items.map((i) => i.month);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKnown((current) => {
      if (months.every((m) => current.has(m))) return current;
      return new Set([...current, ...months]);
    });
  }, [items]);

  const visible = useMemo(
    () => filterHistoryItems(items, filters),
    [items, filters],
  );
  const groups = useMemo(
    () => groupHistoryItems(visible, filters.sort),
    [visible, filters.sort],
  );
  const months = useMemo(() => feedMonths(items, [...known]), [items, known]);
  const statuses = useMemo(() => feedStatusOptions(items), [items]);
  const people = useMemo(
    () =>
      peopleIn(
        tasks.map((t) => ({
          ...t.task,
          assignedAt: t.assignedAt,
          completedAt: t.task.completedAt ?? "",
        })),
        (e) => [...e.assignees, ...(e.completedBy ? [e.completedBy] : [])],
      ),
    [tasks],
  );
  const boards = useMemo(() => {
    const byId = new Map<string, string>();
    for (const b of choreSnapshot?.boards ?? []) byId.set(b.id, b.name);
    for (const r of finishedRuns) byId.set(r.boardId, r.boardName);
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [choreSnapshot, finishedRuns]);

  const set = <K extends keyof FeedFilters>(key: K, value: FeedFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const filterCount = activeFeedFilterCount(filters);
  const narrowed = filterCount > 0 || filters.search.trim() !== "";
  const newestKey = groups[0]?.key;
  const isOpen = (key: string) =>
    toggled.get(key) ?? (narrowed || key === newestKey);
  const toggleMonth = (key: string) =>
    setToggled((current) => new Map(current).set(key, !isOpen(key)));

  if (!snapshot) return null;

  const loading =
    (wantTasks && taskLoad.state === "loading" && tasks.length === 0) ||
    (wantRuns && runLoad.state === "loading" && finishedRuns.length === 0);
  const failures = [
    wantTasks && taskLoad.state === "error" ? taskLoad.message : null,
    wantRuns && runLoad.state === "error" ? runLoad.message : null,
  ].filter((m): m is string => m !== null);
  const truncated =
    (taskLoad.state === "ready" && taskLoad.truncated) ||
    (runLoad.state === "ready" && runLoad.truncated);

  const scopes: HistoryScope[] = chores
    ? ["all", "tasks", "chores"]
    : ["all", "tasks"];

  const emptyText =
    items.length === 0
      ? filters.scope === "chores"
        ? "No chore runs yet."
        : filters.scope === "tasks"
          ? "No task history yet."
          : "No history yet."
      : "Nothing matches these filters.";

  const afterTaskChange = (command: TaskCommand) => execute(command);

  return (
    <section aria-label="Task history" className="space-y-4">
      <div
        role="group"
        aria-label="History type"
        className="flex flex-wrap gap-2"
      >
        {scopes.map((scope) => (
          <button
            key={scope}
            type="button"
            aria-pressed={filters.scope === scope}
            onClick={() => set("scope", scope)}
            className={cn(
              "focus-visible:ring-ring min-h-11 rounded-full border px-4 text-sm font-semibold outline-none focus-visible:ring-2",
              filters.scope === scope
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-foreground",
            )}
          >
            {HISTORY_SCOPE_LABELS[scope]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            aria-label="Search history"
            placeholder="Search history…"
            className="pl-9"
            value={filters.search}
            onChange={(event) => set("search", event.target.value)}
          />
        </div>
        <Select
          aria-label="Month"
          className="w-auto min-w-40"
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
          onChange={(event) =>
            set("sort", event.target.value as FeedFilters["sort"])
          }
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
        {narrowed ? (
          <Button
            variant="ghost"
            onClick={() =>
              setFilters((current) => ({
                ...DEFAULT_FEED_FILTERS,
                scope: current.scope,
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
          <FilterField label="Status">
            <Select
              value={filters.status}
              onChange={(event) => set("status", event.target.value)}
            >
              <option value="all">Any status</option>
              {statuses.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Employee">
            <Select
              value={filters.employee}
              disabled={filters.scope === "chores"}
              onChange={(event) => set("employee", event.target.value)}
            >
              <option value="all">Anyone</option>
              {people.map((p) => (
                <option key={p.profileId} value={p.profileId}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FilterField>
          {chores ? (
            <FilterField label="Chore board">
              <Select
                value={filters.boardId}
                disabled={filters.scope === "tasks"}
                onChange={(event) => set("boardId", event.target.value)}
              >
                <option value="all">All boards</option>
                {boards.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </FilterField>
          ) : null}
          <p className="text-muted-foreground text-xs sm:col-span-2 lg:col-span-3">
            Employee applies to tasks (assigned or completed by); a chore run
            belongs to the whole board. Choosing a board shows only that
            board&apos;s runs.
          </p>
        </div>
      ) : null}

      <p className="text-muted-foreground text-sm" aria-live="polite">
        {summaryLine(visible)}
        {truncated
          ? " · showing the most recent records; choose a month for older ones"
          : ""}
        <span className="sr-only">
          . Tasks are grouped by the month they were completed, or for work not
          completed by the month it is due (or created if it has no due date).
          Runs are grouped by their business day.
        </span>
      </p>

      {failures.map((message) => (
        <div
          key={message}
          role="alert"
          className="border-destructive/30 bg-destructive/10 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm"
        >
          <span className="text-destructive">{message}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setTaskLoad({ state: "loading" });
              setRetry((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </div>
      ))}

      {loading ? (
        <p
          role="status"
          className="text-muted-foreground p-6 text-center text-sm"
        >
          Loading history…
        </p>
      ) : groups.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const open = isOpen(group.key);
            const panelId = `task-history-month-${group.key}`;
            const count = group.completed.length + group.notCompleted.length;
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
                        · {count} {count === 1 ? "item" : "items"}
                      </span>
                    </span>
                  </button>
                </h2>
                {open ? (
                  <div id={panelId} className="border-border border-t">
                    <Bucket
                      title="Completed"
                      testId="history-completed"
                      items={group.completed}
                      render={(item) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          timeZone={timeZone}
                          controller={controller}
                          categoryName={categoryName}
                          execute={afterTaskChange}
                          manager={manager}
                          onOpen={onOpen}
                          onEdit={onEdit}
                          onReassign={onReassign}
                          onDelete={onDelete}
                          onOpenRun={setOpenRun}
                          onOpenBoard={onOpenBoard}
                        />
                      )}
                    />
                    <Bucket
                      title="Not completed"
                      testId="history-not-completed"
                      items={group.notCompleted}
                      render={(item) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          timeZone={timeZone}
                          controller={controller}
                          categoryName={categoryName}
                          execute={afterTaskChange}
                          manager={manager}
                          onOpen={onOpen}
                          onEdit={onEdit}
                          onReassign={onReassign}
                          onDelete={onDelete}
                          onOpenRun={setOpenRun}
                          onOpenBoard={onOpenBoard}
                        />
                      )}
                    />
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {openRun && chores ? (
        <ChoreRunDetailDialog
          cycleId={openRun}
          controller={chores}
          timeZone={timeZone}
          onClose={() => setOpenRun(null)}
        />
      ) : null}
    </section>
  );
}

function summaryLine(visible: readonly HistoryItem[]): string {
  const tasks = visible.filter((i) => i.source === "task").length;
  const runs = visible.length - tasks;
  const parts = [
    `${tasks} ${tasks === 1 ? "task" : "tasks"}`,
    `${runs} chore ${runs === 1 ? "run" : "runs"}`,
  ];
  return parts.join(" · ");
}

function Bucket({
  title,
  testId,
  items,
  render,
}: {
  title: string;
  testId: string;
  items: readonly HistoryItem[];
  render: (item: HistoryItem) => React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div data-testid={testId}>
      <h3 className="bg-muted/40 text-muted-foreground px-4 py-2 text-xs font-semibold tracking-wide uppercase">
        {title} · {items.length}
      </h3>
      <ul className="divide-border divide-y">{items.map(render)}</ul>
    </div>
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

type RowProps = {
  item: HistoryItem;
  timeZone: string;
  controller: TasksController;
  categoryName: (slug: string) => string;
  execute: (command: TaskCommand) => Promise<TaskRunResult>;
  manager: boolean;
  onOpen: (task: TaskView) => void;
  onEdit: (task: TaskView) => void;
  onReassign: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
  onOpenRun: (cycleId: string) => void;
  onOpenBoard?: (boardId: string) => void;
};

function ItemRow(props: RowProps) {
  return props.item.source === "task" ? (
    <TaskHistoryRow {...props} item={props.item} />
  ) : (
    <RunRow {...props} item={props.item} />
  );
}

/**
 * One task. Same fields as before (assigned to / completed by are separate stored
 * facts), plus its status for work that is not completed, and the same actions as
 * All Tasks underneath.
 */
function TaskHistoryRow({
  item,
  timeZone,
  controller,
  execute,
  manager,
  onOpen,
  onEdit,
  onReassign,
  onDelete,
}: RowProps & { item: Extract<HistoryItem, { source: "task" }> }) {
  const { task, assignedAt, archived } = item.entry;
  const when =
    item.basis === "completed" && task.completedAt
      ? formatHistoryStamp(task.completedAt, timeZone)
      : formatBusinessDate(item.basisDate);
  return (
    <li className="px-4 py-3 text-sm" data-testid="history-task-row">
      <div className={cn(ROW_GRID, "flex flex-col gap-1")}>
        <p className="min-w-0 lg:order-2">
          <button
            type="button"
            onClick={() => onOpen(task)}
            className="focus-visible:ring-ring rounded text-left font-semibold underline-offset-2 outline-none hover:underline focus-visible:ring-2"
          >
            {task.title}
          </button>{" "}
          {!item.completed ? (
            <Badge tone={task.status === "blocked" ? "danger" : "warning"}>
              {STATUS_LABELS[task.status]}
            </Badge>
          ) : null}
          {archived ? <Badge tone="neutral">Archived</Badge> : null}
        </p>
        <p className="min-w-0 lg:order-3">
          <span className="text-muted-foreground lg:sr-only">
            Assigned to:{" "}
          </span>
          {assignedToLabel(task)}
        </p>
        <p className="min-w-0 lg:order-4">
          <span className="text-muted-foreground lg:sr-only">
            Completed by:{" "}
          </span>
          {task.completedBy?.name ?? "—"}
        </p>
        <p className="tabular-nums lg:order-1">
          <span className="text-muted-foreground">
            {basisLabel(item)}
            <span className="lg:sr-only">: </span>
          </span>
          <span className="lg:block">{when}</span>
        </p>
        <p className="tabular-nums lg:order-5">
          <span className="text-muted-foreground lg:sr-only">Assigned: </span>
          {task.completedAt
            ? formatAssignedStamp(assignedAt, task.completedAt, timeZone)
            : assignedAt
              ? formatHistoryStamp(assignedAt, timeZone)
              : "—"}
        </p>
        <p className="lg:order-6">
          <span className="text-muted-foreground lg:sr-only">Type: </span>
          <Badge tone={task.kind === "task" ? "neutral" : "accent"}>
            {historyTypeLabel(task.kind)}
          </Badge>
        </p>
      </div>
      {task.kind === "task" && !archived ? (
        <RowActions
          task={task}
          controller={controller}
          manager={manager}
          showReopenHint
          onSetStatus={(t, status) => void execute(statusCommand(t, status))}
          onOpen={onOpen}
          onEdit={onEdit}
          onReassign={onReassign}
          onDelete={onDelete}
        />
      ) : null}
    </li>
  );
}

function RunRow({
  item,
  timeZone,
  manager,
  onOpenRun,
  onOpenBoard,
}: RowProps & { item: Extract<HistoryItem, { source: "chore" }> }) {
  const run = item.run;
  const open = run.status === "open";
  return (
    <li className="px-4 py-3 text-sm" data-testid="history-run-row">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">
            {run.boardName} — Run {run.sequence}{" "}
            <Badge
              tone={run.completed ? "success" : open ? "accent" : "warning"}
            >
              {RUN_STATUS_LABELS[run.status]}
            </Badge>{" "}
            <Badge tone="neutral">Chore Wheel</Badge>
          </p>
          <p className="text-muted-foreground">
            {run.requiredDone} of {run.requiredTotal} required
            {run.optionalTotal > 0
              ? ` · optional ${run.optionalDone} of ${run.optionalTotal}`
              : ""}
            {" · Business day "}
            {formatBusinessDate(run.businessDate)}
            {run.closedAt
              ? ` · finished ${formatRunStamp(run.closedAt, timeZone)}`
              : ` · started ${formatRunStamp(run.openedAt, timeZone)}`}
          </p>
          <p className="text-muted-foreground">
            {open
              ? "Still open on the Chore Wheel."
              : run.closedByKind === "system"
                ? run.status === "expired"
                  ? "Closed automatically at the end of its day."
                  : "Closed automatically when every required check was done."
                : `Closed by ${run.closedByName ?? "a manager"}.`}
            {run.note ? ` Reason: ${run.note}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {open ? (
            onOpenBoard ? (
              <Button
                variant="outline"
                size="sm"
                className="h-11"
                onClick={() => onOpenBoard(run.boardId)}
              >
                Open board
              </Button>
            ) : null
          ) : manager ? (
            <Button
              variant="outline"
              size="sm"
              className="h-11"
              aria-label={`Open saved run: ${run.boardName} run ${run.sequence}`}
              onClick={() => onOpenRun(run.cycleId)}
              data-testid="history-open-run"
            >
              View saved run
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
