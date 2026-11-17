/**
 * Table Allocation 7-Day History Window.
 *
 * Defines the supported operational history window for Table Allocation:
 * Today plus the previous six service dates — seven business dates total.
 *
 * For example, if the branch date is November 17, the visible service dates are
 * November 11–17 (7 dates).
 */

export const ALLOCATION_HISTORY_DAYS = 7;

/**
 * Adds or subtracts calendar days from an ISO date string ("YYYY-MM-DD") in UTC.
 * Uses Date.UTC to prevent timezone drift across month, year, and leap-year boundaries.
 */
export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

export interface AllocationHistoryWindow {
  /** Earliest supported date in the 7-day window (today - 6 days), ISO "YYYY-MM-DD". */
  minDate: string;
  /** Today's service date (the maximum date), ISO "YYYY-MM-DD". */
  maxDate: string;
  /** All 7 supported service dates in chronological order [minDate, ..., maxDate]. */
  supportedDates: string[];
}

export function getAllocationHistoryWindow(
  today: string,
): AllocationHistoryWindow {
  const minDate = shiftIsoDate(today, -(ALLOCATION_HISTORY_DAYS - 1));
  const supportedDates: string[] = [];
  for (let i = -(ALLOCATION_HISTORY_DAYS - 1); i <= 0; i++) {
    supportedDates.push(shiftIsoDate(today, i));
  }
  return {
    minDate,
    maxDate: today,
    supportedDates,
  };
}

export function isWithinAllocationHistoryWindow(
  date: string,
  today: string,
): boolean {
  const { minDate, maxDate } = getAllocationHistoryWindow(today);
  return date >= minDate && date <= maxDate;
}
