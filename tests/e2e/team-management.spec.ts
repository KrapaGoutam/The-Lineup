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

// The "Team" nav item is behind the mobile "More" sheet on narrow
// viewports (desktop's second nav row shows it directly) -- mirrors
// tests/e2e/dashboard.spec.ts's navigateToTab.
async function goToTeam(page: Page) {
  await expect(accountButton(page)).toBeVisible();
  const direct = page.getByRole("button", { name: "Team", exact: true });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  const moreButton = page.getByRole("button", { name: "More" });
  if ((await moreButton.getAttribute("aria-expanded")) !== "true") {
    await moreButton.click();
  }
  await page.getByRole("button", { name: "Team", exact: true }).click();
}

test("manager renames, changes designation, resets passcode, and links attendance; the member signs in with the new passcode", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToTeam(page);

  // Rename.
  await page.getByRole("button", { name: "Rename Mia Chen" }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Mia Rodriguez");
  await page.getByRole("button", { name: "Save name" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByRole("button", { name: "Rename Mia Rodriguez" }),
  ).toBeVisible();

  // Designation change: Staff -> Assistant Manager.
  await page
    .getByRole("button", { name: "Set Mia Rodriguez to Assistant Manager" })
    .click();
  await expect(
    page.getByText("Assistant Manager", { exact: true }).first(),
  ).toBeVisible();

  // Passcode reset with a known, chosen passcode (deterministic --
  // no need to parse an auto-generated one back out of the DOM).
  await page
    .getByRole("button", { name: "Reset Mia Rodriguez's passcode" })
    .click();
  await page.getByRole("radio", { name: "Choose one" }).check();
  await page.getByLabel("New 4-digit passcode").fill("5150");
  await page.getByLabel("Reason").fill("e2e passcode reset test");
  await page
    .getByRole("button", { name: "Reset passcode", exact: true })
    .click();
  await expect(page.getByText("5150")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  // Attendance identity link, strictly by picking a name from the
  // dropdown -- never typed or inferred.
  await page
    .getByRole("button", { name: "Link Mia Rodriguez's attendance record" })
    .click();
  await page
    .getByLabel("Attendance-system record")
    .selectOption({ label: "Anil (Server)" });
  await page.getByRole("button", { name: "Save link" }).click();
  await expect(page.getByText("Their attendance is now linked.")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Attendance linked").first()).toBeVisible();

  // Sign out, then sign back in AS Mia, with the new passcode -- proves
  // the reset passcode actually works, not just that the dialog reported
  // success.
  await signOut(page);
  await signInOnCurrentPage(page, "5150");
  // Scoped to <main> -- on mobile, the account button's own name text
  // sits in a lg:-only block that's present but hidden, not what this
  // assertion means to check.
  await expect(
    page.getByRole("main").getByText("Mia Rodriguez").first(),
  ).toBeVisible();
});

test("a server cannot reach Team management at all", async ({ page }) => {
  await signIn(page, "1357");
  await expect(
    page.getByRole("button", { name: "Team", exact: true }),
  ).toHaveCount(0);

  const moreButton = page.getByRole("button", { name: "More" });
  if (await moreButton.isVisible()) {
    await moreButton.click();
    await expect(
      page.getByRole("button", { name: "Team", exact: true }),
    ).toHaveCount(0);
  }
});
