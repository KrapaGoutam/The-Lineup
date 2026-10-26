import fs from "node:fs";
import path from "node:path";

import { expect, type BrowserContext, type Page } from "@playwright/test";

import { adminClient, env } from "../../support/harness";

/**
 * Guards + helpers for the real-mode browser suite. Credentials are read from
 * local, git-ignored files at run time and never printed or written anywhere:
 *   - the owner PIN from .bootstrap-owner-passcode.local.txt
 *   - the synthetic DEV staff PINs from docs/testing/ (untracked)
 */
export const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export async function assertServerIsDev() {
  const html = await (await fetch(BASE)).text();
  const scripts = [...html.matchAll(/src="(\/_next\/[^"]+\.js[^"]*)"/g)].map(
    (m) => m[1],
  );
  let corpus = html;
  for (const src of scripts.slice(0, 40)) {
    corpus += await (await fetch(new URL(src, BASE))).text();
  }
  if (corpus.includes("ftadewtkjlaotfdvtjcv")) {
    throw new Error("The app under test references PROD. Refusing to run.");
  }
  if (!corpus.includes("opmujepkemwcdxxorhfd")) {
    throw new Error("The app under test is not pinned to the-lineup-dev.");
  }
}

function readPins(): Record<string, string> {
  const owner = fs
    .readFileSync(
      path.resolve(process.cwd(), ".bootstrap-owner-passcode.local.txt"),
      "utf8",
    )
    .match(/Owner passcode:\s*(\d{4,8})/)?.[1];
  const report = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "docs/testing/THE_LINEUP_DEV_VALIDATION_REPORT.md",
    ),
    "utf8",
  );
  const pin = (name: string) =>
    report.match(
      new RegExp(`\\|\\s*${name}\\s*\\|[^\\n]*\\*\\*(\\d{4})\\*\\*`),
    )?.[1];
  const pins = {
    TestOwner: owner,
    TestManager: pin("TestManager"),
    TestServer1: pin("TestServer1"),
    TestServer2: pin("TestServer2"),
  };
  for (const [name, value] of Object.entries(pins)) {
    if (!value) throw new Error(`No local DEV passcode found for ${name}`);
  }
  return pins as Record<string, string>;
}

export const PINS = readPins();

/** DEV Location of the DEV organization (the one the synthetic users belong to). */
export async function devLocation() {
  const admin = adminClient();
  const org = await admin
    .from("organizations")
    .select("id")
    .eq("slug", "the-monks")
    .single();
  const loc = await admin
    .from("locations")
    .select("id")
    .eq("organization_id", org.data!.id)
    .limit(1)
    .single();
  return {
    admin,
    orgId: org.data!.id as string,
    locationId: loc.data!.id as string,
  };
}

/** Wipes TODAY's board at the DEV location (service role; DEV synthetic data). */
export async function resetTodayBoard(
  admin: ReturnType<typeof adminClient>,
  locationId: string,
) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
  }).format(new Date());
  const sessions = await admin
    .from("service_sessions")
    .select("id")
    .eq("location_id", locationId)
    .eq("service_date", today);
  const ids = (sessions.data ?? []).map((s) => s.id as number);
  if (ids.length === 0) return;
  for (const table of [
    "board_events",
    "section_assignments",
    "table_rotation_entries",
    "rotation_rounds",
    "rotation_members",
  ]) {
    await admin.from(table).delete().in("service_session_id", ids);
  }
  await admin.from("service_sessions").delete().in("id", ids);
}

export async function signIn(page: Page, pin: string) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(pin);
  await expect(accountButton(page)).toBeVisible({ timeout: 60_000 });
}

export function accountButton(page: Page) {
  return page
    .getByRole("button", { name: "Account and quick settings" })
    .first();
}

export async function goToAllocation(page: Page) {
  await expect(accountButton(page)).toBeVisible();
  const direct = page.getByRole("button", {
    name: /^Table Allocation$|^Allocation$/,
  });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  const moreButton = page.getByRole("button", { name: "More" });
  if ((await moreButton.getAttribute("aria-expanded")) !== "true") {
    await moreButton.click();
  }
  await page
    .getByRole("button", { name: /^Table Allocation$|^Allocation$/ })
    .click();
}

export type ViewName = "Grid" | "Floor" | "Picker" | "Servers" | "Dashboard";

export async function switchView(page: Page, name: ViewName) {
  await page.getByRole("tab", { name, exact: true }).click();
  await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
}

/** Opens a browser context signed in as the given DEV user, on Table Allocation. */
export async function openAs(
  context: BrowserContext,
  user: keyof typeof PINS,
): Promise<Page> {
  const page = await context.newPage();
  await signIn(page, PINS[user]);
  await goToAllocation(page);
  return page;
}

export function tile(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`^Table ${label}, `) });
}

export async function expectOwner(page: Page, label: string, name: string) {
  await expect(
    page.getByRole("button", { name: `Table ${label}, assigned to ${name}` }),
  ).toBeVisible({ timeout: 30_000 });
}

export async function expectAvailable(page: Page, label: string) {
  await expect(
    page.getByRole("button", { name: `Table ${label}, available` }),
  ).toBeVisible({ timeout: 30_000 });
}

/** Floor: tap an available table, choose a server (Assign Also if prompted). */
export async function floorAssign(page: Page, label: string, server: string) {
  await tile(page, label).click();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: server })
    .click();
  const also = page.getByRole("button", {
    name: new RegExp(`Assign ${label} also`),
  });
  if (await also.isVisible({ timeout: 1500 }).catch(() => false)) {
    await also.click();
  }
}

export { env };
