"use client";

import { useState } from "react";
import { Archive, Pencil, Plus, Power } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { sortByOrder } from "../domain/chore-rules";
import type { ChoreBoardView, ChoreColumnView } from "../domain/chore-types";
import type { TaskTeamMember } from "../domain/task-types";
import type { ChoreController } from "../hooks/use-chore-controller";
import {
  ConfirmDialog,
  ErrorLine,
  Field,
  MoveButtons,
  movedIds,
  StatusBadge,
  useChoreAction,
} from "./chore-settings-parts";

type Props = {
  controller: ChoreController;
  board: ChoreBoardView;
  /** The location's eligible people (server-provided; the database re-checks). */
  team: readonly TaskTeamMember[];
};

type Dialogs =
  | { kind: "form"; column: ChoreColumnView | null }
  | { kind: "remove"; column: ChoreColumnView };

const UNASSIGNED = "";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/** Tasks → Manage → People / Columns. The label is what the board shows; the employee is who it belongs to. */
export function ChorePeopleSection({ controller, board, team }: Props) {
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const { busy, error, setError, act } = useChoreAction(controller);
  const columns = sortByOrder(board.columns.filter((c) => !c.archived));
  const nameOf = (profileId: string | null) =>
    profileId === null
      ? "Unassigned position"
      : (team.find((m) => m.profileId === profileId)?.name ??
        "Former team member");

  async function move(column: ChoreColumnView, direction: -1 | 1) {
    const next = movedIds(
      columns.map((c) => c.id),
      column.id,
      direction,
    );
    if (next)
      await act({ type: "columnsReorder", boardId: board.id, columnIds: next });
  }

  function close() {
    setDialog(null);
    setError(null);
  }

  return (
    <section aria-label="People and columns" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Each column is a person or a responsibility position on{" "}
          <strong>{board.name}</strong>. The label is only what the board shows;
          renaming it never changes the employee&apos;s account.
        </p>
        <Button onClick={() => setDialog({ kind: "form", column: null })}>
          <Plus aria-hidden="true" />
          Add column
        </Button>
      </div>
      <ErrorLine message={dialog ? null : error} />

      {columns.length === 0 ? (
        <p
          role="status"
          className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm"
        >
          No columns yet. Add a person or a position.
        </p>
      ) : (
        <ul className="space-y-2">
          {columns.map((column, index) => {
            const history = board.assignments
              .filter((a) => a.columnId === column.id)
              .sort((a, b) => a.assignedAt.localeCompare(b.assignedAt));
            return (
              <li
                key={column.id}
                data-testid="chore-column-item"
                className="border-border space-y-2 rounded-2xl border p-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {column.label}
                      <StatusBadge isActive={column.isActive} />
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {column.profileId === null ? (
                        <Badge>Position</Badge>
                      ) : (
                        <>Assigned to {nameOf(column.profileId)}</>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <MoveButtons
                      index={index}
                      count={columns.length}
                      label={column.label}
                      disabled={busy}
                      onMove={(d) => void move(column, d)}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDialog({ kind: "form", column })}
                    >
                      <Pencil aria-hidden="true" />
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void act({
                          type: "columnSetState",
                          columnId: column.id,
                          state: column.isActive ? "inactive" : "active",
                        })
                      }
                    >
                      <Power aria-hidden="true" />
                      {column.isActive ? "Turn off" : "Turn on"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ kind: "remove", column })}
                    >
                      <Archive aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                </div>
                {history.length > 1 ? (
                  <details className="text-xs">
                    <summary className="text-muted-foreground cursor-pointer">
                      Assignment history ({history.length})
                    </summary>
                    <ul className="text-muted-foreground mt-1 space-y-0.5">
                      {history.map((a, i) => (
                        <li key={`${a.assignedAt}-${i}`}>
                          {nameOf(a.profileId)} ·{" "}
                          {dateFormat.format(new Date(a.assignedAt))} –{" "}
                          {a.endedAt
                            ? dateFormat.format(new Date(a.endedAt))
                            : "now"}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {dialog?.kind === "form" ? (
        <ColumnFormDialog
          key={dialog.column?.id ?? "new"}
          board={board}
          column={dialog.column}
          team={team}
          taken={columns
            .filter((c) => c.id !== dialog.column?.id && c.isActive)
            .map((c) => c.profileId)}
          controller={controller}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === "remove" ? (
        <ConfirmDialog
          title="Remove this column?"
          description={`${dialog.column.label} leaves the board. Checks already recorded for it stay on record.`}
          confirmLabel="Remove column"
          busy={busy}
          error={error}
          onClose={close}
          onConfirm={() =>
            void act({
              type: "columnSetState",
              columnId: dialog.column.id,
              state: "archived",
            }).then((ok) => ok && close())
          }
        />
      ) : null}
    </section>
  );
}

function ColumnFormDialog({
  board,
  column,
  team,
  taken,
  controller,
  onClose,
}: {
  board: ChoreBoardView;
  column: ChoreColumnView | null;
  team: readonly TaskTeamMember[];
  taken: (string | null)[];
  controller: ChoreController;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(column?.label ?? "");
  const [profileId, setProfileId] = useState<string>(
    column?.profileId ?? UNASSIGNED,
  );
  const { busy, error, act } = useChoreAction(controller);
  const known = team.some((m) => m.profileId === column?.profileId);

  return (
    <Dialog
      open
      onClose={onClose}
      title={column ? "Edit column" : "Add column"}
      description={board.name}
      className="max-w-[min(94vw,32rem)] sm:w-[min(94vw,32rem)]"
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act({
            type: "columnSave",
            boardId: board.id,
            columnId: column?.id ?? null,
            label,
            profileId: profileId === UNASSIGNED ? null : profileId,
          }).then((ok) => ok && onClose());
        }}
      >
        <Field
          id="column-person"
          label="Employee"
          hint="Choose who this column belongs to, or leave it as an unassigned position anyone on the team can check."
        >
          <Select
            id="column-person"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
          >
            <option value={UNASSIGNED}>Unassigned position</option>
            {column?.profileId && !known ? (
              <option value={column.profileId}>
                Former team member (current)
              </option>
            ) : null}
            {team.map((m) => (
              <option
                key={m.profileId}
                value={m.profileId}
                disabled={
                  taken.includes(m.profileId) && m.profileId !== profileId
                }
              >
                {m.name}
                {taken.includes(m.profileId) ? " (already has a column)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="column-label"
          label="Column label"
          hint="What the board shows. Leave it empty to use the employee's name."
        >
          <Input
            id="column-label"
            value={label}
            maxLength={60}
            placeholder={
              team.find((m) => m.profileId === profileId)?.name ??
              "e.g. Prep Cook 2"
            }
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        {column && column.profileId !== (profileId || null) ? (
          <p className="text-muted-foreground text-xs">
            Reassigning keeps the earlier holder in the history, and checks they
            already made stay under their name.
          </p>
        ) : null}
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
          <Button
            type="submit"
            disabled={busy || (label.trim() === "" && profileId === UNASSIGNED)}
          >
            {busy ? "Saving…" : column ? "Save column" : "Add column"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
