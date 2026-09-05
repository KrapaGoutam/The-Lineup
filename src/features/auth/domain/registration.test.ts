import { describe, expect, it } from "vitest";

import { isValidContact, isValidDisplayName } from "./registration";

describe("isValidDisplayName", () => {
  it("accepts a normal name", () => {
    expect(isValidDisplayName("Mia Chen")).toBe(true);
  });

  it("rejects too short or too long", () => {
    expect(isValidDisplayName("M")).toBe(false);
    expect(isValidDisplayName(" ")).toBe(false);
    expect(isValidDisplayName("a".repeat(101))).toBe(false);
  });

  it("trims before checking length", () => {
    expect(isValidDisplayName("  Mia  ")).toBe(true);
    expect(isValidDisplayName("  M  ")).toBe(false);
  });
});

describe("isValidContact", () => {
  it("accepts a phone number or email", () => {
    expect(isValidContact("server@example.com")).toBe(true);
    expect(isValidContact("555-0100")).toBe(true);
  });

  it("rejects too short or too long", () => {
    expect(isValidContact("ab")).toBe(false);
    expect(isValidContact("a".repeat(201))).toBe(false);
  });
});
