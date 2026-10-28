import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importSchema } from "./import-schema.mjs";
import { parseArgs, verifyTarget } from "./import-recipes.mjs";

const fixture = JSON.parse(
  readFileSync(
    "tests/fixtures/recipes/import-sample.synthetic.json",
    "utf8",
  ).replace(/^\uFEFF/, ""),
);
describe("controlled Recipes import", () => {
  it("accepts the synthetic fixture and rejects duplicate numbers", () => {
    expect(importSchema.safeParse(fixture).success).toBe(true);
    const duplicate = structuredClone(fixture);
    duplicate.recipes[1].recipe_number = duplicate.recipes[0].recipe_number;
    expect(importSchema.safeParse(duplicate).success).toBe(false);
  });
  it("requires an explicit safe target and defaults to dry run", () => {
    const args = parseArgs([
      "--file",
      "fixture.json",
      "--org",
      "test",
      "--actor",
      "profile",
      "--target",
      "local",
    ]);
    expect(args.mode).toBe("dry-run");
    expect(() =>
      parseArgs(["--file", "x", "--org", "test", "--actor", "profile"]),
    ).toThrow();
    expect(() =>
      parseArgs([
        "--file",
        "x",
        "--org",
        "test",
        "--actor",
        "profile",
        "--target",
        "prod",
      ]),
    ).toThrow();
    expect(() => verifyTarget("local", "http://127.0.0.1:54321")).not.toThrow();
    expect(() => verifyTarget("dev", "https://example.com")).toThrow();
  });
  it("rejects malformed children and unexpected order fields", () => {
    const invalid = structuredClone(fixture);
    invalid.recipes[0].variants.perfect.ingredients[0].sort_order = 5;
    expect(importSchema.safeParse(invalid).success).toBe(false);
  });
});
