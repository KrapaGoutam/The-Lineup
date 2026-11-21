"use client";

import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  canTickCell,
  cellState,
  findCompletion,
  type CellState,
} from "../domain/chore-rules";
import type {
  ChoreBoardView,
  ChoreColumnView,
  ChoreRowView,
  ChoreViewer,
} from "../domain/chore-types";

type Props = {
  board: ChoreBoardView;
  row: ChoreRowView;
  column: ChoreColumnView;
  viewer: ChoreViewer;
  pending: boolean;
  onToggle: (done: boolean) => void;
  /** Larger target for the phone list. */
  large?: boolean;
};

const STATE_LABEL: Record<CellState, string> = {
  not_applicable: "Not applicable",
  required_open: "Required, not done",
  required_done: "Required, done",
  optional_open: "Optional, not done",
  optional_done: "Optional, done",
  covered: "Covered by another person",
};

/**
 * One checklist requirement. A real checkbox (role + aria-checked) with a 44px
 * target. Not-applicable cells render a dash and are not interactive; a cell the
 * viewer may not change is disabled with the reason as its description. The
 * database decides again on every write.
 */
export function ChoreCell({
  board,
  row,
  column,
  viewer,
  pending,
  onToggle,
  large = false,
}: Props) {
  const state = cellState(board, row, column);
  const completion = findCompletion(board, row.id, column.id);
  const name = `${row.title} — ${column.label}`;

  if (state === "not_applicable") {
    return (
      <span
        role="img"
        aria-label={`${name}: not applicable`}
        data-state="not_applicable"
        className="text-muted-foreground/60 inline-flex min-h-11 min-w-11 items-center justify-center"
      >
        <Minus aria-hidden="true" className="size-4" />
      </span>
    );
  }

  const decision = canTickCell(viewer, board, row, column);
  const done = completion !== undefined;
  const optional = !row.isRequired;
  const disabled = pending || !decision.allowed;
  const reason = decision.allowed ? null : decision.reason;
  const who = completion
    ? `${completion.completedByName}${
        completion.enteredAs === "manager_correction" ? " (manager entry)" : ""
      }`
    : null;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${name}: ${STATE_LABEL[state]}`}
      aria-busy={pending || undefined}
      aria-disabled={disabled || undefined}
      data-state={state}
      data-testid="chore-cell"
      title={reason ?? who ?? undefined}
      onClick={() => {
        if (disabled) return;
        onToggle(!done);
      }}
      className={cn(
        "focus-visible:ring-ring inline-flex items-center justify-center rounded-xl outline-none focus-visible:ring-2",
        large ? "min-h-14 min-w-14" : "min-h-11 min-w-11",
        disabled && !pending ? "cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid place-items-center rounded-lg border-2 transition-colors motion-reduce:transition-none",
          large ? "size-9" : "size-7",
          done
            ? "border-ok bg-ok text-white"
            : state === "covered"
              ? "border-border bg-muted/60 border-dashed"
              : optional
                ? "border-muted-foreground/50 border-dashed"
                : "border-muted-foreground/70",
          disabled && !done ? "opacity-50" : "",
          pending ? "animate-pulse motion-reduce:animate-none" : "",
        )}
      >
        {done ? <Check className="size-5" strokeWidth={3} /> : null}
        {state === "covered" ? (
          <Check className="text-muted-foreground size-4" />
        ) : null}
      </span>
    </button>
  );
}
