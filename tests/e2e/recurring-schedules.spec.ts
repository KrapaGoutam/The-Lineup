import { expect, test, type Locator, type Page } from "@playwright/test";

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  // MUST wait for hydration BEFORE filling the input, otherwise React
  // hydration resets the value (see tests/e2e/dashboard.spec.ts).
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(accountButton(page)).toBeVisible({ timeout: 60000 });
}

// For signing back in after "Sign out" within the same test, without a
// page.goto() -- a full navigation would reload the page and wipe every
// bit of in-memory demo state, not just end the session.
async function signInOnCurrentPage(page: Page, passcode: string) {
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(accountButton(page)).toBeVisible({ timeout: 60000 });
}

function accountButton(page: Page) {
  return page
    .getByRole("button", { name: "Account and quick settings" })
    .first();
}

async function signOut(page: Page) {
  await accountButton(page).click();
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page.getByLabel("Restaurant passcode")).toBeVisible();
}

// The Attendance/Team tabs live behind the mobile "More" sheet on narrow
// viewports (desktop's second nav row shows them directly) -- mirrors
// tests/e2e/dashboard.spec.ts's navigateToTab, tests/e2e/attendance-
// reporting.spec.ts's goToTab. Schedule itself is a first-row tab and
// never needs this, but reused here for consistency/future-proofing.
async function goToTab(page: Page, name: string) {
  await expect(accountButton(page)).toBeVisible();
  const direct = page.getByRole("button", { name, exact: true });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  const moreButton = page.getByRole("button", { name: "More" });
  if ((await moreButton.getAttribute("aria-expanded")) !== "true") {
    await moreButton.click();
  }
  await page.getByRole("button", { name, exact: true }).click();
}

// Every week-grid row is a plain, role-less grid div (name cell + 7 day
// cells as direct children, per schedule-workspace.tsx's own
// `grid-cols-[160px_repeat(7,minmax(110px,1fr))]` row markup) -- located
// via the member's name span rather than a table role, since none
// exists here (unlike Attendance's actual <table>).
function memberRow(page: Page, memberName: string): Locator {
  return page.locator(
    `xpath=//span[normalize-space(text())='${memberName}']/ancestor::div[contains(@class,"grid-cols-[160px_repeat(7,minmax(110px,1fr))]")][1]`,
  );
}

// index: 0 = Monday .. 6 = Sunday, matching weekdayLabels/activeWeekDates
// order in schedule-workspace.tsx. Direct child 0 is the name cell.
function dayCell(row: Locator, index: number): Locator {
  return row.locator(":scope > div").nth(index + 1);
}

test("week navigation: Previous/Next/Today", async ({ page }) => {
  await signIn(page, "2468");
  await goToTab(page, "Schedule");

  // Demo mode's fixed anchor date is 2026-09-08 (a Tuesday) -- the
  // initial week is therefore Mon 2026-09-07 .. Sun 2026-09-13. No
  // "Today" quick-jump on the initial week (nothing to jump back to).
  await expect(page.getByRole("heading", { name: "Sep 7–13" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Today" })).toHaveCount(0);

  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByRole("heading", { name: "Sep 14–20" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Today" })).toBeVisible();

  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByRole("heading", { name: "Sep 21–27" })).toBeVisible();

  await page.getByRole("button", { name: "Previous week" }).click();
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(page.getByRole("heading", { name: "Sep 7–13" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Today" })).toHaveCount(0);

  // Browsing into the past works the same way, in the other direction.
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(
    page.getByRole("heading", { name: "Aug 31–Sep 6" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Today" })).toBeVisible();

  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByRole("heading", { name: "Sep 7–13" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Today" })).toHaveCount(0);
});

test("creating a recurring shift across selected days generates exactly those instances", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToTab(page, "Schedule");
  await page.getByRole("button", { name: "Add shift" }).click();

  // Ava Brooks has zero shifts in the fixture at the start of this test
  // -- a clean row to assert against. Mon (default fromDate, 2026-09-07)
  // + Wed only, through the end of the visible week.
  await page.getByLabel("Person").selectOption({ label: "Ava Brooks" });
  await page.getByLabel("To date (optional)").fill("2026-09-13");
  await page.getByRole("checkbox", { name: "Mon" }).check();
  await page.getByRole("checkbox", { name: "Wed" }).check();
  await page.getByRole("button", { name: "Add to draft" }).click();

  // Two instances, not a single Mon-to-Sun range -- the whole point of
  // the day-of-week filter.
  await expect(page.getByText("Draft shifts").locator("..")).toContainText("2");

  const row = memberRow(page, "Ava Brooks");
  await expect(
    dayCell(row, 0).getByRole("button", { name: /Edit Morning shift/ }),
  ).toBeVisible(); // Monday
  await expect(
    dayCell(row, 2).getByRole("button", { name: /Edit Morning shift/ }),
  ).toBeVisible(); // Wednesday

  // Every unselected day in between and after stays empty.
  for (const index of [1, 3, 4, 5, 6]) {
    await expect(dayCell(row, index).getByRole("button")).toHaveCount(0);
  }
});

test("an end date is required to repeat on specific days", async ({ page }) => {
  await signIn(page, "2468");
  await goToTab(page, "Schedule");
  await page.getByRole("button", { name: "Add shift" }).click();

  await page.getByRole("checkbox", { name: "Mon" }).check();
  await page.getByRole("button", { name: "Add to draft" }).click();

  await expect(
    page.getByText("An end date is required when repeating on specific days."),
  ).toBeVisible();
  // Refused, not silently created as a single-day shift.
  await expect(page.getByText("Draft shifts").locator("..")).toContainText("0");
});

test("editing an already-published shift updates the schedule immediately, with no separate unpublish step", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToTab(page, "Schedule");
  await page.getByRole("button", { name: "Add shift" }).click();

  await page.getByLabel("Person").selectOption({ label: "Mia Chen" });
  await page.getByRole("button", { name: "Add to draft" }).click();
  await page.getByRole("button", { name: /Publish/ }).click();
  await expect(page.getByText("Published shifts").locator("..")).toContainText(
    "1",
  );

  const originalRow = memberRow(page, "Mia Chen");
  await dayCell(originalRow, 0)
    .getByRole("button", { name: /Edit Morning shift/ })
    .click();

  const dialog = page.getByRole("dialog", { name: "Edit shift" });
  await dialog.getByLabel("Person").selectOption({ label: "Leo Park" });
  await dialog.getByLabel("Start time").fill("09:30");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);

  // Still published -- editing a published shift is not a draft/publish
  // round trip.
  await expect(page.getByText("Published shifts").locator("..")).toContainText(
    "1",
  );
  await expect(page.getByText("Draft shifts").locator("..")).toContainText("0");

  await expect(dayCell(originalRow, 0).getByRole("button")).toHaveCount(0);
  const newRow = memberRow(page, "Leo Park");
  await expect(
    dayCell(newRow, 0).getByRole("button", {
      name: "Edit Morning shift, 9:30 AM–4:00 PM",
    }),
  ).toBeVisible();
});

test("deleting a shift removes it immediately, with a confirm step", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToTab(page, "Schedule");
  await page.getByRole("button", { name: "Add shift" }).click();

  await page.getByLabel("Person").selectOption({ label: "Noah Diaz" });
  await page.getByRole("button", { name: "Add to draft" }).click();
  await page.getByRole("button", { name: /Publish/ }).click();

  const row = memberRow(page, "Noah Diaz");
  await dayCell(row, 0)
    .getByRole("button", { name: /Edit Morning shift/ })
    .click();

  const dialog = page.getByRole("dialog", { name: "Edit shift" });
  await dialog.getByRole("button", { name: "Delete shift" }).click();
  // First click asks for confirmation, does not delete yet.
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Confirm delete" }),
  ).toBeVisible();
  await expect(dayCell(row, 0).getByRole("button")).toHaveCount(1);

  await dialog.getByRole("button", { name: "Confirm delete" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(dayCell(row, 0).getByRole("button")).toHaveCount(0);
  await expect(page.getByText("Published shifts").locator("..")).toContainText(
    "0",
  );
});

test("a server never sees the shift edit affordance, even on a published shift", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToTab(page, "Schedule");
  await page.getByRole("button", { name: "Add shift" }).click();

  await page.getByLabel("Person").selectOption({ label: "Mia Chen" });
  await page.getByRole("button", { name: "Add to draft" }).click();
  await page.getByRole("button", { name: /Publish/ }).click();
  await expect(page.getByText("Published shifts").locator("..")).toContainText(
    "1",
  );

  await signOut(page);
  await signInOnCurrentPage(page, "1357"); // Mia Chen, server
  await goToTab(page, "Schedule");

  const row = memberRow(page, "Mia Chen");
  // Rendered, but as a plain non-interactive block -- no `onEdit`, so
  // ShiftBlock renders the `<div>` branch, not the `<button>` one.
  await expect(dayCell(row, 0)).toContainText("Morning");
  await expect(dayCell(row, 0).getByRole("button")).toHaveCount(0);
});
