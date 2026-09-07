import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        // The checked-in scenarios use the deterministic demo passcodes and
        // in-memory mutations. Keep them isolated from any developer's real
        // Supabase values in .env.local.
        env: { ...process.env, NEXT_PUBLIC_DEMO_MODE: "true" },
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "host-tablet", use: { ...devices["iPad (gen 7) landscape"] } },
    { name: "server-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
