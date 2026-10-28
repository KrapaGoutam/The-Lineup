import { expect, test } from "@playwright/test";
import { assertServerIsDev, PINS, signIn } from "./support/dev-app";

test.beforeAll(async () => {
  await assertServerIsDev();
});
for (const role of ["TestManager", "TestServer1"] as const) {
  test(`${role} can read the empty Recipes landing`, async ({ page }) => {
    await signIn(page, PINS[role]);
    const recipes = page.getByRole("button", { name: "Recipes", exact: true });
    if (!(await recipes.first().isVisible()))
      await page.getByRole("button", { name: "More", exact: true }).click();
    await recipes.first().click();
    await expect(
      page.getByRole("heading", { name: "Bar Recipes" }),
    ).toBeVisible();
    await expect(
      page.getByText("No recipes have been added yet."),
    ).toBeVisible();
    await expect(page.getByRole("alert")).not.toContainText(
      "Recipes could not be loaded.",
    );
  });
}
