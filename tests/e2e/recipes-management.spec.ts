import { expect, test } from "@playwright/test";
test("R2-C copy, overwrite, archive, restore and archived index", async ({
  page,
}) => {
  await page.goto("/?tab=recipes&recipe=r1-test-citrus&mode=edit");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  const perfect = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Perfect Bartending Recipe" }),
  });
  const house = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "House Recipe" }) });
  await perfect
    .getByLabel("Method", { exact: true })
    .fill("R2C unsaved current Perfect");
  await expect(
    page.getByRole("button", { name: "Archive Recipe", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Copy Perfect Recipe/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(house.getByLabel("Method", { exact: true })).toHaveValue(
    "R1 synthetic method",
  );
  await page.getByRole("button", { name: /Copy Perfect Recipe/ }).click();
  await page
    .getByRole("button", { name: "Replace House", exact: true })
    .click();
  await expect(house.getByLabel("Method", { exact: true })).toHaveValue(
    "R2C unsaved current Perfect",
  );
  await expect(
    page.getByRole("heading", { name: "House Recipe options" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Edit Recipe", exact: true }).click();
  await expect(house.getByLabel("Method", { exact: true })).toHaveValue(
    "R2C unsaved current Perfect",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Archive Recipe", exact: true })
    .click();
  await expect(
    page.getByText("Hidden from staff. You can restore it later."),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive Recipe", exact: true })
    .click();
  await expect(page.getByText("Archived — hidden from staff")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit Recipe", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: /Bar Recipes/ }).click();
  await expect(page.getByText("R1 Test Citrus", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Show archived").check();
  await page.getByRole("link", { name: /R1 Test Citrus/ }).click();
  await page
    .getByRole("button", { name: "Restore Recipe", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore Recipe", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit Recipe", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("R2-C category management, fallback, dirty close and focus", async ({
  page,
}) => {
  await page.goto("/?tab=recipes");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  await page.getByRole("button", { name: "Manage Categories" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Manage Categories",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Move Others up" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("switch", { name: "Active Others" }),
  ).toBeDisabled();
  await dialog.getByLabel("New category name").fill("R2C synthetic category");
  await dialog
    .getByRole("button", { name: "Add category", exact: true })
    .click();
  const row = dialog.getByRole("region", {
    name: "R2C synthetic category",
    exact: true,
  });
  await row.getByRole("textbox").fill("R2C renamed category");
  await row.getByRole("button", { name: "Rename", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Move R2C renamed category up" })
    .click();
  await dialog
    .getByRole("button", { name: "Move R2C renamed category down" })
    .click();
  await dialog
    .getByRole("switch", { name: "Active R2C renamed category" })
    .uncheck();
  await dialog
    .getByRole("switch", { name: "Active R2C renamed category" })
    .check();
  await dialog.getByLabel("New category name").fill("Unsaved");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(dialog.getByLabel("New category name")).toHaveValue("Unsaved");
  await dialog.getByRole("button", { name: "Close categories" }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Manage Categories" }),
  ).toBeFocused();
});
