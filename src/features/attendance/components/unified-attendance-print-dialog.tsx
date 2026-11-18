"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileText, Printer, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ReportLetterhead } from "@/components/print/report-letterhead";
import type { ReportBrandConfig } from "@/components/print/report-branding";
import type {
  UnifiedAttendanceReport,
  UnifiedEmployeeSection,
} from "../domain/unified-attendance-report";
import { triggerPrintWithFilename } from "@/lib/print-utils";
import { attendanceStatementTitle } from "@/lib/report-period";

export interface UnifiedAttendancePrintDialogProps {
  readonly report: UnifiedAttendanceReport;
  readonly brand?: ReportBrandConfig;
  readonly onClose: () => void;
  readonly initialTarget?: "all" | string | number;
}

export function UnifiedAttendancePrintDialog({
  report,
  brand,
  onClose,
  initialTarget = "all",
}: UnifiedAttendancePrintDialogProps) {
  const [targetScope, setTargetScope] = useState<"all" | "single" | "selected">(
    () => {
      if (initialTarget === "all") return "all";
      return "single";
    },
  );

  const [selectedSingleId, setSelectedSingleId] = useState<string | number>(
    () => {
      if (initialTarget !== "all") return initialTarget;
      return report.sections[0]?.employeeId ?? "";
    },
  );

  const [checkedIds, setCheckedIds] = useState<Set<string | number>>(() => {
    return new Set(report.sections.map((s) => s.employeeId));
  });

  function toggleChecked(id: string | number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleSections = useMemo((): readonly UnifiedEmployeeSection[] => {
    if (targetScope === "all") return report.sections;
    if (targetScope === "single") {
      return report.sections.filter(
        (s) => String(s.employeeId) === String(selectedSingleId),
      );
    }
    return report.sections.filter((s) => checkedIds.has(s.employeeId));
  }, [report.sections, targetScope, selectedSingleId, checkedIds]);

  // A truncated read is a partial month. It must never be printed as a statement.
  const printable = !report.isPartial;

  function handlePrint() {
    if (!printable || visibleSections.length === 0) return;
    const filename =
      visibleSections.length === 1
        ? `${visibleSections[0].employeeName} Attendance Statement ${report.reportingPeriod}`
        : `${report.organization} Attendance Report ${report.reportingPeriod}`;
    triggerPrintWithFilename(filename);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-xs sm:p-6 print:static print:inset-auto print:h-auto print:overflow-visible print:bg-transparent print:p-0 print:backdrop-blur-none"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-label="Attendance Statement Print Preview"
        className="border-border bg-card flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden shadow-2xl print:max-h-none print:w-full print:max-w-none print:overflow-visible print:border-none print:shadow-none"
      >
        {/* Modal Toolbar (Screen Only) */}
        <CardHeader className="border-border bg-card flex flex-none flex-row items-center justify-between border-b p-4 sm:px-6 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="text-primary size-5" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold">Attendance Statements</h2>
              <p className="text-muted-foreground text-xs">
                {report.organization} · {report.branch} ·{" "}
                {report.reportingPeriod}
                {visibleSections.length > 0
                  ? ` — ${visibleSections.length} employee${visibleSections.length === 1 ? "" : "s"}`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handlePrint}
              disabled={!printable || visibleSections.length === 0}
              className="gap-1.5"
            >
              <Printer className="size-4" aria-hidden="true" />
              Print
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X className="size-5" />
            </Button>
          </div>
        </CardHeader>

        {/* Modal Content Scrollable Area */}
        <CardContent className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6 print:overflow-visible print:p-0">
          {/* Target Filter Controls (Screen Only) */}
          <div className="bg-muted/40 border-border flex flex-wrap items-center justify-between gap-4 rounded-xl border p-3 print:hidden">
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
              <span className="text-muted-foreground">Include in print:</span>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="print-scope"
                  checked={targetScope === "all"}
                  onChange={() => setTargetScope("all")}
                  className="accent-[var(--primary)]"
                />
                All ({report.sections.length})
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="print-scope"
                  checked={targetScope === "selected"}
                  onChange={() => setTargetScope("selected")}
                  className="accent-[var(--primary)]"
                />
                Selected ({checkedIds.size})
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="print-scope"
                  checked={targetScope === "single"}
                  onChange={() => setTargetScope("single")}
                  className="accent-[var(--primary)]"
                />
                Single
              </label>
            </div>

            {targetScope === "single" ? (
              <select
                aria-label="Select single employee to print"
                value={String(selectedSingleId)}
                onChange={(e) => setSelectedSingleId(e.target.value)}
                className="border-input bg-background text-foreground rounded-md border px-2.5 py-1 text-xs"
              >
                {report.sections.map((s) => (
                  <option key={s.employeeId} value={String(s.employeeId)}>
                    {s.employeeName}
                  </option>
                ))}
              </select>
            ) : null}

            {targetScope === "selected" ? (
              <div className="border-border bg-background grid max-h-36 w-full grid-cols-2 gap-2 overflow-y-auto rounded-lg border p-2 sm:grid-cols-3">
                {report.sections.map((s) => (
                  <label
                    key={s.employeeId}
                    className="flex cursor-pointer items-center gap-1.5 truncate text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={checkedIds.has(s.employeeId)}
                      onChange={() => toggleChecked(s.employeeId)}
                      className="accent-[var(--primary)]"
                    />
                    <span className="truncate">{s.employeeName}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          {/* Printable Document Statements */}
          {report.isPartial ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 print:hidden"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                This range has more shifts than can be loaded, so these
                statements would be incomplete and their totals wrong. Printing
                is disabled. Close this window and narrow the dates or choose
                specific employees.
              </p>
            </div>
          ) : visibleSections.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm print:hidden">
              No employees selected to print. Choose at least one employee
              above.
            </p>
          ) : (
            <div
              id="attendance-statement-print-area"
              className="space-y-8 print:space-y-0"
            >
              {visibleSections.map((section) => (
                <div
                  key={section.employeeId}
                  className="print-page-break space-y-6 rounded-xl border border-gray-200 bg-white p-6 text-black shadow-sm sm:p-8 print:m-0 print:rounded-none print:border-none print:p-0 print:shadow-none"
                >
                  {/* Dynamic Branded Letterhead */}
                  <ReportLetterhead
                    reportTitle={attendanceStatementTitle(
                      report.reportingPeriodKind ?? "custom",
                    )}
                    periodName={report.reportingPeriod}
                    employeeName={section.employeeName}
                    employeeRole={section.employeeRole}
                    brand={
                      brand || {
                        organizationName: report.organization,
                        locationName: report.branch,
                      }
                    }
                  />

                  {/* Summary Metric Strip */}
                  <div className="grid grid-cols-2 gap-3 border-y border-gray-200 py-3 text-xs sm:grid-cols-4 print:border-gray-300">
                    <div>
                      <p className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                        Total Worked
                      </p>
                      <p className="font-mono text-base font-bold text-black">
                        {section.totalHoursDisplay}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                        Total Shifts
                      </p>
                      <p className="font-mono text-base font-bold text-black">
                        {section.totalShifts}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                        Missing Punches
                      </p>
                      <p className="font-mono text-base font-bold text-black">
                        {section.missingPunchCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                        Audited Edits
                      </p>
                      <p className="font-mono text-base font-bold text-black">
                        {section.correctedShiftCount}
                      </p>
                    </div>
                  </div>

                  {/* Shift Records Table */}
                  <div className="space-y-1">
                    <table className="print-timesheet-table w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b-2 border-black bg-gray-100">
                          <th className="px-2 py-2 font-semibold">Date</th>
                          <th className="px-2 py-2 font-semibold">Day</th>
                          <th className="px-2 py-2 font-semibold">Clock In</th>
                          <th className="px-2 py-2 font-semibold">Clock Out</th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Hours
                          </th>
                          <th className="px-2 py-2 font-semibold">
                            Status / Audit
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row) => (
                          <tr key={row.id} className="border-b border-gray-200">
                            <td className="px-2 py-1.5 font-mono text-[11px]">
                              {row.businessDate}
                            </td>
                            <td className="px-2 py-1.5 text-gray-600">
                              {row.weekday}
                            </td>
                            <td className="px-2 py-1.5 font-mono">
                              {row.clockIn ?? "—"}
                            </td>
                            <td className="px-2 py-1.5 font-mono">
                              {row.clockOut ?? "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono font-medium">
                              {row.workedHoursDisplay}
                            </td>
                            <td className="px-2 py-1.5 text-[11px]">
                              {row.missingPunches ? (
                                <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 print:border print:border-amber-400">
                                  Missing Punch
                                </span>
                              ) : row.hoursStatus === "break_review" ? (
                                <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 print:border print:border-amber-400">
                                  Break pay pending
                                </span>
                              ) : row.correctionIndicators.isCorrected ? (
                                <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-900 print:border print:border-blue-400">
                                  Corrected (v{row.correctionIndicators.count})
                                </span>
                              ) : (
                                <span className="text-gray-500">Normal</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-black font-semibold">
                          <td className="px-2 py-2" colSpan={4}>
                            Total counted hours ({section.totalShifts} shift
                            {section.totalShifts === 1 ? "" : "s"})
                          </td>
                          <td className="px-2 py-2 text-right font-mono">
                            {section.totalHoursDisplay}
                          </td>
                          <td className="px-2 py-2" />
                        </tr>
                      </tbody>
                    </table>
                    {section.unresolvedShiftCount > 0 ? (
                      <p className="pt-1 text-[10px] text-amber-900">
                        {section.unresolvedShiftCount} shift
                        {section.unresolvedShiftCount === 1 ? "" : "s"} ha
                        {section.unresolvedShiftCount === 1 ? "s" : "ve"} no
                        counted hours (still open or break pay not yet
                        classified) and{" "}
                        {section.unresolvedShiftCount === 1 ? "is" : "are"} not
                        included in the total.
                      </p>
                    ) : null}
                  </div>

                  {/* Document Footer & Signatures */}
                  <div className="break-inside-avoid space-y-4 pt-4 text-xs text-gray-600">
                    <p className="text-[10px] text-gray-500">
                      Attendance Source: {report.attendanceSource} · Times
                      displayed in {report.timeZone} local time.
                    </p>
                    <p className="text-[10px] text-gray-500">
                      Hours basis: {report.hoursBasis}. Totals are calculated
                      from exact recorded seconds and rounded once for display,
                      so individual rows may not add to the total by 0.01h.
                      {report.excludedVoidedCount > 0
                        ? ` ${report.excludedVoidedCount} voided session${report.excludedVoidedCount === 1 ? "" : "s"} excluded.`
                        : ""}
                    </p>
                    <div className="grid grid-cols-2 gap-8 pt-4">
                      <div>
                        <div className="border-b border-gray-400 pb-1 font-semibold text-black">
                          {section.employeeName}
                        </div>
                        <p className="mt-1 text-[10px] text-gray-500">
                          Employee Signature & Date
                        </p>
                      </div>
                      <div>
                        <div className="border-b border-gray-400 pb-1 font-semibold text-black">
                          &nbsp;
                        </div>
                        <p className="mt-1 text-[10px] text-gray-500">
                          Authorized Manager Signature & Date
                        </p>
                      </div>
                    </div>
                    {/* No "Page X of Y": employee sections do not map to physical pages. */}
                    <div className="pt-2 text-[10px] text-gray-400">
                      <span>The Lineup Attendance System V2.0.6</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
