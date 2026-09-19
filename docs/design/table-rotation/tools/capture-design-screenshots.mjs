#!/usr/bin/env node
/**
 * Capture approved design-reference screenshots for the Table Rotation
 * multi-view prototype.
 *
 * Usage (from the repo root, or anywhere):
 *   node docs/design/table-rotation/tools/capture-design-screenshots.mjs
 *
 * DESIGN HANDOFF AUTOMATION ONLY.
 * - Does not touch the production Table Rotation feature, Supabase, the
 *   database, RLS, auth, or any application code.
 * - Only reads the static prototype under approved-design-export/ and
 *   writes PNGs under screenshots/{dark,light,tablet}/.
 *
 * Primary prototype used: "Table Rotation Multi-View v2.dc.html", not
 * "Table Rotation Multi-View Standalone.html". Both exist in
 * approved-design-export/; see ../README.md's "Primary visual reference"
 * section for why v2.dc.html is correct (Standalone.html has zero
 * dark/light-switching code, confirmed by grep).
 *
 * Why an HTTP server, not file://: this export is in the Claude Design
 * "bundler" format - the real DOM is constructed at runtime by an
 * embedded script from a resource manifest, not present in the raw HTML.
 * It needs to load like a normal page over http(s), and Playwright's own
 * browser blocks file:// navigation by default in this environment.
 * The server below is a zero-dependency Node http server (built-in
 * modules only) scoped to approved-design-export/ - nothing new to
 * install, nothing that reaches outside that one folder.
 *
 * This script originated in a sibling repo (JobQuest1.0) where Playwright
 * lived under backend/node_modules/. In this repo, @playwright/test is a
 * root-level devDependency, so the import path below points at
 * <repo-root>/node_modules/@playwright/test/index.mjs instead - four
 * levels up from this file (tools/ -> table-rotation/ -> design/ -> docs/
 * -> repo root), same depth as before, different final segment.
 */

import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const exportDir = path.resolve(here, "..", "approved-design-export");
const screenshotsDir = path.resolve(here, "..", "screenshots");
const PRIMARY_HTML = "Table Rotation Multi-View v2.dc.html";
const PORT = 8642;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(req.url.split("?")[0]);
        const filePath = path.join(
          exportDir,
          urlPath === "/" ? PRIMARY_HTML : urlPath,
        );
        if (!filePath.startsWith(exportDir)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        const body = await readFile(filePath);
        res.writeHead(200, {
          "Content-Type":
            MIME[path.extname(filePath)] || "application/octet-stream",
        });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.on("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

const playwrightTestEntry = path.resolve(
  here,
  "..",
  "..",
  "..",
  "..",
  "node_modules",
  "@playwright",
  "test",
  "index.mjs",
);
// Dynamic import() needs a file:// URL for an absolute path (a plain path
// string is not reliably supported, especially on Windows).
const { chromium } = await import(
  `file://${playwrightTestEntry.replaceAll("\\", "/")}`
);

const VIEWS = [
  { tab: "Grid", file: "01-grid", heading: "Dinner rotation" },
  { tab: "Floor", file: "02-floor", heading: "Live floor map" },
  { tab: "Picker", file: "03-picker", heading: "Grid + visual picker" },
  { tab: "Servers", file: "04-servers", heading: "Server board" },
  { tab: "Dashboard", file: "05-dashboard", heading: "Floor dashboard" },
];

/**
 * The theme toggle button's own visible label names the state it will
 * switch TO, not the current state: "Light" showing means the app is
 * currently dark (click to go light); "Dark" showing means it's currently
 * light. There is no data-theme/class attribute on <html> or <body> to
 * read instead (checked directly) - the bundler renders into a nested
 * structure - so the button's own label is the real, visible state signal
 * to wait on, not a proxy for it.
 */
async function ensureTheme(page, wantDark) {
  const toggle = page.getByRole("button", { name: "Toggle theme" });
  for (let attempt = 0; attempt < 3; attempt++) {
    const label = await toggle.innerText();
    const currentlyDark = label.includes("Light");
    if (currentlyDark === wantDark) return;
    await toggle.click();
    // The theme swap itself is an instant CSS-variable flip (confirmed by
    // direct observation); this only waits out the click's own event
    // handling, not an animation.
    await page.waitForTimeout(150);
  }
  throw new Error(
    `Could not reach ${wantDark ? "dark" : "light"} theme after 3 toggle attempts`,
  );
}

async function gotoView(page, view) {
  await page.getByRole("button", { name: view.tab, exact: true }).click();
  await page
    .getByRole("heading", { name: view.heading, exact: true })
    .waitFor({ state: "visible" });
}

async function shoot(page, outDir, name) {
  await mkdir(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
}

async function captureViews(page, outDir) {
  for (const view of VIEWS) {
    await gotoView(page, view);
    await shoot(page, outDir, view.file);
  }
}

/**
 * Floor Team drawer and Quick Add Staff dialog are captured one at a time,
 * each opened fresh (the drawer closed before Quick Add opens), so each
 * screenshot shows exactly one overlay, not two stacked. Both close via
 * their own "✕" button - Escape does not close either (confirmed
 * directly), so this clicks the real control instead of assuming a
 * keyboard shortcut exists.
 */
async function captureFloorTeamAndQuickAdd(page, outDir) {
  await gotoView(page, VIEWS[0]); // Grid - where both entry points live

  await page.getByRole("button", { name: /^Floor Team:/ }).click();
  await page
    .getByRole("heading", { name: "Floor team", exact: true })
    .waitFor({ state: "visible" });
  await shoot(page, outDir, "06-floor-team");
  await page.getByRole("button", { name: "✕" }).click();
  await page
    .getByRole("heading", { name: "Floor team", exact: true })
    .waitFor({ state: "hidden" });

  await page.getByRole("button", { name: "+ Quick Add" }).click();
  await page
    .getByRole("heading", { name: "Quick add staff", exact: true })
    .waitFor({ state: "visible" });
  // Shows both clocked-in groupings ("Clocked in — floor/servers" and
  // "Clocked in — other staff") plus the Other Members search list, per
  // INTERACTIONS.md's Quick Add spec.
  await shoot(page, outDir, "07-quick-add");
  await page.getByRole("button", { name: "✕" }).click();
}

async function main() {
  console.log(`Serving ${exportDir} ...`);
  const server = await startServer();
  console.log(`  -> http://127.0.0.1:${PORT}/`);

  const browser = await chromium.launch();
  try {
    for (const [themeName, wantDark] of [
      ["dark", true],
      ["light", false],
    ]) {
      const outDir = path.join(screenshotsDir, themeName);
      console.log(`\n=== ${themeName} (1440x1000) ===`);
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      await page.goto(
        `http://127.0.0.1:${PORT}/${encodeURIComponent(PRIMARY_HTML)}`,
      );
      await ensureTheme(page, wantDark);
      await captureViews(page, outDir);
      await captureFloorTeamAndQuickAdd(page, outDir);
      await page.close();
      console.log(`  7 screenshots -> ${outDir}`);
    }

    // Optional tablet reference (task section 6): the 5 main views only,
    // no drawer/dialog, dark theme. The prototype's own responsive
    // behavior at this width is a reflow + horizontal scroll of the same
    // desktop layout, not a distinct tablet redesign - captured as-is per
    // "only capture the design's existing responsive behavior."
    const tabletDir = path.join(screenshotsDir, "tablet");
    console.log("\n=== tablet (1024x768, dark) ===");
    const page = await browser.newPage({
      viewport: { width: 1024, height: 768 },
    });
    await page.goto(
      `http://127.0.0.1:${PORT}/${encodeURIComponent(PRIMARY_HTML)}`,
    );
    await ensureTheme(page, true);
    await captureViews(page, tabletDir);
    await page.close();
    console.log(`  5 screenshots -> ${tabletDir}`);
  } finally {
    await browser.close();
    server.close();
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
