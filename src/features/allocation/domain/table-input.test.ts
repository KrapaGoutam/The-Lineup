import { describe, expect, it } from "vitest";

import {
  canonicalizeTableLabel,
  resolveTableInput,
} from "@/features/allocation/domain/table-input";

// Same fixture and vectors as supabase/tests/database/0031 (location L1).
const registry = [
  { label: "T1", diningTableId: 19 },
  { label: "T2", diningTableId: 20 },
  { label: "T6", diningTableId: 24 },
  { label: "T19", diningTableId: 37 },
  { label: "T01", diningTableId: 50 },
  { label: "B1", diningTableId: 51 },
  { label: "5", diningTableId: 60 },
  { label: "T5", diningTableId: 61 },
];

describe("resolveTableInput (mirror of private.resolve_table_input)", () => {
  it.each([
    ["1", "T1", 19, true],
    ["T1", "T1", 19, true],
    ["  T1  ", "T1", 19, true],
    ["6", "T6", 24, true],
    ["19", "T19", 37, true],
    ["B1", "B1", 51, true],
    ["01", "T01", 50, true],
    ["5", "5", 60, true],
    ["99", "99", null, false],
    ["Patio A", "Patio A", null, false],
    ["t1", "t1", null, false],
    ["7", "7", null, false],
  ])("%j -> %j (id %j, registered %j)", (input, label, id, registered) => {
    expect(resolveTableInput(input, registry)).toEqual({
      input: input.trim(),
      canonicalLabel: label,
      diningTableId: id,
      registered,
    });
  });

  it("never collapses a leading zero to T1 (01 with only T1 stays free text)", () => {
    expect(resolveTableInput("01", [{ label: "T1" }]).canonicalLabel).toBe(
      "01",
    );
  });

  it("empty or missing input has no label", () => {
    expect(resolveTableInput("   ", registry).canonicalLabel).toBe("");
    expect(resolveTableInput(null, registry).registered).toBe(false);
  });

  it("an exact registered label wins over the numeric shorthand", () => {
    expect(resolveTableInput("5", registry).diningTableId).toBe(60);
  });
});

describe("canonicalizeTableLabel (mirror of private.canonical_table_label)", () => {
  it.each([
    ["1", "T1"],
    ["1 + 2", "T1 + T2"],
    ["1+2", "T1 + T2"],
    ["1 + Patio A", "T1 + Patio A"],
    ["19 + Patio A", "T19 + Patio A"],
    ["1+T1 + 2", "T1 + T2"],
    ["99", "99"],
    ["", ""],
  ])("%j -> %j", (label, expected) => {
    expect(canonicalizeTableLabel(label, registry)).toBe(expected);
  });
});
