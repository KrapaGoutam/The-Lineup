"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  MoreHorizontal,
  Redo2,
  RotateCcw,
  Rows3,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getAllocationHistoryWindow,
  shiftIsoDate,
} from "@/features/allocation/domain/allocation-history-window";

type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => void;
};

/**
 * The compact "Tools" menu: the infrequent controls, kept off the working
 * surface. Undo / Redo call the existing authoritative undo/redo (no local
 * history stack here). Every destructive action goes through an explicit
 * confirmation dialog -- one casual tap can never erase a service's history.
 * Row / column / entry clears act on the current selection and name it in
 * their label, so they cannot hit something the host did not pick.
 */
export function ToolsMenu({
  canUndo,
  canRedo,
  readOnly,
  canOperate,
  onUndo,
  onRedo,
  onAddRow,
  selectedEntry,
  selectedTurn,
  selectedServer,
  onClearEntry,
  onClearRow,
  onClearColumn,
  onClearBoard,
  serviceDate,
  todayDate,
  onDateChange,
  dateLoading = false,
}: {
  canUndo: boolean;
  canRedo: boolean;
  readOnly: boolean;
  canOperate: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onAddRow: () => void;
  /** Present only when a clearable entry is selected, e.g. "T4 (Mia, turn 3)". */
  selectedEntry: string | null;
  /** The selected entry's turn, e.g. "turn 3". */
  selectedTurn: string | null;
  /** The selected server's name. */
  selectedServer: string | null;
  onClearEntry: () => void;
  onClearRow: () => void;
  onClearColumn: () => void;
  onClearBoard: () => void;
  /** Current viewed service date (e.g. "2026-11-17"). */
  serviceDate?: string;
  /** Location's today service date. */
  todayDate?: string;
  /** Handler when user selects a different service date within the 7-day window. */
  onDateChange?: (nextDate: string) => void;
  dateLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);

  const historyWindow = todayDate
    ? getAllocationHistoryWindow(todayDate)
    : null;
  const minDate = historyWindow?.minDate;
  const isToday = serviceDate === todayDate;

  function act(run: () => void) {
    setOpen(false);
    run();
  }
  function ask(next: Confirmation) {
    setOpen(false);
    setConfirm(next);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <MoreHorizontal aria-hidden="true" /> Tools
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Tools"
        description="Corrections and less common board actions."
      >
        <div className="flex flex-col gap-1.5">
          {todayDate && serviceDate && onDateChange && minDate ? (
            <div className="border-border bg-muted/20 my-1 flex flex-col gap-2 rounded-xl border p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-medium">
                  Service date{" "}
                  {isToday ? "(Today · Live)" : "(Historical · Read-only)"}
                </span>
                {!isToday ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={dateLoading}
                    onClick={() => act(() => onDateChange(todayDate))}
                  >
                    <RotateCcw className="mr-1 size-3" aria-hidden="true" />{" "}
                    Back to today
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="Previous day"
                  disabled={dateLoading || serviceDate <= minDate}
                  onClick={() =>
                    act(() => onDateChange(shiftIsoDate(serviceDate, -1)))
                  }
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <Input
                  type="date"
                  aria-label="Service date"
                  value={serviceDate}
                  min={minDate}
                  max={todayDate}
                  disabled={dateLoading}
                  onChange={(e) => {
                    if (e.target.value) {
                      act(() => onDateChange(e.target.value));
                    }
                  }}
                  className="h-8 flex-1 text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="Next day"
                  disabled={dateLoading || serviceDate >= todayDate}
                  onClick={() =>
                    act(() => onDateChange(shiftIsoDate(serviceDate, 1)))
                  }
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <p className="text-muted-foreground text-[11px] leading-tight">
                Past 7 days ({minDate} to {todayDate}). Older dates are retired.
              </p>
              {dateLoading ? (
                <p className="text-muted-foreground text-xs italic">
                  Loading that day…
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              disabled={!canUndo || readOnly}
              onClick={() => act(onUndo)}
            >
              <Undo2 aria-hidden="true" /> Undo
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!canRedo || readOnly}
              onClick={() => act(onRedo)}
            >
              <Redo2 aria-hidden="true" /> Redo
            </Button>
          </div>
          {canOperate ? (
            <>
              <Button variant="outline" size="sm" onClick={() => act(onAddRow)}>
                <Rows3 aria-hidden="true" /> Add row
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedEntry}
                onClick={() =>
                  ask({
                    title: "Clear selected entry?",
                    description: `${selectedEntry} will be removed from the board. You can undo this.`,
                    confirmLabel: "Clear entry",
                    run: onClearEntry,
                  })
                }
              >
                <X aria-hidden="true" />
                {selectedEntry
                  ? `Clear entry ${selectedEntry}`
                  : "Clear selected entry"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedTurn}
                onClick={() =>
                  ask({
                    title: `Clear ${selectedTurn}?`,
                    description: `Every server's entry in ${selectedTurn} will be cleared. You can undo this.`,
                    confirmLabel: "Clear row",
                    run: onClearRow,
                  })
                }
              >
                <Eraser aria-hidden="true" />
                {selectedTurn ? `Clear ${selectedTurn}` : "Clear selected row"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedServer}
                onClick={() =>
                  ask({
                    title: `Clear ${selectedServer}'s column?`,
                    description: `All of ${selectedServer}'s entries today will be cleared. You can undo this.`,
                    confirmLabel: "Clear column",
                    run: onClearColumn,
                  })
                }
              >
                <Eraser aria-hidden="true" />
                {selectedServer
                  ? `Clear ${selectedServer}'s column`
                  : "Clear selected column"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive"
                onClick={() =>
                  ask({
                    title: "Clear the whole board?",
                    description:
                      "This removes every turn and table recorded today. Servers stay on the rotation. You can undo this.",
                    confirmLabel: "Clear board",
                    run: onClearBoard,
                  })
                }
              >
                <Trash2 aria-hidden="true" /> Clear board
              </Button>
            </>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              const run = confirm?.run;
              setConfirm(null);
              run?.();
            }}
          >
            {confirm?.confirmLabel}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
