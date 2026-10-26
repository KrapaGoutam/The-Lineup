"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { TaskCommand } from "../domain/task-commands";
import { recurrenceSummary } from "../domain/recurrence";
import { dueText, formatClock } from "../domain/task-rules";
import type { RecurrenceRuleView } from "../domain/task-types";
import type {
  TaskRunResult,
  TasksController,
} from "../hooks/use-tasks-controller";

type Props = {
  controller: TasksController;
  onEdit: (series: RecurrenceRuleView) => void;
  execute: (command: TaskCommand) => Promise<TaskRunResult>;
};

/**
 * Manager-only list of recurring series. Each occurrence is its own task;
 * stopping a series cancels only untouched future occurrences and keeps
 * everything already worked or finished.
 */
export function SeriesPanel({ controller, onEdit, execute }: Props) {
  const snapshot = controller.snapshot;
  if (!snapshot) return null;

  return (
    <section
      aria-label="Recurring tasks"
      className="border-border bg-card space-y-3 rounded-2xl border p-4"
    >
      <div>
        <h2 className="text-base font-semibold">Recurring tasks</h2>
        <p className="text-muted-foreground text-sm">
          Every occurrence is its own task with its own status and history.
          Create one from New task → Repeats.
        </p>
      </div>
      {snapshot.series.length === 0 ? (
        <p className="text-muted-foreground text-sm">No recurring tasks yet.</p>
      ) : (
        <ul className="space-y-2">
          {snapshot.series.map((series) => {
            const next = snapshot.tasks
              .filter(
                (t) =>
                  t.recurrenceRuleId === series.id &&
                  t.status === "open" &&
                  t.dueDate !== null &&
                  t.dueDate >= snapshot.today,
              )
              .sort((a, b) =>
                (a.dueDate ?? "").localeCompare(b.dueDate ?? ""),
              )[0];
            return (
              <li
                key={series.id}
                className="border-border flex flex-wrap items-center gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {series.title}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {recurrenceSummary(series)}
                    {series.dueTime ? ` · ${formatClock(series.dueTime)}` : ""}
                    {next ? ` · Next: ${dueText(next, snapshot.today)}` : ""}
                  </span>
                </div>
                <Badge>Series</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={() => onEdit(series)}
                >
                  Edit series
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive min-h-11"
                  onClick={() =>
                    void execute({ type: "seriesStop", ruleId: series.id })
                  }
                >
                  Stop series
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
