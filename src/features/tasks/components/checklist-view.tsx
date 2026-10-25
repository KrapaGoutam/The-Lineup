"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatShortDate, taskProgress } from "../domain/task-rules";
import {
  isTasksManager,
  type ChecklistInstanceView,
  type ChecklistKind,
  type TaskView,
} from "../domain/task-types";
import type { TasksController } from "../hooks/use-tasks-controller";
import { ProgressBar } from "./progress-bar";
import { TaskList } from "./task-list";

type Props = {
  kind: ChecklistKind;
  controller: TasksController;
  categoryName: (slug: string) => string;
  onToggle: (task: TaskView) => void;
  onOpen: (task: TaskView) => void;
  onGoToManage: () => void;
};

const TITLES: Record<ChecklistKind, string> = {
  opening: "Opening",
  closing: "Closing",
};

function isCommon(task: TaskView): boolean {
  return task.assignmentMode === "anyone" || task.assignmentMode === "all_team";
}

/**
 * Today's checklist(s) of one kind, split into COMMON items (anyone) and
 * PERSON SPECIFIC items, plus bounded previous days. Each day is a separate
 * instance with its own rows, so nothing checked on an earlier day can show
 * as checked today.
 */
export function ChecklistView({
  kind,
  controller,
  categoryName,
  onToggle,
  onOpen,
  onGoToManage,
}: Props) {
  const snapshot = controller.snapshot;
  const manager = isTasksManager(controller.viewer.designation);
  const [openDays, setOpenDays] = useState<ReadonlySet<string>>(new Set());

  const { today, previous } = useMemo(() => {
    const all = (snapshot?.checklists ?? []).filter((c) => c.kind === kind);
    const day = snapshot?.today ?? "";
    return {
      today: all.filter((c) => c.serviceDate === day),
      previous: all.filter((c) => c.serviceDate < day),
    };
  }, [snapshot, kind]);

  if (!snapshot) return null;

  function toggleDay(id: string) {
    setOpenDays((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const renderItems = (instance: ChecklistInstanceView, readOnly: boolean) => {
    const common = instance.items.filter(isCommon);
    const specific = instance.items.filter((t) => !isCommon(t));
    return (
      <div className="space-y-4">
        {common.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Common
            </h3>
            <TaskList
              tasks={common}
              controller={controller}
              categoryName={categoryName}
              readOnly={readOnly}
              emptyText=""
              onToggle={onToggle}
              onOpen={onOpen}
            />
          </div>
        ) : null}
        {specific.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Person specific
            </h3>
            <TaskList
              tasks={specific}
              controller={controller}
              categoryName={categoryName}
              showAssignees
              readOnly={readOnly}
              emptyText=""
              onToggle={onToggle}
              onOpen={onOpen}
            />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section aria-label={`${TITLES[kind]} checklist`} className="space-y-6">
      {today.length === 0 ? (
        <div className="border-border rounded-2xl border border-dashed p-6 text-center">
          <p className="text-sm">No {kind} checklist is scheduled for today.</p>
          {manager ? (
            <Button className="mt-3" variant="secondary" onClick={onGoToManage}>
              Set up {kind} checklists
            </Button>
          ) : null}
        </div>
      ) : (
        today.map((instance) => {
          const progress = taskProgress(instance.items);
          const remaining = instance.items.filter(
            (t) => t.status !== "completed" && t.status !== "cancelled",
          );
          return (
            <article
              key={instance.id}
              aria-label={instance.name}
              className="border-border bg-card space-y-4 rounded-2xl border p-4"
            >
              <header className="space-y-3">
                <div>
                  <h2 className="text-base font-semibold">{instance.name}</h2>
                  <p className="text-muted-foreground text-sm">
                    {formatShortDate(instance.serviceDate)}
                  </p>
                </div>
                <ProgressBar
                  progress={progress}
                  label={`${instance.name} progress`}
                />
                {manager && remaining.length > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    Still to do: {remaining.map((t) => t.title).join(" · ")}
                  </p>
                ) : null}
              </header>
              {renderItems(instance, false)}
            </article>
          );
        })
      )}

      <section aria-label="Previous days" className="space-y-2.5">
        <h2 className="text-sm font-semibold">Previous days</h2>
        {previous.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No earlier {kind} checklists yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {previous.map((instance) => {
              const progress = taskProgress(instance.items);
              const expanded = openDays.has(instance.id);
              return (
                <li
                  key={instance.id}
                  className="border-border bg-card rounded-2xl border"
                >
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggleDay(instance.id)}
                    className={cn(
                      "focus-visible:ring-ring flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left outline-none focus-visible:ring-2",
                    )}
                  >
                    <span>
                      <span className="block text-sm font-semibold">
                        {formatShortDate(instance.serviceDate)} ·{" "}
                        {instance.name}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {progress.done} / {progress.total} · {progress.percent}%
                    </span>
                  </button>
                  {expanded ? (
                    <div className="border-border border-t p-4">
                      {renderItems(instance, !manager)}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
