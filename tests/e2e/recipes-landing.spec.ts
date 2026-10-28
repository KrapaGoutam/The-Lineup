import { expect, test, type Page } from "@playwright/test";
async function signIn(page: Page, url: string, code: string) {
  await page.goto(url);
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(code);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}
async function open(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  if (!(await button.first().isVisible()))
    await page.getByRole("button", { name: "More", exact: true }).click();
  await button.first().click();
}
test("management can navigate list and browser history", async ({ page }) => {
  await signIn(page, "/", "2468");
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await open(page, "Recipes");
  await expect(
    page.getByRole("heading", { name: "Bar Recipes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /R1 Test Cocktails/ }),
  ).toBeVisible();
  await expect(page.getByText("R1 Test Citrus")).toBeVisible();
  await expect(page.getByText("23", { exact: true })).toBeVisible();
  await page.getByLabel("Search recipes").fill("highball");
  await expect(
    page.getByRole("heading", { name: "Results (1)" }),
  ).toBeVisible();
  await open(page, "Schedule");
  await expect(page).toHaveURL(/tab=schedule/);
  await expect(
    page.getByRole("heading", { name: "Weekly & monthly roster" }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Bar Recipes" }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Weekly & monthly roster" }),
  ).toBeVisible();
});
test("staff can open Recipes on a restaurant route", async ({ page }) => {
  await signIn(page, "/r/the-monks?tab=recipes", "1357");
  await expect(
    page.getByRole("heading", { name: "Bar Recipes" }),
  ).toBeVisible();
  await expect(page.getByText("R1 Test Citrus")).toBeVisible();
  await expect(page).toHaveURL(/\/r\/the-monks\?tab=recipes/);
});

test("staff can reach Recipes from navigation", async ({ page }) => {
  await signIn(page, "/", "1357");
  await open(page, "Recipes");
  await expect(
    page.getByRole("heading", { name: "Bar Recipes" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/tab=recipes/);
  await expect(page.getByRole("button", { name: /Add Recipe/i })).toHaveCount(
    0,
  );
});
