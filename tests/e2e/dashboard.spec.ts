import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await page.getByRole("button", { name: "Open workspace" }).click();
}

test("manager can use all three operational modules", async ({ page }) => {
  await signIn(page, "2468");

  await expect(
    page.getByRole("heading", { name: "Weekly & monthly roster" }),
  ).toBeVisible();
  await expect(page.getByText("Manager access")).toBeVisible();
  await expect(page.getByRole("button", { name: /Publish/ })).toBeVisible();

  await page
    .getByRole("button", { name: "Table allocation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Table allocation rotation" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear board" })).toBeVisible();

  await page.getByRole("button", { name: "Tip split", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tip split" })).toBeVisible();
  await expect(page.getByText("$17.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("$5.00", { exact: true }).first()).toBeVisible();
});

test("server sees published schedule, own allocation input, and own tip estimate", async ({
  page,
}) => {
  await signIn(page, "1357");

  await expect(page.getByText("Server access")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add shift" })).toHaveCount(0);

  await page
    .getByRole("button", { name: "Table allocation", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Clear board" })).toHaveCount(
    0,
  );
  await expect(
    page.locator('input[aria-label="Table number or combined tables"]:enabled'),
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Tip split", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My tip estimate" }),
  ).toBeVisible();
  await expect(page.getByText("$5.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finalize day" })).toHaveCount(
    0,
  );
});

test("unregistered user can self-register and lands in the app", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Not registered? Create an account" })
    .click();
  await page.getByLabel("Your name").fill("New Server");
  await page.getByLabel("Phone or email").fill("server@example.com");
  await page.getByLabel("Choose a passcode").fill("4321");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Server access")).toBeVisible();
});

test("registering with a passcode already in use shows an error", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Not registered? Create an account" })
    .click();
  await page.getByLabel("Your name").fill("Duplicate Server");
  await page.getByLabel("Phone or email").fill("dup@example.com");
  await page.getByLabel("Choose a passcode").fill("2468");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("That passcode is already in use")).toBeVisible();
});

test("manager can promote a server via the Team tab", async ({ page }) => {
  await signIn(page, "2468");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  await page.getByRole("button", { name: "Make manager" }).first().click();
  await expect(
    page.getByRole("button", { name: "Make server" }).first(),
  ).toBeVisible();
});

test("server never sees the Team tab", async ({ page }) => {
  await signIn(page, "1357");
  await expect(
    page.getByRole("button", { name: "Team", exact: true }),
  ).toHaveCount(0);
});
