import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, url: string, passcode = "1357") {
  await page.goto(url);
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible();
}

test("recipe controls retain visible focus in both themes", async ({
  page,
}) => {
  await signIn(page, "/r/the-monks?tab=recipes&recipe=r1-test-citrus", "2468");
  await expect(
    page.getByRole("heading", { name: /R1 Test Citrus/ }),
  ).toBeVisible();

  for (const theme of ["light", "dark"]) {
    await page.evaluate((val) => {
      document.documentElement.dataset.theme = val;
    }, theme);

    // Header back link
    const back = page.getByRole("link", { name: /Back to Bar Recipes/i });
    await back.focus();
    await expect(back).toBeFocused();

    // Edit and Archive buttons (for management)
    for (const name of ["Edit Recipe", "Archive Recipe"]) {
      const button = page.getByRole("button", { name, exact: true });
      if (await button.isVisible()) {
        await button.focus();
        await expect(button).toBeFocused();
      }
    }
  }
});

test("detail links, search, history and open-book navigation", async ({
  page,
}) => {
  await signIn(page, "/r/the-monks?tab=recipes");
  await page.getByRole("link", { name: /R1 Test Citrus/ }).click();
  await expect(page).toHaveURL(
    /\/r\/the-monks\?tab=recipes&recipe=r1-test-citrus/,
  );
  await expect(
    page.getByRole("heading", { name: /R1 Test Citrus/ }),
  ).toBeVisible();

  // View I: open-book composition, never tabs.
  await expect(page.getByRole("tablist")).toHaveCount(0);
  const perfectHeading = page.getByRole("heading", { name: "Perfect" });
  const houseHeading = page.getByRole("heading", { name: "House" });
  await expect(perfectHeading).toBeVisible();
  await expect(houseHeading).toBeVisible();

  const perfectBox = (await perfectHeading.boundingBox())!;
  const houseBox = (await houseHeading.boundingBox())!;
  const width = page.viewportSize()!.width;

  if (width >= 820) {
    // Two-page spread: House sits to the right of Perfect
    expect(houseBox.x).toBeGreaterThan(perfectBox.x);
  }

  await expect(
    page.getByText("R1 synthetic ingredient").locator("visible=true").first(),
  ).toBeVisible();
  await expect(page.locator(".book-spread")).toBeVisible();

  // Test browser back and forward history
  await page.goBack();
  await expect(page.getByLabel("Search recipes")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /R1 Test Citrus/ }),
  ).toBeFocused();

  await page.getByLabel("Search recipes").fill("citrus");
  await page.getByRole("link", { name: /R1 Test Citrus/ }).click();
  await expect(
    page.getByRole("heading", { name: /R1 Test Citrus/ }),
  ).toBeVisible();

  await page.goBack();
  await expect(page.getByLabel("Search recipes")).toHaveValue("citrus");
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: /R1 Test Citrus/ }),
  ).toBeVisible();

  // Test header back button
  await page.getByRole("link", { name: /Back to Bar Recipes/i }).click();
  await expect(page.getByLabel("Search recipes")).toBeVisible();

  // Single variant test
  await page.getByLabel("Search recipes").fill("highball");
  await page.getByRole("link", { name: /R1 Test Highball/ }).click();
  await expect(page.getByRole("heading", { name: "Perfect" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByTestId("recipe-single")).toBeVisible();

  // Unknown recipe
  await signIn(page, "/r/the-monks?tab=recipes&recipe=unknown");
  await expect(
    page.getByRole("heading", { name: "Recipe not found" }),
  ).toBeVisible();
});

test("1366x768 laptop fit proof - zero document scroll across dual and single variants in both themes", async ({
  page,
}) => {
  test.skip(
    page.viewportSize()?.width !== 1280 && page.viewportSize()?.width !== 1366,
    "Runs at desktop width",
  );
  await page.setViewportSize({ width: 1366, height: 768 });

  for (const slug of ["r1-test-citrus", "r1-test-highball"]) {
    for (const theme of ["light", "dark"]) {
      await signIn(page, `/r/the-monks?tab=recipes&recipe=${slug}`);
      await page.evaluate((val) => {
        document.documentElement.dataset.theme = val;
      }, theme);

      // Verify app header is <= 48px
      const headerBox = await page.locator("[data-app-header]").boundingBox();
      expect(headerBox).toBeTruthy();
      expect(headerBox!.height).toBeLessThanOrEqual(48);

      // Measure document scroll
      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          viewportHeight: window.innerHeight,
          scrollHeight: doc.scrollHeight,
          clientHeight: doc.clientHeight,
          scrollAmount: Math.max(0, doc.scrollHeight - doc.clientHeight),
          spreadHeight:
            document.querySelector(".book-spread")?.getBoundingClientRect()
              .height ?? 0,
        };
      });

      // Strict contract: 0 px document scroll
      expect(metrics.scrollAmount).toBe(0);
      expect(metrics.scrollHeight).toBeLessThanOrEqual(768);
    }
  }
});

test("tablet and mobile responsive layout verification", async ({ page }) => {
  // Tablet landscape (1180x820)
  await page.setViewportSize({ width: 1180, height: 820 });
  await signIn(page, "/r/the-monks?tab=recipes&recipe=r1-test-citrus");
  await expect(page.locator(".book-spread")).toBeVisible();
  const tabletScroll = await page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollHeight - doc.clientHeight);
  });
  expect(tabletScroll).toBe(0);

  // Tablet portrait (820x1180)
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator(".book-spread")).toBeVisible();
  const tabletPortScroll = await page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollHeight - doc.clientHeight);
  });
  expect(tabletPortScroll).toBe(0);

  // Mobile (390x844): single column, no horizontal overflow
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".book-spread")).toBeVisible();
  const mobileHOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  expect(mobileHOverflow).toBe(false);
});
