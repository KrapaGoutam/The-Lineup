"use client";

import { useState } from "react";
import {
  Eraser,
  MoreHorizontal,
  Redo2,
  Rows3,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

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
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);

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
