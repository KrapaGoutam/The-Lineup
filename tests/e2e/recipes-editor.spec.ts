import { expect, test, type Page } from "@playwright/test";
async function signIn(page: Page, url: string, pin = "2468") {
  await page.goto(url);
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(pin);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible();
}
test("creates a House-only recipe without a Perfect placeholder", async ({
  page,
}) => {
  await signIn(page, "/r/the-monks?tab=recipes");
  await page.getByRole("button", { name: "Add Recipe", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("House only synthetic");
  await page.getByRole("button", { name: "Add House Recipe" }).click();
  const house = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "House Recipe" }) });
  await house.getByLabel("Method", { exact: true }).fill("Stir");
  await house
    .getByLabel("Presentation notes", { exact: true })
    .fill("Large clear cube");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Recipe saved", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByTestId("recipe-single")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "House Recipe", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Perfect Bartending Recipe" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Jump to recipe" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Quick glance" })
      .getByText("Garnish", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Perfect Presentation")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("management adds, edits and renumbers a recipe in memory", async ({
  page,
}) => {
  await signIn(page, "/r/the-monks?tab=recipes");
  await page.getByRole("button", { name: "Add Recipe", exact: true }).click();
  await expect(page).toHaveURL(/mode=new/);
  await expect(page.getByLabel("Recipe number", { exact: true })).toHaveValue(
    "24",
  );
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Name", { exact: true }).fill("R2B synthetic drink");
  await page.getByLabel("Base spirit", { exact: true }).fill("Custom spirit");
  await page.getByLabel("Contains alcohol").uncheck();
  await page.getByLabel("Popular", { exact: true }).check();
  await page.getByLabel("On menu", { exact: true }).check();
  await page.getByLabel("Method", { exact: true }).fill("Custom method");
  await page
    .getByRole("button", { name: "Add ingredient", exact: true })
    .click();
  await page
    .getByLabel("Ingredient name", { exact: true })
    .fill("Synthetic ingredient");
  await page.getByLabel("Amount", { exact: true }).fill("To taste");
  await page.getByLabel("Unit", { exact: true }).fill("Custom unit");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await page
    .getByLabel("Instruction", { exact: true })
    .fill("Synthetic instruction");
  await page.getByRole("button", { name: "Add garnish", exact: true }).click();
  await page
    .getByLabel("Garnish name", { exact: true })
    .fill("Synthetic garnish");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit Recipe", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Recipe saved", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(
    /\/r\/the-monks\?tab=recipes&recipe=r2b-synthetic-drink&mode=edit$/,
  );
  await expect(page.getByRole("button", { name: "Add photo" })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "R2B synthetic drink",
  );
  await expect(page.getByLabel("Contains alcohol")).not.toBeChecked();
  await expect(page.getByLabel("Method", { exact: true })).toHaveValue(
    "Custom method",
  );
  await page.getByLabel("Recipe number", { exact: true }).fill("38");
  await page.getByLabel("Name", { exact: true }).fill("R2B renamed drink");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /38.*R2B renamed drink/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(/recipe=r2b-synthetic-drink$/);
});
test("edits existing Perfect and House and reorders all child lists", async ({
  page,
}) => {
  await signIn(page, "/?tab=recipes&recipe=r1-test-citrus&mode=edit");
  const perfect = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Perfect Bartending Recipe" }),
  });
  const house = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "House Recipe" }) });
  await perfect
    .getByLabel("Method", { exact: true })
    .fill("R2B Perfect method");
  await house.getByLabel("Method", { exact: true }).fill("R2B House method");
  for (const [singular, label, text] of [
    ["ingredient", "Ingredient name", "Second ingredient"],
    ["step", "Instruction", "Second step"],
    ["garnish", "Garnish name", "Second garnish"],
  ]) {
    await perfect
      .getByRole("button", { name: `Add ${singular}`, exact: true })
      .click();
    await perfect.getByLabel(label, { exact: true }).nth(1).fill(text);
    await perfect
      .getByRole("button", { name: `Move ${singular} 2 up`, exact: true })
      .click();
    await expect(
      perfect.getByLabel(label, { exact: true }).first(),
    ).toHaveValue(text);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /R1 Test Citrus/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Recipe", exact: true }).click();
  await expect(perfect.getByLabel("Method", { exact: true })).toHaveValue(
    "R2B Perfect method",
  );
  await expect(house.getByLabel("Method", { exact: true })).toHaveValue(
    "R2B House method",
  );
  await expect(
    perfect.getByLabel("Ingredient name", { exact: true }).first(),
  ).toHaveValue("Second ingredient");
  await expect(
    perfect.getByLabel("Instruction", { exact: true }).first(),
  ).toHaveValue("Second step");
  await expect(
    perfect.getByLabel("Garnish name", { exact: true }).first(),
  ).toHaveValue("Second garnish");
});
test("dirty Cancel keeps edits or explicitly discards", async ({ page }) => {
  await signIn(page, "/?tab=recipes");
  await page.getByRole("button", { name: "Add Recipe", exact: true }).click();
  await page
    .getByLabel("Name", { exact: true })
    .fill("Unsaved synthetic drink");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Unsaved synthetic drink",
  );
  await page.goBack();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Unsaved synthetic drink",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bar Recipes", exact: true }),
  ).toBeVisible();
});
test("Staff manual editor URLs fall back to read-only", async ({ page }) => {
  await signIn(page, "/?tab=recipes&mode=new", "1357");
  await expect(
    page.getByRole("heading", { name: "Bar Recipes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Add Recipe|Edit Recipe|Save/ }),
  ).toHaveCount(0);
  await page.goto("/?tab=recipes&recipe=r1-test-citrus&mode=edit");
  await page.waitForSelector('body[data-hydrated="true"]');
  // Demo sessions intentionally reset on a full load.
  await page.getByLabel("Restaurant passcode").fill("1357");
  await expect(
    page.getByRole("heading", { name: /R1 Test Citrus/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Add Recipe|Edit Recipe|Save/ }),
  ).toHaveCount(0);
});
