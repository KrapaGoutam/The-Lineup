"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ReportLetterhead } from "@/components/print/report-letterhead";
import { buildDisplayLabels } from "@/features/attendance/domain/attendance-report";
import { monthLabel } from "@/features/payroll/components/payroll-workspace";
import {
  getPersonColor,
  getPersonInitials,
} from "@/features/payroll/components/payroll-period-groups";
import type { PayrollPeriodWithBalance } from "@/features/payroll/domain/payroll-balance-metrics";
import {
  payrollRosterFilename,
  payrollSingleFilename,
  triggerPrintWithFilename,
  type FilenamePeriod,
} from "@/lib/print-utils";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function money(cents: number) {
  return currency.format(cents / 100);
}

const ALL_OPEN_MONTHS = "all-open" as const;
type MonthChoice = string | typeof ALL_OPEN_MONTHS;

type PrintPage = { neonUserId: number; periods: PayrollPeriodWithBalance[] };

/**
 * Feature 030 bug fix: multi-select batch payroll print, reading only
 * `dashboard.periods`/`rateOptions.users` -- both already fetched once
 * by `PrivilegedPayrollView` and already correctly RLS-scoped -- so this
 * needs no server action of its own, the same reasoning
 * `PayrollPeriodGroups`/`PayrollBalancePanel` already rely on for the
 * exact same data.
 */
export function PayrollPrintDialog({
  periods,
  users,
  defaultNeonUserId,
  onClose,
}: {
  periods: PayrollPeriodWithBalance[];
  users: Array<{ id: number; fullName: string; role: string }>;
  defaultNeonUserId?: number;
  onClose: () => void;
}) {
  const displayLabels = buildDisplayLabels(users);
  const availableMonths = [...new Set(periods.map((p) => p.periodMonth))].sort(
    (a, b) => b.localeCompare(a),
  );
  const allNeonUserIds = [...new Set(periods.map((p) => p.neonUserId))].sort(
    (a, b) => a - b,
  );

  const [monthChoice, setMonthChoice] = useState<MonthChoice>(
    availableMonths[0] ?? ALL_OPEN_MONTHS,
  );
  // Pre-selected to "current" only when opened from a specific person's
  // row (there is a real "current employee" to default to); the global
  // toolbar entry point has no such concept, so it defaults to "all".
  const [employeeChoice, setEmployeeChoice] = useState<
    "current" | "selected" | "all"
  >(defaultNeonUserId !== undefined ? "current" : "all");
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [printJob, setPrintJob] = useState<{
    pages: PrintPage[];
    filename: string;
  } | null>(null);

  useEffect(() => {
    if (!printJob) return;
    triggerPrintWithFilename(printJob.filename);
  }, [printJob]);

  function labelFor(id: number) {
    return displayLabels.get(id) ?? `Neon #${id}`;
  }

  function toggleChecked(id: number) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setError("");
    const targetIds =
      employeeChoice === "current" && defaultNeonUserId !== undefined
        ? [defaultNeonUserId]
        : employeeChoice === "all"
          ? allNeonUserIds
          : [...checkedIds];
    if (targetIds.length === 0) {
      setError("Choose at least one employee.");
      return;
    }

    const pages: PrintPage[] = targetIds
      .map((neonUserId) => ({
        neonUserId,
        periods: periods
          .filter((p) => p.neonUserId === neonUserId)
          .filter((p) =>
            monthChoice === ALL_OPEN_MONTHS
              ? p.balanceCents > 0
              : p.periodMonth === monthChoice,
          )
          .sort((a, b) => a.periodMonth.localeCompare(b.periodMonth)),
      }))
      .filter((page) => page.periods.length > 0);

    if (pages.length === 0) {
      setError(
        monthChoice === ALL_OPEN_MONTHS
          ? "Nobody selected has an open (unpaid) period."
          : "Nobody selected has a period for that month.",
      );
      return;
    }

    const filenamePeriod: FilenamePeriod =
      monthChoice === ALL_OPEN_MONTHS
        ? "all-open-months"
        : {
            year: Number(monthChoice.slice(0, 4)),
            month: Number(monthChoice.slice(5, 7)),
          };
    const filename =
      pages.length === 1
        ? payrollSingleFilename(labelFor(pages[0].neonUserId), filenamePeriod)
        : payrollRosterFilename(filenamePeriod);

    setPrintJob({ pages, filename });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-xs sm:p-6 print:static print:inset-auto print:h-auto print:overflow-visible print:bg-transparent print:p-0 print:backdrop-blur-none"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="payroll-print-title"
        className="border-border bg-card flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden shadow-2xl print:hidden"
      >
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <h2 id="payroll-print-title" className="text-lg font-semibold">
              Print Statements
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Choose a month and who to include.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close print dialog"
          >
            <X />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <label
              htmlFor="payroll-print-month"
              className="text-sm font-medium"
            >
              Month
            </label>
            <Select
              id="payroll-print-month"
              value={monthChoice}
              onChange={(event) => setMonthChoice(event.target.value)}
            >
              <option value={ALL_OPEN_MONTHS}>All open months</option>
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {monthLabel(month)}
                </option>
              ))}
            </Select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Who to print</legend>
            {defaultNeonUserId !== undefined ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="payroll-print-choice"
                  checked={employeeChoice === "current"}
                  onChange={() => setEmployeeChoice("current")}
                  className="accent-[var(--primary)]"
                />
                Print current employee ({labelFor(defaultNeonUserId)})
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="payroll-print-choice"
                checked={employeeChoice === "selected"}
                onChange={() => setEmployeeChoice("selected")}
                className="accent-[var(--primary)]"
              />
              Print selected employees
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="payroll-print-choice"
                checked={employeeChoice === "all"}
                onChange={() => setEmployeeChoice("all")}
                className="accent-[var(--primary)]"
              />
              Print all employees
            </label>
          </fieldset>

          {employeeChoice === "selected" ? (
            <div className="border-border grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-xl border p-2 sm:grid-cols-2">
              {allNeonUserIds.map((id) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checkedIds.has(id)}
                    onChange={() => toggleChecked(id)}
                    className="accent-[var(--primary)]"
                  />
                  {labelFor(id)}
                </label>
              ))}
            </div>
          ) : null}

          {error ? (
            <p className="text-destructive text-sm" aria-live="polite">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={submit}>
              Print
            </Button>
          </div>
        </CardContent>
      </Card>

      {printJob ? (
        <div className="hidden print:block">
          {printJob.pages.map((page) => (
            <div key={page.neonUserId} className="print-page-break p-10">
              <ReportLetterhead
                reportTitle={
                  monthChoice === ALL_OPEN_MONTHS
                    ? "Payroll Compensation Statement — All Open Months"
                    : "Payroll Compensation Statement"
                }
                employeeName={labelFor(page.neonUserId)}
                periodName={
                  monthChoice === ALL_OPEN_MONTHS
                    ? "All open months"
                    : monthLabel(monthChoice)
                }
              />
              <div className="mb-3 flex items-center gap-3">
                <div
                  className="grid size-9 flex-none place-items-center rounded-full text-xs font-bold text-[#101012]"
                  style={{ backgroundColor: getPersonColor(page.neonUserId) }}
                >
                  {getPersonInitials(labelFor(page.neonUserId))}
                </div>
                <p className="text-sm text-gray-600">
                  {page.periods.length}{" "}
                  {page.periods.length === 1 ? "period" : "periods"} included
                </p>
              </div>
              <table className="print-timesheet-table w-full border-collapse text-left text-xs">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Hours</th>
                    <th>Rate</th>
                    <th>Gross</th>
                    <th>Paid</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {page.periods.map((period) => (
                    <tr key={period.id}>
                      <td>{monthLabel(period.periodMonth)}</td>
                      <td className="font-mono tabular-nums">
                        {period.hoursSnapshot.toFixed(1)}h
                      </td>
                      <td className="font-mono tabular-nums">
                        {money(period.rateCentsSnapshot)}/hr
                      </td>
                      <td className="font-mono tabular-nums">
                        {money(period.grossCents)}
                      </td>
                      <td className="font-mono tabular-nums">
                        {money(period.grossCents - period.balanceCents)}
                      </td>
                      <td className="font-mono tabular-nums">
                        {money(period.balanceCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black font-bold">
                    <td colSpan={5} className="text-right uppercase">
                      Total balance:
                    </td>
                    <td className="font-mono tabular-nums">
                      {money(
                        page.periods.reduce(
                          (sum, period) => sum + period.balanceCents,
                          0,
                        ),
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
