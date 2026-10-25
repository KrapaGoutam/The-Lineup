"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

import type { TaskCommand } from "../domain/task-commands";
import { PRIORITY_LABELS, WINDOW_LABELS } from "../domain/task-rules";
import {
  DUE_WINDOWS,
  TASK_PRIORITIES,
  type AssignmentMode,
  type DueWindow,
  type TaskCategory,
  type TaskPriority,
  type TaskTeamMember,
  type TaskView,
} from "../domain/task-types";
import type { TaskRunResult } from "../hooks/use-tasks-controller";
import { AssigneePicker } from "./assignee-picker";

type Props = {
  /** Present when editing; absent when creating. */
  task?: TaskView;
  team: readonly TaskTeamMember[];
  categories: readonly TaskCategory[];
  today: string;
  onClose: () => void;
  onSubmit: (command: TaskCommand) => Promise<TaskRunResult>;
};

const textareaClass =
  "border-input bg-background/70 text-foreground placeholder:text-muted-foreground focus-visible:border-primary/60 focus-visible:ring-ring/40 min-h-24 w-full rounded-xl border px-3 py-2.5 text-sm transition outline-none focus-visible:ring-2";

/**
 * Create or edit a task (manager+). Editing changes the task's content and
 * timing; who it is assigned to changes through the dedicated reassign flow
 * so every reassignment is its own audited event.
 */
export function TaskFormDialog({
  task,
  team,
  categories,
  today,
  onClose,
  onSubmit,
}: Props) {
  const editing = Boolean(task);
  const [title, setTitle] = useState(task?.title ?? "");
  const [instructions, setInstructions] = useState(task?.instructions ?? "");
  const [category, setCategory] = useState(task?.category ?? "other");
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority ?? "normal",
  );
  const [startDate, setStartDate] = useState(task?.startDate ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [dueTime, setDueTime] = useState(task?.dueTime ?? "");
  const [dueWindow, setDueWindow] = useState<DueWindow | "">(
    task?.dueWindow ?? "",
  );
  const [mode, setMode] = useState<AssignmentMode>("individual");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [eachPerson, setEachPerson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

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
    const command: TaskCommand = task
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

    const result = await onSubmit(command);
    setSaving(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? "Edit task" : "New task"}
      description={
        editing
          ? "Change what the task says or when it is due."
          : "Assign work to one person, several people or the whole team."
      }
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

        {!editing ? (
          <>
            <AssigneePicker
              idPrefix="task"
              mode={mode}
              onModeChange={setMode}
              assigneeIds={assigneeIds}
              onAssigneeIdsChange={setAssigneeIds}
              team={team}
            />
            {mode === "multiple" ? (
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              min={editing ? undefined : today}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-due-time">Due time (optional)</Label>
            <Input
              id="task-due-time"
              type="time"
              value={dueTime}
              disabled={!dueDate}
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
            {saving ? "Saving…" : editing ? "Save changes" : "Create task"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
