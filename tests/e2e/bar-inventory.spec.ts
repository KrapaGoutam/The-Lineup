import { expect, test, type Page } from "@playwright/test";

// Bar Inventory V1 / BI-1 browser coverage in demo mode (the in-memory catalog
// engine mirrors the database RPCs; the database itself is covered by pgTAP
// 0033/0034 and the hosted suites). Demo passcodes: 2468 Maya Singh (manager),
// 1357 Mia Chen (staff), 9999 owner.

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

/** Bar Inventory is a secondary module: desktop secondary tier, mobile "More". */
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

async function openManage(page: Page) {
  await openBarInventory(page);
  await page.getByRole("tab", { name: "Manage", exact: true }).click();
}

async function noPageHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("a manager reaches Bar Inventory from the secondary tier / More (BI-NAV-001/002/004)", async ({
  page,
}) => {
  await signIn(page, "2468");
  await openBarInventory(page);

  // Three views only; Inventory (counts) is the default landing.
  const views = page.getByRole("tablist", { name: "Bar Inventory views" });
  await expect(views.getByRole("tab")).toHaveText([
    "Dashboard",
    "Inventory",
    "Manage",
  ]);
  await expect(views.getByRole("tab", { name: "Inventory" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // Primary reachability is untouched.
  const dock = page.getByRole("navigation", { name: "Mobile navigation" });
  if (await dock.isVisible()) {
    await expect(dock.getByRole("button", { name: "Tasks" })).toBeVisible();
  } else {
    await expect(page.locator('[data-nav-tier="primary"]')).toHaveText([
      /Table Allocation/,
      /Tasks/,
    ]);
  }
  await noPageHorizontalScroll(page);
});

test("staff never see Bar Inventory (BI-NAV-003)", async ({ page }) => {
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
});

test("vendors: add, spelling variants are refused with the existing name, rename, deactivate (BI-CAT-002/004)", async ({
  page,
}) => {
  await signIn(page, "2468");
  await openManage(page);
  await page.getByRole("tab", { name: "Vendors" }).click();

  // Seeded vendors plus the read-only system vendor.
  const table = page.getByRole("table", { name: "Vendors" });
  await expect(table.getByRole("row", { name: /Unassigned/ })).toContainText(
    "System",
  );
  await expect(table.getByRole("row", { name: /Faust/ })).toBeVisible();

  await page.getByRole("button", { name: "Add vendor" }).click();
  let dialog = page.getByRole("dialog", { name: "Add vendor" });
  await dialog.getByLabel("Vendor name").fill("DelPapa");
  await dialog.getByRole("button", { name: "Add vendor" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    'A vendor named "Del Papa" already exists.',
  );

  await dialog.getByLabel("Vendor name").fill("Brewer Supply");
  await dialog.getByRole("button", { name: "Add vendor" }).click();
  await expect(dialog).toBeHidden();
  await expect(table.getByRole("row", { name: /Brewer Supply/ })).toBeVisible();

  await table.getByRole("button", { name: "Edit Brewer Supply" }).click();
  dialog = page.getByRole("dialog", { name: "Edit vendor" });
  await dialog.getByLabel("Vendor name").fill("Brewer Supply Co");
  await dialog.getByRole("button", { name: "Save vendor" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    table.getByRole("row", { name: /Brewer Supply Co/ }),
  ).toBeVisible();

  // Deactivate hides it until "Show archived" is ticked; nothing is deleted.
  await table
    .getByRole("button", { name: "Deactivate Brewer Supply Co" })
    .click();
  await expect(
    table.getByRole("row", { name: /Brewer Supply Co/ }),
  ).toHaveCount(0);
  await page.getByLabel("Show archived").check();
  await expect(
    table.getByRole("row", { name: /Brewer Supply Co/ }),
  ).toContainText("Archived");
  await table
    .getByRole("button", { name: "Reactivate Brewer Supply Co" })
    .click();
  await page.getByLabel("Show archived").uncheck();
  await expect(
    table.getByRole("row", { name: /Brewer Supply Co/ }),
  ).toContainText("Active");
  await noPageHorizontalScroll(page);
});

test("products: identity, units (Other), inline new vendor, archive (BI-CAT-007/008/009)", async ({
  page,
}) => {
  await signIn(page, "9999");
  await openManage(page);
  await page.getByRole("tab", { name: "Products" }).click();

  const table = page.getByRole("table", { name: "Products" });
  await expect(
    table.getByRole("row", { name: /Tito's Handmade Vodka/ }),
  ).toContainText("Faust");

  // The same vendor + name + size + unit is refused, whatever the formatting.
  await page.getByRole("button", { name: "Add product" }).first().click();
  let dialog = page.getByRole("dialog", { name: "Add product" });
  await dialog.getByLabel("Vendor", { exact: true }).selectOption({
    label: "Faust",
  });
  await dialog.getByLabel("Product name").fill("TITOS handmade vodka");
  await dialog.getByLabel("Size").fill("750ml");
  await dialog.getByRole("button", { name: "Add product" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "That product already exists",
  );

  // A different size is a different product.
  await dialog.getByLabel("Size").fill("1.75 L");
  await dialog.getByRole("button", { name: "Add product" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    table.getByRole("row", { name: /TITOS handmade vodka.*1\.75 L/ }),
  ).toBeVisible();

  // Unit "Other" needs a name; a brand-new vendor can be created inline.
  await page.getByRole("button", { name: "Add product" }).first().click();
  dialog = page.getByRole("dialog", { name: "Add product" });
  await dialog.getByLabel("Product name").fill("Growler pour");
  await dialog.getByLabel("Vendor", { exact: true }).selectOption({
    label: "＋ New vendor…",
  });
  await dialog.getByLabel("New vendor name").fill("Local Brewery");
  await dialog.getByRole("button", { name: "Add vendor", exact: true }).click();
  await expect(dialog.getByLabel("Vendor", { exact: true })).toHaveValue(/.+/);
  await expect(
    dialog.getByLabel("Vendor", { exact: true }).locator("option:checked"),
  ).toHaveText("Local Brewery");
  await dialog.getByLabel("Unit", { exact: true }).selectOption("other");
  await dialog.getByLabel("Unit name").fill("Growler");
  await dialog.getByRole("button", { name: "Add product" }).click();
  await expect(dialog).toBeHidden();
  const growler = table.getByRole("row", { name: /Growler pour/ });
  await expect(growler).toContainText("Local Brewery");
  await expect(growler).toContainText("Growler");

  // Archive keeps the row (hidden until "Show archived").
  await table.getByRole("button", { name: "Archive Growler pour" }).click();
  await expect(table.getByRole("row", { name: /Growler pour/ })).toHaveCount(0);
  await page.getByLabel("Show archived").check();
  await expect(growler).toContainText("Archived");
  await noPageHorizontalScroll(page);
});

test("categories and subcategories: a subcategory belongs to a category (BI-CAT-006)", async ({
  page,
}) => {
  await signIn(page, "2468");
  await openManage(page);
  await page.getByRole("tab", { name: "Categories" }).click();

  const table = page.getByRole("table", { name: "Categories" });
  await expect(
    table.getByRole("row", { name: /Spirits/ }).first(),
  ).toBeVisible();
  await expect(table.getByRole("row", { name: /↳ Vodka/ })).toBeVisible();

  await page.getByRole("button", { name: "Add category" }).first().click();
  let dialog = page.getByRole("dialog", { name: "Add category" });
  await dialog.getByLabel("Category name").fill(" SPIRITS ");
  await dialog.getByRole("button", { name: "Add category" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    'A category named "Spirits" already exists.',
  );
  await dialog.getByLabel("Category name").fill("Wine");
  await dialog.getByRole("button", { name: "Add category" }).click();
  await expect(dialog).toBeHidden();

  await table.getByRole("button", { name: "Add subcategory to Wine" }).click();
  dialog = page.getByRole("dialog", { name: "Add subcategory" });
  await expect(dialog.getByLabel("Category", { exact: true })).toHaveValue(
    /.+/,
  );
  await dialog.getByLabel("Subcategory name").fill("Red");
  await dialog.getByRole("button", { name: "Add subcategory" }).click();
  await expect(dialog).toBeHidden();
  await expect(table.getByRole("row", { name: /↳ Red/ })).toBeVisible();
});
