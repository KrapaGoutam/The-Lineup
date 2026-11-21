"use client";

import { useState } from "react";
import { Copy, Plus, Power, Archive, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { sortByOrder } from "../domain/chore-rules";
import type { ChoreBoardView } from "../domain/chore-types";
import type { ChoreController } from "../hooks/use-chore-controller";
import {
  boardSaveCommand,
  ConfirmDialog,
  ErrorLine,
  Field,
  MoveButtons,
  movedIds,
  StatusBadge,
  TEXTAREA_CLASS,
  useChoreAction,
} from "./chore-settings-parts";

type Props = {
  controller: ChoreController;
  boards: readonly ChoreBoardView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** A board was just created or copied: select it by name once it arrives. */
  onCreated: (name: string) => void;
};

type Dialogs =
  | { kind: "create" }
  | { kind: "edit"; board: ChoreBoardView }
  | { kind: "duplicate"; board: ChoreBoardView }
  | { kind: "archive"; board: ChoreBoardView };

/** Tasks → Manage → Boards: create, rename, describe, duplicate, switch on/off, archive, reorder. */
export function ChoreBoardsSection({
  controller,
  boards,
  selectedId,
  onSelect,
  onCreated,
}: Props) {
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const { busy, error, setError, act } = useChoreAction(controller);
  const live = sortByOrder(boards.filter((b) => !b.archived));
  const archived = boards.filter((b) => b.archived);

  async function toggle(board: ChoreBoardView) {
    await act({
      type: "boardSetState",
      boardId: board.id,
      state: board.isActive ? "inactive" : "active",
    });
  }

  async function move(board: ChoreBoardView, direction: -1 | 1) {
    const next = movedIds(
      live.map((b) => b.id),
      board.id,
      direction,
    );
    if (next) await act({ type: "boardsReorder", boardIds: next });
  }

  function close() {
    setDialog(null);
    setError(null);
  }

  return (
    <section aria-label="Boards" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Each board is one routine your team checks off together. Boards belong
          to this location.
        </p>
        <Button onClick={() => setDialog({ kind: "create" })}>
          <Plus aria-hidden="true" />
          New board
        </Button>
      </div>
      <ErrorLine message={dialog ? null : error} />

      {live.length === 0 ? (
        <p
          role="status"
          className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm"
        >
          No boards yet. Create one to get started.
        </p>
      ) : (
        <ul className="space-y-2">
          {live.map((board, index) => {
            const liveRows = board.rows.filter((r) => !r.archived).length;
            const liveCols = board.columns.filter((c) => !c.archived).length;
            return (
              <li
                key={board.id}
                data-testid="chore-board-item"
                className="border-border flex flex-wrap items-center gap-3 rounded-2xl border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <button
                      type="button"
                      className="focus-visible:ring-ring rounded text-left underline-offset-2 outline-none hover:underline focus-visible:ring-2"
                      aria-pressed={selectedId === board.id}
                      onClick={() => onSelect(board.id)}
                    >
                      {board.name}
                    </button>
                    <StatusBadge isActive={board.isActive} />
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {liveRows} {liveRows === 1 ? "chore" : "chores"} ·{" "}
                    {liveCols} {liveCols === 1 ? "column" : "columns"}
                    {board.cycle ? ` · Cycle ${board.cycle.sequence}` : ""}
                  </p>
                  {board.description ? (
                    <p className="text-muted-foreground text-xs">
                      {board.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <MoveButtons
                    index={index}
                    count={live.length}
                    label={board.name}
                    disabled={busy}
                    onMove={(d) => void move(board, d)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDialog({ kind: "edit", board })}
                  >
                    <Pencil aria-hidden="true" />
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDialog({ kind: "duplicate", board })}
                  >
                    <Copy aria-hidden="true" />
                    Duplicate
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void toggle(board)}
                  >
                    <Power aria-hidden="true" />
                    {board.isActive ? "Turn off" : "Turn on"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ kind: "archive", board })}
                  >
                    <Archive aria-hidden="true" />
                    Archive
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {archived.length > 0 ? (
        <details className="border-border rounded-2xl border p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Archived boards ({archived.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {archived.map((board) => (
              <li
                key={board.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  {board.name}{" "}
                  <span className="text-muted-foreground text-xs">
                    (read-only; completed records are kept)
                  </span>
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDialog({ kind: "duplicate", board })}
                >
                  <Copy aria-hidden="true" />
                  Duplicate as new board
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {dialog?.kind === "create" || dialog?.kind === "edit" ? (
        <BoardFormDialog
          key={dialog.kind === "edit" ? dialog.board.id : "new"}
          board={dialog.kind === "edit" ? dialog.board : null}
          controller={controller}
          onCreated={onCreated}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === "duplicate" ? (
        <DuplicateDialog
          board={dialog.board}
          controller={controller}
          onCreated={onCreated}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === "archive" ? (
        <ConfirmDialog
          title="Archive this board?"
          description={`${dialog.board.name} leaves the board list and can no longer be checked or edited. Completed records are kept. You can duplicate it later to reuse its setup.`}
          confirmLabel="Archive board"
          busy={busy}
          error={error}
          onClose={close}
          onConfirm={() =>
            void act({
              type: "boardSetState",
              boardId: dialog.board.id,
              state: "archived",
            }).then((ok) => ok && close())
          }
        />
      ) : null}
    </section>
  );
}

function BoardFormDialog({
  board,
  controller,
  onCreated,
  onClose,
}: {
  board: ChoreBoardView | null;
  controller: ChoreController;
  onCreated: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(board?.name ?? "");
  const [description, setDescription] = useState(board?.description ?? "");
  const { busy, error, act } = useChoreAction(controller);

  async function save() {
    const base = board
      ? boardSaveCommand(board)
      : ({
          type: "boardSave",
          boardId: null,
          name: "",
          description: null,
          staffAccess: "own_column",
          managerOverride: false,
          defaultMode: "all_columns",
          recurrenceIntent: "continuous",
          resetIntent: "manual_restart",
          expectedVersion: null,
        } as const);
    const ok = await act({
      ...base,
      name,
      description: description.trim() || null,
    });
    if (ok) {
      if (!board) onCreated(name.trim());
      onClose();
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={board ? "Edit board" : "New board"}
      description={
        board
          ? "Rename the board or change its description."
          : "Give the routine a name. You will add the people and chores next."
      }
      className="max-w-[min(94vw,32rem)] sm:w-[min(94vw,32rem)]"
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field id="board-name" label="Board name">
          <Input
            id="board-name"
            value={name}
            maxLength={80}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id="board-description" label="Description (optional)">
          <textarea
            id="board-description"
            className={TEXTAREA_CLASS}
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <ErrorLine message={error} />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy || name.trim() === ""}>
            {busy ? "Saving…" : board ? "Save board" : "Create board"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DuplicateDialog({
  board,
  controller,
  onCreated,
  onClose,
}: {
  board: ChoreBoardView;
  controller: ChoreController;
  onCreated: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(`${board.name} copy`.slice(0, 80));
  const { busy, error, act } = useChoreAction(controller);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Duplicate board"
      description="Copies the settings, people and chores. Nothing that was checked off is copied."
      className="max-w-[min(94vw,32rem)] sm:w-[min(94vw,32rem)]"
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act({
            type: "boardDuplicate",
            boardId: board.id,
            name,
          }).then((ok) => {
            if (!ok) return;
            onCreated(name.trim());
            onClose();
          });
        }}
      >
        <Field id="duplicate-name" label="Name of the new board">
          <Input
            id="duplicate-name"
            value={name}
            maxLength={80}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <ErrorLine message={error} />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy || name.trim() === ""}>
            {busy ? "Copying…" : "Duplicate board"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
