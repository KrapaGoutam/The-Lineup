// Bug-fix pass on Feature 030. Before this file existed, every print
// trigger in this app was a bare `window.print()` -- no code anywhere
// ever touched `document.title`, so the browser's Save-as-PDF dialog
// always fell back to the page's own generic title instead of a
// document-specific suggested filename. This is that missing piece,
// plus the one place every report's filename convention is spelled out
// so the five surfaces (attendance roster/single, payroll roster/
// single, combined statement) can't quietly drift apart from each
// other.

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** `month` is 1-12 (January = 1), matching every other calendar-month
 * convention already used across this codebase's real-mode features. */
export function formatMonthYearShort(year: number, month: number): string {
  return `${MONTH_ABBREVIATIONS[month - 1]} ${year}`;
}

/** A specific calendar month, or the payroll batch dialog's "every open
 * period regardless of month" choice -- the only filename convention
 * that isn't pinned to one month. */
export type FilenamePeriod =
  | { year: number; month: number }
  | "all-open-months";

function periodLabel(period: FilenamePeriod): string {
  return period === "all-open-months"
    ? "All Open Months"
    : formatMonthYearShort(period.year, period.month);
}

// Casing below is deliberate and literal, matching the exact five
// conventions this was specified against -- "Staff attendance Report"
// (roster attendance) and "Staff Payroll Report" (roster payroll) really
// do differ in capitalization from each other; this isn't a typo to
// "fix" into consistency.
export function attendanceRosterFilename(year: number, month: number): string {
  return `Staff attendance Report ${formatMonthYearShort(year, month)}`;
}

export function attendanceSingleFilename(
  employeeName: string,
  year: number,
  month: number,
): string {
  return `${employeeName} Attendance Report ${formatMonthYearShort(year, month)}`;
}

export function payrollSingleFilename(
  employeeName: string,
  period: FilenamePeriod,
): string {
  return `${employeeName} Payroll Report ${periodLabel(period)}`;
}

export function payrollRosterFilename(period: FilenamePeriod): string {
  return `Staff Payroll Report ${periodLabel(period)}`;
}

export function combinedStatementFilename(
  employeeName: string,
  year: number,
  month: number,
): string {
  return `${employeeName} Monthly Report ${formatMonthYearShort(year, month)}`;
}

/**
 * Sets `document.title` to `suggestedTitle` (what Chrome/Edge's Save-as-
 * PDF flow offers as the default filename) before calling
 * `window.print()`, then restores the original title afterward.
 *
 * The inner `setTimeout` before `window.print()` is deliberate, not
 * decorative: `window.print()` synchronously blocks the calling script
 * while the browser's print dialog is open, and a `document.title`
 * write made in the exact same synchronous tick immediately before that
 * block has been observed to sometimes not be committed yet when the
 * dialog reads it. Yielding one macrotask first guarantees the title
 * change has actually landed.
 *
 * Restoration happens on the `afterprint` event (fired once the dialog
 * closes, print or cancel either way) -- with a fallback timeout for the
 * rare case a browser suppresses that event entirely, so the tab title
 * is never left wrong indefinitely.
 */
export function triggerPrintWithFilename(
  suggestedTitle: string,
  onBeforePrint?: () => void,
): void {
  const originalTitle = document.title;
  document.title = suggestedTitle;
  onBeforePrint?.();

  setTimeout(() => {
    // Guarded so the fallback timeout below can never stomp on the
    // title a second time if `afterprint` already restored it (and
    // something else has since changed it again) -- `removeEventListener`
    // only stops the *event* path from firing restore twice, it does
    // nothing about the independently-scheduled fallback timeout.
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      document.title = originalTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);

    window.print();

    // Fallback cleanup if afterprint is suppressed by the browser.
    setTimeout(restore, 2000);
  }, 50);
}
