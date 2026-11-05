import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * MC-020 — V2-004.001 changes no operational behaviour.
 *
 * Nothing outside the module-configuration feature may read the new table or
 * import the feature yet, so (a) the demo application — which has no database
 * — cannot depend on `location_module_configs`, and (b) no navigation, action
 * or RPC can be gated by a row that does not exist. V2-004.003 / .004 will
 * deliberately change this; whoever does must update this test and prove demo
 * mode still bypasses the table.
 */

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

describe("module configuration is not consumed yet (V2-004.001)", () => {
  const consumers = walk(SRC).filter(
    (file) =>
      !file.startsWith(OWN_FEATURE + path.sep) && file !== GENERATED_TYPES,
  );

  it("no file outside the feature references the table or imports the feature", () => {
    const offenders = consumers.filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      return (
        text.includes("location_module_configs") ||
        text.includes("@/features/modules")
      );
    });
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it("MC-020: the application shell and demo data do not depend on the new table", () => {
    for (const rel of [
      "components/restaurant-operations-app.tsx",
      "lib/demo-data.ts",
      "lib/app-tab.ts",
    ]) {
      const text = fs.readFileSync(path.join(SRC, rel), "utf8");
      expect(text).not.toContain("location_module_configs");
      expect(text).not.toContain("features/modules");
    }
  });

  it("the registry module imports no data layer (stays pure and demo-safe)", () => {
    for (const file of ["module-registry.ts", "module-config.ts"]) {
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
