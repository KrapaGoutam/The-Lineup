"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { Download, Upload, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  CSV_TEMPLATE,
  type EmployeeLookup,
  type ParsedRow,
  parseScheduleCsv,
} from "@/features/schedules/domain/parse-schedule-csv";
import type { ShiftDefaults } from "@/features/schedules/domain/shift-planning";
import type { DemoShift } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "shift-import-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function CsvImportPanel({
  employees,
  shiftDefaults,
  onCommit,
  onClose,
}: {
  employees: EmployeeLookup[];
  shiftDefaults: ShiftDefaults;
  onCommit: (shifts: DemoShift[]) => void;
  onClose: () => void;
}) {
  const [fileError, setFileError] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [parsing, setParsing] = useState(false);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileError("");
    setRows(null);
    setSkipped(new Set());
    setFileName(file.name);
    setParsing(true);
    const reader = new FileReader();
    reader.onload = () => {
      const outcome = parseScheduleCsv({
        text: String(reader.result ?? ""),
        employees,
        defaults: shiftDefaults,
      });
      setParsing(false);
      if (!outcome.ok) {
        setFileError(outcome.fileError);
        return;
      }
      setRows(outcome.rows);
    };
    reader.onerror = () => {
      setParsing(false);
      setFileError("Unable to read that file.");
    };
    reader.readAsText(file);
  }

  const blockingErrorCount = useMemo(
    () =>
      rows?.filter(
        (row) => row.status === "error" && !skipped.has(row.rowNumber),
      ).length ?? 0,
    [rows, skipped],
  );
  const includedRows = useMemo(
    () => rows?.filter((row) => row.status === "valid") ?? [],
    [rows],
  );
  const totalShiftCount = includedRows.reduce(
    (sum, row) => sum + (row.instances?.length ?? 0),
    0,
  );
  const canCommit =
    rows !== null && blockingErrorCount === 0 && includedRows.length > 0;

  function toggleSkip(rowNumber: number) {
    setSkipped((current) => {
      const next = new Set(current);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  function commit() {
    if (!canCommit) return;
    const shifts: DemoShift[] = includedRows.flatMap((row) =>
      (row.instances ?? []).map((instance, index) => ({
        id: `csv-${Date.now()}-${row.rowNumber}-${index}`,
        employeeId: row.employeeId!,
        ...instance,
        status: "draft" as const,
        note: row.raw.note || undefined,
      })),
    );
    onCommit(shifts);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-0 backdrop-blur-sm sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-import-title"
        className="h-full w-full max-w-none overflow-y-auto rounded-none shadow-2xl sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:max-w-2xl sm:rounded-2xl"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <h2 id="csv-import-title" className="text-lg font-semibold">
              Import shifts from CSV
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Every imported shift lands as a draft. Nothing is published.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close CSV import"
          >
            <X />
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={downloadTemplate}
              type="button"
            >
              <Download aria-hidden="true" /> Download template
            </Button>
            <label className="border-border bg-secondary hover:bg-muted flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-semibold">
              <Upload className="size-4" aria-hidden="true" />
              {fileName || "Choose CSV file"}
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                className="sr-only"
              />
            </label>
          </div>

          {parsing ? (
            <p className="text-muted-foreground text-sm">Parsing…</p>
          ) : null}

          {fileError ? (
            <p className="text-destructive text-sm" aria-live="polite">
              {fileError}
            </p>
          ) : null}

          {!rows && !parsing && !fileError ? (
            <p className="text-muted-foreground text-sm">
              Upload a CSV to preview shifts.
            </p>
          ) : null}

          {rows ? (
            <div className="space-y-3">
              <div className="border-border overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-secondary text-muted-foreground text-xs">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Row</th>
                      <th className="px-3 py-2 font-semibold">Employee</th>
                      <th className="px-3 py-2 font-semibold">Shift</th>
                      <th className="px-3 py-2 font-semibold">Dates</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {rows.map((row) => {
                      const isSkipped = skipped.has(row.rowNumber);
                      return (
                        <tr
                          key={row.rowNumber}
                          className={cn(
                            row.status === "error" && "bg-destructive/5",
                          )}
                        >
                          <td className="px-3 py-2 font-mono">
                            {row.rowNumber}
                          </td>
                          <td className="px-3 py-2">{row.raw.employeeName}</td>
                          <td className="px-3 py-2">{row.raw.shiftKind}</td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {row.raw.fromDate}
                            {row.raw.toDate ? `–${row.raw.toDate}` : ""}
                          </td>
                          <td className="px-3 py-2">
                            {row.status === "valid" ? (
                              <span className="flex items-center gap-1.5 text-emerald-300">
                                <span
                                  className="size-1.5 rounded-full bg-emerald-300"
                                  aria-hidden="true"
                                />
                                <span>Valid</span>
                                <span className="sr-only">
                                  — will be created
                                </span>
                              </span>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                <span className="text-destructive flex items-center gap-1.5">
                                  <span
                                    className="size-1.5 rounded-full bg-red-400"
                                    aria-hidden="true"
                                  />
                                  <span>Error: {row.error}</span>
                                </span>
                                <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
                                  <input
                                    type="checkbox"
                                    checked={isSkipped}
                                    onChange={() => toggleSkip(row.rowNumber)}
                                    className="accent-[var(--primary)]"
                                  />
                                  Skip this row
                                </label>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-sm" aria-live="polite">
                  {blockingErrorCount > 0
                    ? `${blockingErrorCount} row(s) need a fix or a skip before you can import.`
                    : `${totalShiftCount} shift(s) will be created as drafts.`}
                </p>
                <Badge tone="neutral">{rows.length} rows parsed</Badge>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button onClick={commit} disabled={!canCommit} type="button">
              Create {totalShiftCount || ""} draft shift
              {totalShiftCount === 1 ? "" : "s"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
