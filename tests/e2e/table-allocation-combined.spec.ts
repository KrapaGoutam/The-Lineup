import { expect, test, type Page } from "@playwright/test";

/**
 * V2.0.4 Combined Table Allocation View, driven in demo mode (deterministic,
 * in-memory). Demo seed: Mia (12, 15), Leo (8, 10), Ava (21 + 22), Noah (4);
 * Ava is next; T1..T19 and B1..B8 are free.
 */

async function openCombined(page: Page) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  const account = page
    .getByRole("button", { name: "Account and quick settings" })
    .first();
  await expect(account).toBeVisible({ timeout: 60_000 });
  // The Next.js dev overlay badge floats over the mobile bottom nav.
  await page.evaluate(() =>
    document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()),
  );
  const direct = page.getByRole("button", {
    name: /^Table Allocation$|^Allocation$/,
  });
  if (await direct.isVisible()) {
    await direct.click();
  } else {
    const more = page.getByRole("button", { name: "More" });
    if ((await more.getAttribute("aria-expanded")) !== "true") {
      await more.click();
    }
    await page
      .getByRole("button", { name: /^Table Allocation$|^Allocation$/ })
      .click();
  }
  await page.getByRole("tab", { name: "Combined" }).click();
  await expect(page.getByText("Demo · Combined View")).toBeVisible();
}

async function pageOverflow(page: Page) {
  return page.evaluate(() => ({
    vertical:
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight,
    horizontal:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
}

const dialog = (page: Page) => page.locator("dialog[open]");

test.describe("Combined view: tablet landscape", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("Split Screen fits one screen: no page scroll, floor and rotation both usable", async ({
    page,
  }) => {
    await openCombined(page);
    const overflow = await pageOverflow(page);
    expect(overflow.vertical).toBeLessThanOrEqual(1);
    expect(overflow.horizontal).toBeLessThanOrEqual(1);

    const map = page.getByRole("group", { name: "Floor map" });
    await expect(map).toBeVisible();
    const history = page.getByRole("region", { name: "Rotation history" });
    await expect(history).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Assign next table to Ava Brooks" }),
    ).toBeVisible();

    // Every map tile sits inside the map and inside the viewport.
    const mapBox = (await map.boundingBox())!;
    expect(mapBox.y + mapBox.height).toBeLessThanOrEqual(768);
    const tiles = map.getByRole("button");
    const count = await tiles.count();
    expect(count).toBeGreaterThan(20);
    for (let i = 0; i < count; i += 1) {
      const box = (await tiles.nth(i).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(mapBox.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(
        mapBox.x + mapBox.width + 1,
      );
      expect(box.y).toBeGreaterThanOrEqual(mapBox.y - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(
        mapBox.y + mapBox.height + 1,
      );
    }
  });

  test("Rotation Focus assigns directly from a NEXT cell, newest turn first", async ({
    page,
  }) => {
    await openCombined(page);
    await page
      .getByRole("button", { name: "Rotation Focus", exact: true })
      .click();
    await expect(page.getByRole("group", { name: "Floor map" })).toHaveCount(0);
    expect((await pageOverflow(page)).vertical).toBeLessThanOrEqual(1);

    await page
      .getByRole("button", { name: "Assign next table to Ava Brooks" })
      .click();
    await expect(
      dialog(page).getByRole("combobox", { name: "Server" }),
    ).toHaveValue("ava");
    await dialog(page).getByRole("button", { name: "Table T7, free" }).click();
    await expect(dialog(page)).toHaveCount(0);

    await expect(
      page.getByRole("button", { name: "Table T7, Ava Brooks, active" }),
    ).toBeVisible();
    // Ava's new entry lands in HER next open turn; rows are newest-first.
    const turns = await page
      .getByRole("region", { name: "Rotation history" })
      .getByRole("button", { name: /^Turn \d+, Mia Chen/ })
      .evaluateAll((els) =>
        els.map((el) =>
          Number(/^Turn (\d+)/.exec(el.getAttribute("aria-label")!)![1]),
        ),
      );
    expect([...turns].sort((a, b) => b - a)).toEqual(turns);
  });

  test("an assignment made in Combined shows in Floor, Servers and Dashboard", async ({
    page,
  }) => {
    await openCombined(page);
    await page.getByRole("button", { name: "Table T9, available" }).click();
    await page.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Table T9, Ava Brooks, active" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Floor" }).click();
    await expect(
      page.getByRole("button", { name: /^Table T9, assigned to Ava Brooks/ }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Servers" }).click();
    await expect(
      page
        .getByRole("group", { name: "Ava Brooks server card" })
        .getByRole("button", { name: /^Table T9, assigned to/ }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Dashboard" }).click();
    await expect(
      page
        .getByText("Dine-in today", { exact: true })
        .locator("xpath=following-sibling::p[1]"),
    ).toHaveText("8");
    await page.getByRole("tab", { name: "Combined" }).click();
    await expect(
      page
        .getByRole("region", { name: "Allocation metrics" })
        .getByText("Dine-in today")
        .locator("xpath=following-sibling::p[1]"),
    ).toHaveText("8");
  });

  test("Floor Focus and the Plan/Grid toggle keep selection and write nothing", async ({
    page,
  }) => {
    await openCombined(page);
    await page
      .getByRole("button", { name: "Floor Focus", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Rotation history" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Table T2, available" }).click();
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Table T2, available", pressed: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Plan", exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: "Allocation metrics" })
        .getByText("Dine-in today")
        .locator("xpath=following-sibling::p[1]"),
    ).toHaveText("7");
    expect((await pageOverflow(page)).vertical).toBeLessThanOrEqual(1);
  });

  test("a long history scrolls inside its own box; Jump to latest appears only after scrolling away", async ({
    page,
  }) => {
    await openCombined(page);
    await page
      .getByRole("button", { name: "Rotation Focus", exact: true })
      .click();
    // Build up several turns quickly through the NEXT cell + picker.
    for (const table of ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"]) {
      await page
        .getByRole("button", { name: "Assign next table to Ava Brooks" })
        .click();
      await dialog(page)
        .getByRole("button", { name: `Table ${table}, free` })
        .click();
      await expect(dialog(page)).toHaveCount(0);
    }
    expect((await pageOverflow(page)).vertical).toBeLessThanOrEqual(1);
    const history = page.getByRole("region", { name: "Rotation history" });
    await expect(
      page.getByRole("button", { name: "Jump to latest" }),
    ).toHaveCount(0);
    await history.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    const jump = page.getByRole("button", { name: "Jump to latest" });
    await expect(jump).toBeVisible();
    await jump.click();
    await expect
      .poll(() => history.evaluate((el) => el.scrollTop))
      .toBeLessThanOrEqual(4);
  });
});

test.describe("Combined view: portrait and phone fallback", () => {
  for (const size of [
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    test(`stays usable at ${size.width}x${size.height} without horizontal page overflow`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await openCombined(page);
      expect((await pageOverflow(page)).horizontal).toBeLessThanOrEqual(1);
      await expect(
        page.getByRole("button", { name: "Assign next table to Ava Brooks" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Tools" }).click();
      await expect(dialog(page).getByText("Tools")).toBeVisible();
      await dialog(page).getByRole("button", { name: "Close" }).click();
      await page.getByRole("button", { name: "Table T3, available" }).click();
      await page.getByRole("button", { name: "Assign", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Table T3, Ava Brooks, active" }),
      ).toBeVisible();
    });
  }
});
