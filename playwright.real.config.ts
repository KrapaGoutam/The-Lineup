import { defineConfig, devices } from "@playwright/test";

/**
 * Real-mode browser checks for Table Rotation V2 Part 1: several isolated
 * browser contexts, each signed in as a different DEV user through the real
 * passcode flow, against an already-running dev server pinned to the
 * the-lineup-dev Supabase project (see tests/real/ui/support/dev-app.ts for
 * the guard that refuses anything else).
 *
 *   NEON_DATABASE_URL= npm run dev          # in one terminal
 *   npm run test:real:ui                    # in another
 */
export default defineConfig({
  testDir: "./tests/real/ui",
  testMatch: "**/*.real.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/real-ui.json" }]],
  timeout: 180_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
});
