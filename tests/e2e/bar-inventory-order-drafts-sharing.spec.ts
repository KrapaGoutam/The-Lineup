import { readFile } from "node:fs/promises";

import { expect, test, type Download, type Page } from "@playwright/test";
import readXlsxFile from "read-excel-file/node";

// Bar Inventory / Vendor Order Drafts V1, VOD-3: Copy Order, CSV/XLSX export,
// Mark Sent, the Drafts | Sent switch and the read-only Sent order, in demo
// mode (in-memory, the same pure engine as the unit tests). Seeded: Faust has
// one Critical item (Tito's, total 3, par 12 → Suggested 9). Demo passcode
// 2468 = manager.

async function signIn(page: Page, passcode = "2468") {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

async function openBarInventory(page: Page) {
  const dock = page.getByRole("navigation", { name: "Mobile navigation" });
  if (await dock.isVisible()) {
    await dock.getByRole("button", { name: "More" }).click();
    await page
      .getByRole("dialog", { name: "More" })
      .getByRole("button", { name: "Bar Inventory" })
      .click();
  } else {
    await page
      .locator('[data-nav-tier="secondary"]')
      .filter({ hasText: "Bar Inventory" })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "Bar Inventory" }),
  ).toBeVisible();
}

const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name, exact: true });

const TITOS = "Tito's Handmade Vodka 750 mL";
const qty = (page: Page) => page.getByLabel(`Order quantity for ${TITOS}`);
const note = (page: Page) => page.getByLabel(`Item note for ${TITOS}`);
const save = (page: Page) =>
  page.getByRole("button", { name: "Save", exact: true });
const faustGroup = (page: Page) =>
  page.locator('[data-testid="order-group"][data-vendor="Faust"]');

type Clipboard = { copied: string[] };
declare global {
  interface Window {
    __clipboard: Clipboard;
  }
}

/** A deterministic clipboard in every browser: it records what was written. */
async function stubClipboard(page: Page, mode: "ok" | "denied") {
  await page.addInitScript((behaviour) => {
    window.__clipboard = { copied: [] };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          if (behaviour === "denied") throw new Error("NotAllowedError");
          window.__clipboard.copied.push(text);
        },
      },
    });
  }, mode);
}

/** Dashboard → Order soon → Faust → Create Order Draft, then a saved order. */
async function savedFaustOrder(
  page: Page,
  options: { itemNote?: string; vendorNote?: string } = {},
) {
  await faustGroup(page)
    .getByRole("button", { name: "Create Order Draft" })
    .click();
  await expect(page.getByTestId("order-draft-editor")).toBeVisible();
  await qty(page).fill("6");
  if (options.itemNote) await note(page).fill(options.itemNote);
  if (options.vendorNote) {
    await page.getByLabel("Vendor note").fill(options.vendorNote);
  }
  await save(page).click();
  await expect(page.getByText("Order draft saved.")).toBeVisible();
}

/** Clicks Export order → a format, and returns the downloaded file. */
async function exportAs(
  page: Page,
  format: "CSV" | "Excel (.xlsx)",
): Promise<{ path: string; name: string }> {
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

const noPageHorizontalScroll = async (page: Page, where = "page") => {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow: ${where}`).toBeLessThanOrEqual(1);
};

/** Tito's row in the Inventory tab, as text (counts, status, last updated). */
async function titosInventory(page: Page): Promise<string> {
  await tab(page, "Inventory").click();
  const titos = page
    .getByRole("article", { name: "Tito's Handmade Vodka" })
    .or(
      page
        .getByRole("table", { name: "Inventory" })
        .getByRole("row", { name: /Tito's Handmade Vodka/ }),
    );
  await expect(titos).toContainText("Critical");
  return (await titos.textContent()) ?? "";
}

test.describe("manager: Copy Order", () => {
  test("copies the vendor-facing text, announces it, and never shows the suggestion (VOD-050/052)", async ({
    page,
  }) => {
    await stubClipboard(page, "ok");
    await signIn(page);
    await openBarInventory(page);
    await savedFaustOrder(page, {
      itemNote: "Promo next week",
      vendorNote: "Deliver Thursday morning.",
    });

    await page.getByRole("button", { name: "Copy Order" }).click();
    await expect(page.getByTestId("copy-status")).toHaveText("Order copied");
    const copied = await page.evaluate(() => window.__clipboard.copied);
    expect(copied).toEqual([
      [
        "Faust — Order Request",
        "",
        `${TITOS} — 6 (Promo next week)`,
        "",
        "Notes:",
        "Deliver Thursday morning.",
      ].join("\n"),
    ]);
    expect(copied[0]).not.toMatch(/suggest|\b9\b/i);
    await expect(page.getByTestId("copy-fallback")).toHaveCount(0);
  });

  test("shows a visible, selected fallback when the clipboard refuses", async ({
    page,
  }) => {
    await stubClipboard(page, "denied");
    await signIn(page);
    await openBarInventory(page);
    await savedFaustOrder(page);

    await page.getByRole("button", { name: "Copy Order" }).click();
    const fallback = page.getByTestId("copy-fallback");
    await expect(fallback).toBeVisible();
    await expect(fallback.getByRole("alert")).toContainText(
      "couldn't copy this automatically",
    );
    const box = fallback.getByLabel("Order text to copy");
    await expect(box).toHaveValue(`Faust — Order Request\n\n${TITOS} — 6`);
    await expect(box).toBeFocused();
    await expect(page.getByTestId("copy-status")).toHaveText("");
  });

  test("is unavailable until a line has a quantity, and says why (VOD-053)", async ({
    page,
  }) => {
    await stubClipboard(page, "ok");
    await signIn(page);
    await openBarInventory(page);
    await faustGroup(page)
      .getByRole("button", { name: "Create Order Draft" })
      .click();
    await expect(
      page.getByText("Add a quantity to at least one included line."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Copy Order" }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      page.getByRole("button", { name: "Export order" }),
    ).toBeDisabled();
    // aria-disabled (it must stay focusable): click anyway, nothing is copied.
    await page
      .getByRole("button", { name: "Copy Order" })
      .click({ force: true });
    expect(await page.evaluate(() => window.__clipboard.copied)).toEqual([]);
  });
});

test.describe("manager: CSV and XLSX export", () => {
  test.beforeEach(async ({ page }) => {
    await stubClipboard(page, "ok");
    await signIn(page);
    await openBarInventory(page);
  });

  test("CSV carries Suggested and Order Qty, and neutralises formula text (VOD-060/061)", async ({
    page,
  }) => {
    await savedFaustOrder(page, { itemNote: "=HYPERLINK(1)" });
    const file = await exportAs(page, "CSV");
    expect(file.name).toMatch(
      /^bar-inventory_.+_order-faust_\d{4}-\d{2}-\d{2}\.csv$/,
    );
    const lines = await csvLines(file.path);
    expect(lines[0]).toBe(
      "Vendor,Item,Size,Unit,SKU,Suggested,Order Qty,Item Note",
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(
      /^Faust,Tito's Handmade Vodka,750 mL,.*,9,6,'=HYPERLINK\(1\)$/,
    );
  });

  test("XLSX has an Order sheet and a Summary sheet (VOD-062)", async ({
    page,
  }) => {
    await savedFaustOrder(page, { vendorNote: "Deliver Thursday." });
    const file = await exportAs(page, "Excel (.xlsx)");
    expect(file.name).toMatch(/\.xlsx$/);
    const sheets = await readXlsxFile(file.path);
    expect(sheets.map((s) => s.sheet)).toEqual(["Order", "Summary"]);
    const order = sheets[0]!.data;
    expect(order[0]).toEqual([
      "Vendor",
      "Item",
      "Size",
      "Unit",
      "SKU",
      "Suggested",
      "Order Qty",
      "Item Note",
    ]);
    expect(order[1]![1]).toBe("Tito's Handmade Vodka");
    expect(order[1]![5]).toBe(9);
    expect(order[1]![6]).toBe(6);
    const summary = new Map(
      sheets[1]!.data.map((row) => [String(row[0]), row[1]]),
    );
    expect(summary.get("Vendor")).toBe("Faust");
    expect(summary.get("Status")).toBe("Draft");
    expect(summary.get("Vendor Note")).toBe("Deliver Thursday.");
    expect(summary.get("Suggested Total")).toBe(9);
    expect(summary.get("Planned Total")).toBe(6);
  });
});

test.describe("manager: Mark Sent and Sent history", () => {
  test.beforeEach(async ({ page }) => {
    await stubClipboard(page, "ok");
    await signIn(page);
    await openBarInventory(page);
  });

  async function confirmMarkSent(page: Page) {
    await page.getByRole("button", { name: "Mark Sent", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Mark this order as sent?",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Yes, mark as sent" }).click();
  }

  test("needs a quantity first (VOD-070)", async ({ page }) => {
    await faustGroup(page)
      .getByRole("button", { name: "Create Order Draft" })
      .click();
    await page.getByRole("button", { name: "Mark Sent", exact: true }).click();
    await expect(page.getByTestId("draft-error")).toContainText(
      "Add a quantity before marking this order sent.",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("confirms in plain words, then shows a read-only Sent order with Copy and Export (VOD-071/081)", async ({
    page,
  }) => {
    await savedFaustOrder(page, {
      itemNote: "weekend stock",
      vendorNote: "Deliver Thursday.",
    });
    await page.getByRole("button", { name: "Mark Sent", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Mark this order as sent?",
    });
    await expect(dialog).toContainText("outside The Lineup");
    await expect(dialog).toContainText("read-only");
    await expect(dialog).toContainText(
      "not receive inventory or change your stock counts",
    );
    await expect(dialog).toContainText("does not send anything");
    await dialog.getByRole("button", { name: "Yes, mark as sent" }).click();

    const order = page.getByTestId("sent-order");
    await expect(order).toBeVisible();
    await expect(page.getByTestId("sent-notice")).toContainText(
      "Order marked sent. It is now read-only, and your inventory was not changed.",
    );
    await expect(page.getByTestId("sent-meta")).toContainText("Sent by");
    // Focus lands on the order's heading, not at the top of the page.
    await expect(
      order.getByRole("heading", { name: "Faust", level: 2 }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Sent", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    // Read-only: nothing to type into, none of the draft controls.
    await expect(order.locator("input, textarea, select")).toHaveCount(0);
    for (const name of [
      "Save",
      "Fill from Suggestions",
      "Update suggestions",
      "Clear Draft",
      "Mark Sent",
    ]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(
        0,
      );
    }
    const line = order.getByTestId("sent-line");
    await expect(line).toContainText(TITOS);
    await expect(line).toContainText("9");
    await expect(line).toContainText("6");
    await expect(line).toContainText("weekend stock");
    await expect(page.getByTestId("sent-vendor-note")).toHaveText(
      "Deliver Thursday.",
    );
    await expect(order).toContainText("Suggested (at draft)");

    // Copy and Export still work on a Sent order (VOD-052 frozen labels).
    await page.getByRole("button", { name: "Copy Order" }).click();
    await expect(page.getByTestId("copy-status")).toHaveText("Order copied");
    expect(await page.evaluate(() => window.__clipboard.copied)).toEqual([
      `Faust — Order Request\n\n${TITOS} — 6 (weekend stock)\n\nNotes:\nDeliver Thursday.`,
    ]);
    const csv = await csvLines((await exportAs(page, "CSV")).path);
    expect(csv[1]).toMatch(/^Faust,Tito's Handmade Vodka,750 mL,.*,9,6,/);
    const book = await readXlsxFile(
      (await exportAs(page, "Excel (.xlsx)")).path,
    );
    const summary = new Map(
      book[1]!.data.map((row) => [String(row[0]), row[1]]),
    );
    expect(summary.get("Status")).toBe("Sent");
    expect(summary.get("Sent By")).toBeTruthy();
    expect(summary.get("Sent At")).toBeTruthy();
  });

  test("inventory is untouched, history lists the order, and a new draft can start (VOD-005/073/080)", async ({
    page,
  }) => {
    const before = await titosInventory(page);
    await tab(page, "Dashboard").click();
    await savedFaustOrder(page);
    await confirmMarkSent(page);
    await expect(page.getByTestId("sent-order")).toBeVisible();
    // Counts, status and last-updated are exactly as they were: Mark Sent
    // recorded a send, not a stock change.
    expect(await titosInventory(page)).toBe(before);

    await tab(page, "Order Drafts").click();
    // The Sent switch starts at Drafts again; the order is in Sent history.
    await page.getByRole("button", { name: "Sent", exact: true }).click();
    const row = page.getByTestId("sent-row");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Faust");
    await expect(row).toContainText("Maya Singh");
    await expect(page.getByTestId("sent-page-status")).toContainText(
      "Page 1 of 1 · 1–1 of 1 sent order",
    );
    // Open it again from the list, then go back.
    await row.getByRole("button", { name: /^View Faust order sent/ }).click();
    await expect(page.getByTestId("sent-order")).toBeVisible();
    await page.getByRole("button", { name: /Back to sent orders/ }).click();
    await expect(row).toHaveCount(1);

    // Drafts: Faust may be drafted again, starting from current stock.
    await page.getByRole("button", { name: "Drafts", exact: true }).click();
    await page.getByLabel("Start a draft for").selectOption({ label: "Faust" });
    await page.getByRole("button", { name: "Create Order Draft" }).click();
    await expect(qty(page)).toHaveValue("");
    await expect(page.getByTestId("draft-suggested")).toHaveText("9");
  });

  test("switching to Sent with unsaved edits asks first (VOD-045)", async ({
    page,
  }) => {
    await faustGroup(page)
      .getByRole("button", { name: "Create Order Draft" })
      .click();
    await qty(page).fill("6");
    const sent = page.getByRole("button", { name: "Sent", exact: true });
    await sent.click();
    const dialog = page.getByRole("dialog", {
      name: "You have unsaved changes",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Stay" }).click();
    await expect(qty(page)).toHaveValue("6");
    await sent.click();
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await expect(
      page.getByText(/No orders have been marked sent yet/),
    ).toBeVisible();
    await expect(page.getByTestId("order-draft-editor")).toHaveCount(0);
  });

  test("keyboard: Mark Sent opens from the keyboard, Escape cancels and focus returns (VOD-112)", async ({
    page,
  }) => {
    await savedFaustOrder(page);
    const markSent = page.getByRole("button", {
      name: "Mark Sent",
      exact: true,
    });
    await markSent.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Mark this order as sent?" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Mark this order as sent?" }),
    ).toBeHidden();
    await expect(markSent).toBeFocused();
    await expect(page.getByTestId("sent-order")).toHaveCount(0);
  });

  test("works without horizontal scroll and with large targets (VOD-110/111)", async ({
    page,
  }) => {
    await savedFaustOrder(page);
    await noPageHorizontalScroll(page, "draft editor");
    for (const name of ["Mark Sent", "Copy Order", "Export order"]) {
      const button = page.getByRole("button", { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(43);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(
        page.viewportSize()!.width + 1,
      );
    }
    // The open export options stay inside the viewport.
    await page.getByRole("button", { name: "Export order" }).click();
    await expect(
      page.getByRole("dialog", { name: "Export order options" }),
    ).toBeVisible();
    await noPageHorizontalScroll(page, "export options open");
    await page.keyboard.press("Escape");

    await confirmMarkSent(page);
    await expect(page.getByTestId("sent-order")).toBeVisible();
    await noPageHorizontalScroll(page, "sent order");
    await page.getByRole("button", { name: /Back to sent orders/ }).click();
    await expect(page.getByTestId("sent-row")).toBeVisible();
    await noPageHorizontalScroll(page, "sent list");
  });
});
