import { defineConfig, devices } from "@playwright/test";

/** Authenticated disposable-stack Schedule/Team acceptance; no hosted target is accepted. */
export default defineConfig({
  testDir: "./tests/local/ui",
  testMatch: "schedule-location.local.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3137",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "host-tablet", use: { ...devices["iPad (gen 7) landscape"] } },
    { name: "server-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
