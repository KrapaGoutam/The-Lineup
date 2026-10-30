import { expect, test, type Page, type Locator } from "@playwright/test";

async function openModule(page: Page, name: string) {
  const dock = page.getByRole("navigation", { name: "Mobile navigation" });
  if (await dock.isVisible()) {
    await dock.getByRole("button", { name: "More", exact: true }).click();
    await page
      .getByRole("dialog", { name: "More", exact: true })
      .getByRole("button", { name, exact: true })
      .click();
  } else {
    const item = page
      .locator('[data-nav-tier="secondary"]')
      .filter({ hasText: name });
    await expect(item).toHaveCount(1);
    await item.click();
    await expect(item).toHaveAttribute("aria-current", "page");
  }
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

async function visibleFocus(page: Page, control: Locator, theme: string) {
  await control.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(control).toBeFocused();
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const style = getComputedStyle(element);
        return (
          element.matches(":focus-visible") &&
          style.boxShadow !== "none" &&
          /2px/.test(style.boxShadow)
        );
      }),
    )
    .toBe(true);
  expect(
    await control.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ring")
        .trim(),
    ),
  ).toBe(theme === "light" ? "#9a4a00" : "#f2a65a");
}

for (const theme of ["light", "dark"]) {
  test(`Recipes and Inventory isolate navigation, reads, filters and dialogs (${theme})`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
    await page.addInitScript(
      (value) => localStorage.setItem("serviceflow-theme", value),
      theme,
    );
    await page.goto("/r/the-monks?tab=bar-inventory");
    await page.waitForSelector('body[data-hydrated="true"]');
    await page.getByLabel("Restaurant passcode").fill("2468");
    await expect(
      page.getByRole("heading", { name: "Bar Inventory", exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await noOverflow(page);
    await page.getByRole("tab", { name: "Inventory", exact: true }).click();
    const search = page.getByRole("searchbox", { name: "Search Inventory" });
    await expect(search).toBeVisible();
    const rowsBefore = await page.getByTestId("bar-inventory").innerText();
    await visibleFocus(page, search, theme);
    await search.fill("integration-no-inventory-match");
    await openModule(page, "Recipes");
    await expect(page).toHaveURL(/tab=recipes/);
    await expect(page.getByLabel("Search recipes")).toHaveValue("");
    await page.getByLabel("Search recipes").fill("citrus");
    await page.getByRole("link", { name: /R1 Test Citrus/ }).click();
    await expect(
      page.getByRole("heading", { name: /R1 Test Citrus/ }),
    ).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: test.info().outputPath("recipe-detail.png"),
    });
    await page.goBack();
    await expect(page.getByLabel("Search recipes")).toBeVisible();
    await page.getByLabel("Search recipes").fill("");
    await page
      .getByRole("button", { name: "Picture Book", exact: true })
      .click();
    await noOverflow(page);
    const categories = page.getByRole("button", {
      name: "Manage Categories",
      exact: true,
    });
    await visibleFocus(page, categories, theme);
    await categories.click();
    const dialog = page.getByRole("dialog", {
      name: "Manage Categories",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(document.activeElement?.closest("dialog"))),
      )
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(categories).toBeFocused();
    await openModule(page, "Bar Inventory");
    await expect(page).toHaveURL(/tab=bar-inventory/);
    await expect(
      page.getByRole("heading", { name: "Bar Inventory", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("tab", { name: "Inventory", exact: true }).click();
    await expect(search).toHaveValue("integration-no-inventory-match");
    await search.fill("");
    await expect
      .poll(() => page.getByTestId("bar-inventory").innerText())
      .toBe(rowsBefore);
    await noOverflow(page);
    await page.screenshot({ path: test.info().outputPath("inventory.png") });
    const adjust = page
      .getByRole("button", { name: /^Adjust / })
      .filter({ visible: true })
      .first();
    await adjust.click();
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await openModule(page, "Recipes");
    await expect(page.getByLabel("Search recipes")).toHaveValue("");
    await expect(
      page.getByRole("heading", { name: "Bar Recipes", exact: true }),
    ).toBeVisible();
    await noOverflow(page);
    await page.goto("/r/the-monks?tab=recipes&recipe=r1-test-citrus");
    await page.waitForSelector('body[data-hydrated="true"]');
    await page.getByLabel("Restaurant passcode").fill("2468");
    await expect(
      page.getByRole("heading", { name: /R1 Test Citrus/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Edit Recipe", exact: true }),
    ).toBeVisible();
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
}
