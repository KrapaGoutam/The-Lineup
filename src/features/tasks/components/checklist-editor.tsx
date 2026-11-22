"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { MAX_CHECKLIST_STEPS } from "../domain/task-commands";
import type { TaskStepView } from "../domain/task-types";

/** One row in the editor. Existing steps keep their database id. */
export type StepDraft = { key: string; id: string | null; title: string };

let draftCounter = 0;
export function newDraftKey(): string {
  draftCounter += 1;
  return `draft-${draftCounter}`;
}

export function draftsFromSteps(steps: readonly TaskStepView[]): StepDraft[] {
  return steps.map((step) => ({
    key: step.id,
    id: step.id,
    title: step.title,
  }));
}

/** Blank rows are dropped; everything else keeps its order and identity. */
export function stepInputsFromDrafts(drafts: readonly StepDraft[]) {
  return drafts
    .map((draft) => ({ id: draft.id, title: draft.title.trim() }))
    .filter((step) => step.title.length > 0);
}

/** Whether the submitted list differs from the steps the editor opened with. */
export function checklistChanged(
  drafts: readonly StepDraft[],
  original: readonly TaskStepView[],
): boolean {
  const next = stepInputsFromDrafts(drafts);
  if (next.length !== original.length) return true;
  return next.some(
    (step, index) =>
      step.id !== original[index].id || step.title !== original[index].title,
  );
}

type Props = {
  steps: StepDraft[];
  onChange: (steps: StepDraft[]) => void;
  disabled?: boolean;
};

/**
 * Add, rename, reorder and remove checklist steps. A plain ordered list of
 * inputs: reordering uses explicit move buttons (keyboard and touch friendly),
 * and removing a step only removes it from this draft until the task is saved.
 */
export function ChecklistEditor({ steps, onChange, disabled = false }: Props) {
  function update(index: number, title: string) {
    onChange(steps.map((s, i) => (i === index ? { ...s, title } : s)));
  }
  function remove(index: number) {
    onChange(steps.filter((_, i) => i !== index));
  }
  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  function add() {
    if (steps.length >= MAX_CHECKLIST_STEPS) return;
    onChange([...steps, { key: newDraftKey(), id: null, title: "" }]);
  }

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">
        Checklist steps (optional)
      </legend>
      {steps.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No steps yet. Add the small jobs that make up this task.
        </p>
      ) : (
        <ol className="space-y-2">
          {steps.map((step, index) => (
            <li key={step.key} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="text-muted-foreground w-6 flex-none text-right text-sm tabular-nums"
              >
                {index + 1}.
              </span>
              <Input
                aria-label={`Step ${index + 1}`}
                value={step.title}
                maxLength={160}
                placeholder="e.g. Check refrigerator temperatures"
                onChange={(event) => update(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (index === steps.length - 1) add();
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move step ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Move step ${index + 1} down`}
                disabled={index === steps.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove step ${index + 1}`}
                onClick={() => remove(index)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <Button
        variant="outline"
        disabled={steps.length >= MAX_CHECKLIST_STEPS}
        onClick={add}
      >
        <Plus aria-hidden="true" />
        Add step
      </Button>
    </fieldset>
  );
}
