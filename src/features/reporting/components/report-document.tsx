import { AlertTriangle } from "lucide-react";

import {
  resolveReportBrand,
  type ReportBrandConfig,
} from "@/components/print/report-branding";
import { ReportLetterhead } from "@/components/print/report-letterhead";
import {
  employeesWithData,
  isEmptyReport,
  sectionsForView,
  type ReportSectionKey,
  type ReportViewKey,
} from "@/features/reporting/domain/report-views";
import type {
  CombinedReport,
  EmployeeKey,
} from "@/features/reporting/domain/report-types";
import { formatBusinessDateTime } from "@/lib/date-time";

import {
  AttendanceDetailSection,
  EmployeeStatement,
  LedgerSection,
  RegisterSection,
  SummarySection,
} from "./report-sections";

/**
 * Brand rules (V2.0.7):
 *  - one organization → that organization's own letterhead (never a silent Monks fallback);
 *  - several organizations → a NEUTRAL combined letterhead; the organization-specific
 *    branding then appears inside the sections that belong to each organization.
 * An organization-specific brand always receives that organization's name and slug.
 */
const NEUTRAL_BRAND: ReportBrandConfig = {
  organizationName: "The Lineup",
  fallbackMarkText: "TL",
};

export function brandForOrganizations(
  report: CombinedReport,
  organizationIds: readonly string[],
): ReportBrandConfig {
  if (organizationIds.length !== 1) return NEUTRAL_BRAND;
  const org = report.organizations.find((o) => o.id === organizationIds[0]);
  if (!org) return NEUTRAL_BRAND;
  const branches = report.branches.filter(
    (b) => b.organizationId === org.id && b.id !== null,
  );
  const single = branches.length === 1 ? branches[0]! : null;
  return resolveReportBrand({
    organizationName: org.name,
    organizationSlug: org.slug,
    // With several branches no single address may be implied (and Monks must not fall back
    // to Webster's); a count label keeps the letterhead honest.
    locationName: single ? single.name : `${branches.length || "All"} branches`,
    locationAddress: single?.address ?? null,
  });
}

function reportOrganizationIds(report: CombinedReport): string[] {
  return [
    ...new Set([
      ...report.attendanceRows.map((r) => r.organizationId),
      ...report.payrollEntries.map((e) => e.organizationId),
    ]),
  ];
}

function generatedLabel(report: CombinedReport): string {
  const zone =
    report.branches.find((b) => b.timeZone)?.timeZone ?? "America/Chicago";
  try {
    return `${formatBusinessDateTime(report.generatedAt, zone)} (${zone})`;
  } catch {
    return report.generatedAt;
  }
}

function Cover({ report }: { report: CombinedReport }) {
  const orgIds = reportOrganizationIds(report);
  const brand = brandForOrganizations(report, orgIds);
  const branchNames = report.branches
    .filter((b) => b.id !== null)
    .map((b) => b.name);
  return (
    <section className="report-section report-cover" aria-label="Report cover">
      <ReportLetterhead
        reportTitle={report.title}
        periodName={report.period.label}
        periodLabel="Report Period"
        brand={brand}
      />
      <div className="mt-8 space-y-4 text-[10pt] text-gray-900">
        <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2">
          <dt className="font-semibold text-gray-600">Organizations</dt>
          <dd>{report.organizations.map((o) => o.name).join(", ") || "—"}</dd>
          <dt className="font-semibold text-gray-600">Branches</dt>
          <dd>{branchNames.join(", ") || "—"}</dd>
          <dt className="font-semibold text-gray-600">Attendance period</dt>
          <dd>{report.period.label}</dd>
          {report.content !== "attendance" ? (
            <>
              <dt className="font-semibold text-gray-600">
                Payroll accounting period
              </dt>
              <dd>{report.period.payrollLabel || "—"}</dd>
            </>
          ) : null}
          <dt className="font-semibold text-gray-600">Content</dt>
          <dd>
            {report.content === "both"
              ? "Attendance and Payroll"
              : report.content === "attendance"
                ? "Attendance only"
                : "Payroll only"}
          </dd>
          <dt className="font-semibold text-gray-600">Generated</dt>
          <dd>{generatedLabel(report)}</dd>
          <dt className="font-semibold text-gray-600">Report reference</dt>
          <dd className="font-mono">{report.reference}</dd>
        </dl>
        <p className="rounded border border-gray-500 p-2 text-[9pt] font-semibold text-gray-900">
          {report.confidentiality}
        </p>
        {report.summary.informationalAggregate ? (
          <p className="text-[9pt] text-gray-800">
            This report spans more than one organization. Combined figures are
            informational only; each organization&apos;s records keep their own
            branding and are never merged into one obligation.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function IncompleteBanner({ report }: { report: CombinedReport }) {
  if (report.completeness.complete) return null;
  return (
    <div
      role="alert"
      className="report-no-print flex items-start gap-2 rounded-xl border-2 border-amber-600 bg-amber-50 p-3 text-sm text-amber-950 print:hidden"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">
          Incomplete — not a valid statement. Printing and export are turned
          off.
        </p>
        <ul className="mt-1 list-disc pl-5">
          {report.completeness.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The printable report: Letter size, one section per block, each employee statement on a new page. */
export function ReportDocument({
  report,
  view,
}: {
  report: CombinedReport;
  view: ReportViewKey;
}) {
  const sections = sectionsForView(view);
  const has = (s: ReportSectionKey) => sections.includes(s);
  const employeeKeys: EmployeeKey[] = employeesWithData(report);
  const empty = isEmptyReport(report);

  return (
    <div className="report-bundle-item">
      <IncompleteBanner report={report} />
      <article
        className="report-document mx-auto w-full max-w-[8.5in] bg-white p-6 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none"
        aria-label={`${report.title} ${report.reference}`}
        data-report-reference={report.reference}
      >
        {has("cover") ? <Cover report={report} /> : null}
        {empty ? (
          <section className="report-section" aria-label="No records">
            <h2 className="text-base font-bold">No records</h2>
            <p className="mt-1 text-[10pt] text-gray-800">
              There are no attendance or payroll records for this selection and
              period. Nothing is printed as a statement.
            </p>
          </section>
        ) : (
          <>
            {has("summary") ? <SummarySection report={report} /> : null}
            {has("register") ? <RegisterSection report={report} /> : null}
            {has("statements")
              ? employeeKeys.map((key) => {
                  const orgIds = [
                    ...new Set([
                      ...report.attendanceRows
                        .filter((r) => r.employeeKey === key)
                        .map((r) => r.organizationId),
                      ...report.payrollEntries
                        .filter((e) => e.employeeKey === key)
                        .map((e) => e.organizationId),
                    ]),
                  ];
                  const emp = report.employees.find((e) => e.key === key);
                  return (
                    <EmployeeStatement
                      key={key}
                      report={report}
                      employeeKey={key}
                      header={
                        <ReportLetterhead
                          reportTitle="Employee Statement"
                          periodName={report.period.label}
                          periodLabel={
                            report.content === "payroll"
                              ? "Report Period"
                              : "Attendance Period"
                          }
                          employeeName={emp?.displayName}
                          employeeRole={emp?.role}
                          brand={brandForOrganizations(report, orgIds)}
                        />
                      }
                    />
                  );
                })
              : null}
            {has("attendance") && report.content !== "payroll" ? (
              <AttendanceDetailSection report={report} />
            ) : null}
            {has("ledger") && report.content !== "attendance" ? (
              <LedgerSection report={report} />
            ) : null}
          </>
        )}
      </article>
    </div>
  );
}
