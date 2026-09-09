"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Feature 025. Same lightweight dialog pattern as this app's other
 * confirm-a-choice dialogs (e.g. team's RenameMemberDialog) -- an overlay,
 * a Card, an X close button, a form. Rendered only for `access.scope ===
 * "all"`; a `self`-scoped viewer's Print button skips this dialog
 * entirely and prints directly (there is only ever one possible choice
 * for them, and offering "selected"/"all" would expose the existence of
 * other people's records, which the privacy invariant forbids).
 *
 * This is where the old always-on checkbox multi-select actually ends up
 * living (see tasks/current-task.md's Reconciliation 2) -- only reachable
 * here, only when "Print selected employees" is chosen, never as the
 * primary browsing UI.
 */
export function AttendancePrintDialog({
  currentPersonId,
  people,
  onClose,
  onConfirm,
}: {
  currentPersonId: number;
  people: Array<{ id: number; label: string }>;
  onClose: () => void;
  onConfirm: (targetIds: number[]) => void;
}) {
  const [choice, setChoice] = useState<"current" | "selected" | "all">(
    "current",
  );
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const currentPersonLabel =
    people.find((person) => person.id === currentPersonId)?.label ??
    "the current employee";

  function toggle(id: number) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (choice === "selected" && checkedIds.size === 0) {
      setError("Choose at least one employee.");
      return;
    }
    const targetIds =
      choice === "current"
        ? [currentPersonId]
        : choice === "all"
          ? people.map((person) => person.id)
          : Array.from(checkedIds);
    onConfirm(targetIds);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-print-title"
        className="w-full max-w-sm shadow-2xl"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <h2 id="attendance-print-title" className="text-lg font-semibold">
              Print attendance
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Choose who to include in the printed report.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close print dialog"
          >
            <X />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="sr-only">Who to print</legend>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="attendance-print-choice"
                  checked={choice === "current"}
                  onChange={() => setChoice("current")}
                  className="accent-[var(--primary)]"
                />
                Print current employee ({currentPersonLabel})
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="attendance-print-choice"
                  checked={choice === "selected"}
                  onChange={() => setChoice("selected")}
                  className="accent-[var(--primary)]"
                />
                Print selected employees
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="attendance-print-choice"
                  checked={choice === "all"}
                  onChange={() => setChoice("all")}
                  className="accent-[var(--primary)]"
                />
                Print all employees
              </label>
            </fieldset>

            {choice === "selected" ? (
              <div className="border-border grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-xl border p-2 sm:grid-cols-2">
                {people.map((person) => (
                  <label
                    key={person.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checkedIds.has(person.id)}
                      onChange={() => toggle(person.id)}
                      className="accent-[var(--primary)]"
                    />
                    {person.label}
                  </label>
                ))}
              </div>
            ) : null}

            {error ? (
              <p className="text-destructive text-sm" aria-live="polite">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Print</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
