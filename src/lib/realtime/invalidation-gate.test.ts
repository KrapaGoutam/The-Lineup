import { describe, expect, it, vi } from "vitest";

import { createInvalidationGate } from "./invalidation-gate";

function harness(options: { quietMs?: number; maxWaitMs?: number } = {}) {
  vi.useFakeTimers();
  const fire = vi.fn();
  const gate = createInvalidationGate(fire, {
    ...options,
    now: () => Date.now(),
  });
  return { fire, gate };
}

describe("createInvalidationGate", () => {
  it("one signal gives exactly one re-read, after the quiet period", () => {
    const { fire, gate } = harness({ quietMs: 400 });
    gate.signal();
    vi.advanceTimersByTime(399);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("folds a burst (an 800-row import) into a single re-read", () => {
    const { fire, gate } = harness({ quietMs: 400, maxWaitMs: 5000 });
    for (let i = 0; i < 800; i += 1) {
      gate.signal();
      vi.advanceTimersByTime(2);
    }
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("never waits longer than maxWait when signals keep coming", () => {
    const { fire, gate } = harness({ quietMs: 400, maxWaitMs: 1000 });
    for (let i = 0; i < 20; i += 1) {
      gate.signal();
      vi.advanceTimersByTime(100);
    }
    // 2 seconds of constant signals: re-read at about 1 s, again about 2 s.
    expect(fire.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fire.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("separate bursts give separate re-reads", () => {
    const { fire, gate } = harness({ quietMs: 400 });
    gate.signal();
    vi.advanceTimersByTime(400);
    gate.signal();
    vi.advanceTimersByTime(400);
    expect(fire).toHaveBeenCalledTimes(2);
  });

  it("cancel drops a pending re-read (unmount, sign-out)", () => {
    const { fire, gate } = harness({ quietMs: 400 });
    gate.signal();
    gate.cancel();
    vi.advanceTimersByTime(5000);
    expect(fire).not.toHaveBeenCalled();
    gate.cancel(); // harmless when nothing is pending
  });

  it("is usable again after cancel", () => {
    const { fire, gate } = harness({ quietMs: 400 });
    gate.signal();
    gate.cancel();
    gate.signal();
    vi.advanceTimersByTime(400);
    expect(fire).toHaveBeenCalledTimes(1);
  });
});
