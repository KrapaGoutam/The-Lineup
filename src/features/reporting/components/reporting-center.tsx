"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, FileText, Loader2, Printer } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  generateCombinedReportAction,
  type ReportBundle,
  type ReportingOptions,
} from "@/features/reporting/actions/reporting-actions";
import type { ReportingLinkParams } from "@/features/reporting/domain/report-links";
import type {
  ReportContent,
  ReportOutputMode,
} from "@/features/reporting/domain/report-types";
import {
  CSV_DATASET_LABELS,
  VIEW_LABELS,
  contentForView,
  outputBlockedReason,
  reportCsvRows,
  reportFilename,
  type CsvDataset,
  type ReportViewKey,
} from "@/features/reporting/domain/report-views";
import { toCsv } from "@/lib/csv/write";
import { downloadFile } from "@/lib/download-file";
import { triggerPrintWithFilename } from "@/lib/print-utils";
import {
  formatReportPeriodLabel,
  inclusiveDayCount,
  monthBounds,
} from "@/lib/report-period";

import { ReportDocument } from "./report-document";

type PeriodMode = "this_month" | "last_month" | "month" | "custom";

const OUTPUT_LABELS: Record<ReportOutputMode, string> = {
  combined: "One combined report",
  by_organization: "Separate reports by organization",
  by_branch: "Separate reports by branch",
};

function monthFromDate(date: string): string {
  return date.slice(0, 7);
}

export function ReportingCenter({
  options,
  initial,
}: {
  options: ReportingOptions;
  initial: ReportingLinkParams;
}) {
  const orgIds = useMemo(
    () => new Set(options.organizations.map((o) => o.id)),
    [options.organizations],
  );
  const branchIds = useMemo(
    () => new Set(options.branches.map((b) => b.id)),
    [options.branches],
  );
  const employeeKeys = useMemo(
    () => new Set(options.employees.map((e) => e.key)),
    [options.employees],
  );

  const allowedViews: ReportViewKey[] = [
    "combined",
    ...(options.canSeeAttendance ? (["attendance"] as const) : []),
    ...(options.canSeePayroll ? (["payroll", "ledger"] as const) : []),
  ];
  const [view, setView] = useState<ReportViewKey>(
    initial.view && allowedViews.includes(initial.view)
      ? initial.view
      : "combined",
  );

  // A link only pre-fills: ids not offered to this user are dropped here (and the server
  // verifies the final request again regardless).
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(
    new Set((initial.organizationIds ?? []).filter((id) => orgIds.has(id))),
  );
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(
    new Set((initial.locationIds ?? []).filter((id) => branchIds.has(id))),
  );
  const linkedEmployees = initial.employeeKeys ?? [];
  // Only a manager can pick employees; for everyone else the server already narrows the
  // report to their own record, and there is no control to leave "selected" mode again.
  const [employeeMode, setEmployeeMode] = useState<"all" | "selected">(
    options.canManage && linkedEmployees.length > 0 ? "selected" : "all",
  );
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(
    new Set(linkedEmployees.filter((k) => employeeKeys.has(k))),
  );
  const unavailableLinkedEmployee =
    options.canManage &&
    linkedEmployees.length > 0 &&
    linkedEmployees.some((k) => !employeeKeys.has(k));
  const [employeeQuery, setEmployeeQuery] = useState("");

  const [content, setContent] = useState<ReportContent>(
    options.canSeeAttendance && options.canSeePayroll
      ? "both"
      : options.canSeePayroll
        ? "payroll"
        : "attendance",
  );
  const [periodMode, setPeriodMode] = useState<PeriodMode>(
    initial.startDate && initial.endDate ? "custom" : "this_month",
  );
  const [monthValue, setMonthValue] = useState(
    monthFromDate(options.thisMonth.start),
  );
  const [customStart, setCustomStart] = useState(
    initial.startDate ?? options.thisMonth.start,
  );
  const [customEnd, setCustomEnd] = useState(
    initial.endDate ?? options.thisMonth.end,
  );
  const [output, setOutput] = useState<ReportOutputMode>("combined");
  const [dataset, setDataset] = useState<CsvDataset>("register");

  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ReportBundle | null>(null);
  const [renderedView, setRenderedView] = useState<ReportViewKey>("combined");

  const range = useMemo(() => {
    switch (periodMode) {
      case "this_month":
        return options.thisMonth;
      case "last_month":
        return options.lastMonth;
      case "month": {
        const b = monthBounds(`${monthValue}-01`);
        return b ?? options.thisMonth;
      }
      default:
        return { start: customStart, end: customEnd };
    }
  }, [periodMode, monthValue, customStart, customEnd, options]);

  const days = inclusiveDayCount(range.start, range.end);
  const rangeError =
    days === null
      ? "Choose a valid date range."
      : days > options.maxRangeDays
        ? `Choose a range of ${options.maxRangeDays} days or fewer.`
        : null;

  const visibleBranches = options.branches.filter(
    (b) => selectedOrgs.size === 0 || selectedOrgs.has(b.organizationId),
  );
  const visibleEmployees = options.employees.filter((e) => {
    if (
      selectedOrgs.size > 0 &&
      !e.organizationIds.some((id) => selectedOrgs.has(id))
    ) {
      return false;
    }
    if (
      selectedBranches.size > 0 &&
      !e.locationIds.some((id) => selectedBranches.has(id))
    ) {
      return false;
    }
    return e.displayName.toLowerCase().includes(employeeQuery.toLowerCase());
  });

  const effectiveContent = contentForView(view, content);
  const employeeError =
    employeeMode === "selected"
      ? selectedEmployees.size === 0
        ? "Select at least one employee, or choose all employees."
        : selectedEmployees.size > options.maxEmployees
          ? `Select ${options.maxEmployees} employees or fewer, or choose all employees.`
          : null
      : null;

  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function toggleOrg(id: string) {
    const nextOrgs = toggle(selectedOrgs, id);
    setSelectedOrgs(nextOrgs);
    // Drop branches that no longer belong to a selected organization.
    if (nextOrgs.size > 0) {
      const valid = new Set(
        options.branches
          .filter((b) => nextOrgs.has(b.organizationId))
          .map((b) => b.id),
      );
      setSelectedBranches(
        new Set([...selectedBranches].filter((b) => valid.has(b))),
      );
    }
  }

  async function generate() {
    if (rangeError || employeeError) return;
    setStatus("loading");
    setError(null);
    const result = await generateCombinedReportAction({
      organizationIds: selectedOrgs.size ? [...selectedOrgs] : null,
      locationIds: selectedBranches.size ? [...selectedBranches] : null,
      employeeKeys: employeeMode === "selected" ? [...selectedEmployees] : null,
      content: effectiveContent,
      startDate: range.start,
      endDate: range.end,
      output,
    });
    if (!result.ok) {
      setBundle(null);
      setStatus("error");
      setError(
        result.sessionInvalid
          ? "Your session is no longer valid. Please sign in again."
          : result.error,
      );
      return;
    }
    setBundle(result.data);
    setRenderedView(view);
    setStatus("done");
  }

  const reports = bundle?.reports ?? [];
  const blocked = outputBlockedReason(reports);

  function print() {
    if (blocked || reports.length === 0) return;
    triggerPrintWithFilename(reportFilename(reports[0]!));
  }

  function exportCsv() {
    if (blocked || reports.length === 0) return;
    const rows = reports.flatMap((r, i) =>
      reportCsvRows(r, dataset).slice(i === 0 ? 0 : 1),
    );
    downloadFile(
      `${reportFilename(reports[0]!, CSV_DATASET_LABELS[dataset])}.csv`,
      toCsv(rows),
      "text/csv;charset=utf-8",
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-6xl space-y-5 p-4 pb-12 sm:p-8 print:max-w-none print:space-y-0 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <p className="text-primary text-sm font-semibold">The Lineup</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
            Reporting Center
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Attendance and payroll reports across the organizations and branches
            you are authorized for. Reports read existing records only; nothing
            here changes attendance, payroll or payments.
          </p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "secondary" })}>
          Back to workspace
        </Link>
      </div>

      <div
        role="tablist"
        aria-label="Report type"
        className="flex flex-wrap gap-2 print:hidden"
      >
        {allowedViews.map((v) => (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition ${
              view === v
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      <Card className="print:hidden">
        <CardContent className="space-y-5">
          {!options.canManage ? (
            <p role="status" className="bg-muted rounded-lg p-3 text-sm">
              You can report on your own records only.
            </p>
          ) : null}
          {unavailableLinkedEmployee ? (
            <p role="status" className="bg-muted rounded-lg p-3 text-sm">
              The employee from the link isn&apos;t available to you here.
              Choose someone from the list below.
            </p>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Organization</legend>
              <p className="text-muted-foreground text-xs">
                None checked = every organization you can report on.
              </p>
              {options.organizations.map((o) => (
                <label
                  key={o.id}
                  className="flex min-h-11 items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={selectedOrgs.has(o.id)}
                    onChange={() => toggleOrg(o.id)}
                  />
                  {o.name}
                </label>
              ))}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Branch</legend>
              <p className="text-muted-foreground text-xs">
                None checked = every authorized branch of the selected
                organizations.
              </p>
              {visibleBranches.map((b) => {
                const org = options.organizations.find(
                  (o) => o.id === b.organizationId,
                );
                return (
                  <label
                    key={b.id}
                    className="flex min-h-11 items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={selectedBranches.has(b.id)}
                      onChange={() =>
                        setSelectedBranches(toggle(selectedBranches, b.id))
                      }
                    />
                    <span>
                      {b.name}
                      {options.organizations.length > 1 && org ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {org.name}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Employees</legend>
            {options.canManage ? (
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="employee-mode"
                    checked={employeeMode === "all"}
                    onChange={() => setEmployeeMode("all")}
                    className="accent-[var(--primary)]"
                  />
                  All authorized employees
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="employee-mode"
                    checked={employeeMode === "selected"}
                    onChange={() => setEmployeeMode("selected")}
                    className="accent-[var(--primary)]"
                  />
                  Selected employees ({selectedEmployees.size})
                </label>
              </div>
            ) : (
              <p className="text-sm">Your own records.</p>
            )}
            {employeeMode === "selected" && options.canManage ? (
              <div className="space-y-2">
                <Label htmlFor="employee-search" className="sr-only">
                  Search employees
                </Label>
                <Input
                  id="employee-search"
                  placeholder="Search employees"
                  value={employeeQuery}
                  onChange={(e) => setEmployeeQuery(e.target.value)}
                />
                <ul
                  aria-label="Employees"
                  className="border-border grid max-h-56 gap-1 overflow-y-auto rounded-xl border p-2 sm:grid-cols-2"
                >
                  {visibleEmployees.map((e) => (
                    <li key={e.key}>
                      <label className="flex min-h-9 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--primary)]"
                          checked={selectedEmployees.has(e.key)}
                          onChange={() =>
                            setSelectedEmployees(
                              toggle(selectedEmployees, e.key),
                            )
                          }
                        />
                        <span className="truncate">
                          {e.displayName}
                          {e.identity === "unmapped_external" ? (
                            <span className="text-muted-foreground">
                              {" "}
                              (external, unlinked)
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                  {visibleEmployees.length === 0 ? (
                    <li className="text-muted-foreground p-2 text-sm">
                      No employees match.
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
            {employeeError ? (
              <p
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {employeeError}
              </p>
            ) : null}
          </fieldset>

          <div className="grid gap-4 md:grid-cols-3">
            {view === "combined" ? (
              <div className="space-y-1">
                <Label htmlFor="report-content">Report content</Label>
                <Select
                  id="report-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value as ReportContent)}
                >
                  {options.canSeeAttendance && options.canSeePayroll ? (
                    <option value="both">Attendance and Payroll</option>
                  ) : null}
                  {options.canSeeAttendance ? (
                    <option value="attendance">Attendance only</option>
                  ) : null}
                  {options.canSeePayroll ? (
                    <option value="payroll">Payroll only</option>
                  ) : null}
                </Select>
              </div>
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="report-period">Period</Label>
              <Select
                id="report-period"
                value={periodMode}
                onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
              >
                <option value="this_month">This month</option>
                <option value="last_month">Last month</option>
                <option value="month">Month / year</option>
                <option value="custom">Custom date range</option>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="report-output">Output</Label>
              <Select
                id="report-output"
                value={output}
                onChange={(e) => setOutput(e.target.value as ReportOutputMode)}
              >
                {(Object.keys(OUTPUT_LABELS) as ReportOutputMode[]).map((k) => (
                  <option key={k} value={k}>
                    {OUTPUT_LABELS[k]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {periodMode === "month" ? (
            <div className="max-w-xs space-y-1">
              <Label htmlFor="report-month">Month and year</Label>
              <Input
                id="report-month"
                type="month"
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value)}
              />
            </div>
          ) : null}
          {periodMode === "custom" ? (
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <Label htmlFor="report-start">From</Label>
                <Input
                  id="report-start"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="report-end">To</Label>
                <Input
                  id="report-end"
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <p className="text-muted-foreground text-sm">
            Attendance period:{" "}
            <span className="text-foreground font-medium">
              {rangeError
                ? "—"
                : formatReportPeriodLabel(range.start, range.end)}
            </span>
            . Payroll accounting periods are whole calendar months and are shown
            separately in the report. &quot;This month&quot; and &quot;Last
            month&quot; use the {options.timeZone} time zone.
          </p>
          {rangeError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {rangeError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={generate}
              disabled={status === "loading" || !!rangeError || !!employeeError}
            >
              {status === "loading" ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <FileText aria-hidden />
              )}
              Generate report
            </Button>
          </div>
        </CardContent>
      </Card>

      <div aria-live="polite" className="print:hidden">
        {status === "loading" ? (
          <p role="status" className="text-muted-foreground text-sm">
            Generating the report…
          </p>
        ) : null}
        {status === "error" && error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </div>

      {status === "done" && bundle ? (
        <section aria-label="Report result" className="space-y-4">
          <Card className="print:hidden">
            <CardContent className="flex flex-wrap items-end gap-3">
              <p className="mr-auto text-sm">
                {reports.length} report{reports.length === 1 ? "" : "s"} ·{" "}
                {reports[0]?.period.label}
              </p>
              <Button onClick={print} disabled={!!blocked}>
                <Printer aria-hidden /> Print / Save as PDF
              </Button>
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="csv-dataset" className="sr-only">
                    Export data set
                  </Label>
                  <Select
                    id="csv-dataset"
                    value={dataset}
                    onChange={(e) => setDataset(e.target.value as CsvDataset)}
                  >
                    {(Object.keys(CSV_DATASET_LABELS) as CsvDataset[]).map(
                      (k) => (
                        <option key={k} value={k}>
                          {CSV_DATASET_LABELS[k]}
                        </option>
                      ),
                    )}
                  </Select>
                </div>
                <Button
                  variant="secondary"
                  onClick={exportCsv}
                  disabled={!!blocked}
                >
                  <Download aria-hidden /> Export CSV
                </Button>
              </div>
              {blocked ? (
                <p role="status" className="basis-full text-sm">
                  {blocked}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-8 print:space-y-0">
            {reports.map((r) => (
              <ReportDocument
                key={r.reference}
                report={r}
                view={renderedView}
              />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
