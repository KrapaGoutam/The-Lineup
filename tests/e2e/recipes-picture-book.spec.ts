import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, url: string, code: string) {
  await page.goto(url);
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(code);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

async function openRecipes(page: Page) {
  const button = page.getByRole("button", { name: "Recipes", exact: true });
  if (!(await button.first().isVisible())) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  }
  await button.first().click();
  await expect(
    page.getByRole("heading", { name: "Bar Recipes" }),
  ).toBeVisible();
}

test.describe("Recipes V1 R2-E Picture Book and Browsing", () => {
  test("browsing flow: view toggle, picture book cards, filters, sort, and search", async ({
    page,
  }) => {
    await signIn(page, "/", "2468");
    await openRecipes(page);

    // 1. Initial default view is List
    const listBtn = page.getByRole("button", { name: "List", exact: true });
    const picBtn = page.getByRole("button", {
      name: "Picture Book",
      exact: true,
    });
    await expect(listBtn).toHaveAttribute("aria-pressed", "true");
    await expect(picBtn).toHaveAttribute("aria-pressed", "false");

    // 2. Switch to Picture Book
    await picBtn.click();
    await expect(picBtn).toHaveAttribute("aria-pressed", "true");
    await expect(listBtn).toHaveAttribute("aria-pressed", "false");

    // 3. Category sections and cards visible
    await expect(
      page.getByRole("heading", { name: /R1 Test Cocktails/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /R1 Test Citrus/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /R1 Test Highball/ }),
    ).toBeVisible();

    // Verify thumbnail placeholder rendered
    await expect(
      page.locator('[data-testid="recipe-image"]').first(),
    ).toBeVisible();

    // 4. Filter chips: Popular
    const popChip = page.getByRole("button", { name: /Popular/i });
    const menuChip = page.getByRole("button", { name: /On menu/i });
    const nonAlcChip = page.getByRole("button", { name: /Non-alcoholic/i });
    const allChip = page.getByRole("button", { name: "All", exact: true });

    await popChip.click();
    await expect(popChip).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("link", { name: /R1 Test Citrus/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /R1 Test Highball/ }),
    ).toHaveCount(0);

    // Filter chip: Non-alcoholic
    await nonAlcChip.click();
    await expect(nonAlcChip).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("link", { name: /R1 Test Highball/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /R1 Test Citrus/ }),
    ).toHaveCount(0);

    // Filter chip: On menu
    await menuChip.click();
    await expect(menuChip).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("link", { name: /R1 Test Citrus/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /R1 Test Highball/ }),
    ).toBeVisible();

    // Filter chip: All
    await allChip.click();
    await expect(allChip).toHaveAttribute("aria-pressed", "true");

    // 5. Sorting controls: Book order vs A–Z
    const bookOrderBtn = page.getByRole("button", {
      name: "Book order",
      exact: true,
    });
    const azBtn = page.getByRole("button", { name: "A–Z", exact: true });
    await expect(bookOrderBtn).toHaveAttribute("aria-pressed", "true");
    await azBtn.click();
    await expect(azBtn).toHaveAttribute("aria-pressed", "true");

    // 6. Search in Picture Book: results become flat Results (n) with category captions
    const searchInput = page.getByLabel("Search recipes");
    await searchInput.fill("highball");
    await expect(
      page.getByRole("heading", { name: "Results (1)" }),
    ).toBeVisible();
    // Card in flat results has category caption
    await expect(page.getByText("Others")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /R1 Test Highball/ }),
    ).toBeVisible();

    // 7. Navigation: click card to open detail
    await page.getByRole("link", { name: /R1 Test Highball/ }).click();
    await expect(page).toHaveURL(/recipe=r1-test-highball/);
    await expect(
      page.getByRole("heading", { name: /23\s*R1 TEST HIGHBALL/i }),
    ).toBeVisible();

    // 8. Back navigation preserves Picture Book view and search
    await page.getByRole("link", { name: /‹ Bar Recipes/i }).click();
    await expect(picBtn).toHaveAttribute("aria-pressed", "true");
    await expect(searchInput).toHaveValue("highball");

    // 9. Switch back to List preserves search text
    await listBtn.click();
    await expect(listBtn).toHaveAttribute("aria-pressed", "true");
    await expect(searchInput).toHaveValue("highball");
  });

  test("preference persistence: Picture Book and List persist across reloads", async ({
    page,
  }) => {
    await signIn(page, "/", "2468");
    await openRecipes(page);

    const listBtn = page.getByRole("button", { name: "List", exact: true });
    const picBtn = page.getByRole("button", {
      name: "Picture Book",
      exact: true,
    });
    await expect(listBtn).toHaveAttribute("aria-pressed", "true");

    // Switch to Picture Book
    await picBtn.click();
    await expect(picBtn).toHaveAttribute("aria-pressed", "true");

    // Reload page
    await page.reload();
    await page.waitForSelector('body[data-hydrated="true"]');
    await page.getByLabel("Restaurant passcode").fill("2468");
    await expect(
      page.getByRole("button", { name: "Account and quick settings" }).first(),
    ).toBeVisible({ timeout: 60000 });
    await openRecipes(page);

    // Picture Book remains active after reload
    await expect(
      page.getByRole("button", { name: "Picture Book", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: "List", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");

    // Switch back to List
    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "List", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    // Reload page
    await page.reload();
    await page.waitForSelector('body[data-hydrated="true"]');
    await page.getByLabel("Restaurant passcode").fill("2468");
    await expect(
      page.getByRole("button", { name: "Account and quick settings" }).first(),
    ).toBeVisible({ timeout: 60000 });
    await openRecipes(page);

    // List remains active
    await expect(
      page.getByRole("button", { name: "List", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("management can toggle Show archived in Picture Book", async ({
    page,
  }) => {
    await signIn(page, "/", "2468");
    await openRecipes(page);

    const picBtn = page.getByRole("button", {
      name: "Picture Book",
      exact: true,
    });
    await picBtn.click();

    // Archived item not visible initially
    await expect(
      page.getByRole("link", { name: /R1 Test Archived/ }),
    ).toHaveCount(0);

    // Toggle Show archived ON
    const showArchivedBox = page.getByLabel("Show archived");
    await expect(showArchivedBox).toBeVisible();
    await showArchivedBox.check();

    // Archived recipe card appears, visibly marked with Archived badge
    const archivedCard = page.getByRole("link", { name: /R1 Test Archived/ });
    await expect(archivedCard).toBeVisible();
    await expect(
      archivedCard.getByText("Archived", { exact: true }),
    ).toBeVisible();
    await expect(archivedCard.locator("..")).toHaveClass(/opacity-60/);
  });

  test("staff cannot see Show archived in Picture Book", async ({ page }) => {
    await signIn(page, "/", "1357");
    await openRecipes(page);

    await page
      .getByRole("button", { name: "Picture Book", exact: true })
      .click();
    await expect(page.getByLabel("Show archived")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /R1 Test Archived/ }),
    ).toHaveCount(0);
  });

  test("RC-148: view toggle, filter chips and sort controls are at least 44 px", async ({
    page,
  }) => {
    await signIn(page, "/", "2468");
    await openRecipes(page);
    const controls = [
      page.getByRole("button", { name: "List", exact: true }),
      page.getByRole("button", { name: "Picture Book", exact: true }),
      page.getByRole("group", { name: "Filter recipes" }).getByRole("button"),
      page.getByRole("group", { name: "Sort order" }).getByRole("button"),
    ];
    for (const control of controls) {
      const count = await control.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        const box = await control.nth(i).boundingBox();
        const label = await control.nth(i).innerText();
        expect(box?.height ?? 0, label + " height").toBeGreaterThanOrEqual(44);
        expect(box?.width ?? 0, label + " width").toBeGreaterThanOrEqual(44);
      }
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
