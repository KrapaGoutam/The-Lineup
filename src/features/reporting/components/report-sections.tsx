import type { ReactNode } from "react";

import {
  formatCents,
  formatSeconds,
} from "@/features/reporting/domain/report-composer";
import {
  groupRegister,
  ledgerTotals,
  registerTotals,
} from "@/features/reporting/domain/report-views";
import {
  INFORMATIONAL_AGGREGATE_NOTE,
  type AttendanceDetailRow,
  type CombinedReport,
  type EmployeeKey,
  type LedgerEntry,
  type PayrollEntry,
  type RegisterRow,
  type ReportException,
  type ScopedTotals,
  type TotalsBlock,
} from "@/features/reporting/domain/report-types";
import { formatPeriodMonth, formatReportDate } from "@/lib/report-period";

/*
 * V2.0.7 report sections. Every figure is read from the composed report: nothing here
 * calculates pay, rates or balances. These render on white "paper" regardless of the app
 * theme and avoid <header>/<nav>/<button> (the print stylesheet hides those elements).
 */

const TH =
  "px-1.5 py-1 text-left text-[8pt] font-semibold tracking-wide text-gray-600 uppercase";
const TD = "px-1.5 py-1 align-top text-[9pt] text-gray-900";
const NUM = "text-right font-mono tabular-nums whitespace-nowrap";

export function Money({ cents }: { cents: number | null }) {
  if (cents === null) return <span aria-label="not applicable">—</span>;
  // The sign (a real minus) carries the meaning; colour alone never does (print is often
  // black and white, and colour-only cues fail for colour-blind readers).
  return <span>{formatCents(cents)}</span>;
}

function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      className="mb-2 border-b border-gray-300 pb-1 text-base font-bold text-black"
    >
      {children}
    </h2>
  );
}

const SEVERITY_LABEL: Record<ReportException["severity"], string> = {
  blocking: "Blocking",
  warning: "Warning",
  info: "Note",
};

export function ExceptionList({
  exceptions,
  title = "Reporting exceptions",
}: {
  exceptions: readonly ReportException[];
  title?: string;
}) {
  if (exceptions.length === 0) {
    return (
      <p className="text-[9pt] text-gray-700">
        No reporting exceptions were found for this selection.
      </p>
    );
  }
  const order = { blocking: 0, warning: 1, info: 2 } as const;
  const sorted = [...exceptions].sort(
    (a, b) => order[a.severity] - order[b.severity],
  );
  return (
    <div className="report-keep">
      <h3 className="mt-3 mb-1 text-[10pt] font-semibold text-black">
        {title}
      </h3>
      <ul className="space-y-1">
        {sorted.map((x, i) => (
          <li key={`${x.code}-${i}`} className="text-[9pt] text-gray-900">
            <span className="mr-1.5 inline-block rounded border border-gray-500 px-1 text-[7.5pt] font-bold tracking-wide uppercase">
              {SEVERITY_LABEL[x.severity]}
            </span>
            {x.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="report-keep rounded border border-gray-300 p-2">
      <p className="text-[7.5pt] font-bold tracking-wider text-gray-600 uppercase">
        {label}
      </p>
      <p className="font-mono text-[11pt] font-bold text-black tabular-nums">
        {value}
      </p>
    </div>
  );
}

// ── Executive summary ────────────────────────────────────────────────────────────────────

function TotalsRow({
  label,
  sub,
  t,
  strong,
}: {
  label: string;
  sub?: string;
  t: TotalsBlock;
  strong?: boolean;
}) {
  return (
    <tr className={strong ? "font-bold" : undefined}>
      <td className={TD}>
        {label}
        {sub ? (
          <span className="block text-[8pt] text-gray-600">{sub}</span>
        ) : null}
      </td>
      <td className={`${TD} ${NUM}`}>{t.employees}</td>
      <td className={`${TD} ${NUM}`}>{formatSeconds(t.attendanceSeconds)}</td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={t.baseCents} />
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={t.adjustmentEffectCents} />
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={t.grossAfterAdjustmentsCents} />
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={t.confirmedPaymentsCents} />
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={t.balanceOwedCents} />
      </td>
    </tr>
  );
}

function TotalsTable({ caption, rows }: { caption: string; rows: ReactNode }) {
  return (
    <table className="report-table mt-2 w-full border-collapse">
      <caption className="mb-1 text-left text-[9pt] font-semibold text-black">
        {caption}
      </caption>
      <thead>
        <tr className="border-b border-gray-400">
          <th className={TH}>Scope</th>
          <th className={`${TH} text-right`}>Employees</th>
          <th className={`${TH} text-right`}>Attendance hrs</th>
          <th className={`${TH} text-right`}>Base</th>
          <th className={`${TH} text-right`}>Adjustments</th>
          <th className={`${TH} text-right`}>Gross</th>
          <th className={`${TH} text-right`}>Payments</th>
          <th className={`${TH} text-right`}>Remaining</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}

export function SummarySection({ report }: { report: CombinedReport }) {
  const s = report.summary;
  const showPayroll = report.content !== "attendance";
  const showAttendance = report.content !== "payroll";
  const scoped = (t: ScopedTotals, withBranch: boolean) => (
    <TotalsRow
      key={`${t.organizationId}-${t.locationId ?? "-"}`}
      label={withBranch ? `${t.branch}` : t.organization}
      sub={withBranch ? t.organization : undefined}
      t={t}
    />
  );
  return (
    <section className="report-section" aria-labelledby="report-summary-title">
      <SectionTitle id="report-summary-title">Executive Summary</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Verified employees" value={s.verifiedEmployees} />
        <Stat label="Organizations" value={s.organizationCount} />
        <Stat label="Branches" value={s.branchCount} />
        {showAttendance ? (
          <Stat
            label="Attendance hours (counted)"
            value={formatSeconds(s.attendanceSeconds)}
          />
        ) : null}
        {showPayroll ? (
          <>
            <Stat label="Base payroll" value={<Money cents={s.baseCents} />} />
            <Stat
              label="Adjustments (effect)"
              value={<Money cents={s.adjustmentEffectCents} />}
            />
            <Stat
              label="Gross after adjustments"
              value={<Money cents={s.grossAfterAdjustmentsCents} />}
            />
            <Stat
              label="Payments recorded"
              value={<Money cents={s.confirmedPaymentsCents} />}
            />
            <Stat
              label="Remaining balance owed"
              value={<Money cents={s.balanceOwedCents} />}
            />
            <Stat label="Pending (draft) records" value={s.pendingPeriods} />
          </>
        ) : null}
        <Stat label="Reporting exceptions" value={s.exceptionCount} />
        {s.unmappedIdentities > 0 ? (
          <Stat
            label="Unmapped external identities"
            value={s.unmappedIdentities}
          />
        ) : null}
      </div>

      {s.informationalAggregate ? (
        <p className="mt-2 rounded border border-gray-500 p-2 text-[8.5pt] font-semibold text-gray-900">
          {INFORMATIONAL_AGGREGATE_NOTE}
        </p>
      ) : null}
      {s.overpaidCents > 0 ? (
        <p className="mt-2 text-[8.5pt] text-gray-800">
          Overpaid credit (not netted against balances owed):{" "}
          <Money cents={s.overpaidCents} />
        </p>
      ) : null}

      <TotalsTable
        caption="By organization"
        rows={
          <>
            {report.byOrganization.map((t) => scoped(t, false))}
            {report.byOrganization.length > 1 ? (
              <TotalsRow
                label="All organizations — informational aggregate"
                t={s}
                strong
              />
            ) : null}
          </>
        }
      />
      <TotalsTable
        caption="By branch"
        rows={report.byBranch.map((t) => scoped(t, true))}
      />
      <ExceptionList exceptions={report.exceptions} />
    </section>
  );
}

// ── Payroll register ─────────────────────────────────────────────────────────────────────

function RegisterRowView({ r }: { r: RegisterRow }) {
  return (
    <tr className={r.includedInTotals ? undefined : "text-gray-500 italic"}>
      <td className={TD}>
        {r.employeeName}
        <span className="block text-[8pt] text-gray-600">
          {r.organization} · {r.branch}
        </span>
      </td>
      <td className={TD}>
        {r.payrollPeriodMonth ? formatPeriodMonth(r.payrollPeriodMonth) : "—"}
      </td>
      <td className={`${TD} ${NUM}`}>
        {r.attendanceSeconds === null
          ? "—"
          : formatSeconds(r.attendanceSeconds)}
        {r.unresolvedShifts > 0 ? (
          <span className="block font-sans text-[7.5pt] text-gray-700">
            +{r.unresolvedShifts} unresolved
          </span>
        ) : null}
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={r.baseCents} />
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={r.adjustmentEffectCents} />
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={r.grossAfterAdjustmentsCents} />
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={r.confirmedPaymentsCents} />
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={r.balanceCents} />
      </td>
      <td className={TD}>{r.financialStatus}</td>
    </tr>
  );
}

function RegisterTotalRow({
  label,
  rows,
  strong,
}: {
  label: string;
  rows: readonly RegisterRow[];
  strong?: boolean;
}) {
  const t = registerTotals(rows);
  return (
    <tr
      className={`report-total-row border-t border-gray-400 ${strong ? "font-bold" : "font-semibold"}`}
    >
      <td className={TD} colSpan={2}>
        {label}
      </td>
      <td className={`${TD} ${NUM}`}>{formatSeconds(t.attendanceSeconds)}</td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={t.baseCents} />
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={t.adjustmentEffectCents} />
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={t.grossAfterAdjustmentsCents} />
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={t.confirmedPaymentsCents} />
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={t.balanceCents} />
      </td>
      <td className={TD} />
    </tr>
  );
}

export function RegisterSection({ report }: { report: CombinedReport }) {
  const groups = groupRegister(report.register);
  const orgs = new Set(groups.map((g) => g.organizationId));
  return (
    <section className="report-section" aria-labelledby="report-register-title">
      <SectionTitle id="report-register-title">
        All-Employee Payroll Register
      </SectionTitle>
      <p className="mb-2 text-[8.5pt] text-gray-700">
        Attendance period: {report.period.label}. Payroll accounting period(s):{" "}
        {report.period.payrollLabel || "—"}. Base is the stored payroll
        snapshot; gross is base plus the effect of adjustments; remaining is
        gross less confirmed payments. Draft payments are not counted.
      </p>
      {report.register.length === 0 ? (
        <p className="text-[9pt] text-gray-700">
          No records for this selection.
        </p>
      ) : (
        <table className="report-table w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-400">
              <th className={TH}>Employee</th>
              <th className={TH}>Payroll period</th>
              <th className={`${TH} text-right`}>Attendance</th>
              <th className={`${TH} text-right`}>Base</th>
              <th className={`${TH} text-right`}>Adjust.</th>
              <th className={`${TH} text-right`}>Gross</th>
              <th className={`${TH} text-right`}>Paid</th>
              <th className={`${TH} text-right`}>Remaining</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <RegisterGroupRows
                key={`${g.organizationId}-${g.locationId ?? "-"}`}
                group={g}
              />
            ))}
            <RegisterTotalRow
              label={
                orgs.size > 1
                  ? "All organizations — informational aggregate"
                  : "Total"
              }
              rows={report.register}
              strong
            />
          </tbody>
        </table>
      )}
    </section>
  );
}

function RegisterGroupRows({
  group,
}: {
  group: ReturnType<typeof groupRegister>[number];
}) {
  return (
    <>
      <tr className="bg-gray-100">
        <td className={`${TD} font-bold`} colSpan={9}>
          {group.organization} · {group.branch}
        </td>
      </tr>
      {group.rows.map((r) => (
        <RegisterRowView key={r.key} r={r} />
      ))}
      <RegisterTotalRow
        label={`Subtotal — ${group.organization} · ${group.branch}`}
        rows={group.rows}
      />
    </>
  );
}

// ── Individual employee statements ──────────────────────────────────────────────────────

function PayrollEntryCard({
  entry,
  org,
  branch,
}: {
  entry: PayrollEntry;
  org: string;
  branch: string;
}) {
  const hours = Number(entry.hoursSnapshot.toFixed(2));
  return (
    <div className="report-keep mb-3 rounded border border-gray-300 p-2">
      <p className="text-[9.5pt] font-semibold text-black">
        {org} · {branch} — payroll {formatPeriodMonth(entry.periodMonth)}{" "}
        <span className="font-normal">
          ({entry.status === "locked" ? "Locked" : "Draft — not final"};{" "}
          {entry.source === "external_neon" ? "external source" : "The Lineup"})
        </span>
      </p>
      {!entry.includedInTotals ? (
        <p className="text-[8.5pt] font-semibold text-gray-900">
          Excluded from totals: conflicting payroll records exist for this
          person and month.
        </p>
      ) : null}
      <table className="report-table mt-1 w-full border-collapse">
        <tbody>
          <tr>
            <td className={TD}>
              Base (snapshot: {hours}h × {formatCents(entry.rateCents)}/h)
            </td>
            <td className={`${TD} ${NUM}`}>
              <Money cents={entry.baseCents} />
            </td>
          </tr>
          {entry.adjustments.map((a) => (
            <tr key={`a-${a.id}`}>
              <td className={TD}>
                Adjustment ADJ-{a.id} — {a.reason}
              </td>
              <td className={`${TD} ${NUM}`}>
                <Money cents={-a.deltaCents === 0 ? 0 : -a.deltaCents} />
              </td>
            </tr>
          ))}
          <tr className="border-t border-gray-300 font-semibold">
            <td className={TD}>Gross after adjustments</td>
            <td className={`${TD} ${NUM}`}>
              <Money cents={entry.grossAfterAdjustmentsCents} />
            </td>
          </tr>
          {entry.payments.map((p) => (
            <tr
              key={`p-${p.id}`}
              className={
                p.status === "draft" ? "text-gray-500 italic" : undefined
              }
            >
              <td className={TD}>
                Payment PAY-{p.id} · {formatReportDate(p.paymentDate)} ·{" "}
                {p.status === "confirmed" ? "Confirmed" : "Draft (not counted)"}
                {p.comment ? ` — ${p.comment}` : ""}
              </td>
              <td className={`${TD} ${NUM}`}>
                <Money cents={p.status === "confirmed" ? -p.amountCents : 0} />
              </td>
            </tr>
          ))}
          <tr className="border-t border-gray-400 font-bold">
            <td className={TD}>Remaining balance</td>
            <td className={`${TD} ${NUM}`}>
              <Money cents={entry.balanceCents} />
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[7.5pt] text-gray-600">
        Audit reference: {entry.sourceRef}
      </p>
    </div>
  );
}

export function EmployeeStatement({
  report,
  employeeKey,
  header,
}: {
  report: CombinedReport;
  employeeKey: EmployeeKey;
  header: ReactNode;
}) {
  const emp = report.employees.find((e) => e.key === employeeKey);
  const rows = report.attendanceRows.filter(
    (r) => r.employeeKey === employeeKey,
  );
  const entries = report.payrollEntries.filter(
    (e) => e.employeeKey === employeeKey,
  );
  const exceptions = report.exceptions.filter(
    (x) => x.employeeKey === employeeKey,
  );
  const orgName = (id: string) =>
    report.organizations.find((o) => o.id === id)?.name ?? "Organization";
  const branchName = (orgId: string, loc: string | null) =>
    report.branches.find((b) => b.organizationId === orgId && b.id === loc)
      ?.name ?? "Organization-level";

  const slices = new Map<
    string,
    {
      org: string;
      branch: string;
      source: string;
      basis: string;
      rows: AttendanceDetailRow[];
    }
  >();
  for (const r of rows) {
    const k = `${r.organizationId}|${r.locationId ?? "-"}|${r.provider}`;
    const s = slices.get(k) ?? {
      org: r.organization,
      branch: r.branch,
      source: r.sourceLabel,
      basis:
        report.attendanceSlices.find(
          (x) =>
            x.organizationId === r.organizationId &&
            x.locationId === r.locationId &&
            x.provider === r.provider,
        )?.hoursBasis ?? "",
      rows: [],
    };
    s.rows.push(r);
    slices.set(k, s);
  }

  return (
    <section
      className="report-section report-statement"
      aria-label={`Statement for ${emp?.displayName ?? "employee"}`}
    >
      {header}
      {emp?.identity === "unmapped_external" ? (
        <p className="mb-2 rounded border border-gray-500 p-1.5 text-[8.5pt] text-gray-900">
          External identity — not linked to a verified employee. Records from
          other sources are not combined with this statement.
        </p>
      ) : null}

      {report.content !== "payroll" ? (
        <div className="mb-3">
          <h3 className="mb-1 text-[10pt] font-semibold text-black">
            Attendance summary
          </h3>
          {slices.size === 0 ? (
            <p className="text-[9pt] text-gray-700">
              No attendance in this period.
            </p>
          ) : (
            <table className="report-table w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-400">
                  <th className={TH}>Organization · Branch</th>
                  <th className={TH}>Source</th>
                  <th className={`${TH} text-right`}>Shifts</th>
                  <th className={`${TH} text-right`}>Counted hrs</th>
                  <th className={`${TH} text-right`}>Unresolved</th>
                  <th className={`${TH} text-right`}>Missing punch</th>
                </tr>
              </thead>
              <tbody>
                {[...slices.values()].map((s, i) => {
                  const seconds = s.rows.reduce(
                    (n, r) => n + (r.workedSeconds ?? 0),
                    0,
                  );
                  return (
                    <tr key={i}>
                      <td className={TD}>
                        {s.org} · {s.branch}
                      </td>
                      <td className={TD}>
                        {s.source}
                        <span className="block text-[7.5pt] text-gray-600">
                          {s.basis}
                        </span>
                      </td>
                      <td className={`${TD} ${NUM}`}>{s.rows.length}</td>
                      <td className={`${TD} ${NUM}`}>
                        {formatSeconds(seconds)}
                      </td>
                      <td className={`${TD} ${NUM}`}>
                        {s.rows.filter((r) => r.workedSeconds === null).length}
                      </td>
                      <td className={`${TD} ${NUM}`}>
                        {s.rows.filter((r) => r.missingPunches).length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {report.content !== "attendance" ? (
        <div>
          <h3 className="mb-1 text-[10pt] font-semibold text-black">
            Compensation, adjustments and payments
          </h3>
          {entries.length === 0 ? (
            <p className="text-[9pt] text-gray-700">
              No payroll record for the payroll period(s){" "}
              {report.period.payrollLabel || "—"}.
            </p>
          ) : (
            entries.map((e) => (
              <PayrollEntryCard
                key={e.sourceRef}
                entry={e}
                org={orgName(e.organizationId)}
                branch={branchName(e.organizationId, e.locationId)}
              />
            ))
          )}
        </div>
      ) : null}

      {exceptions.length > 0 ? (
        <ExceptionList
          exceptions={exceptions}
          title="Exceptions for this employee"
        />
      ) : null}
    </section>
  );
}

// ── Attendance details ───────────────────────────────────────────────────────────────────

const HOURS_STATUS_NOTE: Record<AttendanceDetailRow["hoursStatus"], string> = {
  counted: "",
  open: "Open shift — not counted",
  break_review: "Break pay unresolved — not counted",
  no_duration: "No duration — not counted",
};

export function AttendanceDetailSection({
  report,
}: {
  report: CombinedReport;
}) {
  const byEmployee = new Map<EmployeeKey, AttendanceDetailRow[]>();
  for (const r of report.attendanceRows) {
    const list = byEmployee.get(r.employeeKey) ?? [];
    list.push(r);
    byEmployee.set(r.employeeKey, list);
  }
  return (
    <section
      className="report-section"
      aria-labelledby="report-attendance-title"
    >
      <SectionTitle id="report-attendance-title">
        Attendance Details
      </SectionTitle>
      <p className="mb-2 text-[8.5pt] text-gray-700">
        Business dates and clock times are shown in each branch&apos;s own time
        zone. Hours are counted shifts only; open shifts and unresolved breaks
        are listed but not counted.
      </p>
      {byEmployee.size === 0 ? (
        <p className="text-[9pt] text-gray-700">
          No attendance for this selection.
        </p>
      ) : (
        [...byEmployee.entries()].map(([key, rows]) => {
          const seconds = rows.reduce((n, r) => n + (r.workedSeconds ?? 0), 0);
          const unresolved = rows.filter(
            (r) => r.workedSeconds === null,
          ).length;
          return (
            <div key={key} className="mb-4">
              <h3 className="mb-1 text-[10pt] font-semibold text-black">
                {rows[0]!.employeeName}
              </h3>
              <table className="report-table w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-400">
                    <th className={TH}>Date</th>
                    <th className={TH}>Organization · Branch</th>
                    <th className={TH}>In</th>
                    <th className={TH}>Out</th>
                    <th className={`${TH} text-right`}>Hours</th>
                    <th className={TH}>Source</th>
                    <th className={TH}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className={`${TD} whitespace-nowrap`}>
                        {r.weekday} {r.businessDate}
                      </td>
                      <td className={TD}>
                        {r.organization} · {r.branch}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        {r.clockIn ?? "Missing"}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        {r.clockOut ?? "Missing"}
                      </td>
                      <td className={`${TD} ${NUM}`}>
                        {r.workedSeconds === null
                          ? "—"
                          : formatSeconds(r.workedSeconds)}
                      </td>
                      <td className={TD}>{r.sourceLabel}</td>
                      <td className={TD}>
                        {[
                          HOURS_STATUS_NOTE[r.hoursStatus],
                          r.missingPunches && r.hoursStatus === "counted"
                            ? "Missing punch"
                            : "",
                          r.corrected
                            ? `Audited correction${r.correctionCount > 1 ? "s" : ""} (${r.correctionCount})`
                            : "",
                        ]
                          .filter(Boolean)
                          .join("; ")}
                      </td>
                    </tr>
                  ))}
                  <tr className="report-total-row border-t border-gray-400 font-bold">
                    <td className={TD} colSpan={4}>
                      Total counted — {rows.length} shift
                      {rows.length === 1 ? "" : "s"}
                      {unresolved > 0 ? ` (${unresolved} not counted)` : ""}
                    </td>
                    <td className={`${TD} ${NUM}`}>{formatSeconds(seconds)}</td>
                    <td className={TD} colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </section>
  );
}

// ── Adjustments and payments ledger ──────────────────────────────────────────────────────

function LedgerRow({ l }: { l: LedgerEntry }) {
  return (
    <tr className={l.includedInTotals ? undefined : "text-gray-500 italic"}>
      <td className={`${TD} whitespace-nowrap`}>{l.ref}</td>
      <td className={TD}>
        {l.employeeName}
        <span className="block text-[8pt] text-gray-600">
          {l.organization} · {l.branch}
        </span>
      </td>
      <td className={`${TD} whitespace-nowrap`}>{l.eventDate}</td>
      <td className={TD}>
        {l.description}
        {l.actor ? (
          <span className="block text-[7.5pt] text-gray-600">
            Recorded by {l.actor}
          </span>
        ) : null}
      </td>
      <td className={TD}>{l.status}</td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={l.effectCents} />
      </td>
      <td className={`${TD} ${NUM}`}>
        <Money cents={l.remainingBalanceCents} />
      </td>
    </tr>
  );
}

export function LedgerSection({ report }: { report: CombinedReport }) {
  const t = ledgerTotals(report.ledger);
  return (
    <section className="report-section" aria-labelledby="report-ledger-title">
      <SectionTitle id="report-ledger-title">
        Adjustments &amp; Payments Ledger
      </SectionTitle>
      <p className="mb-2 text-[8.5pt] text-gray-700">
        Existing recorded entries only; this report creates no transaction. The
        effect column shows each entry&apos;s effect on the amount owed (a
        payment reduces it; an adjustment moves it by the opposite of its stored
        delta). Payment method is not recorded in the payroll ledger.
      </p>
      {report.ledger.length === 0 ? (
        <p className="text-[9pt] text-gray-700">
          No payments or adjustments for this selection.
        </p>
      ) : (
        <table className="report-table w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-400">
              <th className={TH}>Reference</th>
              <th className={TH}>Employee</th>
              <th className={TH}>Date</th>
              <th className={TH}>Entry</th>
              <th className={TH}>Status</th>
              <th className={`${TH} text-right`}>Effect</th>
              <th className={`${TH} text-right`}>Remaining</th>
            </tr>
          </thead>
          <tbody>
            {report.ledger.map((l) => (
              <LedgerRow
                key={`${l.ref}-${l.periodMonth}-${l.employeeKey}`}
                l={l}
              />
            ))}
            <tr className="report-total-row border-t border-gray-400 font-bold">
              <td className={TD} colSpan={5}>
                Total confirmed payments (effect on amount owed)
              </td>
              <td className={`${TD} ${NUM}`} colSpan={2}>
                <Money cents={-t.confirmedPaymentsCents} />
              </td>
            </tr>
            <tr className="report-total-row font-bold">
              <td className={TD} colSpan={5}>
                Total adjustments (effect on amount owed) — {t.entries} entries
                listed
              </td>
              <td className={`${TD} ${NUM}`} colSpan={2}>
                <Money cents={t.adjustmentEffectCents} />
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
