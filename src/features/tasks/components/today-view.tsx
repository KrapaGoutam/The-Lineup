"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";

import {
  isMine,
  sortTasks,
  summarizeToday,
  taskBucket,
  taskProgress,
  type TodayScope,
} from "../domain/task-rules";
import {
  isTasksManager,
  type ChecklistKind,
  type TaskView,
} from "../domain/task-types";
import type { TasksController } from "../hooks/use-tasks-controller";
import { ManagementToday } from "./management-today";
import { TaskList } from "./task-list";

type Props = {
  controller: TasksController;
  /** Management scope (All Staff / My Tasks / person); ignored for staff. */
  scope: TodayScope;
  onScopeChange: (scope: TodayScope) => void;
  categoryName: (slug: string) => string;
  onToggle: (task: TaskView) => void;
  onOpen: (task: TaskView) => void;
  onGoToMyTasks: () => void;
  onGoToAssigned?: () => void;
  onGoToChecklist: (kind: ChecklistKind) => void;
};

function SummaryCard({
  title,
  headline,
  detail,
  tone,
  onClick,
}: {
  title: string;
  headline: string;
  detail?: string;
  tone?: "danger";
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </span>
      <span className="mt-1 block text-lg font-semibold">{headline}</span>
      {detail ? (
        <span
          className={cn(
            "mt-0.5 block text-sm",
            tone === "danger" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {detail}
        </span>
      ) : null}
    </>
  );
  const className =
    "border-border bg-card rounded-2xl border p-4 text-left min-h-24";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        className,
        "hover:border-primary/50 focus-visible:ring-ring outline-none focus-visible:ring-2",
      )}
    >
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * Operational and glanceable: what do I need to do, what is overdue, what
 * does the team still have open. Deliberately not an analytics dashboard.
 */
export function TodayView({
  controller,
  scope,
  onScopeChange,
  categoryName,
  onToggle,
  onOpen,
  onGoToMyTasks,
  onGoToAssigned,
  onGoToChecklist,
}: Props) {
  const snapshot = controller.snapshot;
  const manager = isTasksManager(controller.viewer.designation);

  const summary = useMemo(
    () =>
      snapshot
        ? summarizeToday(
            snapshot.tasks,
            controller.viewer,
            controller.now,
            snapshot.today,
          )
        : null,
    [snapshot, controller.viewer, controller.now],
  );

  const upNext = useMemo(() => {
    if (!snapshot) return [];
    const actionable = snapshot.tasks.filter((task) => {
      if (task.kind !== "task" || !isMine(controller.viewer, task))
        return false;
      const bucket = taskBucket(task, controller.now, snapshot.today);
      return bucket === "overdue" || bucket === "today";
    });
    return sortTasks(actionable, controller.now, snapshot.today).slice(0, 6);
  }, [snapshot, controller.viewer, controller.now]);

  if (!snapshot || !summary) return null;

  const checklistCard = (kind: ChecklistKind, title: string) => {
    const instances = snapshot.checklists.filter(
      (c) => c.kind === kind && c.serviceDate === snapshot.today,
    );
    const progress = taskProgress(instances.flatMap((c) => c.items));
    return (
      <SummaryCard
        title={title}
        headline={
          instances.length === 0
            ? "Not scheduled"
            : `${progress.done} / ${progress.total} completed`
        }
        detail={instances.length === 0 ? undefined : `${progress.percent}%`}
        onClick={() => onGoToChecklist(kind)}
      />
    );
  };

  return (
    <section aria-label="Today" className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          title="My tasks"
          headline={`${summary.myOpen} open`}
          detail={
            summary.myOverdue > 0
              ? `${summary.myOverdue} overdue`
              : "Nothing overdue"
          }
          tone={summary.myOverdue > 0 ? "danger" : undefined}
          onClick={onGoToMyTasks}
        />
        {checklistCard("opening", "Opening")}
        {checklistCard("closing", "Closing")}
        {manager ? (
          <SummaryCard
            title="Team tasks"
            headline={`${summary.teamOpen} open`}
            detail={
              summary.teamOverdue > 0
                ? `${summary.teamOverdue} overdue`
                : "Nothing overdue"
            }
            tone={summary.teamOverdue > 0 ? "danger" : undefined}
            onClick={onGoToAssigned}
          />
        ) : null}
        <SummaryCard
          title="Upcoming"
          headline={String(summary.upcoming)}
          detail={summary.upcoming === 1 ? "task later" : "tasks later"}
          onClick={onGoToMyTasks}
        />
      </div>

      {manager ? (
        <ManagementToday
          controller={controller}
          scope={scope}
          onScopeChange={onScopeChange}
          categoryName={categoryName}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      ) : (
        <div className="space-y-2.5">
          <h2 className="text-sm font-semibold">Up next for you</h2>
          <TaskList
            tasks={upNext}
            controller={controller}
            categoryName={categoryName}
            emptyText="You're all caught up."
            onToggle={onToggle}
            onOpen={onOpen}
          />
        </div>
      )}
    </section>
  );
}
