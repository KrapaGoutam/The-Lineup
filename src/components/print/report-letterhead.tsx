// Bug-fix pass on Feature 030. Every print surface previously embedded
// its own copy of the letterhead markup, each pointing at the same
// external raster <img src="https://www.monkswebster.com/..."> -- a
// network-dependent image that simply doesn't render in an offline or
// local print preview (and was marked crossOrigin="anonymous", which
// fails outright against a host that doesn't send CORS headers for
// hotlinked images). One shared component, one embedded inline SVG
// vector mark, guaranteed to render everywhere print does: locally,
// offline, in every browser's print-preview sandbox.

/**
 * A plain monochrome vector monogram -- deliberately simple geometry
 * (a rounded badge + a bold "M" built from two paths) rather than a
 * detailed illustration, so it stays crisp at both the ~32px on-screen
 * size and whatever scale a physical printer renders it at, and reads
 * correctly in pure black ink with no color dependency.
 */
function LetterheadMark() {
  return (
    <svg
      viewBox="0 0 40 40"
      width="32"
      height="32"
      role="img"
      aria-label="The Monk's Indian Fusion crest"
    >
      <rect x="0" y="0" width="40" height="40" rx="8" fill="#111111" />
      <path
        d="M10 28V12h3.4l6.6 9.6 6.6-9.6H30v16h-3.6V17.8l-5.6 8.1h-1.6l-5.6-8.1V28H10Z"
        fill="#ffffff"
      />
    </svg>
  );
}

export type LetterheadMeta = {
  /** e.g. "Monthly Attendance Timesheet", "Payroll Compensation
   * Statement", "Monthly Timesheet & Payroll Statement". */
  documentType: string;
  employeeName: string;
  employeeRole?: string;
  /** e.g. "September 2026". */
  period: string;
  /** Defaults to `new Date()` at render time if omitted. */
  generatedAt?: Date;
};

/**
 * Shared corporate letterhead banner for every print surface
 * (Attendance timesheet, Payroll statement, Combined monthly
 * statement). Pure semantic HTML -- headings, paragraphs, an inline
 * SVG -- never a raster image or a canvas snapshot, so the text stays
 * fully selectable/copiable and the mark always renders regardless of
 * network state.
 */
export function ReportLetterhead({
  documentType,
  employeeName,
  employeeRole,
  period,
  generatedAt,
}: LetterheadMeta) {
  const generated = generatedAt ?? new Date();
  return (
    <div className="mb-4 border-b border-gray-300 pb-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <LetterheadMark />
          <div>
            <h1 className="text-lg font-bold tracking-tight text-black">
              The Monk&apos;s Indian Fusion - Webster
            </h1>
            <p className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
              {documentType}
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-gray-600">
          <p>
            Generated{" "}
            {generated.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3 text-xs text-gray-600">
        <p>
          <span className="font-semibold text-black">{employeeName}</span>
          {employeeRole ? <span> &middot; {employeeRole}</span> : null}
        </p>
        <p className="font-semibold text-black">{period}</p>
      </div>
    </div>
  );
}
