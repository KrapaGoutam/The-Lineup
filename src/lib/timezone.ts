// Converts between a location-local wall-clock time (a calendar date plus
// an HH:mm, no timezone info of its own -- what `shift_kind_defaults` and
// the schedule/tip-interval UIs both work in) and the `timestamptz` instant
// Postgres actually stores. Built on native `Intl.DateTimeFormat` only --
// no date-fns-tz or other dependency (this repo already carries an unused
// `date-fns`, deliberately not reached for here either) -- following the
// exact `formatToParts`-in-a-timezone pattern `use-restaurant-clock.ts`
// already established for the read direction; this is that pattern run in
// reverse, which is the genuinely new piece.
//
// Not marked "server-only": it's pure computation with no secrets, and it
// needs to be unit-testable directly under Vitest, which -- like the
// bootstrap script's plain-JS workaround -- runs outside Next's bundler
// and can't resolve a bare `server-only` import (confirmed while building
// Feature 015's bootstrap script; the same constraint applies here).

function formatPartsInZone(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

// Treats a (date, time) pair as if it were a UTC instant, purely as a
// consistent numeric handle to do arithmetic on -- never returned or
// exposed as a real instant on its own.
function wallClockAsNaiveMs(date: string, time: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, 0);
}

// The zone's UTC offset in minutes at a real instant, e.g. -300 for
// America/Chicago in June (CDT, UTC-5), -360 in January (CST, UTC-6).
function offsetMinutesAt(instantMs: number, timeZone: string): number {
  const rendered = formatPartsInZone(new Date(instantMs), timeZone);
  const renderedAsNaiveMs = wallClockAsNaiveMs(rendered.date, rendered.time);
  return (renderedAsNaiveMs - instantMs) / 60_000;
}

export type ZonedWallTime = {
  /** Location-local calendar date, "YYYY-MM-DD". */
  date: string;
  /** Location-local wall-clock time, 24h "HH:mm". */
  time: string;
  /** IANA time zone, e.g. "America/Chicago". */
  timeZone: string;
};

/**
 * The hard direction: location-local wall time -> the real instant.
 *
 * Two-pass offset correction, then an explicit, generous (3h -- comfortably
 * wider than any real-world one-time DST shift) window check around the
 * first-pass result for a nearby transition:
 *
 * - No transition in the window: the straightforward corrected instant is
 *   the only answer.
 * - A transition is in the window: compute both candidates (one using the
 *   offset from just before the window, one from just after) and check
 *   which actually render back to the requested wall time.
 *   - Exactly one matches: that's the answer -- close to a transition but
 *     not actually ambiguous.
 *   - Both match: the wall time is ambiguous (a fall-back overlap, e.g.
 *     1:30 AM occurring twice) -- resolve to the **earlier** (first)
 *     occurrence.
 *   - Neither matches: the wall time never existed (a spring-forward gap,
 *     e.g. 2:30 AM on the day clocks jump 2 -> 3) -- resolve to the
 *     **later** of the two candidates, i.e. the instant already past the
 *     gap, shifted forward by the gap's size.
 *
 * Both policies are deliberate choices, not the only defensible ones --
 * documented here because there is no single "correct" answer for a wall
 * time that either doesn't exist or exists twice.
 */
export function zonedWallTimeToInstant({
  date,
  time,
  timeZone,
}: ZonedWallTime): Date {
  const targetNaiveMs = wallClockAsNaiveMs(date, time);
  const initialOffset = offsetMinutesAt(targetNaiveMs, timeZone);
  const firstPass = targetNaiveMs - initialOffset * 60_000;

  const WINDOW_MS = 3 * 60 * 60 * 1000;
  const offsetBefore = offsetMinutesAt(firstPass - WINDOW_MS, timeZone);
  const offsetAfter = offsetMinutesAt(firstPass + WINDOW_MS, timeZone);

  if (offsetBefore === offsetAfter) {
    // No transition anywhere near this target -- the ordinary case.
    return new Date(targetNaiveMs - offsetBefore * 60_000);
  }

  const candidateUsingBefore = targetNaiveMs - offsetBefore * 60_000;
  const candidateUsingAfter = targetNaiveMs - offsetAfter * 60_000;
  const rendersToTarget = (ms: number) => {
    const rendered = formatPartsInZone(new Date(ms), timeZone);
    return rendered.date === date && rendered.time === time;
  };
  const matchesBefore = rendersToTarget(candidateUsingBefore);
  const matchesAfter = rendersToTarget(candidateUsingAfter);

  if (matchesBefore && !matchesAfter) return new Date(candidateUsingBefore);
  if (matchesAfter && !matchesBefore) return new Date(candidateUsingAfter);
  if (matchesBefore && matchesAfter) {
    // Overlap: both are real, valid instants for this wall time -- prefer
    // the earlier (first) occurrence.
    return new Date(Math.min(candidateUsingBefore, candidateUsingAfter));
  }
  // Gap: neither candidate renders back to the requested time at all --
  // resolve to the later one (already past the gap).
  return new Date(Math.max(candidateUsingBefore, candidateUsingAfter));
}

/**
 * The easy direction: a real instant -> its location-local wall time.
 * Unambiguous by construction (an instant always renders to exactly one
 * wall-clock reading in a given zone), so no transition handling needed.
 */
export function zonedWallTimeFromInstant(
  instant: Date,
  timeZone: string,
): { date: string; time: string } {
  return formatPartsInZone(instant, timeZone);
}
