"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActiveRecords } from "@/features/allocation/components/combined/active-records";
import { AddServerPicker } from "@/features/allocation/components/combined/add-server-picker";
import { FloorPanel } from "@/features/allocation/components/combined/floor-panel";
import {
  QuickTablePicker,
  type QuickPickerTarget,
} from "@/features/allocation/components/combined/quick-table-picker";
import { RotationBoardGrid } from "@/features/allocation/components/combined/rotation-board-grid";
import { RotationToolbar } from "@/features/allocation/components/combined/rotation-toolbar";
import { SelectedPanel } from "@/features/allocation/components/combined/selected-panel";
import { ToolsMenu } from "@/features/allocation/components/combined/tools-menu";
import type {
  CombinedAssign,
  CombinedExecute,
  ExecResult,
} from "@/features/allocation/components/combined/types";
import { useCombinedMode } from "@/features/allocation/components/combined/use-combined-mode";
import { useViewportFill } from "@/features/allocation/components/combined/use-viewport-fill";
import type { BoardReadModel } from "@/features/allocation/domain/board-read-model";
import {
  buildActiveRecords,
  buildHistoryRows,
  fitFloorTables,
  resolveTarget,
  targetRoundFor,
  type CombinedMode,
  type CombinedSelection,
} from "@/features/allocation/domain/combined-view";
import type { DineInMetrics } from "@/features/allocation/domain/dine-in-metrics";
import type {
  RotationBoard,
  RotationColumn,
} from "@/features/allocation/domain/rotation-board";
import type { TeamMember } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

const MODE_LABELS: Record<CombinedMode, string> = {
  split: "Split Screen",
  floor: "Floor Focus",
  rotation: "Rotation Focus",
};

// Floor map width/height ratios: Split gives each half ~half the width, so a
// squarer map keeps dense tables apart; Floor Focus has the width for 16:9.
const FIT_RATIO: Record<CombinedMode, number> = {
  split: 4 / 3,
  floor: 16 / 9,
  rotation: 16 / 9,
};

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div
      className="border-border bg-card min-w-0 rounded-xl border px-2.5 py-1.5"
      title={hint}
    >
      <p className="text-muted-foreground truncate text-[10px] font-semibold tracking-[0.1em] uppercase">
        {label}
      </p>
      <p className="truncate text-lg leading-tight font-semibold">{value}</p>
    </div>
  );
}

/**
 * V2.0.4 Combined Table Allocation workstation -- a view INSIDE the existing
 * Table Allocation module, not a second allocation system. It owns only
 * presentation state (display mode, what is selected, which popup is open);
 * the board, the rotation engine, occupancy, the occupied-table flow and every
 * mutation come from the workspace that renders it, so Grid, Floor, Picker,
 * Servers and Dashboard always agree with it.
 */
export function CombinedView({
  board,
  columns,
  team,
  readModel,
  metrics,
  roster,
  clockedInProfileIds,
  locationName,
  scopeKey,
  liveLabel,
  tablesLoadError,
  disabled,
  readOnly,
  canUndo,
  canRedo,
  execute,
  onAssign,
  onUndo,
  onRedo,
}: {
  board: RotationBoard;
  /** Visible (non-removed) rotation columns in rotation order. */
  columns: RotationColumn[];
  team: TeamMember[];
  readModel: BoardReadModel;
  metrics: DineInMetrics;
  roster: TeamMember[];
  clockedInProfileIds: string[];
  locationName: string | null;
  /** Preference scope: the branch (or "demo"). */
  scopeKey: string;
  liveLabel: string;
  tablesLoadError: boolean;
  /** No floor operations allowed (locked, historical, or insufficient role). */
  disabled: boolean;
  readOnly: boolean;
  canUndo: boolean;
  canRedo: boolean;
  execute: CombinedExecute;
  onAssign: CombinedAssign;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const [mode, setMode] = useCombinedMode(scopeKey);
  const { ref, height, reclaim } = useViewportFill<HTMLDivElement>(true);

  const [selection, setSelection] = useState<CombinedSelection | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [picker, setPicker] = useState<
    (QuickPickerTarget & { open: boolean }) | null
  >(null);
  const [addServerOpen, setAddServerOpen] = useState(false);

  const colorOf = (columnId: string) =>
    team.find(({ id }) => id === columnId)?.color;

  const eligible = useMemo(
    () => columns.filter(({ status }) => status === "active"),
    [columns],
  );
  const nextColumnId = metrics.nextColumnId;
  const nextName = columns.find(({ id }) => id === nextColumnId)?.name;

  const fittedTables = useMemo(
    () => fitFloorTables(readModel.tables),
    [readModel.tables],
  );
  const rows = useMemo(
    () => buildHistoryRows(board, columns),
    [board, columns],
  );
  const records = useMemo(
    () => buildActiveRecords(board, columns),
    [board, columns],
  );

  const target = resolveTarget({
    board,
    columns,
    tables: readModel.tables,
    offMapTables: readModel.offMapTables,
    selection,
  });
  // A selected server that left the rotation is simply no longer selected.
  const serverId = columns.some(({ id }) => id === selectedServerId)
    ? selectedServerId
    : null;

  const selectedEntry =
    target.kind === "active" ||
    target.kind === "history" ||
    target.kind === "open-cell"
      ? { roundId: target.roundId, columnId: target.columnId }
      : null;
  const selectedRound = selectedEntry
    ? board.rounds.find(({ id }) => id === selectedEntry.roundId)
    : undefined;

  function selectTable(label: string) {
    setSelection((current) =>
      current?.type === "table" && current.label === label
        ? null
        : { type: "table", label },
    );
  }
  function selectEntry(roundId: string, columnId: string) {
    setSelectedServerId(columnId);
    setSelection((current) =>
      current?.type === "entry" &&
      current.roundId === roundId &&
      current.columnId === columnId
        ? null
        : { type: "entry", roundId, columnId },
    );
  }
  function selectServer(columnId: string) {
    setSelectedServerId((current) => (current === columnId ? null : columnId));
  }

  function openPicker(columnId: string | null, roundId?: string) {
    setPicker({ open: true, columnId, roundId });
  }

  const fail = (error: string): ExecResult => ({ ok: false, error });
  async function skipFor(columnId: string): Promise<ExecResult> {
    const roundId = targetRoundFor(board, columnId);
    if (!roundId) return fail("This server has no open turn to skip.");
    return execute({ type: "skip-turn", roundId, columnId });
  }

  const mid = "gap-2 lg:min-h-0 lg:flex-1";
  const floorPanel = (
    <FloorPanel
      className="lg:flex-1"
      tables={fittedTables}
      offMapTables={readModel.offMapTables}
      loadError={tablesLoadError}
      selectedLabel={selection?.type === "table" ? selection.label : null}
      disabled={disabled}
      fitRatio={FIT_RATIO[mode]}
      onSelectTable={selectTable}
    />
  );
  const panel = (
    <SelectedPanel
      target={target}
      servers={eligible}
      nextColumnId={nextColumnId}
      disabled={disabled}
      onAssign={(label, columnId) => onAssign({ label, columnId })}
      onOpenPicker={openPicker}
      onTransfer={(roundId, from, to) =>
        execute({
          type: "transfer",
          sourceRoundId: roundId,
          sourceColumnId: from,
          destColumnId: to,
        })
      }
      onEnd={(roundId, columnId) =>
        execute({ type: "end-table", roundId, columnId })
      }
      onClear={(roundId, columnId) =>
        execute({ type: "clear-cell", roundId, columnId })
      }
      onSkip={(roundId, columnId) =>
        execute({ type: "skip-turn", roundId, columnId })
      }
      onDismiss={() => setSelection(null)}
      className="shrink-0"
    />
  );
  const toolbar = (
    <RotationToolbar
      columns={columns}
      servers={readModel.servers}
      nextColumnId={nextColumnId}
      selectedServerId={serverId}
      showChips={mode === "split"}
      disabled={disabled}
      colorOf={colorOf}
      onSelectServer={selectServer}
      onMove={(columnId, direction) =>
        void execute({ type: "move-column", columnId, direction })
      }
      onTogglePause={(columnId) => {
        const paused =
          columns.find(({ id }) => id === columnId)?.status === "paused";
        void execute({
          type: "set-column-status",
          columnId,
          status: paused ? "active" : "paused",
        });
      }}
      onSkip={(columnId) => void skipFor(columnId)}
      onAddTable={() => openPicker(serverId ?? nextColumnId)}
      onAddServer={() => setAddServerOpen(true)}
      onExpand={mode === "split" ? () => setMode("rotation") : undefined}
    />
  );
  const grid = (
    <RotationBoardGrid
      className="max-h-[60dvh] min-h-52 lg:max-h-none lg:min-h-0 lg:flex-1"
      columns={columns}
      rows={rows}
      nextColumnId={nextColumnId}
      selectedServerId={serverId}
      selectedEntry={selection?.type === "entry" ? selection : null}
      disabled={disabled}
      colorOf={colorOf}
      onSelectServer={selectServer}
      onSelectEntry={selectEntry}
      onNextCell={(columnId) => openPicker(columnId)}
    />
  );
  const recordsList = (
    <ActiveRecords
      className="shrink-0 lg:max-h-32"
      records={records}
      selected={selectedEntry}
      onSelect={(record) => {
        setSelectedServerId(record.columnId);
        setSelection({
          type: "entry",
          roundId: record.roundId,
          columnId: record.columnId,
        });
      }}
    />
  );

  return (
    <div
      ref={ref}
      style={height ? { height, marginBottom: -reclaim } : undefined}
      className="flex min-h-0 flex-col gap-2"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h1 className="text-lg leading-tight font-semibold tracking-[-0.02em]">
            Table Allocation
          </h1>
          <p className="text-muted-foreground truncate text-xs">
            {locationName ?? "Demo"} · Combined View
          </p>
        </div>
        <div
          role="group"
          aria-label="Combined display mode"
          className="border-border bg-muted/30 flex gap-1 rounded-lg border p-0.5"
        >
          {(Object.keys(MODE_LABELS) as CombinedMode[]).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={mode === value ? "secondary" : "ghost"}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {MODE_LABELS[value]}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="success">
            <span
              className="size-1.5 rounded-full bg-emerald-300"
              aria-hidden="true"
            />
            {liveLabel}
          </Badge>
          <ToolsMenu
            canUndo={canUndo}
            canRedo={canRedo}
            readOnly={readOnly}
            canOperate={!disabled}
            onUndo={onUndo}
            onRedo={onRedo}
            onAddRow={() => void execute({ type: "add-row" })}
            selectedEntry={
              (target.kind === "active" || target.kind === "history") &&
              target.label
                ? `${target.label} (${target.serverName}, turn ${selectedRound?.sequence ?? "?"})`
                : null
            }
            selectedTurn={
              selectedRound ? `turn ${selectedRound.sequence}` : null
            }
            selectedServer={
              columns.find(({ id }) => id === serverId)?.name ?? null
            }
            onClearEntry={() => {
              if (target.kind === "active" || target.kind === "history") {
                void execute({
                  type: "clear-cell",
                  roundId: target.roundId,
                  columnId: target.columnId,
                });
                setSelection(null);
              }
            }}
            onClearRow={() => {
              if (selectedRound) {
                void execute({ type: "clear-row", roundId: selectedRound.id });
                setSelection(null);
              }
            }}
            onClearColumn={() => {
              if (serverId) {
                void execute({ type: "clear-column", columnId: serverId });
                setSelection(null);
              }
            }}
            onClearBoard={() => {
              void execute({ type: "clear-board" });
              setSelection(null);
            }}
          />
        </div>
      </header>

      <section
        aria-label="Allocation metrics"
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-5"
      >
        <Metric
          label="Dine-in today"
          value={metrics.dineInToday}
          hint="Dine-in table seatings today. Not a guest count."
        />
        <Metric label="Active" value={metrics.active} />
        <Metric label="Completed" value={metrics.completed} />
        <Metric label="Servers" value={metrics.eligibleServers} />
        <Metric label="Next" value={nextName ? nextName.split(" ")[0] : "—"} />
      </section>

      <div
        className={cn(
          "flex flex-col",
          mid,
          mode === "split" &&
            "lg:grid lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]",
        )}
      >
        {mode === "split" ? (
          <>
            <div className="flex flex-col gap-2 lg:min-h-0">
              {floorPanel}
              {panel}
            </div>
            <div className="flex flex-col gap-2 lg:min-h-0">
              {toolbar}
              {grid}
              {recordsList}
            </div>
          </>
        ) : mode === "floor" ? (
          <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">
            {floorPanel}
            {panel}
          </div>
        ) : (
          <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">
            {toolbar}
            {grid}
            {panel}
            {recordsList}
          </div>
        )}
      </div>

      <QuickTablePicker
        open={picker?.open === true}
        onClose={() => setPicker(null)}
        target={{
          columnId: picker?.columnId ?? null,
          roundId: picker?.roundId,
        }}
        servers={eligible}
        tables={readModel.tables}
        fittedTables={fittedTables}
        offMapTables={readModel.offMapTables}
        tablesLoadError={tablesLoadError}
        disabled={disabled}
        onAssign={onAssign}
      />
      <AddServerPicker
        open={addServerOpen}
        onClose={() => setAddServerOpen(false)}
        roster={roster}
        onRotation={new Set(columns.map(({ id }) => id))}
        clockedInProfileIds={clockedInProfileIds}
        disabled={disabled}
        onAdd={(member) =>
          execute({
            type: "add-column",
            column: {
              id: member.id,
              name: member.name,
              position: board.columns.length,
              status: "active",
            },
          })
        }
      />
    </div>
  );
}
