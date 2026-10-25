"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { TaskCommand } from "../domain/task-commands";
import {
  DEFAULT_TASK_CATEGORIES,
  isTasksManager,
  type TaskView,
} from "../domain/task-types";
import type { TasksController } from "../hooks/use-tasks-controller";
import { MyTasksView } from "./my-tasks-view";
import { TaskDetailDialog } from "./task-detail-dialog";
import { TaskFormDialog } from "./task-form-dialog";
import { TodayView } from "./today-view";

export type TasksTab = "today" | "mine";

type Props = {
  controller: TasksController;
};

const TAB_LABELS: Record<TasksTab, string> = {
  today: "Today",
  mine: "My Tasks",
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
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [form, setForm] = useState<{ task?: TaskView } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const openTask = useMemo(
    () => snapshot?.tasks.find((t) => t.id === openTaskId) ?? null,
    [snapshot, openTaskId],
  );

  const tabs: TasksTab[] = ["today", "mine"];

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
              categoryName={categoryName}
              onToggle={toggle}
              onOpen={(task) => setOpenTaskId(task.id)}
              onGoToMyTasks={() => setTab("mine")}
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
          team={snapshot.team}
          onClose={() => setOpenTaskId(null)}
          onEdit={(task) => {
            setOpenTaskId(null);
            setForm({ task });
          }}
          run={execute}
        />
      ) : null}

      {snapshot && form ? (
        <TaskFormDialog
          key={form.task?.id ?? "new"}
          task={form.task}
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
