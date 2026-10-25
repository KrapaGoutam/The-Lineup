"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { TaskCommand } from "../domain/task-commands";
import type {
  ChecklistKind,
  ChecklistTemplateView,
} from "../domain/task-types";
import type {
  TaskRunResult,
  TasksController,
} from "../hooks/use-tasks-controller";
import { TemplateDialog } from "./template-dialog";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function daysText(days: readonly number[]): string {
  if (days.length === 7) return "Every day";
  return days.map((d) => DAY_LABELS[d]).join(", ");
}

type Props = {
  controller: TasksController;
  execute: (command: TaskCommand) => Promise<TaskRunResult>;
};

/** Manager-only: reusable Opening and Closing templates. */
export function TemplatesPanel({ controller, execute }: Props) {
  const snapshot = controller.snapshot;
  const [editing, setEditing] = useState<{
    kind: ChecklistKind;
    template?: ChecklistTemplateView;
  } | null>(null);

  if (!snapshot) return null;

  return (
    <section aria-label="Checklist templates" className="space-y-4">
      {(["opening", "closing"] as const).map((kind) => {
        const templates = snapshot.templates.filter((t) => t.kind === kind);
        const label = kind === "opening" ? "Opening" : "Closing";
        return (
          <div
            key={kind}
            className="border-border bg-card space-y-3 rounded-2xl border p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{label} templates</h2>
                <p className="text-muted-foreground text-sm">
                  What should happen each day. Every day gets its own checklist.
                </p>
              </div>
              <Button variant="secondary" onClick={() => setEditing({ kind })}>
                <Plus aria-hidden="true" />
                New {kind} template
              </Button>
            </div>
            {templates.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No {kind} templates yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {templates.map((template) => (
                  <li
                    key={template.id}
                    className="border-border flex flex-wrap items-center gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {template.name}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {template.items.length}{" "}
                        {template.items.length === 1 ? "item" : "items"} ·{" "}
                        {daysText(template.daysOfWeek)}
                      </span>
                    </div>
                    {!template.active ? <Badge>Archived</Badge> : null}
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => setEditing({ kind, template })}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11"
                      onClick={() =>
                        void execute({
                          type: "templateSetActive",
                          templateId: template.id,
                          active: !template.active,
                        })
                      }
                    >
                      {template.active ? "Archive" : "Restore"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {editing ? (
        <TemplateDialog
          key={editing.template?.id ?? `new-${editing.kind}`}
          kind={editing.kind}
          template={editing.template}
          team={snapshot.team}
          onClose={() => setEditing(null)}
          onSubmit={execute}
        />
      ) : null}
    </section>
  );
}
