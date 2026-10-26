"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { TaskCommand } from "../domain/task-commands";
import { weekdayOf } from "../domain/recurrence";
import { PRIORITY_LABELS, WINDOW_LABELS } from "../domain/task-rules";
import {
  DUE_WINDOWS,
  TASK_PRIORITIES,
  type AssignmentMode,
  type DueWindow,
  type RecurrenceEndType,
  type RecurrenceFrequency,
  type RecurrenceRuleView,
  type TaskCategory,
  type TaskPriority,
  type TaskTeamMember,
  type TaskView,
} from "../domain/task-types";
import type { TaskRunResult } from "../hooks/use-tasks-controller";
import { AssigneePicker } from "./assignee-picker";

type Props = {
  /** Editing a single task (this occurrence only when it belongs to a series). */
  task?: TaskView;
  /** Editing a whole series: "this and future occurrences". */
  series?: RecurrenceRuleView;
  team: readonly TaskTeamMember[];
  categories: readonly TaskCategory[];
  today: string;
  onClose: () => void;
  onSubmit: (command: TaskCommand) => Promise<TaskRunResult>;
};

type Repeat = "none" | RecurrenceFrequency;

const REPEAT_LABELS: Record<Repeat, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekdays: "Weekdays (Mon–Fri)",
  weekly: "Weekly",
  selected_weekdays: "Selected weekdays",
  monthly: "Monthly",
};
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const textareaClass =
  "border-input bg-background/70 text-foreground placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-ring/40 min-h-24 w-full rounded-xl border px-3 py-2.5 text-sm transition outline-none focus-visible:ring-2";

/**
 * Create a task (optionally repeating), edit one task, or edit a whole
 * series for "this and future occurrences". Editing a task changes its
 * content and timing; who it is assigned to changes through the dedicated
 * reassign flow so every reassignment is its own audited event.
 */
export function TaskFormDialog({
  task,
  series,
  team,
  categories,
  today,
  onClose,
  onSubmit,
}: Props) {
  const editingTask = Boolean(task);
  const editingSeries = Boolean(series);
  const source = task ?? series;
  const [title, setTitle] = useState(source?.title ?? "");
  const [instructions, setInstructions] = useState(source?.instructions ?? "");
  const [category, setCategory] = useState(source?.category ?? "other");
  const [priority, setPriority] = useState<TaskPriority>(
    source?.priority ?? "normal",
  );
  const [startDate, setStartDate] = useState(task?.startDate ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [dueTime, setDueTime] = useState(source?.dueTime ?? "");
  const [dueWindow, setDueWindow] = useState<DueWindow | "">(
    source?.dueWindow ?? "",
  );
  const [mode, setMode] = useState<AssignmentMode>(
    series?.assignmentMode ?? "individual",
  );
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    series?.assigneeIds ?? [],
  );
  const [eachPerson, setEachPerson] = useState(false);

  const [repeat, setRepeat] = useState<Repeat>(series?.frequency ?? "none");
  const [startsOn, setStartsOn] = useState(series?.startsOn ?? today);
  const [weekdays, setWeekdays] = useState<number[]>(
    series?.weekdays ?? [weekdayOf(today)],
  );
  const [dayOfMonth, setDayOfMonth] = useState(
    String(series?.dayOfMonth ?? Number(today.slice(8, 10))),
  );
  const [endType, setEndType] = useState<RecurrenceEndType>(
    series?.endType ?? "never",
  );
  const [endsOn, setEndsOn] = useState(series?.endsOn ?? "");
  const [maxOccurrences, setMaxOccurrences] = useState(
    String(series?.maxOccurrences ?? 10),
  );

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const repeating = repeat !== "none";
  const showAssignment = !editingTask;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    let command: TaskCommand;
    if (repeating) {
      const input = {
        title: title.trim(),
        instructions: instructions.trim() || null,
        category,
        priority,
        assignmentMode: mode,
        assigneeIds,
        dueTime: dueTime || null,
        dueWindow: dueWindow || null,
        frequency: repeat,
        weekdays: repeat === "selected_weekdays" ? weekdays : null,
        dayOfMonth: repeat === "monthly" ? Number(dayOfMonth) || null : null,
        startsOn,
        endType,
        endsOn: endType === "on_date" ? endsOn || null : null,
        maxOccurrences:
          endType === "after_count" ? Number(maxOccurrences) || null : null,
      };
      command = series
        ? { type: "seriesUpdate", ruleId: series.id, input }
        : { type: "seriesCreate", input };
    } else {
      const fields = {
        title: title.trim(),
        instructions: instructions.trim() || null,
        category,
        priority,
        startDate: startDate || null,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        dueWindow: dueWindow || null,
      };
      command = task
        ? { type: "update", taskId: task.id, input: fields }
        : {
            type: "create",
            input: {
              ...fields,
              assignmentMode: mode,
              assigneeIds,
              eachPerson: mode === "multiple" && eachPerson,
            },
          };
    }

    const result = await onSubmit(command);
    setSaving(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  const heading = editingSeries
    ? "Edit series"
    : editingTask
      ? task?.recurrenceRuleId
        ? "Edit this occurrence"
        : "Edit task"
      : "New task";
  const description = editingSeries
    ? "Changes apply to this and future occurrences that haven't started. Completed and past occurrences are never changed."
    : editingTask
      ? task?.recurrenceRuleId
        ? "Only this occurrence changes; the rest of the series is untouched."
        : "Change what the task says or when it is due."
      : "Assign work to one person, several people or the whole team.";

  return (
    <Dialog
      open
      onClose={onClose}
      title={heading}
      description={description}
      className="max-w-[min(94vw,38rem)] sm:w-[min(94vw,38rem)]"
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="task-title">Title</Label>
          <Input
            id="task-title"
            value={title}
            maxLength={160}
            required
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Refill ice bins"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="task-instructions">Instructions (optional)</Label>
          <textarea
            id="task-instructions"
            className={textareaClass}
            value={instructions}
            maxLength={2000}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="task-category">Category</Label>
            <Select
              id="task-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-priority">Priority</Label>
            <Select
              id="task-priority"
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as TaskPriority)
              }
            >
              {TASK_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {showAssignment ? (
          <>
            <AssigneePicker
              idPrefix="task"
              mode={mode}
              onModeChange={setMode}
              assigneeIds={assigneeIds}
              onAssigneeIdsChange={setAssigneeIds}
              team={team}
            />
            {mode === "multiple" && !repeating ? (
              <label className="border-border flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 accent-[var(--primary)]"
                  checked={eachPerson}
                  onChange={(event) => setEachPerson(event.target.checked)}
                />
                <span>
                  <span className="block font-medium">
                    Each person completes it separately
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    Off: the first person to finish completes it for everyone.
                  </span>
                </span>
              </label>
            ) : null}
          </>
        ) : null}

        {!editingTask ? (
          <div className="space-y-1.5">
            <Label htmlFor="task-repeat">Repeats</Label>
            <Select
              id="task-repeat"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value as Repeat)}
            >
              {(Object.keys(REPEAT_LABELS) as Repeat[])
                .filter((value) => !editingSeries || value !== "none")
                .map((value) => (
                  <option key={value} value={value}>
                    {REPEAT_LABELS[value]}
                  </option>
                ))}
            </Select>
          </div>
        ) : null}

        {repeating ? (
          <div className="border-border bg-muted/30 space-y-3 rounded-2xl border p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="task-starts">Starts</Label>
                <Input
                  id="task-starts"
                  type="date"
                  value={startsOn}
                  onChange={(event) => setStartsOn(event.target.value)}
                />
              </div>
              {repeat === "monthly" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="task-dom">Day of month</Label>
                  <Input
                    id="task-dom"
                    type="number"
                    min={1}
                    max={31}
                    value={dayOfMonth}
                    onChange={(event) => setDayOfMonth(event.target.value)}
                  />
                </div>
              ) : null}
            </div>

            {repeat === "selected_weekdays" ? (
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">On</legend>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_LABELS.map((label, index) => {
                    const on = weekdays.includes(index);
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setWeekdays((current) =>
                            on
                              ? current.filter((d) => d !== index)
                              : [...current, index].sort(),
                          )
                        }
                        className={cn(
                          "focus-visible:ring-ring min-h-11 min-w-12 rounded-xl border px-3 text-sm font-semibold outline-none focus-visible:ring-2",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-surface",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="task-ends">Ends</Label>
                <Select
                  id="task-ends"
                  value={endType}
                  onChange={(event) =>
                    setEndType(event.target.value as RecurrenceEndType)
                  }
                >
                  <option value="never">Never</option>
                  <option value="on_date">On date</option>
                  <option value="after_count">After a number of times</option>
                </Select>
              </div>
              {endType === "on_date" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="task-ends-on">End date</Label>
                  <Input
                    id="task-ends-on"
                    type="date"
                    value={endsOn}
                    min={startsOn}
                    onChange={(event) => setEndsOn(event.target.value)}
                  />
                </div>
              ) : null}
              {endType === "after_count" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="task-count">Number of times</Label>
                  <Input
                    id="task-count"
                    type="number"
                    min={1}
                    max={1000}
                    value={maxOccurrences}
                    onChange={(event) => setMaxOccurrences(event.target.value)}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!repeating ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="task-start">Start date (optional)</Label>
                <Input
                  id="task-start"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-due-date">Due date (optional)</Label>
                <Input
                  id="task-due-date"
                  type="date"
                  value={dueDate}
                  min={editingTask ? undefined : today}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            </>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="task-due-time">Due time (optional)</Label>
            <Input
              id="task-due-time"
              type="time"
              value={dueTime}
              disabled={!repeating && !dueDate}
              onChange={(event) => setDueTime(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-window">When in the day (optional)</Label>
            <Select
              id="task-window"
              value={dueWindow}
              onChange={(event) =>
                setDueWindow(event.target.value as DueWindow | "")
              }
            >
              <option value="">No specific window</option>
              {DUE_WINDOWS.map((value) => (
                <option key={value} value={value}>
                  {WINDOW_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !title.trim()}>
            {saving
              ? "Saving…"
              : editingSeries || editingTask
                ? "Save changes"
                : "Create task"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
