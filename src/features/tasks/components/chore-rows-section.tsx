"use client";

import { useState } from "react";
import { Archive, ListPlus, Pencil, Plus, Power } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { sortByOrder } from "../domain/chore-rules";
import {
  REQUIREMENT_MODES,
  REQUIREMENT_MODE_HELP,
  REQUIREMENT_MODE_LABELS,
  type ChoreBoardView,
  type ChoreRowView,
  type RequirementMode,
} from "../domain/chore-types";
import type { ChoreController } from "../hooks/use-chore-controller";
import {
  ConfirmDialog,
  ErrorLine,
  Field,
  MoveButtons,
  movedIds,
  StatusBadge,
  TEXTAREA_CLASS,
  useChoreAction,
} from "./chore-settings-parts";

type Props = { controller: ChoreController; board: ChoreBoardView };

type Dialogs =
  | { kind: "form"; row: ChoreRowView | null }
  | { kind: "bulk" }
  | { kind: "remove"; row: ChoreRowView };

/** Tasks → Manage → Chores / Rows. */
export function ChoreRowsSection({ controller, board }: Props) {
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const { busy, error, setError, act } = useChoreAction(controller);
  const rows = sortByOrder(board.rows.filter((r) => !r.archived));
  const columns = board.columns.filter((c) => !c.archived);

  async function move(row: ChoreRowView, direction: -1 | 1) {
    const next = movedIds(
      rows.map((r) => r.id),
      row.id,
      direction,
    );
    if (next)
      await act({ type: "rowsReorder", boardId: board.id, rowIds: next });
  }

  function close() {
    setDialog(null);
    setError(null);
  }

  return (
    <section aria-label="Chores and rows" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          The chores on <strong>{board.name}</strong>, in the order they appear.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => setDialog({ kind: "bulk" })}
          >
            <ListPlus aria-hidden="true" />
            Add several
          </Button>
          <Button onClick={() => setDialog({ kind: "form", row: null })}>
            <Plus aria-hidden="true" />
            Add chore
          </Button>
        </div>
      </div>
      <ErrorLine message={dialog ? null : error} />

      {rows.length === 0 ? (
        <p
          role="status"
          className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm"
        >
          No chores yet. Add the first one.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li
              key={row.id}
              data-testid="chore-row-item"
              className="border-border flex flex-wrap items-center gap-3 rounded-2xl border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {row.title}
                  <StatusBadge isActive={row.isActive} />
                  {!row.isRequired ? <Badge>Optional</Badge> : null}
                </p>
                <p className="text-muted-foreground text-xs">
                  {REQUIREMENT_MODE_LABELS[row.mode]}
                  {row.mode === "selected_columns"
                    ? `: ${row.selectedColumnIds
                        .map(
                          (id) =>
                            columns.find((c) => c.id === id)?.label ??
                            "removed",
                        )
                        .join(", ")}`
                    : ""}
                </p>
                {row.instructions ? (
                  <p className="text-muted-foreground text-xs">
                    {row.instructions}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <MoveButtons
                  index={index}
                  count={rows.length}
                  label={row.title}
                  disabled={busy}
                  onMove={(d) => void move(row, d)}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDialog({ kind: "form", row })}
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
                      type: "rowSetState",
                      rowId: row.id,
                      state: row.isActive ? "inactive" : "active",
                    })
                  }
                >
                  <Power aria-hidden="true" />
                  {row.isActive ? "Turn off" : "Turn on"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDialog({ kind: "remove", row })}
                >
                  <Archive aria-hidden="true" />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === "form" ? (
        <RowFormDialog
          key={dialog.row?.id ?? "new"}
          board={board}
          row={dialog.row}
          controller={controller}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === "bulk" ? (
        <BulkDialog board={board} controller={controller} onClose={close} />
      ) : null}
      {dialog?.kind === "remove" ? (
        <ConfirmDialog
          title="Remove this chore?"
          description={`${dialog.row.title} leaves the board. Checks already recorded for it stay on record.`}
          confirmLabel="Remove chore"
          busy={busy}
          error={error}
          onClose={close}
          onConfirm={() =>
            void act({
              type: "rowSetState",
              rowId: dialog.row.id,
              state: "archived",
            }).then((ok) => ok && close())
          }
        />
      ) : null}
    </section>
  );
}

function RowFormDialog({
  board,
  row,
  controller,
  onClose,
}: {
  board: ChoreBoardView;
  row: ChoreRowView | null;
  controller: ChoreController;
  onClose: () => void;
}) {
  const columns = sortByOrder(board.columns.filter((c) => !c.archived));
  const [title, setTitle] = useState(row?.title ?? "");
  const [instructions, setInstructions] = useState(row?.instructions ?? "");
  const [required, setRequired] = useState(row?.isRequired ?? true);
  const [mode, setMode] = useState<RequirementMode>(
    row?.mode ?? board.defaultMode,
  );
  const [selected, setSelected] = useState<string[]>(
    row?.selectedColumnIds ?? [],
  );
  const { busy, error, act } = useChoreAction(controller);

  return (
    <Dialog
      open
      onClose={onClose}
      title={row ? "Edit chore" : "Add chore"}
      description={board.name}
      className="max-w-[min(94vw,34rem)] sm:w-[min(94vw,34rem)]"
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act({
            type: "rowSave",
            boardId: board.id,
            rowId: row?.id ?? null,
            title,
            instructions: instructions.trim() || null,
            required,
            mode,
            columnIds: mode === "selected_columns" ? selected : [],
          }).then((ok) => ok && onClose());
        }}
      >
        <Field id="row-title" label="Chore name">
          <Input
            id="row-title"
            value={title}
            maxLength={120}
            autoFocus
            placeholder="e.g. Mango Lassi — Bucket 1"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field id="row-instructions" label="Instructions (optional)">
          <textarea
            id="row-instructions"
            className={TEXTAREA_CLASS}
            value={instructions}
            maxLength={500}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </Field>
        <label className="flex min-h-11 items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          <span>
            Required
            <span className="text-muted-foreground block text-xs">
              Optional chores can be checked but do not count toward the board
              total.
            </span>
          </span>
        </label>
        <Field
          id="row-mode"
          label="Who must complete it"
          hint={REQUIREMENT_MODE_HELP[mode]}
        >
          <Select
            id="row-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as RequirementMode)}
          >
            {REQUIREMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {REQUIREMENT_MODE_LABELS[m]}
              </option>
            ))}
          </Select>
        </Field>
        {mode === "selected_columns" ? (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Required from</legend>
            {columns.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Add people in People / Columns first.
              </p>
            ) : (
              columns.map((c) => (
                <label
                  key={c.id}
                  className="flex min-h-11 items-center gap-2.5 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={selected.includes(c.id)}
                    onChange={(e) =>
                      setSelected((cur) =>
                        e.target.checked
                          ? [...cur, c.id]
                          : cur.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {c.label}
                </label>
              ))
            )}
          </fieldset>
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
          <Button type="submit" disabled={busy || title.trim() === ""}>
            {busy ? "Saving…" : row ? "Save chore" : "Add chore"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function BulkDialog({
  board,
  controller,
  onClose,
}: {
  board: ChoreBoardView;
  controller: ChoreController;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  async function add() {
    setBusy(true);
    setError(null);
    let added = 0;
    for (const title of lines) {
      const result = await controller.run({
        type: "rowSave",
        boardId: board.id,
        rowId: null,
        title,
        instructions: null,
        required: true,
        // Bulk add cannot pick people, so a selected-people default falls back.
        mode:
          board.defaultMode === "selected_columns"
            ? "all_columns"
            : board.defaultMode,
        columnIds: [],
      });
      if (!result.ok) {
        setError(
          `Added ${added} of ${lines.length}. "${title}": ${result.error}`,
        );
        setBusy(false);
        return;
      }
      added += 1;
    }
    setBusy(false);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add several chores"
      description="One chore per line. They are added as required chores for everyone; edit any of them afterwards."
      className="max-w-[min(94vw,34rem)] sm:w-[min(94vw,34rem)]"
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Field id="bulk-chores" label="Chores">
          <textarea
            id="bulk-chores"
            className={TEXTAREA_CLASS}
            rows={8}
            value={text}
            autoFocus
            placeholder={
              "Mango Lassi — Bucket 1\nMint Chutney Refill\nClean Prep Counter"
            }
            onChange={(e) => setText(e.target.value)}
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
          <Button type="submit" disabled={busy || lines.length === 0}>
            {busy
              ? "Adding…"
              : `Add ${lines.length} ${lines.length === 1 ? "chore" : "chores"}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
