import { describe, expect, it } from "vitest";

import { can, isValidPasscode } from "./passcode";

describe("passcode access", () => {
  it("accepts exactly four digits", () => {
    expect(isValidPasscode("2468")).toBe(true);
    expect(isValidPasscode("0000")).toBe(true);
    expect(isValidPasscode("246")).toBe(false);
    expect(isValidPasscode("24681")).toBe(false);
    expect(isValidPasscode("246810")).toBe(false);
    expect(isValidPasscode("24681012")).toBe(false);
    expect(isValidPasscode("1234ab")).toBe(false);
    expect(isValidPasscode("")).toBe(false);
  });

  it("keeps tip management away from servers", () => {
    expect(can("manager", "tips:manage")).toBe(true);
    expect(can("server", "tips:manage")).toBe(false);
    expect(can("server", "tips:view-own")).toBe(true);
  });
});
