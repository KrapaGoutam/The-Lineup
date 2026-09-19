#!/usr/bin/env node
/**
 * Captures implementation reference screenshots for the Table Rotation
 * Multi-View feature (Grid/Floor/Picker/Servers/Dashboard, dark/light,
 * plus a tablet pass) against a locally running demo-mode dev server.
 *
 * Usage:
 *   NEXT_PUBLIC_DEMO_MODE=true npm run dev   (in one terminal)
 *   node docs/features/table-rotation-multi-view/tools/capture-implementation-screenshots.mjs
 *
 * Writes into docs/features/table-rotation-multi-view/screenshots/{dark,light,tablet}/.
 * Read-only against the app -- demo mode only (in-memory), no real
 * Supabase/production data touched.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.resolve(here, "..", "screenshots");
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const { chromium, devices } = await import("@playwright/test");

const VIEWS = [
  { tab: "Grid", file: "grid" },
  { tab: "Floor", file: "floor" },
  { tab: "Picker", file: "picker" },
  { tab: "Servers", file: "servers" },
  { tab: "Dashboard", file: "dashboard" },
];

async function setTheme(page, dark) {
  await page.evaluate((wantDark) => {
    document.documentElement.setAttribute(
      "data-theme",
      wantDark ? "dark" : "light",
    );
    localStorage.setItem("serviceflow-theme", wantDark ? "dark" : "light");
  }, dark);
  await page.waitForTimeout(150);
}

async function signIn(page, passcode) {
  await page.goto(BASE_URL);
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await page
    .getByRole("button", { name: "Account and quick settings" })
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
}

async function shoot(page, dir, name) {
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

async function captureViews(page, dir) {
  for (const view of VIEWS) {
    await page.getByRole("tab", { name: view.tab, exact: true }).click();
    await page.waitForTimeout(300);
    await shoot(page, dir, view.file);
  }
}

async function main() {
  const browser = await chromium.launch();

  // Dark + light, desktop viewport.
  for (const [themeName, wantDark] of [
    ["dark", true],
    ["light", false],
  ]) {
    const outDir = path.join(outRoot, themeName);
    console.log(`\n=== ${themeName} (desktop) ===`);
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await signIn(page, "2468");
    await setTheme(page, wantDark);
    await captureViews(page, outDir);

    if (themeName === "dark") {
      // Floor Team drawer + Quick Add dialog, dark only.
      await page.getByRole("tab", { name: "Grid", exact: true }).click();
      await page
        .getByRole("button", { name: "Zara" })
        .waitFor({ state: "visible" });
      // The "Floor team changed?" card is the closest analog to a Floor
      // Team drawer in this implementation -- captured as-is.
      await shoot(page, outDir, "floor-team");
      // Quick add via Floor's "+ Table" style flow doesn't exist on Grid;
      // the Grid's own quick-add card is the equivalent surface.
      await shoot(page, outDir, "quick-add");
    }
    console.log(
      `  ${VIEWS.length + (themeName === "dark" ? 2 : 0)} screenshots -> ${outDir}`,
    );
    await page.close();
  }

  // Tablet (iPad landscape), dark only.
  const tabletDir = path.join(outRoot, "tablet");
  console.log("\n=== tablet (dark) ===");
  const ipad = devices["iPad (gen 7) landscape"];
  const page = await browser.newPage({ ...ipad });
  await signIn(page, "2468");
  await setTheme(page, true);
  await captureViews(page, tabletDir);
  console.log(`  ${VIEWS.length} screenshots -> ${tabletDir}`);
  await page.close();

  await browser.close();
  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
