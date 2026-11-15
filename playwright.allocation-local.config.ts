import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/local/ui",
  testMatch: "allocation-location.local.spec.ts",
  outputDir: "test-results/allocation-local",
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  use: {
    baseURL: "http://localhost:3127",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "host-tablet", use: { ...devices["iPad (gen 7) landscape"] } },
    { name: "server-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
