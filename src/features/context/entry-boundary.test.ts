import { readdirSync, readFileSync } from "node:fs";
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

  it("the cookie is never written by the resolver, the reader or the entry data path (writes live only in context-cookie-writer)", () => {
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

  it("V2-003.004: the only module that writes the cookie is the centralized writer, which only stores the serialized id pair", () => {
    const writer = read("src/features/context/data/context-cookie-writer.ts");
    expect(writer).toMatch(/serializeActiveContextCookie\(/);
    expect(writer).toMatch(/activeContextWriteOptions\(/);
    expect(writer).toMatch(/activeContextClearOptions\(/);
    expect(writer).not.toMatch(/domain\s*:/);
    for (const file of [
      "src/features/context/data/context-persistence.ts",
      "src/features/context/actions/context-actions.ts",
      "src/features/context/data/context-cookie-writer.ts",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(
        /service[_-]?role|SERVICE_ROLE|supabase\/admin|createAdminClient/i,
      );
      expect(source, file).not.toMatch(
        /document\.cookie|localStorage|sessionStorage/,
      );
    }
    // No other source file may touch the cookie name through a setter.
    const stack = [join(root, "src")];
    const offenders: string[] = [];
    while (stack.length) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (
          /\.(ts|tsx)$/.test(entry.name) &&
          !/\.test\./.test(entry.name) &&
          !full.endsWith("context-cookie-writer.ts") &&
          /ACTIVE_CONTEXT_COOKIE_NAME/.test(readFileSync(full, "utf8")) &&
          /\.set\(|\.delete\(/.test(readFileSync(full, "utf8"))
        ) {
          offenders.push(full);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("V2-003.004: operational location resolution no longer takes its location from the Referer or the URL", () => {
    const legacy = read("src/features/locations/data/primary-location.ts");
    expect(legacy).not.toMatch(/parseExplicitLocationSelection/);
    expect(legacy).not.toMatch(/explicitSelection/);
    // the Referer is consulted only through the reject-only consistency hint
    expect(legacy).toMatch(/parseRequestWorkspaceHint/);
    expect(legacy).toMatch(/hintAgreesWithContext/);
    expect(legacy).toMatch(/readActiveContextCookieValue/);
    const domain = read("src/features/context/domain/request-consistency.ts");
    expect(domain).not.toMatch(/return\s*\{[^}]*locationId:\s*hint/);
  });

  it("V2-003.004: sign-in and sign-out routes expire the context cookie; clients sign out through the ordered helper", () => {
    for (const file of [
      "src/app/api/auth/signout/route.ts",
      "src/app/api/auth/passcode/route.ts",
      "src/app/api/auth/register/route.ts",
    ]) {
      expect(read(file), file).toMatch(/clearActiveContextCookie\(\)/);
    }
    const app = read("src/components/restaurant-operations-app.tsx");
    expect(app).not.toMatch(/fetch\("\/api\/auth\/signout"/);
    expect(app).toMatch(/requestSignOut\(\)/);
    const login = read("src/components/login-screen.tsx");
    expect(login).toMatch(/settleSignOut\(\)/);
  });
});
