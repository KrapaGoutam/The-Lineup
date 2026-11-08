import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

function resolveLocalEnv() {
  let url =
    process.env.LOCAL_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "";
  let anon =
    process.env.LOCAL_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";
  let secret =
    process.env.LOCAL_SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";

  if (!anon || !secret) {
    try {
      const out = execSync("npx supabase status -o env", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (!anon) {
        const m =
          out.match(/PUBLISHABLE_KEY=["']?([^"'\r\n]+)/) ||
          out.match(/ANON_KEY=["']?([^"'\r\n]+)/);
        if (m) anon = m[1].trim();
      }
      if (!secret) {
        const m =
          out.match(/SECRET_KEY=["']?([^"'\r\n]+)/) ||
          out.match(/SERVICE_ROLE_KEY=["']?([^"'\r\n]+)/);
        if (m) secret = m[1].trim();
      }
      if (!url) {
        const m = out.match(/API_URL=["']?([^"'\r\n]+)/);
        if (m) url = m[1].trim();
      }
    } catch {
      // ignore
    }
  }

  return {
    url: url || "http://127.0.0.1:54321",
    anon,
    secret,
  };
}

const localEnv = resolveLocalEnv();

/**
 * Authenticated disposable-stack Payroll acceptance; no hosted target is accepted.
 */
export default defineConfig({
  testDir: "./tests/local/ui",
  testMatch: "payroll-location.local.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3137",
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npx next dev -p 3137 --webpack",
        url: "http://localhost:3137",
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          PORT: "3137",
          NEXT_PUBLIC_DEMO_MODE: "false",
          NEXT_PUBLIC_SUPABASE_URL: localEnv.url,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localEnv.anon,
          SUPABASE_SECRET_KEY: localEnv.secret,
          SUPABASE_SERVICE_ROLE_KEY: localEnv.secret,
        },
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "host-tablet", use: { ...devices["iPad (gen 7) landscape"] } },
    { name: "server-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
