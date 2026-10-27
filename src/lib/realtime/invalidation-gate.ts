/**
 * Turns a burst of "something changed" signals into one re-read.
 *
 * A bulk import of 800 rows or a count that touches many items sends many
 * Realtime events within a moment. Each one means the same thing ("re-read"),
 * so they are folded together: the re-read fires once the signals go quiet,
 * and never later than `maxWaitMs` after the first one even if they keep
 * coming. One signal still produces exactly one re-read.
 *
 * Timers are injectable so the behaviour is tested without waiting.
 */
export type InvalidationGate = {
  /** A change happened somewhere; a re-read is wanted soon. */
  signal(): void;
  /** Drop any pending re-read (unmount, sign-out). */
  cancel(): void;
};

export type GateOptions = {
  quietMs?: number;
  maxWaitMs?: number;
  now?: () => number;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export function createInvalidationGate(
  fire: () => void,
  {
    quietMs = 400,
    maxWaitMs = 2500,
    now = Date.now,
    setTimer = (run, ms) => setTimeout(run, ms),
    clearTimer = (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  }: GateOptions = {},
): InvalidationGate {
  let handle: unknown = null;
  let firstAt = 0;

  const run = () => {
    handle = null;
    fire();
  };

  return {
    signal() {
      const at = now();
      if (handle === null) firstAt = at;
      else clearTimer(handle);
      const untilCap = Math.max(0, firstAt + maxWaitMs - at);
      handle = setTimer(run, Math.min(quietMs, untilCap));
    },
    cancel() {
      if (handle !== null) clearTimer(handle);
      handle = null;
    },
  };
}
