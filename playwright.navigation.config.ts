import { defineConfig, devices } from "@playwright/test";

/** Authenticated synthetic DEV acceptance. No credential-bearing traces. */
export default defineConfig({
  testDir: "./tests/real/ui",
  testMatch: "module-navigation.real.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  outputDir: "artifacts/navigation/playwright",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "artifacts/navigation/results.json" }],
  ],
  use: {
    actionTimeout: 30_000,
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3103",
    trace: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "chromium",
      grepInvert: /mobile account recovery/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit-ipad",
      grepInvert: /mobile account recovery/,
      use: {
        ...devices["iPad (gen 7) landscape"],
        // Windows WebKit's bundled TLS store rejects the otherwise trusted
        // Vercel chain. verifyDevApp first validates TLS with Node normally.
        ignoreHTTPSErrors:
          process.platform === "win32" &&
          (process.env.PLAYWRIGHT_BASE_URL?.startsWith("https://") ?? false),
      },
    },
    {
      name: "chromium-mobile",
      grep: /mobile account recovery/,
      use: { ...devices["Pixel 7"] },
    },
  ],
});
