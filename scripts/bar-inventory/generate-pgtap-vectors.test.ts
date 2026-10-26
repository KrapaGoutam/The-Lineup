import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  generateKeyVectorTest,
  OUTPUT_PATH,
  VECTORS_PATH,
} from "./generate-pgtap-vectors.mjs";

const normalize = (text: string) => text.replace(/\r\n/g, "\n");

describe("bar inventory pgTAP key vectors", () => {
  it("committed SQL matches the generator output for keys-vectors.json", () => {
    const keys = JSON.parse(readFileSync(VECTORS_PATH, "utf8"));
    const committed = readFileSync(OUTPUT_PATH, "utf8");
    expect(normalize(committed)).toBe(normalize(generateKeyVectorTest(keys)));
  });

  it("plans exactly as many assertions as it emits", () => {
    const keys = JSON.parse(readFileSync(VECTORS_PATH, "utf8"));
    const sql = generateKeyVectorTest(keys);
    const planned = Number(/select plan\((\d+)\);/.exec(sql)?.[1]);
    const emitted = sql
      .split("\n")
      .filter((l) => /^select (is|isnt)\(/.test(l));
    expect(emitted).toHaveLength(planned);
  });
});
