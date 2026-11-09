import { describe, expect, it } from "vitest";

import { parseQuantityInput, toCents } from "./stock-rules";

describe("quantity parser: exhaustive fraction check (no silent rounding, no float drift)", () => {
  it("accepts a/b exactly when it is a whole number of cents, and the value is exact", () => {
    for (let d = 1; d <= 40; d++) {
      for (let n = 0; n <= 120; n++) {
        const res = parseQuantityInput(`${n}/${d}`);
        const exact = (100 * n) % d === 0;
        expect(res.ok, `${n}/${d}`).toBe(exact);
        if (res.ok) {
          expect(res.cents).toBe((100 * n) / d);
          // the number handed to the database is cents / 100, never a drifted float
          expect(toCents(res.value as number)).toBe(res.cents);
        }
      }
    }
  });

  it("mixed fractions add the whole part exactly", () => {
    for (let w = 0; w <= 30; w++) {
      for (const [n, d] of [
        [1, 2],
        [1, 4],
        [3, 4],
        [1, 5],
        [2, 5],
        [1, 10],
        [7, 20],
      ]) {
        const res = parseQuantityInput(`${w} ${n}/${d}`);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.cents).toBe(w * 100 + (100 * n) / d);
      }
    }
  });

  it.each([
    "1/3",
    "1/8",
    "2/3",
    "1/6",
    "5/8",
    "1 1/3",
    "0 1/8",
    "1/0",
    "0/0",
    "1 1/0",
    "-1",
    "-0",
    "-1/2",
    "1 -1/2",
    "- 1",
    "NaN",
    "Infinity",
    "-Infinity",
    "1e3",
    "1E2",
    "0x10",
    "1_000",
    "1 1/2 3",
    "1/2/3",
    "1 / ",
    "/2",
    "1 /2/",
    "1//2",
    "1.5/2",
    "1/2.5",
    "½",
    "٣",
    "1\u00a01/2x",
    "1 ½",
    "5.",
    ".",
    "..5",
    "1..5",
    "1.2.3",
    "+1",
    "1,5",
    "99999999999.99",
    "99999999999/1",
    "1000000000000",
    "9999999999.995",
    "123456789012345678901234567890",
    "99999999999999999999/1",
    "1 99999999999999999999/1",
  ])(
    "rejects %j cleanly (an error result, never a throw, never a silently different number)",
    (input) => {
      const res = parseQuantityInput(input);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.length).toBeGreaterThan(0);
    },
  );

  it.each([
    ["0", 0],
    ["0.5", 0.5],
    [".5", 0.5],
    ["0.75", 0.75],
    ["1/2", 0.5],
    ["3/4", 0.75],
    ["1/4", 0.25],
    ["1 1/2", 1.5],
    ["2", 2],
    ["2.25", 2.25],
    ["10", 10],
    ["007", 7],
    ["9999999999.99", 9_999_999_999.99],
    ["  1/2  ", 0.5],
    ["1 / 2", 0.5],
    ["0/5", 0],
  ])("accepts %j as exactly %s", (input, expected) => {
    const res = parseQuantityInput(input);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBe(expected);
  });

  it("never lets a stored decimal quantity through a parse/format round trip change", () => {
    for (const text of ["0.1", "0.2", "0.3", "1.15", "2.675", ".07"]) {
      const res = parseQuantityInput(text);
      if (text === "2.675") {
        expect(res.ok).toBe(false); // three decimals are refused, not rounded
        continue;
      }
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value).toBe(Number(text));
    }
  });

  it("blank handling: blank is unchanged (null) only where allowed; an explicit zero is zero", () => {
    expect(parseQuantityInput("", { allowBlank: true })).toMatchObject({
      ok: true,
      value: null,
    });
    expect(parseQuantityInput("", { allowBlank: false }).ok).toBe(false);
    expect(parseQuantityInput("0", { allowBlank: true })).toMatchObject({
      ok: true,
      value: 0,
    });
    expect(parseQuantityInput("0/4", { allowBlank: true })).toMatchObject({
      ok: true,
      value: 0,
    });
  });
});
