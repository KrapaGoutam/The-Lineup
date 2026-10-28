"use client";

import { useCallback, useMemo, useState } from "react";
import { Bell, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { TaskCommand } from "../domain/task-commands";
import { ALL_STAFF_SCOPE, type TodayScope } from "../domain/task-rules";
import {
  DEFAULT_TASK_CATEGORIES,
  isTasksManager,
  type RecurrenceRuleView,
  type TaskView,
} from "../domain/task-types";
import type { TasksController } from "../hooks/use-tasks-controller";
import { AssignedView } from "./assigned-view";
import { ChecklistView } from "./checklist-view";
import { HandoffPanel } from "./handoff-panel";
import { NotificationsDialog } from "./notifications-dialog";
import { MyTasksView } from "./my-tasks-view";
import { SeriesPanel } from "./series-panel";
import { TaskDetailDialog } from "./task-detail-dialog";
import { TaskFormDialog } from "./task-form-dialog";
import { TemplatesPanel } from "./templates-panel";
import { TodayView } from "./today-view";

export type TasksTab =
  | "today"
  | "mine"
  | "opening"
  | "closing"
  | "assigned"
  | "manage";

type Props = {
  controller: TasksController;
};

const TAB_LABELS: Record<TasksTab, string> = {
  today: "Today",
  mine: "My Tasks",
  opening: "Opening",
  closing: "Closing",
  assigned: "Assigned",
  manage: "Manage",
};

/**
 * The Tasks module shell: sub-navigation, the shared task dialogs and the
 * mutation notice. Data and mutations come from the controller; this
 * component never keeps its own copy of task state, so whatever the server
 * last returned is always what is on screen.
 */
export function TasksWorkspace({ controller }: Props) {
  const { snapshot, viewer, run } = controller;
  const manager = isTasksManager(viewer.designation);
  const [tab, setTab] = useState<TasksTab>("today");
  // Kept here (not in TodayView) so the choice survives hopping to another
  // Tasks section and back. Only managers can change it.
  const [todayScope, setTodayScope] = useState<TodayScope>(ALL_STAFF_SCOPE);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    task?: TaskView;
    series?: RecurrenceRuleView;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showInbox, setShowInbox] = useState(false);

  const categories = snapshot?.categories ?? DEFAULT_TASK_CATEGORIES;
  const categoryName = useCallback(
    (slug: string) => categories.find((c) => c.slug === slug)?.name ?? "Other",
    [categories],
  );

  const execute = useCallback(
    async (command: TaskCommand) => {
      const result = await run(command);
      setNotice(result.ok ? null : result.error);
      return result;
    },
    [run],
  );

  const toggle = useCallback(
    (task: TaskView) => {
      void execute(
        task.status === "completed"
          ? { type: "reopen", taskId: task.id }
          : { type: "complete", taskId: task.id },
      );
    },
    [execute],
  );

  const openTask = useMemo(() => {
    if (!snapshot || !openTaskId) return null;
    return (
      snapshot.tasks.find((t) => t.id === openTaskId) ??
      snapshot.checklists
        .flatMap((c) => c.items)
        .find((t) => t.id === openTaskId) ??
      null
    );
  }, [snapshot, openTaskId]);

  const tabs: TasksTab[] = manager
    ? ["today", "mine", "opening", "closing", "assigned", "manage"]
    : ["today", "mine", "opening", "closing"];

  return (
    <section aria-label="Tasks" className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tasks</h1>
          {snapshot ? (
            <p className="text-muted-foreground text-sm">
              {new Intl.DateTimeFormat("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                timeZone: snapshot.timeZone,
              }).format(controller.now)}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!controller.snapshot ? null : (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh tasks"
              onClick={() => void controller.refresh()}
            >
              <RefreshCw aria-hidden="true" />
            </Button>
          )}
          {snapshot ? (
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={
                snapshot.unreadCount > 0
                  ? `Notifications, ${snapshot.unreadCount} unread`
                  : "Notifications"
              }
              onClick={() => setShowInbox(true)}
            >
              <Bell aria-hidden="true" />
              {snapshot.unreadCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold"
                >
                  {snapshot.unreadCount > 99 ? "99+" : snapshot.unreadCount}
                </span>
              ) : null}
            </Button>
          ) : null}
          {manager ? (
            <Button onClick={() => setForm({})}>
              <Plus aria-hidden="true" />
              New task
            </Button>
          ) : null}
        </div>
      </div>

      <nav aria-label="Tasks sections" className="-mx-1 overflow-x-auto px-1">
        <div className="flex gap-1.5">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
              className={cn(
                "focus-visible:ring-ring min-h-11 rounded-xl px-4 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-2",
                tab === id
                  ? "bg-primary text-primary-foreground"
                  : "border-border bg-surface text-foreground border",
              )}
            >
              {TAB_LABELS[id]}
            </button>
          ))}
        </div>
      </nav>

      {notice ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm"
        >
          <span className="text-destructive">{notice}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs underline"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {controller.loadError && !snapshot ? (
        <div className="border-border rounded-2xl border p-6 text-center">
          <p className="text-sm">{controller.loadError}</p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => void controller.refresh()}
          >
            Try again
          </Button>
        </div>
      ) : !snapshot ? (
        <p
          role="status"
          className="text-muted-foreground p-6 text-center text-sm"
        >
          Loading tasks…
        </p>
      ) : (
        <>
          {tab === "today" ? (
            <TodayView
              controller={controller}
              scope={todayScope}
              onScopeChange={setTodayScope}
              categoryName={categoryName}
              onToggle={toggle}
              onOpen={(task) => setOpenTaskId(task.id)}
              onGoToMyTasks={() => setTab("mine")}
              onGoToChecklist={(kind) => setTab(kind)}
              onGoToAssigned={manager ? () => setTab("assigned") : undefined}
            />
          ) : null}
          {tab === "assigned" && manager ? (
            <AssignedView
              controller={controller}
              categoryName={categoryName}
              onToggle={toggle}
              onOpen={(task) => setOpenTaskId(task.id)}
            />
          ) : null}
          {tab === "manage" && manager ? (
            <div className="space-y-5">
              <SeriesPanel
                controller={controller}
                execute={execute}
                onEdit={(series) => setForm({ series })}
              />
              <TemplatesPanel controller={controller} execute={execute} />
              <HandoffPanel
                controller={controller}
                categoryName={categoryName}
                onOpen={(task) => setOpenTaskId(task.id)}
                execute={execute}
              />
            </div>
          ) : null}
          {tab === "opening" || tab === "closing" ? (
            <ChecklistView
              kind={tab}
              controller={controller}
              categoryName={categoryName}
              onToggle={toggle}
              onOpen={(task) => setOpenTaskId(task.id)}
              onGoToManage={() => setTab("manage")}
            />
          ) : null}
          {tab === "mine" ? (
            <MyTasksView
              controller={controller}
              categoryName={categoryName}
              onToggle={toggle}
              onOpen={(task) => setOpenTaskId(task.id)}
            />
          ) : null}
        </>
      )}

      {snapshot && openTask ? (
        <TaskDetailDialog
          key={openTask.id}
          task={openTask}
          viewer={viewer}
          now={controller.now}
          today={snapshot.today}
          timeZone={snapshot.timeZone}
          categoryName={categoryName(openTask.category)}
          events={snapshot.events}
          series={snapshot.series.find(
            (r) => r.id === openTask.recurrenceRuleId,
          )}
          onEditSeries={(series) => {
            setOpenTaskId(null);
            setForm({ series });
          }}
          team={snapshot.team}
          onClose={() => setOpenTaskId(null)}
          onEdit={(task) => {
            setOpenTaskId(null);
            setForm({ task });
          }}
          run={execute}
        />
      ) : null}

      {snapshot && showInbox ? (
        <NotificationsDialog
          notifications={snapshot.notifications}
          unreadCount={snapshot.unreadCount}
          timeZone={snapshot.timeZone}
          onClose={() => setShowInbox(false)}
          onRead={(ids) => void execute({ type: "notificationsRead", ids })}
          onOpenTask={(taskId) => setOpenTaskId(taskId)}
        />
      ) : null}

      {snapshot && form ? (
        <TaskFormDialog
          key={form.task?.id ?? form.series?.id ?? "new"}
          task={form.task}
          series={form.series}
          team={snapshot.team}
          categories={snapshot.categories}
          today={snapshot.today}
          onClose={() => setForm(null)}
          onSubmit={execute}
        />
      ) : null}
    </section>
  );
}
