import { expect, test, type Page } from "@playwright/test";
async function signIn(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("1357");
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible();
}
test("jump headings clear the shell and retain visible focus in both themes", async ({
  page,
}) => {
  for (const [width, height] of [
    [820, 1180],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await signIn(page, "/r/the-monks?tab=recipes&recipe=r1-test-citrus");
    await expect(
      page.getByRole("heading", { name: /R1 Test Citrus/ }),
    ).toBeFocused();
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      for (const name of ["House", "Perfect"]) {
        const jump = page
          .getByRole("navigation", { name: "Jump to recipe" })
          .getByRole("link", { name });
        await jump.focus();
        await page.keyboard.press("Enter");
        const target = page.locator(
          `#recipe-variant-${name.toLowerCase()}-heading`,
        );
        await expect(target).toBeFocused();
        await expect
          .poll(() =>
            target.evaluate(
              (element) => getComputedStyle(element).outlineColor,
            ),
          )
          .toBe(theme === "light" ? "rgb(154, 74, 0)" : "rgb(242, 166, 90)");
        const result = await target.evaluate((element) => ({
          top: element.getBoundingClientRect().top,
          header: document
            .querySelector("[data-app-header]")!
            .getBoundingClientRect().bottom,
          outline: getComputedStyle(element).outlineWidth,
        }));
        expect(result.top).toBeGreaterThanOrEqual(result.header);
        expect(parseFloat(result.outline)).toBeGreaterThan(0);
      }
    }
  }
});

test("Light theme uses a visible focus color for recipe controls", async ({
  page,
}) => {
  await page.goto("/r/the-monks?tab=recipes&recipe=r1-test-citrus");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  await expect(
    page.getByRole("heading", { name: /R1 Test Citrus/ }),
  ).toBeFocused();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.keyboard.press("Tab");
  for (const name of ["Edit Recipe", "Archive Recipe"]) {
    const button = page.getByRole("button", { name, exact: true });
    await button.focus();
    await expect
      .poll(() =>
        button.evaluate((element) => getComputedStyle(element).boxShadow),
      )
      .toContain("rgb(154, 74, 0)");
  }
  const back = page.getByRole("link", { name: /Bar Recipes/ });
  await back.focus();
  await expect
    .poll(() =>
      back.evaluate((element) => getComputedStyle(element).outlineColor),
    )
    .toBe("rgb(154, 74, 0)");
});
test("detail links, search, history and direct restaurant URL", async ({
  page,
}) => {
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
  // Concept E: both complete recipes, Perfect first, never tabs.
  await expect(page.getByRole("tablist")).toHaveCount(0);
  const perfectHeading = page.getByRole("heading", {
    name: "Perfect Bartending Recipe",
  });
  const houseHeading = page.getByRole("heading", { name: "House Recipe" });
  await expect(perfectHeading).toBeVisible();
  await expect(houseHeading).toBeVisible();
  const perfectBox = (await perfectHeading.boundingBox())!;
  const houseBox = (await houseHeading.boundingBox())!;
  const width = page.viewportSize()!.width;
  const jump = page.getByRole("navigation", { name: "Jump to recipe" });
  if (width >= 1024) {
    // Two-column spread: House sits right of Perfect on the same row.
    expect(houseBox.x).toBeGreaterThan(perfectBox.x + perfectBox.width / 2);
    expect(Math.abs(houseBox.y - perfectBox.y)).toBeLessThan(4);
    await expect(jump).toBeHidden();
  } else {
    // Stacked: Perfect above House, with working jump links.
    expect(houseBox.y).toBeGreaterThan(perfectBox.y);
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [name, heading] of [
      ["House", houseHeading],
      ["Perfect", perfectHeading],
    ] as const) {
      await jump.getByRole("link", { name }).focus();
      await page.keyboard.press("Enter");
      await expect(heading).toBeFocused();
      const positions = await heading.evaluate((element) => ({
        top: element.getBoundingClientRect().top,
        header: document
          .querySelector("[data-app-header]")!
          .getBoundingClientRect().bottom,
        outline: getComputedStyle(element).outlineWidth,
      }));
      expect(positions.top).toBeGreaterThanOrEqual(positions.header);
      expect(parseFloat(positions.outline)).toBeGreaterThan(0);
    }
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
  await expect(page.getByTestId("recipe-single")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Jump to recipe" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Final Presentation" }),
  ).toBeVisible();
  await signIn(page, "/r/the-monks?tab=recipes&recipe=unknown");
  await expect(
    page.getByRole("heading", { name: "Recipe not found" }),
  ).toBeVisible();
});
