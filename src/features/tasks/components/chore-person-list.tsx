"use client";

import { useState } from "react";

import { Select } from "@/components/ui/select";

import {
  cellKey,
  cellState,
  columnProgress,
  defaultColumnFor,
  liveColumns,
  liveRows,
  rowAppliesTo,
  sortByOrder,
} from "../domain/chore-rules";
import type { ChoreBoardView, ChoreViewer } from "../domain/chore-types";
import { ChoreCell } from "./chore-cell";

type Props = {
  board: ChoreBoardView;
  viewer: ChoreViewer;
  pendingCells: ReadonlySet<string>;
  onToggle: (rowId: string, columnId: string, done: boolean) => void;
};

/**
 * Phone view: the same completion data as the matrix, one person at a time, so
 * nothing is squeezed. Starts on the viewer's own column.
 */
export function ChorePersonList({
  board,
  viewer,
  pendingCells,
  onToggle,
}: Props) {
  const columns = sortByOrder(liveColumns(board));
  const [chosen, setChosen] = useState<string | null>(null);
  const column =
    columns.find((c) => c.id === chosen) ?? defaultColumnFor(viewer, board);

  if (!column) {
    return (
      <p
        role="status"
        className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm"
      >
        This board has no people or positions yet.
      </p>
    );
  }

  const rows = sortByOrder(liveRows(board)).filter((r) =>
    rowAppliesTo(r, column),
  );
  const progress = columnProgress(board, column);

  return (
    <div data-testid="chore-person-list" className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="chore-person" className="text-sm font-medium">
          Person
        </label>
        <Select
          id="chore-person"
          value={column.id}
          onChange={(e) => setChosen(e.target.value)}
        >
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
              {c.profileId === viewer.profileId ? " (you)" : ""}
            </option>
          ))}
        </Select>
        <p className="text-muted-foreground text-sm tabular-nums">
          {progress.done} of {progress.total} required done for {column.label}
        </p>
      </div>

      {rows.length === 0 ? (
        <p
          role="status"
          className="text-muted-foreground rounded-2xl border border-dashed p-5 text-center text-sm"
        >
          Nothing is assigned to {column.label}.
        </p>
      ) : (
        <ul className="border-border divide-border divide-y rounded-2xl border">
          {rows.map((row) => (
            <li
              key={row.id}
              data-testid="chore-list-row"
              data-state={cellState(board, row, column)}
              className="flex items-center justify-between gap-3 px-3 py-1.5"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">{row.title}</span>
                {row.instructions ? (
                  <span className="text-muted-foreground block text-xs">
                    {row.instructions}
                  </span>
                ) : null}
                {!row.isRequired ? (
                  <span className="text-muted-foreground block text-xs">
                    Optional
                  </span>
                ) : null}
              </span>
              <ChoreCell
                large
                board={board}
                row={row}
                column={column}
                viewer={viewer}
                pending={pendingCells.has(cellKey(board.id, row.id, column.id))}
                onToggle={(done) => onToggle(row.id, column.id, done)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
