import { test, expect, type Page } from "@playwright/test";
import {
  checked,
  createNavigationFixture,
  verifyDevApp,
} from "../support/module-navigation-fixture";

const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3103";
let fixture: Awaited<ReturnType<typeof createNavigationFixture>>;
test.use({ trace: "off", screenshot: "off" }); // Credentials never enter trace/screenshot artifacts.
test.beforeAll(async () => {
  await verifyDevApp(base);
  fixture = await createNavigationFixture();
});
test.afterAll(async () => {
  await fixture?.teardown();
});

async function login(page: Page, key = "owner") {
  // The injected Vercel feedback toolbar is not product UI. Its cross-origin
  // requests produce unrelated WebKit errors; keep acceptance on the app.
  await page.route("https://vercel.live/**", (route) => route.abort());
  await page.goto(`${base}/r/${fixture.slug}`);
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(fixture.users[key].pin);
  await expect(
    page.getByRole("heading", { name: "Choose a location", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "A", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Switch workspace/ }).first(),
  ).toBeVisible({ timeout: 60000 });
}
async function choose(page: Page, name: string) {
  await page
    .getByRole("button", { name: /Switch workspace/ })
    .first()
    .click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
  await expect(
    page
      .getByRole("button", { name: new RegExp(`Switch workspace.*${name}$`) })
      .first(),
  ).toBeVisible({ timeout: 60000 });
}
async function settings(page: Page) {
  const desktop = page.getByRole("button", { name: "Settings", exact: true });
  if (await desktop.isVisible()) await desktop.click();
  else {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: /^Settings/ }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
}
async function navAvailable(page: Page, label: string) {
  if ((await page.viewportSize())!.width >= 1024)
    return page.locator("[data-nav-tier]").filter({ hasText: label });
  await page.getByRole("button", { name: "More", exact: true }).click();
  return page
    .getByRole("dialog", { name: "More", exact: true })
    .getByRole("button", { name: label, exact: true });
}
test("DEV navigation, history, context isolation, recovery and save refresh", async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const pageErrors: { message: string; stack: string }[] = [];
  const failedRequests: { url: string; reason: string }[] = [];
  function observe(target: Page) {
    target.on("pageerror", (error) =>
      pageErrors.push({
        message: error.message,
        stack: error.stack ?? error.message,
      }),
    );
    target.on("requestfailed", (request) =>
      failedRequests.push({
        url: request.url(),
        reason: request.failure()?.errorText ?? "",
      }),
    );
  }
  observe(page);
  await login(page);
  expect(
    await page.locator('[data-nav-tier="primary"]').allTextContents(),
  ).toEqual(["Table Allocation", "Tasks"]);
  expect(
    await page.locator('[data-nav-tier="secondary"]').allTextContents(),
  ).toEqual(["Bar Inventory"]);
  await page.goto(
    `${base}/r/${fixture.slug}?location=${fixture.locations.A}&tab=recipes&recipe=old&mode=edit`,
  );
  await expect(page).not.toHaveURL(/tab=recipes|recipe=|mode=/);
  await expect(
    page.locator('[data-nav-tier="primary"]').filter({ hasText: "Tasks" }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .locator('[data-nav-tier="secondary"]')
    .filter({ hasText: "Bar Inventory" })
    .click();
  await choose(page, "B");
  await expect(page).not.toHaveURL(/tab=bar-inventory/);
  expect(
    await page.locator('[data-nav-tier="primary"]').allTextContents(),
  ).toEqual(["Tasks"]);
  expect(
    await page.locator('[data-nav-tier="secondary"]').allTextContents(),
  ).toEqual(["Recipes"]);
  await page.goBack();
  // Existing V2-003 history guard closes stale workspaces instead of resurrecting A.
  await expect(
    page.getByRole("heading", {
      name: /Your active location changed|This page is for/,
    }),
  ).toBeVisible({ timeout: 30000 });
  await page.goForward();
  await expect(
    page.getByRole("button", { name: /Switch workspace.*B$/ }).first(),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-nav-tier="secondary"]')
      .filter({ hasText: "Bar Inventory" }),
  ).toHaveCount(0);
  await page.goto(
    `${base}/r/${fixture.slug}?location=${fixture.locations.B}&tab=unknown`,
  );
  await expect(page).not.toHaveURL(/tab=unknown/);
  await page.reload();
  await expect(
    page.locator('[data-nav-tier="primary"]').filter({ hasText: "Tasks" }),
  ).toHaveAttribute("aria-current", "page");
  await settings(page);
  await expect(page.locator("#settings-team")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Staff / Account Recovery" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset Navigation staff's passcode" })
    .click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Synthetic navigation recovery validation");
  await page
    .getByRole("button", { name: "Reset passcode", exact: true })
    .click();
  await expect(page.getByText(/Write this down now/)).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const audit = await checked(
    fixture.admin
      .from("audit_events")
      .select("action,reason,actor_profile_id,entity_id")
      .eq("organization_id", fixture.orgIds[0])
      .eq("action", "passcode_reset"),
  );
  expect(audit).toEqual([
    {
      action: "passcode_reset",
      reason: "Synthetic navigation recovery validation",
      actor_profile_id: fixture.users.owner.id,
      entity_id: fixture.users.staff.id,
    },
  ]);
  // Restore only this run's disposable staff credential for the staff browser checks.
  // Reset again through the existing endpoint, never any persistent test account.
  const reset = await page.request.post(`${base}/api/auth/passcode/reset`, {
    data: {
      restaurantSlug: fixture.slug,
      targetProfileId: fixture.users.staff.id,
      reason: "Restore synthetic fixture credential",
      newPasscode: fixture.users.staff.pin,
    },
  });
  expect(reset.status()).toBe(200);
  await page.locator("#settings-locations").click();
  await page
    .getByRole("combobox", { name: "Select organization to administer" })
    .selectOption(fixture.orgIds[0]);
  await expect(
    page.getByRole("button", { name: "Manage B", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Manage B", exact: true }).click();
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  await page
    .getByRole("button", { name: "Disable Tasks", exact: true })
    .click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.locator('[data-nav-tier="primary"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Back to Settings" }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/tab=recipes/);
  await settings(page);
  await choose(page, "Missing");
  await expect(
    page.getByText("No operational modules are enabled for this location."),
  ).toBeVisible();
  await choose(page, "Disabled");
  await expect(
    page.getByText("No operational modules are enabled for this location."),
  ).toBeVisible();
  await choose(page, "C");
  await expect(page).toHaveURL(new RegExp(`${fixture.slug}-b`));
  await expect(
    page.getByText("No operational modules are enabled for this location."),
  ).toBeVisible();
  await page.goto(
    `${base}/r/${fixture.slug}?location=${fixture.locations.Inactive}&tab=tasks`,
  );
  await expect(
    page.getByRole("heading", {
      name: "Location selection is no longer valid",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage locations and modules" }),
  ).toBeVisible();
  const staffContext = await browser.newContext({
    ignoreHTTPSErrors: test.info().project.use.ignoreHTTPSErrors === true,
  });
  try {
    const staff = await staffContext.newPage();
    observe(staff);
    await login(staff, "staff");
    await settings(staff);
    await expect(
      staff.getByRole("heading", { name: "Staff / Account Recovery" }),
    ).toHaveCount(0);
    await expect(staff.locator("#settings-locations")).toHaveCount(0);
    const denied = await staff.request.post(`${base}/api/auth/passcode/reset`, {
      data: {
        restaurantSlug: fixture.slug,
        targetProfileId: fixture.users.manager.id,
        reason: "Synthetic denied reset",
      },
    });
    expect(denied.status()).toBe(403);
    await staff.getByRole("button", { name: "Change your passcode" }).click();
    await expect(
      staff.getByRole("dialog", { name: "Change your passcode" }),
    ).toBeVisible();
    let nextPin = String(
      (Number(fixture.users.staff.pin) + 1) % 10000,
    ).padStart(4, "0");
    while (Object.values(fixture.users).some((user) => user.pin === nextPin))
      nextPin = String((Number(nextPin) + 1) % 10000).padStart(4, "0");
    await staff
      .getByLabel("Current passcode", { exact: true })
      .fill(fixture.users.staff.pin);
    await staff.getByLabel("New passcode", { exact: true }).fill(nextPin);
    await staff
      .getByRole("dialog")
      .getByRole("button", { name: "Change passcode", exact: true })
      .click();
    await expect(
      staff.getByText(/Use your new passcode the next time/),
    ).toBeVisible();
    fixture.users.staff.pin = nextPin;
    await staff.getByRole("button", { name: "Done", exact: true }).click();
    await staff.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(staff.getByLabel("Restaurant passcode")).toBeVisible();
    await login(staff, "staff");
  } finally {
    await staffContext.close();
  }
  // WebKit reports canceled same-origin fetches as access-control pageerrors
  // during full-document history/reload. Exclude only a proven canceled request,
  // never an actual CORS denial, script exception or unhandled rejection.
  const unexpected = pageErrors.filter((error) => {
    const url = error.stack
      .split("\n")[0]
      .match(
        /^Fetch API cannot load (https?:\/\/\S+) due to access control checks\.$/,
      )?.[1];
    return (
      !url ||
      new URL(url).origin !== new URL(base).origin ||
      !failedRequests.some((request) => {
        const canceled = new URL(request.url);
        const diagnostic = new URL(url);
        // Next may add tab/_rsc parameters as the traversal is canceled.
        return (
          /cancel|abort/i.test(request.reason) &&
          canceled.origin === diagnostic.origin &&
          canceled.pathname === diagnostic.pathname &&
          canceled.searchParams.get("location") ===
            diagnostic.searchParams.get("location")
        );
      })
    );
  });
  expect(unexpected, JSON.stringify(failedRequests)).toEqual([]);
});

test("mobile account recovery and location navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
  await login(page);
  const dock = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(dock.getByRole("button")).toHaveCount(3);
  expect(
    await dock
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.every(
          (button) =>
            button.getBoundingClientRect().height >= 44 &&
            button.getBoundingClientRect().width >= 44,
        ),
      ),
  ).toBe(true);
  await dock.getByRole("button", { name: "More" }).click();
  let more = page.getByRole("dialog", { name: "More", exact: true });
  await expect(
    more.getByRole("button", { name: "Bar Inventory", exact: true }),
  ).toBeVisible();
  await expect(
    more.getByRole("button", { name: "Recipes", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await settings(page);
  await expect(page.locator("#settings-team")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Reset Navigation staff's passcode" })
    .click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Synthetic mobile recovery acceptance");
  await page
    .getByRole("button", { name: "Reset passcode", exact: true })
    .click();
  await expect(page.getByText(/Write this down now/)).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .locator("#settings-passcode")
    .getByRole("button", { name: "Change your passcode", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Change your passcode" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await choose(page, "B");
  await expect(dock.getByRole("button")).toHaveCount(2);
  await dock.getByRole("button", { name: "More" }).click();
  more = page.getByRole("dialog", { name: "More", exact: true });
  await expect(
    more.getByRole("button", { name: "Recipes", exact: true }),
  ).toBeVisible();
  await expect(
    more.getByRole("button", { name: "Bar Inventory", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.goto(
    `${base}/r/${fixture.slug}?location=${fixture.locations.B}&tab=bar-inventory`,
  );
  await expect(page).not.toHaveURL(/tab=bar-inventory/);
  await expect(
    dock.getByRole("button", { name: "Tasks", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await choose(page, "Missing");
  await expect(dock.getByRole("button")).toHaveCount(1);
  await expect(
    page.getByText("No operational modules are enabled for this location."),
  ).toBeVisible();
  await dock.getByRole("button", { name: "More" }).click();
  more = page.getByRole("dialog", { name: "More", exact: true });
  await expect(more.getByRole("button", { name: /^Settings/ })).toBeVisible();
  await expect(
    more.getByRole("button", { name: "Change passcode", exact: true }),
  ).toBeVisible();
  await more.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Restaurant passcode")).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [1366, 1024, 768, 390]) {
  test(`responsive Settings-only and filtered navigation at ${width}px light/dark`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await choose(page, "Missing");
      await expect(
        page.getByText("No operational modules are enabled for this location."),
      ).toBeVisible();
      const dock = page.getByRole("navigation", { name: "Mobile navigation" });
      if (width < 1024) {
        await expect(dock.getByRole("button")).toHaveCount(1);
        await dock.getByRole("button", { name: "More" }).click();
        const more = page.getByRole("dialog", { name: "More", exact: true });
        await expect(
          more.getByRole("button", { name: "Sign out" }),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dock.getByRole("button", { name: "More" })).toBeFocused();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/navigation/navigation-${width}-${theme}.png`,
        fullPage: true,
      });
      await choose(page, "A");
      if (width < 1024) await expect(dock.getByRole("button")).toHaveCount(3);
      const inventory = await navAvailable(page, "Bar Inventory");
      await expect(inventory).toBeVisible();
      if (width < 1024) await page.keyboard.press("Escape");
    }
  });
}
