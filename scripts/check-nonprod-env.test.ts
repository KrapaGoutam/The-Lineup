import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEV_REF,
  PROD_REF,
  findEnvViolations,
  parseEnvFile,
  scanDirectory,
} from "./check-nonprod-env.mjs";

describe("findEnvViolations", () => {
  it("accepts the DEV project", () => {
    expect(
      findEnvViolations({
        NEXT_PUBLIC_SUPABASE_URL: `https://${DEV_REF}.supabase.co`,
      }),
    ).toEqual([]);
  });

  it("accepts an empty or demo configuration", () => {
    expect(findEnvViolations({ NEXT_PUBLIC_DEMO_MODE: "true" })).toEqual([]);
  });

  it("rejects the PROD ref in the URL and names the variable, not the value", () => {
    const url = `https://${PROD_REF}.supabase.co`;
    const v = findEnvViolations({ NEXT_PUBLIC_SUPABASE_URL: url });
    expect(v[0]).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(v.join("\n")).not.toContain(PROD_REF);
  });

  it("rejects the PROD ref hidden in any other variable", () => {
    const v = findEnvViolations({
      SOMETHING_ELSE: `postgres://x@db.${PROD_REF}.supabase.co/postgres`,
    });
    expect(v).toHaveLength(1);
  });

  it("rejects an unknown Supabase project URL", () => {
    expect(
      findEnvViolations({
        NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co",
      }),
    ).toHaveLength(1);
  });
});

describe("parseEnvFile", () => {
  it("reads KEY=value and quoted values, ignoring comments", () => {
    expect(parseEnvFile('# c\nA=1\nB="two"\n')).toEqual({ A: "1", B: "two" });
  });
});

describe("scanDirectory", () => {
  it("reports files containing the PROD ref and ignores clean ones", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nonprod-"));
    fs.mkdirSync(path.join(dir, "static"));
    fs.writeFileSync(path.join(dir, "static", "bad.js"), `x="${PROD_REF}"`);
    fs.writeFileSync(path.join(dir, "ok.js"), `x="${DEV_REF}"`);
    expect(scanDirectory(dir)).toEqual([path.join("static", "bad.js")]);
    fs.rmSync(dir, { recursive: true });
  });

  it("returns nothing for a missing directory", () => {
    expect(scanDirectory(path.join(os.tmpdir(), "does-not-exist-xyz"))).toEqual(
      [],
    );
  });
});
