"use client";

import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { TaskCommand } from "../domain/task-commands";
import { WINDOW_LABELS } from "../domain/task-rules";
import {
  DUE_WINDOWS,
  type AssignmentMode,
  type ChecklistKind,
  type ChecklistTemplateItemView,
  type ChecklistTemplateView,
  type DueWindow,
  type TaskTeamMember,
} from "../domain/task-types";
import type { TaskRunResult } from "../hooks/use-tasks-controller";
import { AssigneePicker } from "./assignee-picker";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DraftItem = ChecklistTemplateItemView & { key: number };

type Props = {
  kind: ChecklistKind;
  template?: ChecklistTemplateView;
  team: readonly TaskTeamMember[];
  onClose: () => void;
  onSubmit: (command: TaskCommand) => Promise<TaskRunResult>;
};

let nextKey = 1;

function blankItem(kind: ChecklistKind): DraftItem {
  return {
    key: nextKey++,
    title: "",
    instructions: null,
    category: kind,
    priority: "normal",
    assignmentMode: "anyone",
    assigneeIds: [],
    dueWindow: null,
    dueTime: null,
  };
}

/**
 * Create or edit an Opening / Closing template. A template says what should
 * happen; each day's actual checklist is generated from it separately, so
 * editing here never changes a day that has already started.
 */
export function TemplateDialog({
  kind,
  template,
  team,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(template?.name ?? "");
  const [days, setDays] = useState<number[]>(
    template?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
  );
  const [items, setItems] = useState<DraftItem[]>(() =>
    template && template.items.length > 0
      ? template.items.map((item) => ({ ...item, key: nextKey++ }))
      : [blankItem(kind)],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function patch(key: number, change: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );
  }

  function move(index: number, delta: -1 | 1) {
    setItems((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await onSubmit({
      type: "templateSave",
      templateId: template?.id ?? null,
      input: {
        kind,
        name: name.trim(),
        daysOfWeek: days,
        active: template?.active ?? true,
        items: items
          .filter((item) => item.title.trim())
          .map((item) => ({
            title: item.title.trim(),
            instructions: item.instructions?.trim() || null,
            category: item.category,
            priority: item.priority,
            assignmentMode: item.assignmentMode,
            assigneeIds: item.assigneeIds,
            dueWindow: item.dueWindow,
            dueTime: item.dueTime,
          })),
      },
    });
    setSaving(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  const label = kind === "opening" ? "Opening" : "Closing";

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        template
          ? `Edit ${label.toLowerCase()} template`
          : `New ${label.toLowerCase()} template`
      }
      description="Each day gets its own fresh checklist generated from this template."
      className="max-w-[min(96vw,44rem)] sm:w-[min(96vw,44rem)]"
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="template-name">Template name</Label>
          <Input
            id="template-name"
            value={name}
            maxLength={80}
            autoFocus
            required
            onChange={(event) => setName(event.target.value)}
            placeholder={`e.g. Weekday ${label}`}
          />
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Runs on</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((day, index) => {
              const on = days.includes(index);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setDays((current) =>
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
                  {day}
                </button>
              );
            })}
          </div>
        </fieldset>

        <section aria-label="Checklist items" className="space-y-3">
          <h3 className="text-sm font-semibold">Items</h3>
          <ol className="space-y-3">
            {items.map((item, index) => (
              <li
                key={item.key}
                className="border-border bg-muted/30 space-y-3 rounded-2xl border p-3"
              >
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor={`item-title-${item.key}`}>
                      Item {index + 1}
                    </Label>
                    <Input
                      id={`item-title-${item.key}`}
                      value={item.title}
                      maxLength={160}
                      onChange={(event) =>
                        patch(item.key, { title: event.target.value })
                      }
                      placeholder="e.g. Unlock entrance"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move item ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move item ${index + 1} down`}
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() =>
                      setItems((current) =>
                        current.filter(
                          (candidate) => candidate.key !== item.key,
                        ),
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <AssigneePicker
                  idPrefix={`item-${item.key}`}
                  mode={item.assignmentMode}
                  onModeChange={(mode: AssignmentMode) =>
                    patch(item.key, { assignmentMode: mode })
                  }
                  assigneeIds={item.assigneeIds}
                  onAssigneeIdsChange={(ids) =>
                    patch(item.key, { assigneeIds: ids })
                  }
                  team={team}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`item-window-${item.key}`}>
                      Due window (optional)
                    </Label>
                    <Select
                      id={`item-window-${item.key}`}
                      value={item.dueWindow ?? ""}
                      onChange={(event) =>
                        patch(item.key, {
                          dueWindow: (event.target.value ||
                            null) as DueWindow | null,
                        })
                      }
                    >
                      <option value="">
                        Default for {label.toLowerCase()}
                      </option>
                      {DUE_WINDOWS.map((value) => (
                        <option key={value} value={value}>
                          {WINDOW_LABELS[value]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`item-notes-${item.key}`}>
                      Instructions (optional)
                    </Label>
                    <Input
                      id={`item-notes-${item.key}`}
                      value={item.instructions ?? ""}
                      maxLength={2000}
                      onChange={(event) =>
                        patch(item.key, { instructions: event.target.value })
                      }
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <Button
            variant="outline"
            onClick={() => setItems((current) => [...current, blankItem(kind)])}
          >
            <Plus aria-hidden="true" />
            Add item
          </Button>
        </section>

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving || !name.trim() || days.length === 0}
          >
            {saving ? "Saving…" : "Save template"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
