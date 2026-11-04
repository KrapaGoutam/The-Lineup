import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Static guards that keep the entry boundary honest (V2-003.001).
 */
const root = process.cwd();
// Guards inspect CODE, not the explanatory comments that name what is forbidden.
const read = (path: string) =>
  readFileSync(join(root, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("entry-boundary static guards", () => {
  it("the entry data path (page-data) never uses the legacy primary-location helper", () => {
    const source = read("src/lib/page-data.ts");
    expect(source).not.toMatch(/getPrimaryLocation|primary-location/);
    // and always forwards the verified scope to all three loaders
    expect(source).toMatch(
      /getScheduleContext\(context\.organizationId, scope\)/,
    );
    expect(source).toMatch(/getTipsContext\(context\.organizationId, scope\)/);
    expect(source).toMatch(
      /getAllocationContext\(context\.organizationId, undefined, scope\)/,
    );
  });

  it("context resolution never uses a privileged/service-role client or the legacy primary location", () => {
    for (const file of [
      "src/features/context/data/active-context.ts",
      "src/features/context/data/context-cookie-reader.ts",
      "src/features/context/domain/active-context.ts",
      "src/features/context/domain/context-cookie.ts",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(
        /service[_-]?role|SERVICE_ROLE|supabase\/admin|createAdminClient/i,
      );
      expect(source, file).not.toMatch(/getPrimaryLocation/);
    }
  });

  it("the cookie is read-only in V2-003.001 (no cookie writes anywhere in the context feature)", () => {
    for (const file of [
      "src/features/context/data/active-context.ts",
      "src/features/context/data/context-cookie-reader.ts",
      "src/lib/page-data.ts",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(
        /cookies?\(\)\.set|\.set\(|\.delete\(|document\.cookie|localStorage|sessionStorage/,
      );
    }
  });

  it("identity comes only from supabase.auth.getUser()", () => {
    const source = read("src/features/context/data/active-context.ts");
    expect(source).toMatch(/auth\.getUser\(\)/);
    expect(source).not.toMatch(/getSession\(|getClaims\(|jwt-decode|atob\(/);
  });

  it("V2-003.003: the legacy follow-up helper never picks the oldest location and the redirect is built only from verified data", () => {
    const legacy = read("src/features/locations/data/primary-location.ts");
    expect(legacy).not.toMatch(/created_at|ascending|\.limit\(/);
    expect(legacy).toMatch(/listCurrentEligibleContexts/);
    const pageData = read("src/lib/page-data.ts");
    // the only redirect target is the canonical builder fed by a resolved context
    expect(pageData).toMatch(/contextSwitchHref\(global\.context, ""\)/);
    expect(pageData).not.toMatch(/searchParams|headers\(|referer/i);
  });
});
