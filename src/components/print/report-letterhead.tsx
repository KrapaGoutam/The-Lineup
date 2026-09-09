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
// Feature 032: the crest is now the canonical "The Monk's" vector logo
// (originally a placeholder mark in Feature 031, since no real brand
// asset existed in the repo at the time). The source file lives at
// `public/brand/the-monks-logo.svg`; `the-monks-logo-markup.ts` is a
// mechanically-extracted copy of its inner <path> markup (its own file
// header explains why), rendered here via `dangerouslySetInnerHTML` on
// a plain <svg> wrapper -- not an <img>, so it prints synchronously
// with zero network/asset-loading dependency, identical in spirit to
// the hand-authored mark it replaces.

import { THE_MONKS_LOGO_MARKUP } from "./the-monks-logo-markup";

/**
 * The canonical "The Monk's" crest, inlined from
 * `public/brand/the-monks-logo.svg` (167 paths, original 948x928
 * viewBox) so it renders with zero network dependency in every print
 * context -- local, offline, or inside a browser's print-preview
 * sandbox. `dangerouslySetInnerHTML` is used deliberately here (not a
 * pattern to copy elsewhere in this codebase): the markup is a static,
 * build-time-extracted asset, not user input, and JSX has no simpler
 * way to render a large pre-existing block of raw SVG markup.
 */
function LetterheadMark() {
  return (
    <svg
      viewBox="0 0 948 928"
      width="37"
      height="36"
      role="img"
      aria-label="The Monk's Indian Fusion crest"
      dangerouslySetInnerHTML={{ __html: THE_MONKS_LOGO_MARKUP }}
    />
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
