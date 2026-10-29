import { expect, test, type Page } from "@playwright/test";
async function signIn(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("1357");
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible();
}
test("detail links, search, history and direct restaurant URL", async ({
  page,
}, testInfo) => {
  await signIn(page, "/r/the-monks?tab=recipes");
  await page.getByRole("link", { name: /R1 Test Citrus/ }).click();
  await expect(
    page.getByRole("heading", { name: /R1 Test Citrus/ }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("Search recipes")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /R1 Test Citrus/ }),
  ).toBeFocused();
  await page.getByLabel("Search recipes").fill("citrus");
  await page.getByRole("link", { name: /R1 Test Citrus/ }).click();
  await expect(page).toHaveURL(
    /\/r\/the-monks\?tab=recipes&recipe=r1-test-citrus/,
  );
  await expect(
    page.getByRole("heading", { name: /R1 Test Citrus/ }),
  ).toBeVisible();
  if (testInfo.project.name === "server-mobile") {
    const house = page.getByRole("tab", { name: "House" });
    await expect(house).toHaveAttribute("aria-selected", "true");
    await house.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "Perfect" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await house.click();
  } else {
    await expect(
      page.getByRole("heading", { name: "Perfect Bartending Recipe" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "House Recipe" }),
    ).toBeVisible();
  }
  await expect(
    page.getByText("R1 synthetic ingredient").locator("visible=true").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Quick glance" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Quick measure" }).first(),
  ).toBeVisible();
  const detailOrder = await page.evaluate(() => {
    const heading = document.querySelector("h1");
    const glance = document.querySelector('section[aria-label="Quick glance"]');
    const measure = document.querySelector(
      'section[aria-label="Quick measure"]',
    );
    const image = document.querySelector('[data-testid="recipe-image"]');
    if (!heading || !glance || !measure || !image) return false;
    return (
      (heading.compareDocumentPosition(glance) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0 &&
      (glance.compareDocumentPosition(measure) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0 &&
      (measure.compareDocumentPosition(image) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0
    );
  });
  expect(detailOrder).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goBack();
  await expect(page.getByLabel("Search recipes")).toHaveValue("citrus");
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: /R1 Test Citrus/ }),
  ).toBeVisible();
  await page.reload();
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("1357");
  await expect(
    page.getByRole("heading", { name: /R1 Test Citrus/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "‹ Bar Recipes" }).click();
  await page.getByLabel("Search recipes").fill("highball");
  await page.getByRole("link", { name: /R1 Test Highball/ }).click();
  await expect(
    page.getByRole("heading", { name: "Perfect Bartending Recipe" }),
  ).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await signIn(page, "/r/the-monks?tab=recipes&recipe=unknown");
  await expect(
    page.getByRole("heading", { name: "Recipe not found" }),
  ).toBeVisible();
});
