"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { TaskCommand } from "../domain/task-commands";
import {
  addDaysToDate,
  dueText,
  isActiveStatus,
  isOverdue,
} from "../domain/task-rules";
import type { TaskView } from "../domain/task-types";
import type {
  TaskRunResult,
  TasksController,
} from "../hooks/use-tasks-controller";

type Props = {
  controller: TasksController;
  categoryName: (slug: string) => string;
  onOpen: (task: TaskView) => void;
  execute: (command: TaskCommand) => Promise<TaskRunResult>;
};

/**
 * Manual shift handoff. Unfinished work from earlier days (or overdue today)
 * never disappears on its own: a manager picks what happens to it -- carry
 * forward to a new date, or open it to reassign / cancel. Automatic handoff
 * on shift change is a documented future enhancement.
 */
export function HandoffPanel({
  controller,
  categoryName,
  onOpen,
  execute,
}: Props) {
  const snapshot = controller.snapshot;
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  const unfinished = useMemo(
    () =>
      snapshot
        ? snapshot.tasks.filter(
            (task) =>
              task.kind === "task" &&
              isActiveStatus(task.status) &&
              (isOverdue(task, controller.now) ||
                (task.dueDate !== null && task.dueDate < snapshot.today)),
          )
        : [],
    [snapshot, controller.now],
  );

  if (!snapshot) return null;
  const newDate = target || addDaysToDate(snapshot.today, 0);
  const chosen = unfinished.filter((t) => selected.has(t.id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function carryForward() {
    if (chosen.length === 0 || busy) return;
    setBusy(true);
    const result = await execute({
      type: "carryForward",
      taskIds: chosen.map((t) => t.id),
      newDueDate: newDate,
    });
    setBusy(false);
    if (result.ok) setSelected(new Set());
  }

  return (
    <section
      aria-label="Unfinished work"
      className="border-border bg-card space-y-3 rounded-2xl border p-4"
    >
      <div>
        <h2 className="text-base font-semibold">Unfinished work</h2>
        <p className="text-muted-foreground text-sm">
          Overdue or left over from earlier days. Carry it forward, or open a
          task to reassign or cancel it.
        </p>
      </div>

      {unfinished.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing is waiting to be handed off.
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {unfinished.map((task) => (
              <li
                key={task.id}
                className="border-border flex items-center gap-3 rounded-xl border p-2.5"
              >
                <input
                  type="checkbox"
                  className="size-5 flex-none accent-[var(--primary)]"
                  checked={selected.has(task.id)}
                  onChange={() => toggle(task.id)}
                  aria-label={`Select ${task.title}`}
                />
                <button
                  type="button"
                  onClick={() => onOpen(task)}
                  className="focus-visible:ring-ring min-h-11 min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2"
                >
                  <span className="block truncate text-sm font-semibold">
                    {task.title}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {dueText(task, snapshot.today)} ·{" "}
                    {categoryName(task.category)}
                    {task.assignees.length
                      ? ` · ${task.assignees.map((a) => a.name).join(", ")}`
                      : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="handoff-date">New due date</Label>
              <Input
                id="handoff-date"
                type="date"
                value={newDate}
                min={snapshot.today}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <Button
              disabled={chosen.length === 0 || busy}
              onClick={() => void carryForward()}
            >
              Carry forward {chosen.length > 0 ? `(${chosen.length})` : ""}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
