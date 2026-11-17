// V2.0.5 -- the external (Monks, Neon) attendance timestamp contract.
//
// VERIFIED (read-only, aggregate evidence, 2026-11-17): the Neon `attendance`
// table's `clock_in` / `clock_out` are `timestamp WITHOUT time zone`. The
// source application writes the restaurant's own *local wall-clock time*
// (America/Chicago) into them -- there is no zone or offset in the value.
// Evidence: the median clock-in hour is 11 in every month Jun-Nov 2026 (a real
// UTC instant would move an hour at the DST boundary; a wall-clock value does
// not), and `hours_worked` equals the naive difference of the two columns for
// every closed row.
//
// The previous reader let the Neon driver (node-postgres/`pg-types`) parse
// those values. `pg-types` interprets a zone-less timestamp in the *process*
// time zone, so a UTC server (Vercel) turned the stored "10:59" into the
// instant 10:59Z, which renders as 4:59 AM (CST) / 5:59 AM (CDT) in Chicago,
// while a developer machine in Central time happened to be right. This module
// removes the process-time-zone dependency: the query returns the raw text and
// this function resolves it against an explicit IANA zone.
//
// Pure and dependency-free on purpose (no "server-only"): unit-testable under
// Vitest in any process time zone.

import { zonedWallTimeToInstant } from "@/lib/timezone";

/**
 * The time zone the verified Monks (Webster) source application writes its
 * wall-clock values in. Resolved from the location's own IANA zone, never a
 * fixed UTC offset, so daylight saving is handled by `Intl`.
 */
export const EXTERNAL_NEON_SOURCE_TIME_ZONE = "America/Chicago";

// Postgres `timestamp::text` -> "YYYY-MM-DD HH:MM:SS" with an optional
// fractional part. No zone suffix is possible for `timestamp without time zone`.
const NAIVE_TIMESTAMP_TEXT =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/;

/**
 * Resolves a zone-less source timestamp (as Postgres renders it with `::text`)
 * to the real instant it denotes in `timeZone`, as an ISO-8601 UTC string.
 *
 * - `null` stays `null` (an open shift has no clock-out).
 * - Malformed input throws: guessing would silently mis-date a payroll
 *   record, and a Postgres `timestamp` never renders any other shape (a source
 *   `infinity` value is rejected here deliberately).
 * - Spring-forward gap / fall-back overlap follow the documented policy of
 *   `zonedWallTimeToInstant` (gap -> instant after the gap; overlap -> first
 *   occurrence). The source cannot disambiguate the repeated hour.
 */
export function neonWallTimeToInstantIso(
  value: string | null,
  timeZone: string = EXTERNAL_NEON_SOURCE_TIME_ZONE,
): string | null {
  if (value === null) return null;
  const match = NAIVE_TIMESTAMP_TEXT.exec(value);
  if (!match) {
    throw new Error("Unrecognized Neon attendance timestamp.");
  }
  const [, year, month, day, hour, minute, second, fraction] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    throw new Error("Unrecognized Neon attendance timestamp.");
  }
  const date = `${year}-${month}-${day}`;
  // Reject non-existent calendar dates (e.g. 2026-02-31) instead of letting
  // Date.UTC roll them over into a different, plausible-looking day.
  const probe = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  if (
    probe.getUTCFullYear() !== Number(year) ||
    probe.getUTCMonth() !== Number(month) - 1 ||
    probe.getUTCDate() !== Number(day)
  ) {
    throw new Error("Unrecognized Neon attendance timestamp.");
  }

  const minuteInstant = zonedWallTimeToInstant({
    date,
    time: `${hour}:${minute}`,
    timeZone,
  });
  const millis = fraction ? Math.floor(Number(`0.${fraction}`) * 1000) : 0;
  return new Date(
    minuteInstant.getTime() + Number(second) * 1000 + millis,
  ).toISOString();
}
