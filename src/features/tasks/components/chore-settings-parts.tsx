"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

import type { ChoreCommand } from "../domain/chore-commands";
import type { ChoreBoardView } from "../domain/chore-types";
import type { ChoreController } from "../hooks/use-chore-controller";

/** Runs one command at a time and keeps the busy flag and the plain-language error. */
export function useChoreAction(controller: ChoreController) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(command: ChoreCommand): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const result = await controller.run(command);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    return true;
  }

  return { busy, error, setError, act };
}

/** The settings a boardSave carries, taken from the board and changed by `patch`. */
export function boardSaveCommand(
  board: ChoreBoardView,
  patch: Partial<Extract<ChoreCommand, { type: "boardSave" }>> = {},
): Extract<ChoreCommand, { type: "boardSave" }> {
  return {
    type: "boardSave",
    boardId: board.id,
    name: board.name,
    description: board.description,
    staffAccess: board.staffAccess,
    managerOverride: board.managerOverride,
    defaultMode: board.defaultMode,
    recurrenceIntent: board.recurrenceIntent,
    resetIntent: board.resetIntent,
    expectedVersion: board.version,
    ...patch,
  };
}

export function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  ) : null;
}

/** Move a list item up or down (touch-friendly, keyboard-friendly; no drag needed). */
export function MoveButtons({
  index,
  count,
  label,
  disabled,
  onMove,
}: {
  index: number;
  count: number;
  label: string;
  disabled?: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <span className="inline-flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Move ${label} up`}
        disabled={disabled || index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Move ${label} down`}
        disabled={disabled || index >= count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown aria-hidden="true" />
      </Button>
    </span>
  );
}

export function StatusBadge({
  isActive,
  archived,
}: {
  isActive: boolean;
  archived?: boolean;
}) {
  if (archived) return <Badge>Archived</Badge>;
  return isActive ? (
    <Badge tone="success">On</Badge>
  ) : (
    <Badge tone="warning">Off</Badge>
  );
}

/** Moves `id` by one place inside `ids` and returns the new order (or null at the ends). */
export function movedIds(
  ids: readonly string[],
  id: string,
  direction: -1 | 1,
): string[] | null {
  const index = ids.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return null;
  const next = [...ids];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as string);
  return next;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description={description}
      className="max-w-[min(94vw,30rem)] sm:w-[min(94vw,30rem)]"
    >
      <div className="space-y-3">
        {children}
        <ErrorLine message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** A labelled form field shell. */
export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

export const TEXTAREA_CLASS =
  "border-input bg-background/70 text-foreground focus-visible:border-primary/60 focus-visible:ring-ring/40 min-h-20 w-full rounded-xl border px-3 py-2 text-sm transition outline-none focus-visible:ring-2";
