import { expect, test, type Page } from "@playwright/test";

// V2-002.005 — Location Lifecycle Integrity (demo mode, synthetic fixtures).
// The demo lifecycle source is in-memory: nothing here touches a database, and
// no real operational location is ever deactivated or archived.

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(accountButton(page)).toBeVisible({ timeout: 60000 });
}

function accountButton(page: Page) {
  return page
    .getByRole("button", { name: "Account and quick settings" })
    .first();
}

async function openSettings(page: Page) {
  await expect(accountButton(page)).toBeVisible();
  const desktopButton = page.getByRole("button", {
    name: "Settings",
    exact: true,
  });
  if (await desktopButton.isVisible()) {
    await desktopButton.click();
    return;
  }
  const moreButton = page.getByRole("button", { name: "More" });
  if ((await moreButton.getAttribute("aria-expanded")) !== "true") {
    await moreButton.click();
  }
  await page.getByRole("button", { name: /^Settings/ }).click();
}

async function openLocations(page: Page) {
  await signIn(page, "2468");
  await openSettings(page);
  await page.locator("#settings-locations").click();
  await expect(
    page.getByRole("heading", { name: "Locations", exact: true }),
  ).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("Location Lifecycle (V2-002.005)", () => {
  test("manager deactivates, reactivates, and archives a location", async ({
    page,
  }) => {
    await openLocations(page);
    const nasa = page.getByTestId("location-card-demo-loc-2");
    await expect(nasa.getByTestId("lifecycle-badge-active")).toBeVisible();

    // Request deactivation → confirmation shows state, impact and reason
    await nasa.getByRole("button", { name: "Deactivate NASA Branch" }).click();
    const dialog = page.getByTestId("lifecycle-dialog");
    await expect(dialog).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Deactivate NASA Branch" }),
    ).toBeVisible();
    await expect(dialog).toContainText("Other locations are not affected");
    await expectNoHorizontalOverflow(page);

    // The reason is required
    await page.getByRole("button", { name: "Deactivate location" }).click();
    await expect(dialog).toContainText("A reason is required.");

    await page.getByLabel(/Reason/).fill("Seasonal closure for renovation");
    await page.getByRole("button", { name: "Deactivate location" }).click();
    await expect(page.getByTestId("lifecycle-dialog")).toHaveCount(0);
    await expect(page.getByTestId("lifecycle-notice")).toContainText(
      "NASA Branch: deactivate completed.",
    );
    await expect(nasa.getByTestId("lifecycle-badge-inactive")).toBeVisible();

    // Sibling location is untouched
    await expect(
      page
        .getByTestId("location-card-demo-loc-1")
        .getByTestId("lifecycle-badge-active"),
    ).toBeVisible();

    // Reactivate
    await nasa.getByRole("button", { name: "Reactivate NASA Branch" }).click();
    await page.getByLabel(/Reason/).fill("Renovation finished");
    await page.getByRole("button", { name: "Reactivate location" }).click();
    await expect(nasa.getByTestId("lifecycle-badge-active")).toBeVisible();

    // Deactivate again, then archive with the typed-name confirmation
    await nasa.getByRole("button", { name: "Deactivate NASA Branch" }).click();
    await page.getByLabel(/Reason/).fill("Closing the branch");
    await page.getByRole("button", { name: "Deactivate location" }).click();
    await expect(nasa.getByTestId("lifecycle-badge-inactive")).toBeVisible();

    await nasa.getByRole("button", { name: "Archive NASA Branch" }).click();
    await page.getByLabel(/Reason/).fill("Permanently closed");
    await page.getByLabel(/to confirm/).fill("nasa branch");
    await page.getByRole("button", { name: "Archive location" }).click();
    await expect(page.getByTestId("lifecycle-dialog")).toContainText(
      "name does not match",
    );
    await page.getByLabel(/to confirm/).fill("NASA Branch");
    await page.getByRole("button", { name: "Archive location" }).click();
    await expect(page.getByTestId("lifecycle-dialog")).toHaveCount(0);

    // Archived locations stay discoverable, with history and no operational controls
    const toggle = page.getByRole("button", {
      name: /archived locations \(1\)/i,
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    const archived = page.getByTestId("location-card-demo-loc-2");
    await expect(
      archived.getByTestId("lifecycle-badge-archived"),
    ).toBeVisible();
    await expect(
      archived.getByRole("button", { name: "Manage NASA Branch" }),
    ).toHaveCount(0);
    await expect(
      archived.getByRole("button", { name: "Reactivate NASA Branch" }),
    ).toHaveCount(0);
    await archived
      .getByRole("button", { name: "View history of NASA Branch" })
      .click();
    const history = page.getByTestId("lifecycle-history");
    await expect(history).toContainText("Permanently closed");
    await expect(history.getByRole("listitem")).toHaveCount(4);
    await expectNoHorizontalOverflow(page);
  });

  test("blockers are shown with real counts and prevent confirmation", async ({
    page,
  }) => {
    await openLocations(page);
    await page
      .getByTestId("location-card-demo-loc-1")
      .getByRole("button", { name: "Deactivate Webster Branch" })
      .click();
    const blockers = page.getByTestId("lifecycle-blockers");
    await expect(blockers).toContainText("Cannot deactivate Webster Branch.");
    await expect(blockers).toContainText("1 active service session");
    await expect(blockers).toContainText(
      "Resolve these items before deactivation",
    );
    await expect(
      page.getByRole("button", { name: "Deactivate location" }),
    ).toBeDisabled();
    await expectNoHorizontalOverflow(page);

    // Cancel leaves the location active
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page
        .getByTestId("location-card-demo-loc-1")
        .getByTestId("lifecycle-badge-active"),
    ).toBeVisible();
  });

  test("confirmation is operable by keyboard", async ({ page }) => {
    await openLocations(page);
    const deactivate = page
      .getByTestId("location-card-demo-loc-2")
      .getByRole("button", { name: "Deactivate NASA Branch" });
    await deactivate.focus();
    await page.keyboard.press("Enter");
    const reason = page.getByLabel(/Reason/);
    await expect(reason).toBeVisible();
    await reason.fill("Keyboard driven closure");
    await page.getByRole("button", { name: "Deactivate location" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page
        .getByTestId("location-card-demo-loc-2")
        .getByTestId("lifecycle-badge-inactive"),
    ).toBeVisible();
  });

  test("staff cannot reach lifecycle controls", async ({ page }) => {
    await signIn(page, "1357");
    await openSettings(page);
    await expect(page.locator("#settings-locations")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Deactivate|Archive/ }),
    ).toHaveCount(0);
  });
});
