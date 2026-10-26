"use client";

import type { TaskView } from "../domain/task-types";
import type { TasksController } from "../hooks/use-tasks-controller";
import { TaskRow } from "./task-row";

type Props = {
  tasks: readonly TaskView[];
  controller: TasksController;
  categoryName: (slug: string) => string;
  showAssignees?: boolean;
  readOnly?: boolean;
  emptyText: string;
  onToggle: (task: TaskView) => void;
  onOpen: (task: TaskView) => void;
};

/** A plain list of task rows with an explicit empty state. */
export function TaskList({
  tasks,
  controller,
  categoryName,
  showAssignees,
  readOnly,
  emptyText,
  onToggle,
  onOpen,
}: Props) {
  const snapshot = controller.snapshot;
  if (!snapshot) return null;

  if (tasks.length === 0) {
    return (
      <p className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm">
        {emptyText}
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          viewer={controller.viewer}
          now={controller.now}
          today={snapshot.today}
          pending={controller.pendingIds.has(task.id)}
          categoryName={categoryName(task.category)}
          showAssignees={showAssignees}
          readOnly={readOnly}
          onToggle={onToggle}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}
