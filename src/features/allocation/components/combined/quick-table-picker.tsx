"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { OffMapTables } from "@/features/allocation/components/off-map-tables";
import { TableMap } from "@/features/allocation/components/table-map";
import type { CombinedAssign } from "@/features/allocation/components/combined/types";
import type { OffMapTable } from "@/features/allocation/domain/board-read-model";
import {
  buildPickerTiles,
  type PickerTile,
} from "@/features/allocation/domain/combined-view";
import type { ResolvedFloorTable } from "@/features/allocation/domain/floor-layout";
import type { RotationColumn } from "@/features/allocation/domain/rotation-board";
import { cn } from "@/lib/utils";

type PickerMode = "grid" | "plan";

export type QuickPickerTarget = {
  /** The server to preselect (Mia's NEXT cell, the selected server, or the next one). */
  columnId: string | null;
  /** A specific turn to assign into; omitted = the server's own next open turn. */
  roundId?: string;
};

/**
 * Quick Table Assignment -- the one popup behind every "+ Table".
 *
 * It is a view over the SAME resolved tables the Floor Plan draws (`TableMap`
 * is reused, not re-implemented), so Quick Grid and Floor Plan can never
 * disagree about availability. Selecting a free table runs the workspace's
 * validated assign path; the popup closes only after that is confirmed, and
 * an error is shown in place so the host can retry. Occupied tables stay
 * visible, labelled "Busy", and cannot be picked.
 */
export function QuickTablePicker({
  open,
  onClose,
  target,
  servers,
  tables,
  fittedTables,
  offMapTables,
  tablesLoadError,
  disabled,
  onAssign,
}: {
  open: boolean;
  onClose: () => void;
  target: QuickPickerTarget;
  /** Eligible (active) servers, in rotation order. */
  servers: RotationColumn[];
  tables: ResolvedFloorTable[];
  /** `tables` with display-only fitted coordinates (same order and labels). */
  fittedTables: ResolvedFloorTable[];
  offMapTables: OffMapTable[];
  tablesLoadError: boolean;
  disabled: boolean;
  onAssign: CombinedAssign;
}) {
  const [mode, setMode] = useState<PickerMode>("grid");
  const [serverId, setServerId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preselect the requested server every time the popup (re)opens; fall back
  // to the first eligible server if the requested one is no longer eligible.
  // Done during render ("adjust state when an input changes"), keyed on
  // open + target so a roster refresh never clobbers the host's own choice.
  const seedKey = open
    ? `${target.columnId ?? ""}|${target.roundId ?? ""}`
    : "";
  const [seededFor, setSeededFor] = useState("");
  if (seededFor !== seedKey) {
    setSeededFor(seedKey);
    if (open) {
      setServerId(
        target.columnId && servers.some(({ id }) => id === target.columnId)
          ? target.columnId
          : (servers[0]?.id ?? ""),
      );
      setError(null);
      setSubmitting(false);
    }
  }

  // A server paused or removed while the popup is open must not stay chosen.
  const eligible = servers.some(({ id }) => id === serverId);
  const tiles = useMemo(
    () => buildPickerTiles(tables, offMapTables),
    [tables, offMapTables],
  );
  const busy = new Set(
    tiles.filter((tile) => tile.occupiedBy).map(({ label }) => label),
  );
  const blocked = disabled || submitting || !eligible;

  async function pick(label: string) {
    if (blocked || busy.has(label)) return;
    setSubmitting(true);
    setError(null);
    const result = await onAssign({
      label,
      columnId: serverId,
      roundId: target.roundId,
    });
    setSubmitting(false);
    if (result.ok) {
      onClose();
      return;
    }
    setError(result.error);
  }

  const serverName = servers.find(({ id }) => id === serverId)?.name;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Quick Table Assignment"
      description={
        serverName ? `Assigning to ${serverName}` : "Choose a server first."
      }
      className="sm:w-[min(94vw,44rem)] sm:max-w-[min(94vw,44rem)]"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="text-muted-foreground shrink-0 text-xs font-semibold">
              Server
            </span>
            <Select
              aria-label="Server"
              value={eligible ? serverId : ""}
              disabled={disabled || submitting || servers.length === 0}
              onChange={(event) => {
                setServerId(event.target.value);
                setError(null);
              }}
            >
              {eligible ? null : <option value="">Choose a server…</option>}
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </Select>
          </label>
          <div
            role="group"
            aria-label="Picker layout"
            className="border-border bg-muted/30 flex gap-1 rounded-lg border p-1"
          >
            {(
              [
                ["grid", "Quick Grid"],
                ["plan", "Floor Plan"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant={mode === value ? "secondary" : "ghost"}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {servers.length === 0 ? (
          <p role="status" className="text-muted-foreground text-sm">
            No active servers on the rotation. Add or resume a server first.
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}

        {mode === "grid" ? (
          <ul
            aria-label="Tables"
            className="grid max-h-[50dvh] grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4 md:grid-cols-5"
          >
            {tiles.map((tile) => (
              <li key={tile.label}>
                <PickerTileButton
                  tile={tile}
                  disabled={blocked || busy.has(tile.label)}
                  onPick={() => pick(tile.label)}
                />
              </li>
            ))}
            {tiles.length === 0 ? (
              <li className="text-muted-foreground col-span-full text-sm">
                {tablesLoadError
                  ? "Couldn't load the tables. Refresh and try again."
                  : "No tables are configured for this location."}
              </li>
            ) : null}
          </ul>
        ) : (
          <div className="flex flex-col gap-2">
            <TableMap
              tables={fittedTables}
              loadError={tablesLoadError}
              selectedLabel={null}
              compact
              disabled={blocked}
              isTableDisabled={(table) => busy.has(table.label)}
              onSelectTable={pick}
            />
            <OffMapTables
              tables={offMapTables.filter(({ occupiedBy }) => !occupiedBy)}
              disabled={blocked}
              heading="Off-map available tables"
              onSelectTable={pick}
            />
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function PickerTileButton({
  tile,
  disabled,
  onPick,
}: {
  tile: PickerTile;
  disabled: boolean;
  onPick: () => void;
}) {
  const occupied = Boolean(tile.occupiedBy);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      aria-label={
        occupied
          ? `Table ${tile.label}, busy, assigned to ${tile.occupiedBy!.name}${tile.offMap ? ", off-map" : ""}`
          : `Table ${tile.label}, free${tile.offMap ? ", off-map" : ""}`
      }
      className={cn(
        "focus-visible:ring-ring flex min-h-11 w-full flex-col items-center justify-center rounded-lg border px-1.5 py-1 text-center focus-visible:ring-2 focus-visible:outline-none",
        occupied
          ? "border-border bg-muted/40 text-muted-foreground opacity-80"
          : "border-ok/40 bg-ok/10 text-foreground hover:bg-ok/20",
        "disabled:cursor-not-allowed",
      )}
    >
      <span className="font-mono text-sm leading-tight font-bold">
        {tile.label}
        {tile.resourceType === "bar_seat" ? (
          <span className="text-muted-foreground ml-1 text-[9px] font-semibold">
            BAR
          </span>
        ) : null}
      </span>
      <span className="text-[10px] leading-tight">
        {occupied ? `Busy · ${tile.occupiedBy!.name.split(" ")[0]}` : "Free"}
      </span>
    </button>
  );
}
