/**
 * Collapses a burst of wake-up signals into one request.
 *
 * A browser routinely fires `visibilitychange`, `focus` and `online` within a
 * few milliseconds of each other, and a second tab may do the same. The gate
 * admits a request only when none is in flight and the previous one started at
 * least `minIntervalMs` ago, so a storm costs one call. The clock is injected
 * (and is meant to be monotonic, e.g. `performance.now`) so it is testable and
 * immune to wall-clock changes.
 */
export type WakeGate = {
  /** True when the caller may start a request now; it must call `leave()`. */
  tryEnter: () => boolean;
  leave: () => void;
};

export function createWakeGate(
  minIntervalMs: number,
  now: () => number,
): WakeGate {
  let inFlight = false;
  let lastStart = Number.NEGATIVE_INFINITY;
  return {
    tryEnter() {
      if (inFlight) return false;
      const t = now();
      if (t - lastStart < minIntervalMs) return false;
      inFlight = true;
      lastStart = t;
      return true;
    },
    leave() {
      inFlight = false;
    },
  };
}
