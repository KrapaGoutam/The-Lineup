import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * V2-004.003 permits entry loading and navigation. V2-004.004 adds exactly ONE
 * further entry point -- `@/features/modules/data/module-enforcement` -- which
 * only Server Action modules and the page loader may import. Nothing else may
 * reference the table or any other part of the feature.
 */
const ENFORCEMENT_ENTRY = "@/features/modules/data/module-enforcement";

const SRC = path.resolve(import.meta.dirname, "../..");
const OWN_FEATURE = path.join(SRC, "features", "modules");
const GENERATED_TYPES = path.join(SRC, "types", "database.generated.ts");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("module configuration stays within settings and navigation (V2-004.003)", () => {
  const consumers = walk(SRC).filter(
    (file) =>
      !file.startsWith(OWN_FEATURE + path.sep) &&
      !file.includes(".test.") &&
      ![
        "lib/page-data.ts",
        "components/restaurant-operations-app.tsx",
        "features/settings/components/settings-page.tsx",
      ].some((rel) => file === path.join(SRC, rel)) &&
      file !== GENERATED_TYPES &&
      file !==
        path.join(
          SRC,
          "features/locations/components/location-administration.tsx",
        ),
  );

  it("no file outside the feature references the table or imports the feature (except the enforcement entry)", () => {
    const offenders = consumers.filter((file) => {
      const text = fs
        .readFileSync(file, "utf8")
        .split(ENFORCEMENT_ENTRY)
        .join("");
      return (
        text.includes("location_module_configs") ||
        text.includes("@/features/modules")
      );
    });
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it("only Server Action modules and the page loader import the enforcement entry", () => {
    const importers = walk(SRC)
      .filter((file) => !file.startsWith(OWN_FEATURE + path.sep))
      .filter((file) => !file.includes(".test."))
      .filter((file) =>
        fs.readFileSync(file, "utf8").includes(ENFORCEMENT_ENTRY),
      )
      .map((file) => path.relative(SRC, file).split(path.sep).join("/"));
    const allowed = (rel: string) =>
      rel === "lib/page-data.ts" ||
      /^features\/[a-z-]+\/actions\/[a-z-]+\.ts$/.test(rel);
    expect(importers.filter((rel) => !allowed(rel))).toEqual([]);
    expect(importers.length).toBeGreaterThan(10);
  });

  it("MC-020: the application shell and demo data do not depend on the new table", () => {
    for (const rel of ["lib/demo-data.ts", "lib/app-tab.ts"]) {
      const text = fs.readFileSync(path.join(SRC, rel), "utf8");
      expect(text).not.toContain("location_module_configs");
      expect(text).not.toContain("features/modules");
    }
  });

  it("the registry module imports no data layer (stays pure and demo-safe)", () => {
    for (const file of [
      "module-registry.ts",
      "module-config.ts",
      "module-navigation.ts",
      "module-enforcement.ts",
      "module-readiness.ts",
    ]) {
      const text = fs.readFileSync(
        path.join(OWN_FEATURE, "domain", file),
        "utf8",
      );
      expect(text).not.toMatch(
        /from\s+["'](server-only|@\/lib\/supabase|@supabase)/,
      );
    }
  });
});
