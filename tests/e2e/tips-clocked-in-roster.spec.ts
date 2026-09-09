import { expect, test, type Page } from "@playwright/test";

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

// Behind the mobile "More" sheet on narrow viewports (desktop's second
// nav row shows it directly) -- mirrors every other spec's own goToTab.
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

async function linkAttendance(
  page: Page,
  memberName: string,
  neonLabel: string,
) {
  await page
    .getByRole("button", { name: `Link ${memberName}'s attendance record` })
    .click();
  await page
    .getByLabel("Attendance-system record")
    .selectOption({ label: neonLabel });
  await page.getByRole("button", { name: "Save link" }).click();
  await expect(page.getByText("Their attendance is now linked.")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
}

function participantCheckbox(page: Page, shortName: string) {
  return page.getByRole("checkbox", { name: shortName, exact: true });
}

test("manager pulls the clocked-in team, finalizes, and the split stays frozen through a later attendance unlink", async ({
  page,
}) => {
  await signIn(page, "2468");

  // Two people, linked to the two Neon users who have a genuinely open
  // (unclosed) shift on the demo anchor date -- see
  // src/features/attendance/demo-data.ts's own Feature 029 fixture rows.
  await goToTab(page, "Team");
  await linkAttendance(page, "Mia Chen", "Anil (Server)");
  await linkAttendance(page, "Noah Diaz", "Deepak Rao (Server)");

  await goToTab(page, "Tip Split");

  // Before pulling: the original, unrelated "first four" demo default.
  await expect(participantCheckbox(page, "Mia")).toBeChecked();
  await expect(participantCheckbox(page, "Leo")).toBeChecked();
  await expect(participantCheckbox(page, "Ava")).toBeChecked();
  await expect(participantCheckbox(page, "Noah")).toBeChecked();

  await page.getByRole("button", { name: "Pull clocked-in team" }).click();

  // After pulling: exactly the two linked, currently clocked-in people --
  // the previous default is gone, not merged with it.
  await expect(participantCheckbox(page, "Mia")).toBeChecked();
  await expect(participantCheckbox(page, "Noah")).toBeChecked();
  await expect(participantCheckbox(page, "Leo")).not.toBeChecked();
  await expect(participantCheckbox(page, "Ava")).not.toBeChecked();
  await expect(participantCheckbox(page, "Zara")).not.toBeChecked();
  await expect(participantCheckbox(page, "Sam")).not.toBeChecked();
  await expect(participantCheckbox(page, "Ivy")).not.toBeChecked();

  await page.getByRole("textbox", { name: "Tips received" }).fill("100.00");
  await page.getByRole("button", { name: "Add and calculate" }).click();

  await expect(page.getByText("Mia Chen")).toBeVisible();
  await expect(page.getByText("Noah Diaz")).toBeVisible();
  // Exactly two $50.00 figures on the whole page -- Mia's and Noah's own
  // totals in "Estimated totals" -- nothing else on this view is ever
  // $50.00.
  await expect(page.getByText("$50.00", { exact: true })).toHaveCount(2);
  await expect(
    page.getByText("$100.00", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Finalize day" }).click();
  await expect(page.getByText("Finalized", { exact: true })).toBeVisible();
  // Once finalized, the pull button (and every other edit control) is
  // disabled -- there is nothing left to preset.
  await expect(
    page.getByRole("button", { name: "Pull clocked-in team" }),
  ).toBeDisabled();

  // Now a real, disruptive attendance-side change: fully unlink Mia's
  // attendance record. Reconciliation 2's own guarantee is that this
  // must have zero effect on the already-finalized split.
  await goToTab(page, "Team");
  await page
    .getByRole("button", { name: "Link Mia Chen's attendance record" })
    .click();
  await page.getByRole("button", { name: "Unlink" }).click();
  await expect(
    page.getByText("Their attendance link has been removed."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  await goToTab(page, "Tip Split");
  await expect(page.getByText("Finalized", { exact: true })).toBeVisible();
  await expect(page.getByText("$50.00", { exact: true })).toHaveCount(2);
  await expect(
    page.getByText("$100.00", { exact: true }).first(),
  ).toBeVisible();

  // And from the affected person's own signed-in view: still exactly
  // $50.00, the frozen snapshot, unaffected by the unlink.
  await signOut(page);
  await signInOnCurrentPage(page, "1357"); // Mia Chen, server
  await goToTab(page, "Tip Split");
  await expect(page.getByText("My tip estimate")).toBeVisible();
  // Two legitimate occurrences here (the headline total and the
  // itemized single-interval breakdown below it) -- both must show the
  // exact same frozen $50.00.
  await expect(page.getByText("$50.00", { exact: true })).toHaveCount(2);
});
