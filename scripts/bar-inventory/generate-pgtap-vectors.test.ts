import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  generateKeyVectorTest,
  generateStatusVectorTest,
  OUTPUT_PATH,
  STATUS_OUTPUT_PATH,
  STATUS_VECTORS_PATH,
  VECTORS_PATH,
} from "./generate-pgtap-vectors.mjs";

const normalize = (text: string) => text.replace(/\r\n/g, "\n");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const planned = (sql: string) => Number(/select plan\((\d+)\);/.exec(sql)?.[1]);

describe("bar inventory pgTAP key vectors", () => {
  it("committed SQL matches the generator output for keys-vectors.json", () => {
    const committed = readFileSync(OUTPUT_PATH, "utf8");
    expect(normalize(committed)).toBe(
      normalize(generateKeyVectorTest(read(VECTORS_PATH))),
    );
  });

  it("plans exactly as many assertions as it emits", () => {
    const sql = generateKeyVectorTest(read(VECTORS_PATH));
    const emitted = sql
      .split("\n")
      .filter((l) => /^select (is|isnt)\(/.test(l));
    expect(emitted).toHaveLength(planned(sql));
  });
});

describe("bar inventory pgTAP status vectors", () => {
  it("committed SQL matches the generator output for status-vectors.json", () => {
    const committed = readFileSync(STATUS_OUTPUT_PATH, "utf8");
    expect(normalize(committed)).toBe(
      normalize(generateStatusVectorTest(read(STATUS_VECTORS_PATH))),
    );
  });

  it("plans one assertion per vector plus the row-count check", () => {
    const sql = generateStatusVectorTest(read(STATUS_VECTORS_PATH));
    const emitted = sql
      .split("\n")
      .filter((l) => /^select (results_eq|is)\(/.test(l));
    expect(emitted).toHaveLength(planned(sql));
  });
});
