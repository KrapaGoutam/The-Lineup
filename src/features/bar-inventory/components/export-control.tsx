"use client";

import { Download } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import type { ExportFormat } from "@/lib/export/document";
import { downloadFile } from "@/lib/download-file";

import type { ExportRequest } from "../domain/exports";
import {
  activeFilterCount,
  serializeTableState,
  type TableState,
} from "../domain/table-filters";
import { useOutsideDismiss } from "./table-kit/use-outside-dismiss";

export type ExportOutcome =
  | { ok: true; filename: string; mime: string; data: string | Blob }
  | { ok: false; error: string };

export type RunExport = (
  request: ExportRequest,
  format: ExportFormat,
) => Promise<ExportOutcome>;

/** What the table on screen currently shows, for "Export N filtered rows". */
export type VisibleInfo = { filters: string; count: number; active: boolean };

const NONE: VisibleInfo = { filters: "", count: 0, active: false };

/**
 * Tracks a table's filter state and row count through its `onVisibleRows`
 * callback, without re-rendering when nothing changed.
 */
export function useVisibleInfo<Row>() {
  const [info, setInfo] = useState<VisibleInfo>(NONE);
  const onVisibleRows = useCallback((rows: Row[], state: TableState) => {
    const next: VisibleInfo = {
      filters: serializeTableState(state).toString(),
      count: rows.length,
      active: activeFilterCount(state) > 0,
    };
    setInfo((prev) =>
      prev.filters === next.filters &&
      prev.count === next.count &&
      prev.active === next.active
        ? prev
        : next,
    );
  }, []);
  return [info, onVisibleRows] as const;
}

/**
 * Export button. Sends only what to export and the table's filter string;
 * whoever builds the file re-applies the filters to the authorized rows.
 * With filters active, the person chooses all rows or just the filtered ones.
 */
export function ExportControl({
  label = "Export",
  info,
  build,
  run,
  disabled,
}: {
  label?: string;
  info: VisibleInfo;
  /** The request for the given filter string ("" = everything). */
  build: (filters: string) => ExportRequest;
  run: RunExport;
  disabled?: boolean;
}) {
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"all" | "filtered">("filtered");
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);
  useOutsideDismiss(open, [buttonRef, panelRef], close);

  const filteredScope = info.active && scope === "filtered";

  async function download(format: ExportFormat) {
    setBusy(format);
    setError(null);
    try {
      const outcome = await run(
        build(filteredScope ? info.filters : ""),
        format,
      );
      if (outcome.ok) {
        downloadFile(outcome.filename, outcome.data, outcome.mime);
        close();
      } else {
        setError(outcome.error);
      }
    } catch {
      setError("That didn't work. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        className={buttonVariants({ variant: "secondary" })}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Download aria-hidden="true" /> {label}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={`${label} options`}
          className="border-border bg-popover text-popover-foreground absolute top-full left-0 z-30 mt-1 flex w-64 flex-col gap-3 rounded-xl border p-3 shadow-xl"
        >
          {info.active ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-semibold">Rows</legend>
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${panelId}-scope`}
                  checked={scope === "filtered"}
                  onChange={() => setScope("filtered")}
                />
                Filtered rows ({info.count})
              </label>
              <label className="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`${panelId}-scope`}
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                />
                All rows
              </label>
            </fieldset>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void download("csv")}
            >
              {busy === "csv" ? "Preparing…" : "Download CSV"}
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void download("xlsx")}
            >
              {busy === "xlsx" ? "Preparing…" : "Download Excel (.xlsx)"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
