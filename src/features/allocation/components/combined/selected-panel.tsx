"use client";

import { useId, useState } from "react";
import { ArrowRightLeft, LogOut, Plus, SkipForward, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  ActionNote,
  AssignmentSummary,
} from "@/features/allocation/components/assignment-scope-note";
import type { ExecResult } from "@/features/allocation/components/combined/types";
import { getAssignmentScope } from "@/features/allocation/domain/assignment-scope";
import type { ResolvedTarget } from "@/features/allocation/domain/combined-view";
import type { RotationColumn } from "@/features/allocation/domain/rotation-board";
import { cn } from "@/lib/utils";

/**
 * Context-sensitive actions for whatever is selected (a map/grid table, a
 * rotation entry or an active record) -- ONE component for every placement
 * (under the floor in Split / Floor Focus, under the rotation grid in
 * Rotation Focus), so the actions and their order never differ by mode.
 *
 * It renders from a target re-resolved against the live board on every render
 * (see `resolveTarget`), so a stale selection shows what is true now. It owns
 * no business rule: Assign goes through the workspace's validated assign path,
 * Transfer / End / Clear are the existing board actions. No party size.
 */
export function SelectedPanel({
  target,
  servers,
  nextColumnId,
  disabled,
  onAssign,
  onOpenPicker,
  onTransfer,
  onEnd,
  onClear,
  onSkip,
  onDismiss,
  className,
}: {
  target: ResolvedTarget;
  /** Eligible (active) servers in rotation order. */
  servers: RotationColumn[];
  nextColumnId: string | null;
  disabled: boolean;
  onAssign: (label: string, columnId: string) => Promise<ExecResult>;
  onOpenPicker: (columnId: string, roundId?: string) => void;
  onTransfer: (
    roundId: string,
    fromColumnId: string,
    toColumnId: string,
  ) => Promise<ExecResult>;
  onEnd: (roundId: string, columnId: string) => Promise<ExecResult>;
  onClear: (roundId: string, columnId: string) => Promise<ExecResult>;
  onSkip: (roundId: string, columnId: string) => Promise<ExecResult>;
  onDismiss: () => void;
  className?: string;
}) {
  const noteId = useId();
  const [transferring, setTransferring] = useState(false);
  const [override, setOverride] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the transient sub-state whenever the target itself changes (done
  // during render, the documented "adjust state on prop change" pattern).
  const targetKey =
    target.kind === "none"
      ? "none"
      : target.kind === "free-table"
        ? `free:${target.label}`
        : `${target.kind}:${target.roundId}:${target.columnId}`;
  const [seenKey, setSeenKey] = useState(targetKey);
  if (seenKey !== targetKey) {
    setSeenKey(targetKey);
    setTransferring(false);
    setError(null);
    setOverride("");
  }

  // The server for a free table defaults to the canonical next one; an
  // intentional override is honoured only while that server is still eligible.
  const assignee = servers.some(({ id }) => id === override)
    ? override
    : nextColumnId && servers.some(({ id }) => id === nextColumnId)
      ? nextColumnId
      : (servers[0]?.id ?? "");

  async function run(action: () => Promise<ExecResult>, then?: () => void) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.ok) then?.();
    else setError(result.error);
  }

  const shell = (children: React.ReactNode) => (
    <section
      aria-label="Selected table actions"
      className={cn(
        "border-border bg-card rounded-xl border px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {target.kind !== "none" ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-9 min-h-9"
            aria-label="Deselect"
            onClick={onDismiss}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-destructive mt-1.5 text-xs font-medium">
          {error}
        </p>
      ) : null}
    </section>
  );

  if (target.kind === "none") {
    return shell(
      <p className="text-muted-foreground text-sm">
        Select a table or a rotation entry to assign, transfer, end or correct
        it.
      </p>,
    );
  }

  if (target.kind === "free-table") {
    const next = servers.find(({ id }) => id === nextColumnId);
    return shell(
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">
          <span className="font-mono">{target.label}</span> · Available
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-muted-foreground shrink-0 text-xs font-semibold">
              {assignee && assignee === next?.id ? "Next:" : "Server:"}
            </span>
            <Select
              aria-label="Server for this table"
              className="min-h-10"
              value={assignee}
              disabled={disabled || busy || servers.length === 0}
              onChange={(event) => setOverride(event.target.value)}
            >
              {servers.length === 0 ? (
                <option value="">No active servers</option>
              ) : null}
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                  {server.id === nextColumnId ? " (next)" : ""}
                </option>
              ))}
            </Select>
          </label>
          <Button
            className="min-h-10"
            disabled={disabled || busy || !assignee}
            onClick={() =>
              run(() => onAssign(target.label, assignee), onDismiss)
            }
          >
            <Plus aria-hidden="true" /> Assign
          </Button>
        </div>
      </div>,
    );
  }

  if (target.kind === "open-cell") {
    return shell(
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">
          Turn {target.sequence} · {target.serverName} · Open
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => onOpenPicker(target.columnId, target.roundId)}
          >
            <Plus aria-hidden="true" /> Assign table
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || busy}
            onClick={() =>
              run(() => onSkip(target.roundId, target.columnId), onDismiss)
            }
          >
            <SkipForward aria-hidden="true" /> Skip turn
          </Button>
        </div>
      </div>,
    );
  }

  if (target.kind === "history") {
    return shell(
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">
          Turn {target.sequence} · {target.serverName} ·{" "}
          {target.status === "ended" ? (
            <>
              Ended <span className="font-mono">{target.label}</span>
            </>
          ) : (
            "Skipped turn"
          )}
        </p>
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || busy}
            onClick={() =>
              run(() => onClear(target.roundId, target.columnId), onDismiss)
            }
          >
            <X aria-hidden="true" /> Clear entry
          </Button>
        </div>
        <p className="text-muted-foreground text-[11px]">
          Clearing a completed entry is a correction; it removes the record.
        </p>
      </div>,
    );
  }

  // Active (an occupied table, or the live assignment of a record).
  const scope = getAssignmentScope(target.tables);
  const others = servers.filter(({ id }) => id !== target.columnId);
  return shell(
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">
        <span className="font-mono">{target.label}</span> · Occupied ·{" "}
        {target.serverName}
      </p>
      <AssignmentSummary id={`${noteId}-summary`} scope={scope} />
      {transferring ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-xs">
            {scope.combined ? `Give ${scope.label} to:` : "Give this table to:"}
          </p>
          {scope.transferNote ? (
            <p className="text-muted-foreground -mt-0.5 text-[11px]">
              {scope.transferNote}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {others.map((server) => (
              <Button
                key={server.id}
                size="sm"
                variant="secondary"
                disabled={disabled || busy}
                onClick={() =>
                  run(
                    () =>
                      onTransfer(target.roundId, target.columnId, server.id),
                    onDismiss,
                  )
                }
              >
                {server.name}
              </Button>
            ))}
            {others.length === 0 ? (
              <span className="text-muted-foreground text-xs">
                No other active servers.
              </span>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setTransferring(false)}
            >
              Back
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || busy}
              aria-describedby={
                scope.transferNote ? `${noteId}-transfer` : undefined
              }
              onClick={() => setTransferring(true)}
            >
              <ArrowRightLeft aria-hidden="true" /> Transfer
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || busy}
              aria-describedby={scope.endNote ? `${noteId}-end` : undefined}
              onClick={() =>
                run(() => onEnd(target.roundId, target.columnId), onDismiss)
              }
            >
              <LogOut aria-hidden="true" /> End table
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || busy}
              aria-describedby={
                scope.unassignNote ? `${noteId}-clear` : undefined
              }
              onClick={() =>
                run(() => onClear(target.roundId, target.columnId), onDismiss)
              }
            >
              <X aria-hidden="true" /> Clear entry
            </Button>
          </div>
          <ActionNote id={`${noteId}-transfer`} text={scope.transferNote} />
          <ActionNote id={`${noteId}-end`} text={scope.endNote} />
          <ActionNote id={`${noteId}-clear`} text={scope.unassignNote} />
        </>
      )}
    </div>,
  );
}
