import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// Local-only integration harness. No linked-project configuration or env files.
const status = execSync("npx.cmd supabase status -o env", {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});
const pick = (key: string) =>
  status.match(new RegExp(`^${key}="?([^"\\r\\n]+)`, "m"))?.[1] ?? "";
const url = pick("API_URL");
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error("B5 browser harness requires local Supabase.");
const env = {
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    pick("PUBLISHABLE_KEY") || pick("ANON_KEY"),
  SUPABASE_SECRET_KEY: pick("SECRET_KEY") || pick("SERVICE_ROLE_KEY"),
  APP_PIN_PEPPER: "b5-browser-only-test-pepper-at-least-32-characters",
  NEXT_PUBLIC_DEMO_MODE: "false",
};
Object.assign(process.env, env);
export default defineConfig({
  testDir: "./tests/local/ui",
  testMatch: "b5-universal-pin.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3145",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: devices["Desktop Chrome"] },
    { name: "mobile", use: devices["Pixel 7"] },
  ],
  webServer: {
    command: "npm run dev -- --webpack --port 3145",
    url: "http://localhost:3145",
    reuseExistingServer: false,
    timeout: 180_000,
    env,
  },
});
