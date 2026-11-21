"use client";

import { Badge } from "@/components/ui/badge";

import {
  cellKey,
  liveColumns,
  liveRows,
  rowProgress,
  sortByOrder,
} from "../domain/chore-rules";
import { REQUIREMENT_MODE_LABELS } from "../domain/chore-types";
import type { ChoreBoardView, ChoreViewer } from "../domain/chore-types";
import { ChoreCell } from "./chore-cell";

type Props = {
  board: ChoreBoardView;
  viewer: ChoreViewer;
  pendingCells: ReadonlySet<string>;
  onToggle: (rowId: string, columnId: string, done: boolean) => void;
};

/**
 * Desktop / tablet matrix: rows are chores, columns are people or positions.
 * The chore label column is sticky and the whole table scrolls horizontally
 * when there are many columns, so a long board never squeezes the checkboxes.
 */
export function ChoreMatrix({ board, viewer, pendingCells, onToggle }: Props) {
  const columns = sortByOrder(liveColumns(board));
  const rows = sortByOrder(liveRows(board));

  if (columns.length === 0 || rows.length === 0) {
    return (
      <p
        role="status"
        className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm"
      >
        {columns.length === 0
          ? "This board has no people or positions yet."
          : "This board has no chores yet."}
        {viewer.isManager
          ? " Add them in Manage → People / Columns and Chores / Rows."
          : " A manager needs to finish setting it up."}
      </p>
    );
  }

  return (
    <div
      data-testid="chore-matrix"
      className="border-border overflow-x-auto rounded-2xl border"
      tabIndex={0}
      role="region"
      aria-label={`${board.name} chore matrix`}
    >
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">
          {board.name}: chores down the side, people across the top. Each cell
          is a checkbox.
        </caption>
        <thead>
          <tr className="bg-muted/50">
            <th
              scope="col"
              className="bg-muted sticky left-0 z-10 min-w-48 px-3 py-2 text-left font-semibold"
            >
              Chore
            </th>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                data-testid="chore-column-header"
                className="min-w-24 px-3 py-2 text-center font-semibold"
              >
                <span className="block">{column.label}</span>
                {column.profileId === viewer.profileId ? (
                  <Badge tone="accent" className="mt-1">
                    You
                  </Badge>
                ) : column.profileId === null ? (
                  <span className="text-muted-foreground block text-xs font-normal">
                    Position
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const progress = rowProgress(board, row);
            return (
              <tr
                key={row.id}
                data-testid="chore-row"
                className="border-border border-t"
              >
                <th
                  scope="row"
                  className="bg-background sticky left-0 z-10 px-3 py-1.5 text-left font-medium"
                >
                  <span className="block">{row.title}</span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs font-normal">
                    <span className="tabular-nums">
                      {progress.done} of {progress.total} done
                    </span>
                    {row.mode !== "all_columns" ? (
                      <span>· {REQUIREMENT_MODE_LABELS[row.mode]}</span>
                    ) : null}
                    {!row.isRequired ? <span>· Optional</span> : null}
                  </span>
                  {row.instructions ? (
                    <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
                      {row.instructions}
                    </span>
                  ) : null}
                </th>
                {columns.map((column) => (
                  <td key={column.id} className="px-2 py-1 text-center">
                    <ChoreCell
                      board={board}
                      row={row}
                      column={column}
                      viewer={viewer}
                      pending={pendingCells.has(
                        cellKey(board.id, row.id, column.id),
                      )}
                      onToggle={(done) => onToggle(row.id, column.id, done)}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
