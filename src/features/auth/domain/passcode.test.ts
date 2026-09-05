import { describe, expect, it } from "vitest";

import { can, isValidPasscode } from "./passcode";

describe("passcode access", () => {
  it("accepts only six to eight digits", () => {
    expect(isValidPasscode("246810")).toBe(true);
    expect(isValidPasscode("24681012")).toBe(true);
    expect(isValidPasscode("12345")).toBe(false);
    expect(isValidPasscode("1234ab")).toBe(false);
  });

  it("keeps tip management away from servers", () => {
    expect(can("manager", "tips:manage")).toBe(true);
    expect(can("server", "tips:manage")).toBe(false);
    expect(can("server", "tips:view-own")).toBe(true);
  });
});
