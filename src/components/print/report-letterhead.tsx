import {
  ReportBrandConfig,
  resolveReportBrand,
  ResolveBrandInput,
} from "./report-branding";

/**
 * Vector logo or clean typography mark. Rendered synchronously with zero
 * external network dependencies so it prints identically everywhere.
 */
function LetterheadMark({
  logoMarkup,
  viewBox = "0 0 948 928",
  ariaLabel = "Organization mark",
  fallbackText = "TL",
}: {
  logoMarkup?: string | null;
  viewBox?: string;
  ariaLabel?: string;
  fallbackText?: string;
}) {
  if (logoMarkup) {
    return (
      <svg
        viewBox={viewBox}
        width="37"
        height="36"
        role="img"
        aria-label={ariaLabel}
        dangerouslySetInnerHTML={{ __html: logoMarkup }}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-400 bg-gray-100 font-mono text-xs font-bold text-gray-800 print:border-gray-600 print:bg-gray-100"
    >
      {fallbackText}
    </div>
  );
}

export type ReportLetterheadProps = {
  /** e.g. "Monthly Employee Timesheet", "Staff Attendance Report",
   * "Payroll Compensation Statement". */
  reportTitle: string;
  /** e.g. "September 2026". */
  periodName: string;
  /** Omit to hide the "EMPLOYEE" block entirely -- for an all-staff
   * summary table with no single employee to name. */
  employeeName?: string;
  employeeRole?: string;
  /**
   * Optional dynamic brand configuration or resolution input.
   * If omitted, defaults to canonical Monks Webster for full backward compatibility.
   */
  brand?: ReportBrandConfig | ResolveBrandInput;
  organizationName?: string;
  branchName?: string;
  cityState?: string;
  website?: string;
};

/**
 * Shared corporate letterhead banner for every print surface
 * (Attendance timesheet, Payroll statement, Combined monthly
 * statement). Pure semantic HTML -- headings, paragraphs, an inline
 * SVG or clean typography fallback -- never a raster image or a canvas
 * snapshot, so the text stays fully selectable/copiable and the mark
 * always renders regardless of network state. `break-inside-avoid` keeps
 * the whole banner on one side of a page break rather than splitting mid-block.
 */
export function ReportLetterhead({
  reportTitle,
  periodName,
  employeeName,
  employeeRole,
  brand,
  organizationName,
  branchName,
  cityState,
  website,
}: ReportLetterheadProps) {
  // Resolve dynamic branding with fallback to canonical Monks Webster
  const resolvedBrand: ReportBrandConfig =
    brand && "organizationName" in brand && "fallbackMarkText" in brand
      ? (brand as ReportBrandConfig)
      : resolveReportBrand({
          organizationName:
            organizationName ?? (brand as ResolveBrandInput)?.organizationName,
          organizationSlug: (brand as ResolveBrandInput)?.organizationSlug,
          locationName:
            branchName ?? (brand as ResolveBrandInput)?.locationName,
          locationAddress: (brand as ResolveBrandInput)?.locationAddress,
          cityState: cityState ?? (brand as ResolveBrandInput)?.cityState,
          website: website ?? (brand as ResolveBrandInput)?.website,
        });

  // Canonical branch header display text
  const isMonks = resolvedBrand.organizationName.toLowerCase().includes("monk");
  const branchTitle = isMonks
    ? `The Monk's Indian Fusion - ${resolvedBrand.branchName || "Webster"}`
    : resolvedBrand.branchName
      ? `${resolvedBrand.organizationName} - ${resolvedBrand.branchName}`
      : resolvedBrand.organizationName;

  return (
    <div className="mb-4 break-inside-avoid border-b border-gray-300 pb-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <LetterheadMark
            logoMarkup={resolvedBrand.logoMarkup}
            viewBox={resolvedBrand.logoViewBox}
            ariaLabel={
              resolvedBrand.logoAriaLabel ||
              `${resolvedBrand.organizationName} logo`
            }
            fallbackText={resolvedBrand.fallbackMarkText}
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-black">
              {resolvedBrand.organizationName}
            </h1>
            <p className="text-sm text-gray-500">{reportTitle}</p>
          </div>
        </div>
        <div className="text-right text-xs text-gray-600">
          <p className="font-semibold text-black">{branchTitle}</p>
          {resolvedBrand.streetAddress ? (
            <p>{resolvedBrand.streetAddress}</p>
          ) : null}
          {resolvedBrand.cityState ? <p>{resolvedBrand.cityState}</p> : null}
          {resolvedBrand.website ? (
            <p className="font-mono">{resolvedBrand.website}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          {employeeName ? (
            <>
              <p className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                Employee
              </p>
              <p className="text-sm font-semibold text-black">
                {employeeName}
                {employeeRole ? ` (${employeeRole})` : ""}
              </p>
            </>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
            Pay Period
          </p>
          <p className="text-sm font-semibold text-black">{periodName}</p>
        </div>
      </div>
    </div>
  );
}
