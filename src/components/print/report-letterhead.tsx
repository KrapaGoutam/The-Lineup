// Bug-fix pass on Feature 030, redesigned again on Feature 031 to match
// the reference PDF layout exactly. Every print surface previously
// embedded its own copy of the letterhead markup, each pointing at the
// same external raster <img src="https://www.monkswebster.com/..."> --
// a network-dependent image that simply doesn't render in an offline or
// local print preview (and was marked crossOrigin="anonymous", which
// fails outright against a host that doesn't send CORS headers for
// hotlinked images). One shared component, one embedded inline SVG
// mark, guaranteed to render everywhere print does: locally, offline,
// in every browser's print-preview sandbox.
//
// No "Monk's" brand SVG file exists anywhere in this repo (checked --
// only the Next.js starter icons under public/), and monkswebster.com
// is a real, unrelated external site, not an asset this codebase owns
// -- so this mark is an original, simple monochrome hood/cowl
// silhouette evoking the restaurant's name, not an "extraction" of
// anyone's real logo.

/**
 * A plain monochrome vector mark -- deliberately simple geometry (a
 * hooded silhouette, two flat-filled paths) rather than a detailed
 * illustration, so it stays crisp at both the ~36px on-screen size and
 * whatever scale a physical printer renders it at, and reads correctly
 * in pure black ink with no color dependency.
 */
function LetterheadMark() {
  return (
    <svg
      viewBox="0 0 48 48"
      width="36"
      height="36"
      role="img"
      aria-label="The Monk's Indian Fusion crest"
    >
      <path
        d="M24 4C13.5 4 5 12.7 5 23.4V42a2 2 0 0 0 2 2h34a2 2 0 0 0 2-2V23.4C43 12.7 34.5 4 24 4Z"
        fill="#111827"
      />
      <path
        d="M24 11c-6.6 0-12 5.4-12 12v15h6V27a6 6 0 0 1 12 0v11h6V23c0-6.6-5.4-12-12-12Z"
        fill="#ffffff"
      />
    </svg>
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
};

/**
 * Shared corporate letterhead banner for every print surface
 * (Attendance timesheet, Payroll statement, Combined monthly
 * statement). Pure semantic HTML -- headings, paragraphs, an inline
 * SVG -- never a raster image or a canvas snapshot, so the text stays
 * fully selectable/copiable and the mark always renders regardless of
 * network state. `break-inside-avoid` keeps the whole banner on one
 * side of a page break rather than splitting mid-block.
 */
export function ReportLetterhead({
  reportTitle,
  periodName,
  employeeName,
  employeeRole,
}: ReportLetterheadProps) {
  return (
    <div className="mb-4 break-inside-avoid border-b border-gray-300 pb-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <LetterheadMark />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-black">
              The Monk&apos;s
            </h1>
            <p className="text-sm text-gray-500">{reportTitle}</p>
          </div>
        </div>
        <div className="text-right text-xs text-gray-600">
          <p className="font-semibold text-black">
            The Monk&apos;s Indian Fusion - Webster
          </p>
          <p>Webster, New York</p>
          <p className="font-mono">monkswebster.com</p>
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
