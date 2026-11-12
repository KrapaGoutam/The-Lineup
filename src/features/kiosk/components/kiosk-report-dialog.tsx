"use client";

import * as React from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Printer,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { KioskActiveContext } from "../domain/kiosk-device";
import type { KioskEmployeeSessionState } from "./kiosk-app";
import { kioskGetEmployeeReportAction } from "../actions/kiosk-clock-actions";
import type { NativeReportRow } from "@/features/attendance/domain/native-report";

export interface KioskReportDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly context: KioskActiveContext;
  readonly employee: KioskEmployeeSessionState;
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "0h 0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatTime(
  isoString: string | null | undefined,
  timeZone: string,
): string {
  if (!isoString) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

function formatDate(dateString: string): string {
  try {
    const [year, month, day] = dateString.split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(d);
  } catch {
    return dateString;
  }
}

export function KioskReportDialog({
  open,
  onClose,
  context,
  employee,
}: KioskReportDialogProps) {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = React.useState<number>(
    currentDate.getFullYear(),
  );
  const [selectedMonth, setSelectedMonth] = React.useState<number>(
    currentDate.getMonth() + 1,
  );
  const [rows, setRows] = React.useState<readonly NativeReportRow[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchReport = React.useCallback(async (year: number, month: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await kioskGetEmployeeReportAction({ year, month });
      if (!res.ok) {
        setError(res.error);
        setRows([]);
      } else {
        setRows(res.data.rows);
      }
    } catch (err: unknown) {
      console.error("fetchReport error", err);
      setError("Failed to load attendance report.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchReport(selectedYear, selectedMonth);
    }
  }, [open, selectedYear, selectedMonth, fetchReport]);

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const monthLabel = React.useMemo(() => {
    const d = new Date(selectedYear, selectedMonth - 1, 1);
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(d);
  }, [selectedYear, selectedMonth]);

  // Totals calculations
  const totalWorkedSeconds = React.useMemo(() => {
    return rows.reduce(
      (sum, row) =>
        sum + (row.netPayableSeconds ?? row.grossElapsedSeconds ?? 0),
      0,
    );
  }, [rows]);

  const totalBreakSeconds = React.useMemo(() => {
    return rows.reduce((sum, row) => sum + (row.totalBreakSeconds ?? 0), 0);
  }, [rows]);

  if (!open) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-md sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kiosk-report-title"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141416] text-[#f6f3ed] shadow-2xl print:max-h-none print:w-full print:border-none print:bg-white print:text-black print:shadow-none">
        {/* Header - on screen */}
        <div className="flex items-center justify-between border-b border-white/10 p-4 sm:p-6 print:hidden">
          <div>
            <h2
              id="kiosk-report-title"
              className="font-serif text-2xl font-bold tracking-tight text-[#f6f3ed]"
            >
              My Attendance Timesheet
            </h2>
            <p className="mt-1 text-xs text-[#aaa7a1] sm:text-sm">
              {employee.displayName} • {context.locationName}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handlePrint}
              disabled={isLoading || rows.length === 0}
              className="h-9 border-white/10 text-xs font-medium hover:bg-white/5"
              data-testid="print-timesheet-button"
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print Timesheet
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="h-9 w-9 p-0 text-[#aaa7a1] hover:text-[#f6f3ed]"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Printable Letterhead Banner (Visible only in print mode) */}
        <div className="hidden border-b border-gray-300 p-6 print:block">
          <div className="letterhead-banner flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-wider text-gray-900 uppercase">
                {context.organizationName}
              </h1>
              <p className="text-sm text-gray-600">
                Location: {context.locationName}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-800">
                Employee Timesheet: {employee.displayName}
              </p>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold text-gray-900">
                {monthLabel}
              </span>
              <p className="mt-1 text-xs text-gray-500">
                Printed: {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Month Selector Bar */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[#1b1b1e]/50 px-4 py-2 sm:px-6 print:hidden">
          <Button
            type="button"
            variant="ghost"
            onClick={handlePrevMonth}
            disabled={isLoading}
            className="h-8 px-2 text-xs text-[#aaa7a1] hover:text-[#f6f3ed]"
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            Previous
          </Button>

          <div className="flex items-center gap-1.5 text-sm font-semibold text-[#f6f3ed]">
            <Calendar className="h-4 w-4 text-[#f2a65a]" />
            <span data-testid="timesheet-month-label">{monthLabel}</span>
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={handleNextMonth}
            disabled={isLoading}
            className="h-8 px-2 text-xs text-[#aaa7a1] hover:text-[#f6f3ed]"
          >
            Next
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-3 gap-2 border-b border-white/10 p-4 sm:gap-4 sm:p-6 print:grid print:grid-cols-3 print:gap-4 print:border-gray-200 print:p-4">
          <div className="rounded-xl border border-white/10 bg-[#1b1b1e]/80 p-3 text-center sm:p-4 print:border-gray-300 print:bg-gray-50">
            <span className="text-xs text-[#aaa7a1] print:text-gray-600">
              Total Hours
            </span>
            <p className="mt-1 font-mono text-xl font-bold text-[#f2a65a] sm:text-2xl print:text-gray-900">
              {formatDuration(totalWorkedSeconds)}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#1b1b1e]/80 p-3 text-center sm:p-4 print:border-gray-300 print:bg-gray-50">
            <span className="text-xs text-[#aaa7a1] print:text-gray-600">
              Total Shifts
            </span>
            <p className="mt-1 font-mono text-xl font-bold text-[#f6f3ed] sm:text-2xl print:text-gray-900">
              {rows.length}
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#1b1b1e]/80 p-3 text-center sm:p-4 print:border-gray-300 print:bg-gray-50">
            <span className="text-xs text-[#aaa7a1] print:text-gray-600">
              Break Time
            </span>
            <p className="mt-1 font-mono text-xl font-bold text-[#aaa7a1] sm:text-2xl print:text-gray-700">
              {formatDuration(totalBreakSeconds)}
            </p>
          </div>
        </div>

        {/* Table Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 print:overflow-visible print:p-0">
          {isLoading ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-[#aaa7a1]">
              <Loader2 className="h-6 w-6 animate-spin text-[#f2a65a]" />
              <span>Loading attendance history...</span>
            </div>
          ) : error ? (
            <div className="flex h-48 flex-col items-center justify-center text-center text-sm text-red-400">
              <p>{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center text-sm text-[#aaa7a1]">
              <Clock className="mb-2 h-8 w-8 text-white/20" />
              <p>No attendance records found for {monthLabel}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="print-timesheet-table w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs font-semibold tracking-wider text-[#aaa7a1] uppercase print:border-gray-300">
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Clock In</th>
                    <th className="px-3 py-2.5">Clock Out</th>
                    <th className="px-3 py-2.5">Break</th>
                    <th className="px-3 py-2.5 text-right">Worked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono print:divide-gray-200">
                  {rows.map((row) => (
                    <tr key={row.sessionId} className="hover:bg-white/5">
                      <td className="px-3 py-2.5 font-sans font-medium text-[#f6f3ed] print:text-gray-900">
                        {formatDate(row.serviceDate)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          tone={
                            row.status === "active"
                              ? "success"
                              : row.status === "on_break"
                                ? "warning"
                                : "neutral"
                          }
                          className="text-[10px] capitalize"
                        >
                          {row.status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-[#aaa7a1] print:text-gray-700">
                        {formatTime(row.clockInAt, context.timeZone)}
                      </td>
                      <td className="px-3 py-2.5 text-[#aaa7a1] print:text-gray-700">
                        {formatTime(row.clockOutAt, context.timeZone)}
                      </td>
                      <td className="px-3 py-2.5 text-[#aaa7a1] print:text-gray-700">
                        {formatDuration(row.totalBreakSeconds)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-[#f2a65a] print:text-gray-900">
                        {formatDuration(
                          row.netPayableSeconds ?? row.grossElapsedSeconds,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer - on screen */}
        <div className="flex items-center justify-between border-t border-white/10 p-4 sm:p-6 print:hidden">
          <span className="text-xs text-[#aaa7a1]">
            Showing records exclusively for your account.
          </span>
          <Button
            type="button"
            variant="default"
            onClick={onClose}
            className="bg-[#f2a65a] text-sm font-semibold text-[#1c1007] hover:bg-[#e09244]"
          >
            Back to Actions
          </Button>
        </div>
      </div>
    </div>
  );
}
