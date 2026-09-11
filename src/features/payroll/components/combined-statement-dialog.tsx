"use client";

import { useEffect, useState } from "react";
import { FileText, Printer, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ReportLetterhead } from "@/components/print/report-letterhead";
import {
  getCombinedMonthlyStatementAction,
  type CombinedMonthlyStatement,
} from "@/features/payroll/actions/statement-actions";
import { calendarWeekday } from "@/features/attendance/domain/attendance-metrics";
import { formatBusinessTime } from "@/lib/date-time";
import {
  combinedStatementFilename,
  combinedStatementRosterFilename,
  triggerPrintWithFilename,
} from "@/lib/print-utils";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function money(cents: number): string {
  return currency.format(cents / 100);
}

function formatHours(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return "0h";
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
}

function formatPaymentDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const PRINT_AREA_ID = "combined-statement-print-area";

/** Either one specific employee, or every active employee for the
 * chosen month -- Feature 031's "All Employees" batch statement. */
export type CombinedStatementTarget =
  | { scope: "single"; neonUserId: number }
  | { scope: "all"; neonUserIds: number[] };

export function CombinedStatementDialog({
  restaurantSlug,
  target,
  year,
  month,
  timeZone,
  onClose,
}: {
  restaurantSlug: string;
  target: CombinedStatementTarget;
  year: number;
  month: number;
  /** Bug fix: the restaurant's business timezone (e.g. "America/Chicago"),
   * required so clock-in/out times render correctly regardless of the
   * viewer's own device/browser timezone -- see date-time.ts's header
   * comment for the bug this closes. */
  timeZone: string;
  onClose: () => void;
}) {
  const [statements, setStatements] = useState<
    CombinedMonthlyStatement[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialFailureCount, setPartialFailureCount] = useState(0);

  const neonUserIds =
    target.scope === "single" ? [target.neonUserId] : target.neonUserIds;
  const neonUserIdsKey = neonUserIds.join(",");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setPartialFailureCount(0);
      if (neonUserIds.length === 0) {
        if (!cancelled) {
          setError("No active employees to include.");
          setLoading(false);
        }
        return;
      }
      const results = await Promise.all(
        neonUserIds.map((neonUserId) =>
          getCombinedMonthlyStatementAction({
            restaurantSlug,
            year,
            month,
            neonUserId,
          }),
        ),
      );
      if (cancelled) return;
      const succeeded = results.filter(
        (r): r is { ok: true; data: CombinedMonthlyStatement } => r.ok,
      );
      if (succeeded.length === 0) {
        const firstError = results.find((r) => !r.ok);
        setError(
          firstError && !firstError.ok
            ? firstError.error
            : "Could not generate any statements for that selection.",
        );
        setLoading(false);
        return;
      }
      setStatements(succeeded.map((r) => r.data));
      setPartialFailureCount(results.length - succeeded.length);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // neonUserIds is derived fresh from `target` every render (a new
    // array reference each time) -- keyed by its own stringified
    // contents instead, so this effect only re-runs when the actual
    // set of ids changes, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantSlug, year, month, neonUserIdsKey]);

  function printStatements() {
    if (!statements || statements.length === 0) return;
    const filename =
      statements.length === 1
        ? combinedStatementFilename(
            statements[0].employee.name,
            statements[0].period.year,
            statements[0].period.month,
          )
        : combinedStatementRosterFilename(year, month);
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
        aria-label="Combined Statement"
        className="border-border bg-card flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden shadow-2xl print:max-h-none print:w-full print:max-w-none print:overflow-visible print:border-none print:shadow-none"
      >
        {/* Modal Toolbar (Screen Only) */}
        <CardHeader className="border-border bg-card flex flex-none flex-row items-center justify-between border-b p-4 sm:px-6 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="text-primary size-5" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold">
                {target.scope === "all"
                  ? "Monthly Statements — All Employees"
                  : "Monthly Statement"}
              </h2>
              <p className="text-muted-foreground text-xs">
                Attendance timesheet and payroll breakdown
                {statements && statements.length > 1
                  ? ` — ${statements.length} employees`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statements && statements.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={printStatements}
                className="gap-1.5"
              >
                <Printer className="size-4" aria-hidden="true" />
                Print
              </Button>
            ) : null}
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

        {/* Modal Content Scrollable Area -- print: overrides reset the
            screen-only scroll/height clamps so the WHOLE statement
            prints, not just whatever's currently scrolled into view
            (a real, independent bug from the duplicate-page one: this
            div's max-h/overflow would otherwise clip a long statement
            even once isolation itself is fixed). */}
        <CardContent className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6 print:overflow-visible print:p-0">
          {loading ? (
            <div className="space-y-2 py-16 text-center">
              <p className="text-sm font-medium">Generating statement…</p>
              <p className="text-muted-foreground text-xs">
                Collating attendance logs and payroll ledger
              </p>
            </div>
          ) : error ? (
            <div className="space-y-3 py-12 text-center">
              <p className="text-destructive text-sm font-medium">{error}</p>
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : statements && statements.length > 0 ? (
            <div id={PRINT_AREA_ID} className="space-y-8">
              {partialFailureCount > 0 ? (
                <p className="text-destructive text-xs print:hidden">
                  {partialFailureCount}{" "}
                  {partialFailureCount === 1 ? "statement" : "statements"} could
                  not be generated and{" "}
                  {partialFailureCount === 1 ? "is" : "are"} not included below.
                </p>
              ) : null}
              {statements.flatMap((statement) => [
                // Feature 033: strict 2-page duplex pagination -- Page 1
                // (Attendance) and Page 2 (Payroll + signatures) are two
                // FLAT siblings of the print area, each its own
                // `.print-page-break`, not one page split visually in
                // half. That's what lets back-to-back/duplex printing
                // put each employee on their own two-sided sheet
                // (Employee 1 on pages 1-2, Employee 2 on pages 3-4,
                // ...): a duplex printer flips physical sheets, not
                // rendered pixels, so the break has to be a real second
                // page boundary. Both stay flat (not nested inside a
                // per-employee wrapper) so `.print-page-break:last-child`
                // in globals.css still correctly identifies only the
                // true final page of the whole batch.
                <div
                  key={`${statement.employee.neonUserId}-attendance`}
                  className="print-page-break statement-page space-y-6"
                >
                  <ReportLetterhead
                    reportTitle="Monthly Timesheet & Payroll Statement — Page 1 of 2: Attendance"
                    employeeName={statement.employee.name}
                    employeeRole={`${statement.employee.role} · ID #${statement.employee.neonUserId}`}
                    periodName={statement.period.monthLabel}
                  />

                  {/* Top Section: Daily Attendance Timesheet */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold tracking-wider text-black uppercase">
                        Part 1: Recorded Attendance
                      </h3>
                      <span className="font-mono text-xs text-gray-600">
                        {statement.attendance.daysWorked} days ·{" "}
                        {formatHours(statement.attendance.totalHours)}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
                      <div>
                        <span className="block text-[10px] font-semibold text-gray-500 uppercase">
                          Days Worked
                        </span>
                        <span className="font-mono text-sm font-bold text-black">
                          {statement.attendance.daysWorked}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-gray-500 uppercase">
                          Total Hours
                        </span>
                        <span className="font-mono text-sm font-bold text-black">
                          {formatHours(statement.attendance.totalHours)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-gray-500 uppercase">
                          Average / Day
                        </span>
                        <span className="font-mono text-sm font-bold text-black">
                          {formatHours(statement.attendance.avgHoursPerDay)}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="print-timesheet-table w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b-2 border-black bg-gray-100">
                            <th className="px-2 py-2 font-bold text-black">
                              Date
                            </th>
                            <th className="px-2 py-2 font-bold text-black">
                              Day
                            </th>
                            <th className="px-2 py-2 font-bold text-black">
                              Clock In
                            </th>
                            <th className="px-2 py-2 font-bold text-black">
                              Clock Out
                            </th>
                            <th className="px-2 py-2 text-right font-bold text-black">
                              Hours
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {statement.attendance.rows.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="py-4 text-center text-gray-500 italic"
                              >
                                No attendance shifts logged for this period.
                              </td>
                            </tr>
                          ) : (
                            statement.attendance.rows.map((row) => (
                              <tr
                                key={row.id}
                                className="border-b border-gray-200"
                              >
                                <td className="px-2 py-1.5 font-mono">
                                  {row.date}
                                </td>
                                <td className="px-2 py-1.5 text-gray-600">
                                  {calendarWeekday(row.date)}
                                </td>
                                <td className="px-2 py-1.5 font-mono">
                                  {row.clockIn
                                    ? formatBusinessTime(row.clockIn, timeZone)
                                    : "—"}
                                </td>
                                <td className="px-2 py-1.5 font-mono">
                                  {row.clockOut
                                    ? formatBusinessTime(row.clockOut, timeZone)
                                    : "—"}
                                </td>
                                <td className="px-2 py-1.5 text-right font-mono font-semibold">
                                  {row.hoursWorked === null
                                    ? "—"
                                    : formatHours(row.hoursWorked)}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-black font-bold">
                            <td
                              colSpan={4}
                              className="px-2 py-2 text-right text-xs tracking-wider uppercase"
                            >
                              Total Hours Logged:
                            </td>
                            <td className="px-2 py-2 text-right font-mono text-sm">
                              {formatHours(statement.attendance.totalHours)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>,
                <div
                  key={`${statement.employee.neonUserId}-payroll`}
                  className="print-page-break statement-page space-y-6"
                >
                  <ReportLetterhead
                    reportTitle="Monthly Timesheet & Payroll Statement — Page 2 of 2: Payroll"
                    employeeName={statement.employee.name}
                    employeeRole={`${statement.employee.role} · ID #${statement.employee.neonUserId}`}
                    periodName={statement.period.monthLabel}
                  />

                  {/* Bottom Section: Payroll Compensation & Settlement */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold tracking-wider text-black uppercase">
                        Part 2: Payroll &amp; Compensation
                      </h3>
                      {statement.payroll ? (
                        <Badge
                          tone={
                            statement.payroll.status === "paid"
                              ? "success"
                              : statement.payroll.status === "part-paid"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {statement.payroll.status.toUpperCase()}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">NOT YET GENERATED</Badge>
                      )}
                    </div>

                    {statement.payroll ? (
                      <>
                        <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3 sm:grid-cols-4">
                          <div>
                            <span className="block text-[10px] font-semibold text-gray-500 uppercase">
                              Base Pay Rate
                            </span>
                            <span className="font-mono text-sm font-bold text-black">
                              {money(statement.payroll.rateCentsSnapshot)}/hr
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-semibold text-gray-500 uppercase">
                              Gross Compensation
                            </span>
                            <span className="font-mono text-sm font-bold text-black">
                              {money(statement.payroll.grossCents)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-semibold text-gray-500 uppercase">
                              Confirmed Paid
                            </span>
                            <span className="font-mono text-sm font-bold text-emerald-700">
                              {money(statement.payroll.confirmedPaymentsCents)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-semibold text-gray-500 uppercase">
                              Balance Due
                            </span>
                            <span className="text-primary font-mono text-sm font-bold">
                              {money(statement.payroll.balanceCents)}
                            </span>
                          </div>
                        </div>

                        {/* Payment Records */}
                        {statement.payroll.payments.length > 0 ? (
                          <div>
                            <h4 className="mb-1.5 text-xs font-semibold text-gray-700">
                              Settlement Payments:
                            </h4>
                            <table className="print-timesheet-table w-full border-collapse text-left text-xs">
                              <thead>
                                <tr className="border-b border-gray-300 text-gray-600">
                                  <th className="px-2 py-1 font-medium">
                                    Date
                                  </th>
                                  <th className="px-2 py-1 font-medium">
                                    Status
                                  </th>
                                  <th className="px-2 py-1 font-medium">
                                    Memo / Note
                                  </th>
                                  <th className="px-2 py-1 text-right font-medium">
                                    Amount
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {statement.payroll.payments.map((payment) => (
                                  <tr
                                    key={payment.id}
                                    className="border-b border-gray-100"
                                  >
                                    <td className="px-2 py-1 font-mono">
                                      {formatPaymentDate(payment.paymentDate)}
                                    </td>
                                    <td className="px-2 py-1 font-medium capitalize">
                                      {payment.status}
                                    </td>
                                    <td className="px-2 py-1">
                                      {payment.comment ?? "Direct settlement"}
                                    </td>
                                    <td className="px-2 py-1 text-right font-mono font-semibold">
                                      {money(payment.amountCents)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 italic">
                            No payments recorded yet for this payroll period.
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-500">
                        A formal payroll period has not yet been generated for
                        this calendar month. Once generated by management, the
                        verified rate, gross compensation, and payment ledger
                        will appear here.
                      </div>
                    )}
                  </div>

                  {/* Signatures & Certification Block */}
                  <div className="mt-3 break-inside-avoid border-t-2 border-black pt-3">
                    <div className="grid grid-cols-2 gap-12 text-xs">
                      <div>
                        <div className="mb-1.5 border-b border-black pb-1" />
                        <p className="font-semibold text-black">
                          Employee Signature &amp; Date
                        </p>
                        <p className="text-[10.5px] text-gray-500">
                          I certify that the recorded hours and statement
                          details above are accurate.
                        </p>
                      </div>
                      <div>
                        <div className="mb-1.5 border-b border-black pb-1" />
                        <p className="font-semibold text-black">
                          Manager Approval &amp; Date
                        </p>
                        <p className="text-[10.5px] text-gray-500">
                          Approved for restaurant operational and payroll
                          disbursement records.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>,
              ])}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
