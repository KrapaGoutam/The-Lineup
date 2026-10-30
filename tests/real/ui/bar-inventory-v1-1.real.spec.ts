import {
  test,
  expect,
  type Page,
  type BrowserContext,
  type Browser,
} from "@playwright/test";
import { createHmac, randomInt } from "node:crypto";
import fs from "node:fs";
import { createFixture, type Fixture, type TestUser } from "../support/harness";
import {
  assertInventoryDev,
  inventoryBase,
  inventoryProduct,
  inventoryRpc,
  seedInventory,
  verifyInventoryCleanup,
} from "../support/inventory-v1-1";
import {
  businessDate,
  addCalendarMonths,
} from "../../../src/features/bar-inventory/domain/freshness";
test.describe.configure({ mode: "serial" });
let fx: Fixture;
let manager: Page;
let staff: Page;
let contexts: BrowserContext[] = [];
let browserForFixture: Browser;
let managerPin: string;
let alpha: string;
let beta: string;
let slug: string;
const pageErrors: string[] = [];
const app = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
async function credential(user: TestUser) {
  assertInventoryDev();
  const parsed = fs
    .readFileSync(".env.development.local", "utf8")
    .match(/^APP_PIN_PEPPER=(.*)$/m)?.[1]
    .replace(/^"|"$/g, "");
  if (!parsed || parsed.length < 32)
    throw new Error("DEV passcode pepper missing");
  const pin = String(randomInt(1000, 10000));
  const hmac = (text: string) =>
    createHmac("sha256", parsed).update(text).digest("hex");
  const password = hmac(`authpw:${fx.orgId}:${pin}`);
  const auth = await fx.admin.auth.admin.updateUserById(user.id, { password });
  if (auth.error) throw new Error("Synthetic auth setup failed");
  const inserted = await fx.admin.from("passcode_credentials").insert({
    organization_id: fx.orgId,
    profile_id: user.id,
    locator: hmac(`${fx.orgId}:${pin}`),
    synthetic_email: user.email,
    active: true,
  });
  if (inserted.error) throw new Error("Synthetic credential setup failed");
  const session = await user.client.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (session.error) throw new Error("Synthetic auth sign-in failed");
  return pin;
}
async function login(page: Page, pin: string) {
  await page.goto(`/r/${slug}`);
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(pin);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}
async function inventory(page: Page) {
  await page
    .locator('[data-nav-tier="secondary"]')
    .filter({ hasText: "Bar Inventory" })
    .click();
  await page.getByRole("tab", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Date tracking for BI V1.1 Alpha",
      exact: true,
    }),
  ).toBeVisible({ timeout: 30000 });
}
async function stock(product: string) {
  const result = await fx.admin
    .from("inventory_stock")
    .select("on_hand,backup,version")
    .eq("product_id", product)
    .eq("location_id", fx.locA)
    .single();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
test.beforeAll(async ({ browser }) => {
  browserForFixture = browser;
  assertInventoryDev();
  const html = await (await fetch(app)).text();
  let corpus = html;
  for (const match of [
    ...html.matchAll(/src="(\/_next\/[^" ]+\.js[^" ]*)"/g),
  ].slice(0, 40))
    corpus += await (await fetch(new URL(match[1], app))).text();
  if (
    corpus.includes("ftadewtkjlaotfdvtjcv") ||
    !corpus.includes("opmujepkemwcdxxorhfd")
  )
    throw new Error("App is not pinned to DEV");
  fx = await createFixture();
  const seeded = await seedInventory(fx);
  alpha = await inventoryProduct(fx, seeded, "BI V1.1 Alpha");
  beta = await inventoryProduct(fx, seeded, "BI V1.1 Beta");
  const loc = await fx.admin
    .from("locations")
    .update({ created_at: "2020-01-01T00:00:00Z" })
    .eq("id", fx.locA);
  if (loc.error) throw new Error(loc.error.message);
  const org = await fx.admin
    .from("organizations")
    .select("slug")
    .eq("id", fx.orgId)
    .single();
  if (org.error) throw new Error(org.error.message);
  slug = org.data.slug;
  const counted = await inventoryRpc(fx.manager, "inventory_bulk_count", {
    ...inventoryBase(fx),
    p_rows: [
      { productId: alpha, expectedVersion: 1, onHand: 8, backup: 1 },
      { productId: beta, expectedVersion: 1, onHand: 4, backup: 0 },
    ],
    p_reason: "stock_count",
    p_note: "Fixture initialization",
  });
  if (counted.error) throw new Error(counted.error.message);
  const pins = await Promise.all([
    credential(fx.manager),
    credential(fx.server1),
  ]);
  managerPin = pins[0];
  contexts = [await browser.newContext(), await browser.newContext()];
  manager = await contexts[0].newPage();
  staff = await contexts[1].newPage();
  manager.on("pageerror", (e) => pageErrors.push(e.message));
  staff.on("pageerror", (e) => pageErrors.push(e.message));
  await login(manager, pins[0]);
  await login(staff, pins[1]);
});
test.afterAll(async () => {
  for (const context of contexts) await context.close();
  if (!fx) return;
  await fx.teardown();
  const counts = await verifyInventoryCleanup(fx);
  fs.mkdirSync("artifacts/bar-inventory-v1-1", { recursive: true });
  fs.writeFileSync(
    "artifacts/bar-inventory-v1-1/hosted-ui-cleanup.json",
    JSON.stringify(counts, null, 2),
  );
  expect(pageErrors).toEqual([]);
});
test("manager sign-in/load and Staff UI denial", async () => {
  await expect(
    staff
      .locator('[data-nav-tier="secondary"]')
      .filter({ hasText: "Bar Inventory" }),
  ).toHaveCount(0);
  await inventory(manager);
});
test("bulk review detects stale conflict, refreshes, atomically saves and records history", async () => {
  await manager
    .getByRole("checkbox", { name: "Select BI V1.1 Alpha", exact: true })
    .check();
  await manager
    .getByRole("checkbox", { name: "Select BI V1.1 Beta", exact: true })
    .check();
  await manager.getByRole("button", { name: "Bulk Edit", exact: true }).click();
  const dialog = manager.getByRole("dialog", {
    name: "Bulk Count",
    exact: true,
  });
  await dialog
    .getByLabel("New On Hand: BI V1.1 Alpha", { exact: true })
    .fill("0");
  await dialog
    .getByLabel("New On Hand: BI V1.1 Beta", { exact: true })
    .fill("6");
  await dialog
    .getByLabel("Optional note", { exact: true })
    .fill("Hosted V1.1 count");
  await dialog
    .getByRole("button", { name: "Review Changes", exact: true })
    .click();
  const changed = await inventoryRpc(fx.owner, "inventory_stock_adjust", {
    ...inventoryBase(fx),
    p_product_id: alpha,
    p_mode: "set",
    p_on_hand: 9,
    p_backup: null,
    p_reason: "correction",
    p_note: "Concurrent count",
    p_expected_version: 2,
  });
  expect(changed.error).toBeNull();
  await dialog
    .getByRole("button", { name: "Confirm 2 Changes", exact: true })
    .click();
  await expect(dialog.getByText(/Nothing was saved/).first()).toBeVisible({
    timeout: 30000,
  });
  expect((await stock(beta)).on_hand).toBe(4);
  await dialog
    .getByRole("button", { name: "Refresh counts and re-review", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Review Changes", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirm 2 Changes", exact: true })
    .click();
  await expect(dialog).toBeHidden({ timeout: 30000 });
  expect((await stock(alpha)).on_hand).toBe(0);
  expect((await stock(beta)).on_hand).toBe(6);
  const ledger = await fx.manager.client
    .from("inventory_adjustments")
    .select("id,actor_profile_id")
    .eq("note", "Hosted V1.1 count");
  expect(ledger.error).toBeNull();
  expect(ledger.data).toHaveLength(2);
  expect(ledger.data?.every((r) => r.actor_profile_id === fx.manager.id)).toBe(
    true,
  );
  await manager.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    manager.getByRole("heading", { name: "Inventory history", exact: true }),
  ).toBeVisible();
  await manager.getByRole("tab", { name: "Inventory", exact: true }).click();
});
test("columns and personal views survive a new browser load and support save-as/update/default", async () => {
  await manager
    .getByRole("searchbox", { name: "Search Inventory" })
    .fill("Alpha");
  await manager.getByRole("button", { name: "Columns", exact: true }).click();
  const menu = manager.getByRole("dialog", { name: "Choose columns" });
  await menu.getByRole("checkbox", { name: "SKU", exact: true }).uncheck();
  await menu
    .getByRole("button", { name: "Move Vendor down", exact: true })
    .click();
  await manager.getByRole("button", { name: "Columns", exact: true }).click();
  await manager.getByRole("button", { name: "Save View", exact: true }).click();
  let dialog = manager.getByRole("dialog", { name: "Save View", exact: true });
  await dialog.getByLabel("View name", { exact: true }).fill("Weekly");
  await dialog.getByLabel("Make my default Inventory view").check();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30000 });
  const freshContext = await browserForFixture.newContext();
  contexts.push(freshContext);
  const fresh = await freshContext.newPage();
  await login(fresh, managerPin);
  await inventory(fresh);
  await expect(
    fresh.getByRole("searchbox", { name: "Search Inventory" }),
  ).toHaveValue("Alpha");
  await expect(
    fresh
      .getByRole("table", { name: "Inventory", exact: true })
      .locator("thead th")
      .first(),
  ).toContainText("Name");
  await expect(fresh.getByRole("columnheader", { name: /SKU/ })).toHaveCount(0);
  await manager.reload();
  await manager.getByRole("tab", { name: "Inventory", exact: true }).click();
  await expect(
    manager.getByRole("searchbox", { name: "Search Inventory" }),
  ).toHaveValue("Alpha");
  await manager
    .getByRole("combobox", { name: "Saved Views", exact: true })
    .selectOption({ label: "Weekly (default)" });
  if (!(await manager.locator("details[open]").count()))
    await manager.getByText("Manage view", { exact: true }).click();
  await manager
    .getByRole("button", { name: "Save as new", exact: true })
    .click();
  dialog = manager.getByRole("dialog", { name: "Save View", exact: true });
  await dialog.getByLabel("View name", { exact: true }).fill("Copy");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30000 });
  await manager
    .getByRole("searchbox", { name: "Search Inventory" })
    .fill("Beta");
  if (!(await manager.locator("details[open]").count()))
    await manager.getByText("Manage view", { exact: true }).click();
  await manager
    .getByRole("button", { name: "Update current view", exact: true })
    .click();
  await expect
    .poll(async () => {
      const r = await fx.manager.client
        .from("inventory_saved_views")
        .select("payload")
        .eq("name", "Copy")
        .single();
      return r.data?.payload?.state?.search;
    })
    .toBe("Beta");
  await manager
    .getByRole("button", { name: "Reset to standard Inventory", exact: true })
    .click();
  await manager.getByRole("tab", { name: "Dashboard", exact: true }).click();
  await manager.getByRole("tab", { name: "Inventory", exact: true }).click();
  await expect(
    manager.getByRole("searchbox", { name: "Search Inventory" }),
  ).toHaveValue("Alpha");
  await manager
    .getByRole("button", { name: "Reset to standard Inventory", exact: true })
    .click();
});
test("multiple manufacture/expiration dates, rule, dashboard and drilldown use real server actions", async () => {
  const today = businessDate(new Date(), "America/Chicago");
  const manufacture = addCalendarMonths(today, -10).split("-");
  const expiration = new Date(`${today}T12:00:00Z`);
  expiration.setUTCDate(expiration.getUTCDate() + 5);
  const exp = `${expiration.getUTCMonth() + 1}/${expiration.getUTCDate()}/${expiration.getUTCFullYear()}`;
  await manager
    .getByRole("button", {
      name: "Date tracking for BI V1.1 Alpha",
      exact: true,
    })
    .click();
  let dialog = manager.getByRole("dialog", {
    name: "BI V1.1 Alpha — Date Tracking",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Add Date Entry", exact: true })
    .click();
  await dialog
    .getByLabel("Manufactured", { exact: true })
    .fill(`${manufacture[1]}/${manufacture[0]}`);
  await dialog.getByLabel("Expires", { exact: true }).fill(exp);
  await dialog.getByLabel("Quantity (optional)", { exact: true }).fill("1");
  await dialog
    .getByRole("button", { name: "Save date entry", exact: true })
    .click();
  await expect(dialog).toContainText("1 date groups", { timeout: 30000 });
  await dialog
    .getByRole("button", { name: "Add Date Entry", exact: true })
    .click();
  await dialog.getByLabel("Expires", { exact: true }).fill("12/2099");
  await dialog
    .getByRole("button", { name: "Save date entry", exact: true })
    .click();
  await expect(dialog).toContainText("2 date groups", { timeout: 30000 });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await manager.getByRole("tab", { name: "Manage", exact: true }).click();
  await manager
    .getByRole("tab", { name: "Freshness Rules", exact: true })
    .click();
  await manager
    .getByRole("button", { name: "Add freshness rule", exact: true })
    .click();
  dialog = manager.getByRole("dialog", {
    name: "Add freshness rule",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "Subcategory", exact: true })
    .selectOption({ label: "V1.1 synthetic Beer / V1.1 synthetic IPA" });
  await dialog.getByLabel("Maximum age (months)", { exact: true }).fill("9");
  await dialog
    .getByLabel("Warn before limit (months)", { exact: true })
    .fill("1");
  await dialog
    .getByRole("button", { name: "Save freshness rule", exact: true })
    .click();
  await expect(dialog).toBeHidden({ timeout: 30000 });
  await manager.getByRole("tab", { name: "Dashboard", exact: true }).click();
  await expect(manager.getByTestId("date-kpi-urgent")).toContainText(
    "1 products",
  );
  await expect(manager.getByTestId("date-kpi-limit")).toContainText(
    "1 products",
  );
  await manager.getByTestId("date-kpi-urgent").click();
  await expect(
    manager.getByRole("combobox", { name: "Expiration filter", exact: true }),
  ).toHaveValue("Within 7 days");
  fs.mkdirSync("artifacts/bar-inventory-v1-1", { recursive: true });
  await manager.screenshot({
    path: "artifacts/bar-inventory-v1-1/hosted-desktop.png",
    fullPage: true,
  });
  await manager.setViewportSize({ width: 390, height: 844 });
  await manager.screenshot({
    path: "artifacts/bar-inventory-v1-1/hosted-mobile.png",
    fullPage: true,
  });
  expect(
    await manager.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
