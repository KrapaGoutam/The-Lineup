import { describe, expect, it } from "vitest";

import { createWakeGate } from "./wake-gate";

describe("wake gate", () => {
  it("collapses a focus + visibility + online burst into one request", () => {
    const t = 1_000;
    const gate = createWakeGate(5_000, () => t);
    const admitted = [gate.tryEnter(), gate.tryEnter(), gate.tryEnter()];
    expect(admitted).toEqual([true, false, false]);
  });

  it("refuses while a request is in flight even after the interval", () => {
    let t = 0;
    const gate = createWakeGate(5_000, () => t);
    expect(gate.tryEnter()).toBe(true);
    t = 60_000;
    expect(gate.tryEnter()).toBe(false);
    gate.leave();
    expect(gate.tryEnter()).toBe(true);
  });

  it("refuses inside the minimum interval after a request finished", () => {
    let t = 0;
    const gate = createWakeGate(5_000, () => t);
    expect(gate.tryEnter()).toBe(true);
    gate.leave();
    t = 4_999;
    expect(gate.tryEnter()).toBe(false);
    t = 5_000;
    expect(gate.tryEnter()).toBe(true);
  });
});
