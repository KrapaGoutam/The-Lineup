import { execSync } from "node:child_process";
import { defineConfig } from "@playwright/test";

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
 * V2-008 B1 (D7 + F-1): location-only manager Kiosks entry, real Auth cookies, disposable local stack only; no hosted target is accepted.
 */
export default defineConfig({
  testDir: "./tests/local/ui",
  testMatch: "kiosk-location-manager.local.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/kiosk-location-manager-ui.json" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3138",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npx next dev -p 3138 --webpack",
        url: "http://localhost:3138",
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          PORT: "3138",
          NEXT_PUBLIC_DEMO_MODE: "false",
          NEXT_PUBLIC_SUPABASE_URL: localEnv.url,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localEnv.anon,
          SUPABASE_SECRET_KEY: localEnv.secret,
          SUPABASE_SERVICE_ROLE_KEY: localEnv.secret,
        },
      },
  projects: [
    {
      name: "desktop",
      use: {
        viewport: { width: 1280, height: 800 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    },
    {
      name: "tablet",
      use: {
        browserName: "webkit",
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
      },
    },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
