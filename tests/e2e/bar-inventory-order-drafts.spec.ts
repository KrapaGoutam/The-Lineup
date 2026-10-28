import { expect, test, type Page } from "@playwright/test";

// Bar Inventory / Vendor Order Drafts V1, VOD-2: the Order Drafts tab, editor
// and Dashboard → Order soon CTA in demo mode (in-memory, same pure engine as
// the unit tests). Seeded: Faust has one Critical item (Tito's, total 3,
// par 12 → Suggested 9); Del Papa has one Low item (Modelo). Demo passcodes:
// 2468 manager, 1357 staff.

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
const include = (page: Page) =>
  page.getByLabel(`Include ${TITOS} in the order`);
const save = (page: Page) => page.getByRole("button", { name: "Save" });
const faustGroup = (page: Page) =>
  page.locator('[data-testid="order-group"][data-vendor="Faust"]');

/** Dashboard → Order soon → Faust → Create Order Draft. */
async function createFaustDraft(page: Page) {
  await faustGroup(page)
    .getByRole("button", { name: "Create Order Draft" })
    .click();
  await expect(page.getByTestId("order-draft-editor")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Faust", level: 2 }),
  ).toBeVisible();
}

test.describe("manager", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await openBarInventory(page);
  });

  test("Order Drafts is a Bar Inventory tab between Inventory and Manage (VOD-100)", async ({
    page,
  }) => {
    await expect(
      page
        .getByRole("tablist", { name: "Bar Inventory views" })
        .getByRole("tab"),
    ).toHaveText(["Dashboard", "Inventory", "Order Drafts", "Manage"]);
    await tab(page, "Order Drafts").click();
    await expect(tab(page, "Order Drafts")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("region", { name: "Order Drafts view" }),
    ).toBeVisible();
    // Empty state, and Unassigned can never be picked.
    await expect(page.getByText(/No order drafts yet/)).toBeVisible();
    const options = await page
      .getByLabel("Start a draft for")
      .locator("option")
      .allTextContents();
    expect(options).toEqual(["Del Papa", "Faust"]);
  });

  test("Dashboard CTA creates the draft, then offers Open; never a second draft (VOD-101/102)", async ({
    page,
  }) => {
    const group = faustGroup(page);
    await expect(
      group.getByRole("button", { name: "Open Order Draft" }),
    ).toHaveCount(0);
    // The Dashboard stays the alert surface: no quantity inputs on it.
    await expect(
      page.getByRole("textbox", { name: /Order quantity/ }),
    ).toHaveCount(0);

    await createFaustDraft(page);
    await expect(tab(page, "Order Drafts")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Suggested Order is read-only text beside the manager's own quantity.
    const line = page.getByTestId("draft-line");
    await expect(line.getByTestId("draft-suggested")).toHaveText("9");
    await expect(qty(page)).toHaveValue("");

    await tab(page, "Dashboard").click();
    await expect(
      group.getByRole("button", { name: "Create Order Draft" }),
    ).toHaveCount(0);
    await group.getByRole("button", { name: "Open Order Draft" }).click();
    await expect(page.getByTestId("order-draft-editor")).toBeVisible();
    await expect(
      page.getByTestId("draft-list").getByRole("listitem"),
    ).toHaveCount(1);
  });

  test("quantity-only edit persists after leaving and reopening the tab (VOD-046 user flow)", async ({
    page,
  }) => {
    await createFaustDraft(page);
    await qty(page).fill("5");
    await expect(page.getByTestId("draft-save-bar")).toHaveAttribute(
      "data-state",
      "dirty",
    );
    await save(page).click();
    await expect(page.getByText("Order draft saved.")).toBeVisible();
    await expect(page.getByTestId("draft-save-bar")).toHaveAttribute(
      "data-state",
      "clean",
    );

    await tab(page, "Inventory").click();
    await tab(page, "Order Drafts").click();
    await expect(qty(page)).toHaveValue("5");
    await expect(page.getByTestId("draft-planned-total")).toHaveText("5");
    // The system's suggestion did not move.
    await expect(page.getByTestId("draft-suggested")).toHaveText("9");

    // blank → 0 is a real quantity; 5 → blank clears it.
    await qty(page).fill("0");
    await save(page).click();
    await expect(page.getByTestId("draft-save-bar")).toHaveAttribute(
      "data-state",
      "clean",
    );
    await tab(page, "Dashboard").click();
    await tab(page, "Order Drafts").click();
    await expect(qty(page)).toHaveValue("0");
    await qty(page).fill("");
    await save(page).click();
    await expect(page.getByTestId("draft-save-bar")).toHaveAttribute(
      "data-state",
      "clean",
    );
    await tab(page, "Inventory").click();
    await tab(page, "Order Drafts").click();
    await expect(qty(page)).toHaveValue("");
  });

  test("notes, include/exclude and totals; invalid input is rejected (VOD-015/021)", async ({
    page,
  }) => {
    await createFaustDraft(page);
    await qty(page).fill("abc");
    await qty(page).blur();
    await expect(qty(page)).toHaveAttribute("aria-invalid", "true");
    await save(page).click();
    await expect(page.getByTestId("draft-error")).toContainText(
      "Nothing was saved",
    );

    await qty(page).fill("12");
    await note(page).fill("Weekend stock\nfor the patio");
    await page.getByLabel("Vendor note").fill("Deliver Thursday morning.");
    await expect(page.getByTestId("draft-planned-total")).toHaveText("12");
    await expect(page.getByTestId("draft-suggested-total")).toHaveText("9");
    await include(page).uncheck();
    await expect(page.getByTestId("draft-planned-total")).toHaveText("0");
    await expect(page.getByTestId("draft-line")).toHaveAttribute(
      "data-included",
      "false",
    );
    await expect(
      page.getByTestId("draft-line").getByText("Excluded"),
    ).toBeVisible();
    await save(page).click();
    await expect(page.getByText("Order draft saved.")).toBeVisible();

    await tab(page, "Inventory").click();
    await tab(page, "Order Drafts").click();
    await expect(qty(page)).toHaveValue("12");
    await expect(note(page)).toHaveValue("Weekend stock\nfor the patio");
    await expect(page.getByLabel("Vendor note")).toHaveValue(
      "Deliver Thursday morning.",
    );
    // Excluded stays visible, with its values, until the manager includes it.
    await expect(include(page)).not.toBeChecked();
    await expect(page.getByTestId("draft-totals")).not.toContainText("$");
  });

  test("Fill from Suggestions and Clear Draft (VOD-030/032)", async ({
    page,
  }) => {
    await createFaustDraft(page);
    await page.getByRole("button", { name: "Fill from Suggestions" }).click();
    await expect(page.getByText("Filled from suggestions.")).toBeVisible();
    await expect(qty(page)).toHaveValue("9");
    await expect(page.getByTestId("draft-planned-total")).toHaveText("9");

    await qty(page).fill("4");
    await page.getByLabel("Vendor note").fill("Call first");
    await save(page).click();
    await expect(page.getByTestId("draft-save-bar")).toHaveAttribute(
      "data-state",
      "clean",
    );

    // A typed quantity is never overwritten without an explicit confirmation.
    await page.getByRole("button", { name: "Fill from Suggestions" }).click();
    const fill = page.getByRole("dialog", { name: "Fill from Suggestions" });
    await expect(fill.getByLabel(/Fill empty quantities only/)).toBeChecked();
    await fill.getByRole("button", { name: "Fill empty only" }).click();
    await expect(qty(page)).toHaveValue("4");

    // Clear confirms, names what is lost, and can be cancelled.
    await page.getByRole("button", { name: "Clear Draft" }).click();
    const clear = page.getByRole("dialog", { name: "Clear this draft?" });
    await expect(clear).toContainText("stock counts are not changed");
    await clear.getByRole("button", { name: "Cancel" }).click();
    await expect(qty(page)).toHaveValue("4");
    await page.getByRole("button", { name: "Clear Draft" }).click();
    await page
      .getByRole("dialog", { name: "Clear this draft?" })
      .getByRole("button", { name: "Clear draft" })
      .click();
    await expect(page.getByText("Draft cleared.")).toBeVisible();
    await expect(qty(page)).toHaveValue("");
    await expect(page.getByLabel("Vendor note")).toHaveValue("");
    // Suggested stays; inventory is untouched (Total on the line is the snapshot).
    await expect(page.getByTestId("draft-suggested")).toHaveText("9");
  });

  test("leaving with unsaved edits asks Save / Discard / Stay (VOD-045)", async ({
    page,
  }) => {
    await createFaustDraft(page);
    await qty(page).fill("7");

    await tab(page, "Inventory").click();
    const dialog = page.getByRole("dialog", {
      name: "You have unsaved changes",
    });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Stay" }).click();
    await expect(tab(page, "Order Drafts")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(qty(page)).toHaveValue("7");

    await tab(page, "Inventory").click();
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await expect(tab(page, "Inventory")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await tab(page, "Order Drafts").click();
    await expect(qty(page)).toHaveValue("");

    await qty(page).fill("8");
    await tab(page, "Manage").click();
    await dialog.getByRole("button", { name: "Save and continue" }).click();
    await expect(tab(page, "Manage")).toHaveAttribute("aria-selected", "true");
    await tab(page, "Order Drafts").click();
    await expect(qty(page)).toHaveValue("8");
  });

  test("keyboard: dialogs open from the keyboard, Escape cancels and focus returns (VOD-112)", async ({
    page,
  }) => {
    await createFaustDraft(page);
    const clearButton = page.getByRole("button", { name: "Clear Draft" });
    await clearButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Clear this draft?" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Clear this draft?" }),
    ).toBeHidden();
    await expect(clearButton).toBeFocused();

    // Fields are reachable in order and carry programmatic labels.
    await qty(page).focus();
    await page.keyboard.type("6");
    await page.keyboard.press("Tab");
    await expect(note(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(include(page)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(include(page)).not.toBeChecked();
  });

  test("usable without horizontal scroll; targets are large enough (VOD-110/111)", async ({
    page,
  }) => {
    await createFaustDraft(page);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    const viewport = page.viewportSize()!;
    for (const control of [qty(page), note(page), include(page)]) {
      await control.scrollIntoViewIfNeeded();
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    const inputBox = (await qty(page).boundingBox())!;
    expect(inputBox.height).toBeGreaterThanOrEqual(43);
    const includeLabel = page.locator("label").filter({ has: include(page) });
    expect((await includeLabel.boundingBox())!.height).toBeGreaterThanOrEqual(
      43,
    );
    for (const name of ["Save", "Fill from Suggestions", "Clear Draft"]) {
      const button = page.getByRole("button", { name, exact: true });
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(43);
    }
    // Save and edit still work at this size.
    await qty(page).fill("3");
    await save(page).click();
    await expect(page.getByText("Order draft saved.")).toBeVisible();
  });
});

test("staff cannot reach Bar Inventory or Order Drafts (VOD-093)", async ({
  page,
}) => {
  await signIn(page, "1357");
  const dock = page.getByRole("navigation", { name: "Mobile navigation" });
  if (await dock.isVisible()) {
    await dock.getByRole("button", { name: "More" }).click();
    await expect(
      page
        .getByRole("dialog", { name: "More" })
        .getByRole("button", { name: "Bar Inventory" }),
    ).toHaveCount(0);
  } else {
    await expect(
      page
        .locator('[data-nav-tier="secondary"]')
        .filter({ hasText: "Bar Inventory" }),
    ).toHaveCount(0);
  }
  await expect(page.getByRole("tab", { name: "Order Drafts" })).toHaveCount(0);
});
