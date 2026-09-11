// Bug fix: shared, correct 12-hour clock/calendar-date formatting for the
// restaurant's business timezone, for print/display surfaces that render a
// formal "12:06 PM" style rather than the 24-hour "HH:mm" style
// `src/lib/timezone.ts`'s own `zonedWallTimeFromInstant` already produces
// (used as-is by `attendance-report.tsx`'s internal ops table -- that
// display is correct today and is deliberately left untouched here).
//
// Root cause this exists to fix: `combined-statement-dialog.tsx` had its
// own local `formatClockTime`, built on `Date.prototype.toLocaleTimeString`
// with NO `timeZone` option -- silently falling back to whatever timezone
// the *rendering environment* (the viewer's own browser, since that
// component is "use client") happens to be in, not the restaurant's actual
// business timezone. `clock_in`/`clock_out` were never the problem (Neon's
// driver already parses them into correct, genuinely timezone-aware
// `timestamptz` instants -- confirmed reading attendance-data.ts) -- the
// bug was purely a missing `timeZone` at the one formatting call that
// forgot to pass one.
//
// `Intl.DateTimeFormat`'s own `timeZone` option is the right tool for this
// direction (instant -> local wall time): unlike the reverse direction
// (wall time -> instant, which `zonedWallTimeToInstant` in timezone.ts
// exists for specifically because DST transitions make it ambiguous), a
// real instant always renders to exactly one wall-clock reading in a given
// zone -- no gap/overlap handling needed, so there's no reason to route
// through timezone.ts's more complex round-trip machinery for what
// `Intl.DateTimeFormat` already does correctly and simply.
//
// Every business-facing 12-hour print/statement surface should format
// through these functions, not roll its own `toLocaleTimeString` call --
// that's exactly the mistake that produced this bug in the first place.

const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = timeFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    timeFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    dateFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * A genuine instant (`iso`, e.g. a `timestamptz` read back from Neon or
 * Supabase) rendered as a 12-hour clock time in the restaurant's business
 * timezone -- e.g. "11:06 AM". `timeZone` is always required and always
 * explicit; there is deliberately no "just use the browser's zone"
 * fallback anywhere in this module.
 */
export function formatBusinessTime(iso: string, timeZone: string): string {
  return timeFormatter(timeZone).format(new Date(iso));
}

/**
 * A genuine instant rendered as a calendar date in the restaurant's
 * business timezone -- e.g. "Sep 10, 2026". Only meaningful for a real
 * instant (a `timestamptz`); a plain calendar-date column (no time
 * component, e.g. `attendance.date`) should never round-trip through this
 * -- format it directly, the same discipline `ATTENDANCE_QUERY_SQL`'s own
 * `date::text` cast already establishes for why that column is never
 * handed to a `Date` constructor at all.
 */
export function formatBusinessDate(iso: string, timeZone: string): string {
  return dateFormatter(timeZone).format(new Date(iso));
}

/** Both of the above, combined: "Sep 10, 2026, 11:06 AM". */
export function formatBusinessDateTime(iso: string, timeZone: string): string {
  return `${formatBusinessDate(iso, timeZone)}, ${formatBusinessTime(iso, timeZone)}`;
}
