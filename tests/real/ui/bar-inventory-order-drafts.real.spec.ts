/**
 * Vendor Order Drafts V1 / VOD-4 -- real-mode browser scenarios (hosted DEV).
 * Three isolated contexts signed in through the real passcode flow: TestOwner
 * and TestManager (management) and TestServer1 (staff). The catalog is seeded
 * through the app's own CSV import (real RPCs) under a unique "VOD4-<stamp>"
 * tag. Mark Sent leaves ONE immutable Sent order (plus the vendor/products it
 * references) in the DEV org by design -- Sent history is append-only and the
 * database refuses to delete it. Everything else this spec creates is removed
 * afterwards (service role, DEV only). Scenario ids match
 * docs/features/bar-inventory-vendor-order-drafts-v1/TEST_MATRIX.md.
 */
import { readFile } from "node:fs/promises";

import {
  expect,
  test,
  type BrowserContext,
  type Download,
  type Page,
} from "@playwright/test";
import readXlsxFile from "read-excel-file/node";

import {
  accountButton,
  assertServerIsDev,
  devLocation,
  PINS,
  signIn,
} from "./support/dev-app";

test.describe.configure({ mode: "serial" });

const TAG = `VOD4-${Date.now()}`;
const VENDOR = `${TAG} Vendor`;
const ALPHA = `${TAG} Alpha`; // critical, par 12 -> suggested 9
const BETA = `${TAG} Beta`; // critical, no par -> "Order needed"
const GAMMA = `${TAG} Gamma`; // healthy -> never on the draft
const ALPHA_LABEL = `${ALPHA} 750 mL`;
const BETA_LABEL = `${BETA} 1 L`;
const HEADER =
  "Vendor,Name,Category,Subcategory,Size,Unit,SKU,On Hand,Backup,Cutoff Limit,Warning Level,Par Level,Notes";

let owner: Page;
let manager: Page;
let staff: Page;
let contexts: BrowserContext[] = [];
const pageErrors: string[] = [];

async function open(context: BrowserContext, pin: string, label: string) {
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${label}: ${e.message}`));
  await signIn(page, pin);
  return page;
}

async function openBarInventory(page: Page) {
  await expect(accountButton(page)).toBeVisible();
  await page
    .locator('[data-nav-tier="secondary"]')
    .filter({ hasText: "Bar Inventory" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bar Inventory" }),
  ).toBeVisible();
  await expect(page.getByText("Loading Bar Inventory…")).toBeHidden({
    timeout: 30_000,
  });
}

const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true });
const qty = (page: Page, label = ALPHA_LABEL) =>
  page.getByLabel(`Order quantity for ${label}`);
const note = (page: Page, label = ALPHA_LABEL) =>
  page.getByLabel(`Item note for ${label}`);
const include = (page: Page, label = BETA_LABEL) =>
  page.getByLabel(`Include ${label} in the order`);
const save = (page: Page) =>
  page.getByRole("button", { name: "Save", exact: true });
const group = (page: Page) =>
  page.locator(`[data-testid="order-group"][data-vendor="${VENDOR}"]`);

async function saveAndWait(page: Page) {
  await save(page).click();
  await expect(page.getByTestId("draft-save-bar")).toHaveAttribute(
    "data-state",
    "clean",
    { timeout: 30_000 },
  );
}

/** Full reload of the page, back to the Order Drafts tab. */
async function reloadToDrafts(page: Page) {
  await page.reload();
  await page.waitForSelector('body[data-hydrated="true"]');
  await openBarInventory(page);
  await tab(page, "Order Drafts").click();
  await expect(page.getByTestId("order-draft-editor")).toBeVisible({
    timeout: 30_000,
  });
}

async function openDraftFromDashboard(page: Page) {
  await openBarInventory(page);
  await expect(group(page)).toBeVisible({ timeout: 30_000 });
  const create = group(page).getByRole("button", {
    name: "Create Order Draft",
  });
  const existing = group(page).getByRole("button", {
    name: "Open Order Draft",
  });
  if (await create.isVisible()) await create.click();
  else await existing.click();
  await expect(page.getByTestId("order-draft-editor")).toBeVisible({
    timeout: 30_000,
  });
}

/** The real system clipboard; Windows stores a newline as CRLF, so normalise. */
const readClipboard = (page: Page) =>
  page.evaluate(async () =>
    (await navigator.clipboard.readText()).replaceAll("\r\n", "\n"),
  );

async function exportAs(page: Page, format: "CSV" | "Excel (.xlsx)") {
  await page.getByRole("button", { name: "Export order", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: `Download ${format}` }).click();
  const file: Download = await download;
  return {
    path: (await file.path()) as string,
    name: file.suggestedFilename(),
  };
}

const csvLines = async (path: string) =>
  (await readFile(path, "utf8")).replace(/^﻿/, "").trimEnd().split("\r\n");

async function db() {
  const { admin, orgId, locationId } = await devLocation();
  const vendor = await admin
    .from("inventory_vendors")
    .select("id")
    .eq("organization_id", orgId)
    .eq("name", VENDOR)
    .maybeSingle();
  const products = await admin
    .from("inventory_products")
    .select("id, name")
    .eq("organization_id", orgId)
    .like("name", `${TAG}%`);
  const idOf = (name: string) =>
    products.data?.find((p) => p.name === name || p.name.startsWith(name))
      ?.id as string | undefined;
  return {
    admin,
    orgId,
    locationId,
    vendorId: vendor.data?.id as string | undefined,
    products: products.data ?? [],
    idOf,
  };
}

async function draftsFor(status?: "draft" | "sent") {
  const { admin, orgId, locationId, vendorId } = await db();
  let query = admin
    .from("inventory_order_drafts")
    .select("*")
    .eq("organization_id", orgId)
    .eq("location_id", locationId)
    .eq("vendor_id", vendorId!)
    .order("created_at", { ascending: true });
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return (data ?? []) as Record<string, unknown>[];
}

async function itemFor(draftId: string, productName: string) {
  const { admin, idOf } = await db();
  const { data } = await admin
    .from("inventory_order_draft_items")
    .select("*")
    .eq("draft_id", draftId)
    .eq("product_id", idOf(productName)!)
    .single();
  return data as Record<string, unknown>;
}

async function inventoryTruth() {
  const { admin, orgId, locationId, products } = await db();
  const ids = products.map((p) => p.id as string);
  const stock = await admin
    .from("inventory_stock")
    .select(
      "product_id, on_hand, backup, total, version, last_adjusted_at, updated_at",
    )
    .eq("location_id", locationId)
    .in("product_id", ids)
    .order("product_id");
  const ledger = await admin
    .from("inventory_adjustments")
    .select("id")
    .eq("organization_id", orgId)
    .order("id", { ascending: false });
  const changeLog = await admin
    .from("inventory_change_log")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  return {
    stock: stock.data,
    ledgerCount: ledger.data?.length ?? 0,
    ledgerMaxId: ledger.data?.[0]?.id ?? null,
    changeLogCount: changeLog.count,
  };
}

async function cleanup() {
  const { admin, orgId, vendorId } = await db();
  if (!vendorId) return;
  // Active drafts (and their lines) go; Sent history is append-only by design.
  await admin
    .from("inventory_order_drafts")
    .delete()
    .eq("organization_id", orgId)
    .eq("vendor_id", vendorId)
    .eq("status", "draft");
  // Products still referenced by a Sent order must stay (FK); the rest go.
  const referenced = await admin
    .from("inventory_order_draft_items")
    .select("product_id")
    .eq("organization_id", orgId);
  const keep = new Set(
    (referenced.data ?? []).map((r) => r.product_id as string),
  );
  const products = await admin
    .from("inventory_products")
    .select("id")
    .eq("organization_id", orgId)
    .like("name", `${TAG}%`);
  const removable = (products.data ?? [])
    .map((p) => p.id as string)
    .filter((id) => !keep.has(id));
  if (removable.length > 0) {
    await admin.from("inventory_products").delete().in("id", removable);
  }
  // Catalog scaffolding goes too unless a Sent order still points at it (the
  // database then refuses, which is the point of immutable history).
  for (const table of [
    "inventory_subcategories",
    "inventory_categories",
    "inventory_vendors",
  ]) {
    await admin
      .from(table)
      .delete()
      .eq("organization_id", orgId)
      .like("name", `${TAG}%`);
  }
}

test.beforeAll(async ({ browser }) => {
  await assertServerIsDev();
  contexts = [
    await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    }),
    await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    }),
    await browser.newContext(),
  ];
  owner = await open(contexts[0], PINS.TestOwner, "owner");
  manager = await open(contexts[1], PINS.TestManager, "manager");
  staff = await open(contexts[2], PINS.TestServer1, "staff");
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  await cleanup();
  expect(pageErrors).toEqual([]);
});

test("VOD-093: staff never see Bar Inventory or Order Drafts", async () => {
  await expect(accountButton(staff)).toBeVisible();
  await expect(
    staff
      .locator('[data-nav-tier="secondary"]')
      .filter({ hasText: "Bar Inventory" }),
  ).toHaveCount(0);
});

test("seed: the catalog is imported through the real RPCs", async () => {
  await openBarInventory(manager);
  await tab(manager, "Manage").click();
  await tab(manager, "Import").click();
  const rows = [
    `${VENDOR},${ALPHA},${TAG} Cat,${TAG} Sub,750 mL,Bottle,,2,1,4,6,12,`,
    `${VENDOR},${BETA},${TAG} Cat,${TAG} Sub,1 L,Bottle,,3,0,4,6,,`,
    `${VENDOR},${GAMMA},${TAG} Cat,${TAG} Sub,750 mL,Bottle,,9,0,2,4,10,`,
  ];
  await manager.getByLabel("CSV or Excel file").setInputFiles({
    name: `${TAG}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from([HEADER, ...rows].join("\n")),
  });
  await expect(manager.getByTestId("import-counts")).toContainText("Create 3", {
    timeout: 30_000,
  });
  await manager.getByRole("button", { name: /^Review and import/ }).click();
  await manager
    .getByRole("dialog", { name: "Import these changes?" })
    .getByRole("button", { name: "Import now" })
    .click();
  await expect(manager.getByText("Import complete")).toBeVisible({
    timeout: 30_000,
  });
});

test("VOD-101/003: two managers click Create Order Draft at once -> one active DRAFT; Unassigned is not draftable", async () => {
  await openBarInventory(owner);
  await openBarInventory(manager);
  await tab(manager, "Dashboard").click();
  await expect(group(owner)).toBeVisible({ timeout: 30_000 });
  await expect(group(manager)).toBeVisible({ timeout: 30_000 });
  // Healthy Gamma is not on the Order soon group.
  await expect(group(manager)).not.toContainText(GAMMA);
  await Promise.all([
    group(owner).getByRole("button", { name: "Create Order Draft" }).click(),
    group(manager).getByRole("button", { name: "Create Order Draft" }).click(),
  ]);
  await expect(owner.getByTestId("order-draft-editor")).toBeVisible({
    timeout: 30_000,
  });
  await expect(manager.getByTestId("order-draft-editor")).toBeVisible({
    timeout: 30_000,
  });
  const active = await draftsFor("draft");
  expect(active).toHaveLength(1);
  // The picker never offers the system vendor.
  const options = await manager
    .getByLabel("Start a draft for")
    .locator("option")
    .allTextContents()
    .catch(() => [] as string[]);
  expect(options).not.toContain("Unassigned");
  // Seeded lines: Alpha (suggested 9) and Beta (Order needed); not Gamma.
  await expect(manager.getByTestId("draft-line")).toHaveCount(2);
  await expect(manager.getByTestId("draft-suggested").first()).toBeVisible();
  await expect(manager.getByText(GAMMA)).toHaveCount(0);
});

test("VOD-046: quantity-only edits persist across a real reload (blank->5, 5->6, ->0, ->blank)", async () => {
  const draftId = (await draftsFor("draft"))[0].id as string;
  const steps: [string, string, number | null][] = [
    ["5", "blank -> 5", 5],
    ["6", "5 -> 6", 6],
    ["0", "-> 0", 0],
    ["", "-> blank", null],
  ];
  for (const [typed, label, expected] of steps) {
    await qty(manager).fill(typed);
    await saveAndWait(manager);
    await reloadToDrafts(manager);
    await expect(qty(manager), label).toHaveValue(typed);
    const row = await itemFor(draftId, ALPHA);
    expect(row.order_qty === null ? null : Number(row.order_qty), label).toBe(
      expected,
    );
  }
  // Same value again: Save stays unavailable (nothing to save).
  await qty(manager).fill("6");
  await saveAndWait(manager);
  const version = (await draftsFor("draft"))[0].version;
  await qty(manager).fill("6");
  await expect(manager.getByTestId("draft-save-bar")).toHaveAttribute(
    "data-state",
    "clean",
  );
  expect((await draftsFor("draft"))[0].version).toBe(version);
});

test("VOD-014/015: notes (newline), vendor note, Include/Exclude persist; line stays visible", async () => {
  const draftId = (await draftsFor("draft"))[0].id as string;
  await note(manager).fill("Case of 12\nfor the patio");
  await manager.getByLabel("Vendor note").fill("Dock B\nCall on arrival");
  await qty(manager, BETA_LABEL).fill("2");
  await include(manager).uncheck();
  await expect(manager.getByTestId("draft-planned-total")).toHaveText("6");
  await saveAndWait(manager);
  await reloadToDrafts(manager);
  await expect(note(manager)).toHaveValue("Case of 12\nfor the patio");
  await expect(manager.getByLabel("Vendor note")).toHaveValue(
    "Dock B\nCall on arrival",
  );
  await expect(include(manager)).not.toBeChecked();
  await expect(manager.getByTestId("draft-line")).toHaveCount(2);
  const beta = await itemFor(draftId, BETA);
  expect(beta).toMatchObject({ included: false });
  expect(Number(beta.order_qty)).toBe(2);
  // Excluded lines are omitted from Copy: only Alpha 6.
  await include(manager).check();
  await qty(manager, BETA_LABEL).fill("");
  await saveAndWait(manager);
});

test("VOD-030/008/032: Fill, Update suggestions, Clear against real data", async () => {
  const draftId = (await draftsFor("draft"))[0].id as string;
  const before = await inventoryTruth();
  // Clear first so Fill starts from blanks.
  await manager.getByRole("button", { name: "Clear Draft" }).click();
  await manager
    .getByRole("dialog", { name: "Clear this draft?" })
    .getByRole("button", { name: "Clear draft" })
    .click();
  await expect(manager.getByText("Draft cleared.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(qty(manager)).toHaveValue("");
  await expect(manager.getByLabel("Vendor note")).toHaveValue("");
  await expect(manager.getByTestId("draft-line")).toHaveCount(2);

  await manager.getByRole("button", { name: "Fill from Suggestions" }).click();
  await expect(manager.getByText("Filled from suggestions.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(qty(manager)).toHaveValue("9");
  await expect(qty(manager, BETA_LABEL)).toHaveValue(""); // no numeric suggestion
  expect(Number((await itemFor(draftId, ALPHA)).order_qty)).toBe(9);
  expect((await itemFor(draftId, BETA)).order_qty).toBeNull();

  // A typed quantity survives the default (empty-only) Fill.
  await qty(manager).fill("4");
  await saveAndWait(manager);
  await manager.getByRole("button", { name: "Fill from Suggestions" }).click();
  const dialog = manager.getByRole("dialog", { name: "Fill from Suggestions" });
  await expect(dialog.getByLabel(/Fill empty quantities only/)).toBeChecked();
  await dialog.getByRole("button", { name: "Fill empty only" }).click();
  await expect(qty(manager)).toHaveValue("4");

  // Stock moves behind the app's back; the stored suggestion does not change
  // until Update suggestions, and then Order Qty / notes are untouched.
  const { admin, locationId, idOf } = await db();
  const alphaId = idOf(ALPHA)!;
  const stock = await admin
    .from("inventory_stock")
    .select("version")
    .eq("product_id", alphaId)
    .eq("location_id", locationId)
    .single();
  await admin
    .from("inventory_stock")
    .update({ on_hand: 0, backup: 0, version: stock.data!.version + 1 })
    .eq("product_id", alphaId)
    .eq("location_id", locationId);
  expect(Number((await itemFor(draftId, ALPHA)).suggested_qty)).toBe(9);
  await reloadToDrafts(manager);
  await expect(manager.getByTestId("draft-suggested").first()).toHaveText("9");
  await manager.getByRole("button", { name: "Update suggestions" }).click();
  await expect(manager.getByTestId("draft-suggested").first()).toHaveText(
    "12",
    {
      timeout: 30_000,
    },
  );
  await expect(qty(manager)).toHaveValue("4");
  // Restore the stock figure for the Mark Sent isolation check below.
  const restored = await admin
    .from("inventory_stock")
    .select("version")
    .eq("product_id", alphaId)
    .eq("location_id", locationId)
    .single();
  await admin
    .from("inventory_stock")
    .update({ on_hand: 2, backup: 1, version: restored.data!.version + 1 })
    .eq("product_id", alphaId)
    .eq("location_id", locationId);
  // Clear/Fill/Update never wrote the ledger.
  const after = await inventoryTruth();
  expect(after.ledgerCount).toBe(before.ledgerCount);
});

test("VOD-041: two real windows -- the second save is refused (PT409), edits are kept, Keep my edits applies on top", async () => {
  const draftId = (await draftsFor("draft"))[0].id as string;
  // Both windows load the same version.
  await reloadToDrafts(manager);
  await reloadToDrafts(owner);
  await expect(qty(owner)).toBeVisible({ timeout: 30_000 });

  await qty(owner).fill("7");
  await saveAndWait(owner);

  await qty(manager).fill("8");
  await save(manager).click();
  const conflict = manager.getByTestId("draft-conflict");
  await expect(conflict).toBeVisible({ timeout: 30_000 });
  await expect(conflict).toContainText("This order draft changed elsewhere.");
  await expect(conflict).toContainText(/TestOwner saved version \d+/);
  await expect(conflict).toContainText("Your changes were not saved.");
  // The typed edit is still on screen and nothing was applied.
  await expect(qty(manager)).toHaveValue("8");
  expect(Number((await itemFor(draftId, ALPHA)).order_qty)).toBe(7);

  await conflict
    .getByRole("button", { name: "Keep my edits on the latest" })
    .click();
  await save(manager).click();
  await expect(manager.getByTestId("draft-save-bar")).toHaveAttribute(
    "data-state",
    "clean",
    { timeout: 30_000 },
  );
  expect(Number((await itemFor(draftId, ALPHA)).order_qty)).toBe(8);
});

test("VOD-076: stale Mark Sent is refused and the draft stays DRAFT", async () => {
  const draftId = (await draftsFor("draft"))[0].id as string;
  // The manager reviews the latest version...
  await reloadToDrafts(manager);
  // ...then the owner (fresh screen) edits after that review.
  await reloadToDrafts(owner);
  await qty(owner).fill("10");
  await saveAndWait(owner);

  await manager.getByRole("button", { name: "Mark Sent", exact: true }).click();
  await manager
    .getByRole("dialog", { name: "Mark this order as sent?" })
    .getByRole("button", { name: "Yes, mark as sent" })
    .click();
  await expect(
    manager.getByText(/Reload the latest version before marking it sent/),
  ).toBeVisible({ timeout: 30_000 });
  const rows = await draftsFor();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: draftId,
    status: "draft",
    sent_at: null,
  });
});

test("VOD-050/060/062/061: Copy, CSV and XLSX from the real draft; formula text is neutralised", async () => {
  await reloadToDrafts(manager);
  await expect(qty(manager)).toHaveValue("10");
  await note(manager).fill("=SUM(1+1)");
  await manager.getByLabel("Vendor note").fill("@deliver Thursday");
  await qty(manager, BETA_LABEL).fill("3");
  await saveAndWait(manager);

  await manager.getByRole("button", { name: "Copy Order" }).click();
  await expect(manager.getByTestId("copy-status")).toHaveText("Order copied");
  const copied = await readClipboard(manager);
  expect(copied.split("\n")[0]).toBe(`${VENDOR} — Order Request`);
  expect(copied).toContain(`${ALPHA} 750 mL — 10 (=SUM(1+1))`);
  expect(copied).toContain(`${BETA} 1 L — 3`);
  expect(copied).toContain("Notes:\n@deliver Thursday");
  expect(copied).not.toMatch(/suggest/i);

  const csv = await exportAs(manager, "CSV");
  const lines = await csvLines(csv.path);
  expect(lines[0]).toBe(
    "Vendor,Item,Size,Unit,SKU,Suggested,Order Qty,Item Note",
  );
  expect(lines).toHaveLength(3);
  const alphaLine = lines.find((l) => l.includes(ALPHA))!;
  const betaLine = lines.find((l) => l.includes(BETA))!;
  expect(alphaLine).toMatch(/,12,10,'=SUM\(1\+1\)$/); // suggestion re-stamped to 12
  expect(betaLine).toMatch(/,Order needed,3,$/);

  const xlsx = await exportAs(manager, "Excel (.xlsx)");
  const book = await readXlsxFile(xlsx.path);
  expect(book.map((s) => s.sheet)).toEqual(["Order", "Summary"]);
  const summary = new Map(book[1]!.data.map((r) => [String(r[0]), r[1]]));
  expect(summary.get("Vendor")).toBe(VENDOR);
  expect(summary.get("Status")).toBe("Draft");
  expect(String(summary.get("Vendor Note"))).toBe("'@deliver Thursday");
  expect(summary.get("Planned Total")).toBe(13);
  expect(String(book[0]!.data[1]![7])).toBe("'=SUM(1+1)");

  // Reset the formula-looking text so nothing odd stays in the saved record.
  await note(manager).fill("Case of 12");
  await manager.getByLabel("Vendor note").fill("Deliver Thursday");
  await saveAndWait(manager);
});

test("VOD-070/071/072/073: Mark Sent confirms in plain words, records the send, and changes no stock or ledger", async () => {
  const draftId = (await draftsFor("draft"))[0].id as string;
  const before = await inventoryTruth();

  await manager.getByRole("button", { name: "Mark Sent", exact: true }).click();
  const dialog = manager.getByRole("dialog", {
    name: "Mark this order as sent?",
  });
  await expect(dialog).toContainText("outside The Lineup");
  await expect(dialog).toContainText("read-only");
  await expect(dialog).toContainText(
    "not receive inventory or change your stock counts",
  );
  await expect(dialog).toContainText("does not send anything");
  await dialog.getByRole("button", { name: "Yes, mark as sent" }).click();

  const order = manager.getByTestId("sent-order");
  await expect(order).toBeVisible({ timeout: 30_000 });
  await expect(manager.getByTestId("sent-notice")).toContainText(
    "Order marked sent. It is now read-only, and your inventory was not changed.",
  );
  await expect(order.locator("input, textarea, select")).toHaveCount(0);

  const sent = (await draftsFor("sent"))[0];
  expect(sent).toMatchObject({ id: draftId, status: "sent" });
  expect(sent.sent_by).not.toBeNull();
  expect(sent.sent_at).not.toBeNull();
  expect(sent.version).toBeGreaterThan(1);

  const after = await inventoryTruth();
  expect(after.stock).toEqual(before.stock);
  expect(after.ledgerCount).toBe(before.ledgerCount);
  expect(after.ledgerMaxId).toBe(before.ledgerMaxId);
  expect(after.changeLogCount).toBe(before.changeLogCount);

  // Sent facts are shown in the location's time zone (never raw UTC).
  const iso = sent.sent_at as string;
  const zone = "America/Chicago";
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
  const utcTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
  await expect(manager.getByTestId("sent-meta")).toContainText(
    `${date}, ${time}`,
  );
  expect(utcTime).not.toBe(time); // Chicago is never UTC, so this proves the zone is applied
});

test("VOD-076/idempotency: a second manager on the old screen is told 'Already marked sent'; one Sent record", async () => {
  // The owner's window still shows the editable draft (it never reloaded).
  await expect(owner.getByTestId("order-draft-editor")).toBeVisible();
  await owner.getByRole("button", { name: "Mark Sent", exact: true }).click();
  await owner
    .getByRole("dialog", { name: "Mark this order as sent?" })
    .getByRole("button", { name: "Yes, mark as sent" })
    .click();
  await expect(owner.getByTestId("sent-notice")).toContainText(
    /Already marked sent by .*Nothing was changed/,
    { timeout: 30_000 },
  );
  expect(await draftsFor("sent")).toHaveLength(1);
});

test("VOD-075: the Sent order is read-only (UI) and refuses writes (database)", async () => {
  const sent = (await draftsFor("sent"))[0];
  const { admin } = await db();
  for (const name of [
    "Save",
    "Fill from Suggestions",
    "Update suggestions",
    "Clear Draft",
    "Mark Sent",
  ]) {
    await expect(
      manager.getByRole("button", { name, exact: true }),
    ).toHaveCount(0);
  }
  const tamper = await admin
    .from("inventory_order_drafts")
    .update({ vendor_note: "tamper" })
    .eq("id", sent.id as string);
  expect(tamper.error?.code).toBe("23514");
});

test("VOD-005/080: history lists the order; a NEW draft starts from current stock", async () => {
  await tab(manager, "Order Drafts").click();
  const back = manager.getByRole("button", { name: /Back to sent orders/ });
  if (await back.isVisible()) await back.click();
  await manager.getByRole("button", { name: "Sent", exact: true }).click();
  const row = manager.getByTestId("sent-row").filter({ hasText: VENDOR });
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row).toContainText("TestManager");
  await expect(manager.getByTestId("sent-page-status")).toContainText(
    /Page 1 of \d+/,
  );
  await row.getByRole("button", { name: /^View .*order sent/ }).click();
  await expect(manager.getByTestId("sent-order")).toBeVisible();
  await expect(manager.getByTestId("sent-order")).toContainText(
    "Suggested (at draft)",
  );
  await manager.getByRole("button", { name: /Back to sent orders/ }).click();

  await manager.getByRole("button", { name: "Drafts", exact: true }).click();
  await manager.getByLabel("Start a draft for").selectOption({ label: VENDOR });
  await manager.getByRole("button", { name: "Create Order Draft" }).click();
  await expect(qty(manager)).toHaveValue("", { timeout: 30_000 });
  const rows = await draftsFor();
  expect(rows.map((r) => r.status).sort()).toEqual(["draft", "sent"]);
});

test("VOD-082: renaming the product and vendor after sending leaves the Sent order unchanged", async () => {
  const { admin, orgId, idOf, vendorId } = await db();
  await admin
    .from("inventory_products")
    .update({ name: `${ALPHA} RENAMED` })
    .eq("id", idOf(ALPHA)!);
  await admin
    .from("inventory_vendors")
    .update({ name: `${VENDOR} RENAMED` })
    .eq("id", vendorId!)
    .eq("organization_id", orgId);
  try {
    await openBarInventory(manager);
    await tab(manager, "Order Drafts").click();
    await manager.getByRole("button", { name: "Sent", exact: true }).click();
    const row = manager.getByTestId("sent-row").filter({ hasText: VENDOR });
    await expect(row.first()).toBeVisible({ timeout: 30_000 });
    await expect(row.first()).not.toContainText("RENAMED");
    await row
      .first()
      .getByRole("button", { name: /^View .*order sent/ })
      .click();
    const order = manager.getByTestId("sent-order");
    await expect(order).toContainText(ALPHA);
    await expect(order).not.toContainText("RENAMED");
    // Copy of the Sent order uses the frozen labels too.
    await manager.getByRole("button", { name: "Copy Order" }).click();
    const copied = await readClipboard(manager);
    expect(copied).toContain(`${VENDOR} — Order Request`);
    expect(copied).not.toContain("RENAMED");
  } finally {
    await admin
      .from("inventory_products")
      .update({ name: ALPHA })
      .eq("id", idOf(ALPHA)!);
    await admin
      .from("inventory_vendors")
      .update({ name: VENDOR })
      .eq("id", vendorId!)
      .eq("organization_id", orgId);
  }
});

test("export of a Sent order carries the frozen facts", async () => {
  const csv = await exportAs(manager, "CSV");
  const lines = await csvLines(csv.path);
  expect(lines[0]).toBe(
    "Vendor,Item,Size,Unit,SKU,Suggested,Order Qty,Item Note",
  );
  expect(lines.some((l) => l.startsWith(VENDOR) && l.includes(ALPHA))).toBe(
    true,
  );
  const xlsx = await exportAs(manager, "Excel (.xlsx)");
  const book = await readXlsxFile(xlsx.path);
  const summary = new Map(book[1]!.data.map((r) => [String(r[0]), r[1]]));
  expect(summary.get("Status")).toBe("Sent");
  expect(summary.get("Sent By")).toBeTruthy();
  expect(summary.get("Sent At")).toBeTruthy();
});
