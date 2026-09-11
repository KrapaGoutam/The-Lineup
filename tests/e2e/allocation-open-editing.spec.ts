import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  // MUST wait for hydration BEFORE filling the input, otherwise React
  // hydration resets the value (see tests/e2e/dashboard.spec.ts).
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  // Bug fix: a full 4-digit fill() auto-submits on its own now -- no
  // separate "Open workspace" click (see tests/e2e/dashboard.spec.ts).
  await expect(accountButton(page)).toBeVisible({ timeout: 60000 });
}

function accountButton(page: Page) {
  return page
    .getByRole("button", { name: "Account and quick settings" })
    .first();
}

// The Allocation tab lives behind the mobile "More" sheet on narrow
// viewports (desktop's second nav row shows it directly) -- mirrors
// tests/e2e/dashboard.spec.ts's navigateToTab.
async function goToAllocation(page: Page) {
  await expect(accountButton(page)).toBeVisible();
  const direct = page.getByRole("button", {
    name: /^Table Allocation$|^Allocation$/,
  });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  const moreButton = page.getByRole("button", { name: "More" });
  if ((await moreButton.getAttribute("aria-expanded")) !== "true") {
    await moreButton.click();
  }
  await page
    .getByRole("button", { name: /^Table Allocation$|^Allocation$/ })
    .click();
}

// Feature 028. Passcode 1357 is Mia Chen, a plain server, whose own
// column already has "Table 12" from the demo seed -- every assertion
// below that edits or clears someone else's cell deliberately targets
// Leo's or Noah's column instead, so the edit is provably cross-column,
// not just "a server editing their own row".
test("a server can edit an already-assigned table in a teammate's column, with correct attribution, while administrative actions stay manager-only", async ({
  page,
}) => {
  await signIn(page, "1357");
  await goToAllocation(page);

  await expect(page.getByText("Table 8")).toBeVisible(); // Leo Park's seeded cell.

  // Reconciliation 1: the per-cell edit affordance is open to any active
  // member, unlike the bulk admin actions asserted below.
  await page.getByRole("button", { name: "Edit table 8" }).click();
  // Editing pre-fills and autofocuses the one input carrying the
  // previous value -- every other cell's input on the board shares the
  // identical accessible name, so the ambiguity has to be broken by
  // which one is actually focused, not by name alone.
  await page.locator("input:focus").fill("8B");
  await page.getByRole("button", { name: "Save table" }).click();

  await expect(page.getByText("Table 8B")).toBeVisible();
  // Unconditional attribution: no reason was entered, yet the actor and
  // the target column are both recorded and visible to the whole team.
  await expect(
    page.getByText("Mia Chen edited Leo Park's column"),
  ).toBeVisible();

  // Admin board actions remain manager/owner-only even though per-cell
  // editing is wide open.
  await expect(page.getByRole("button", { name: "Clear board" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Add row" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Move .* up$/ })).toHaveCount(
    0,
  );
});

test("a server can clear an already-assigned table in a teammate's column, and the clear is attributed", async ({
  page,
}) => {
  await signIn(page, "1357");
  await goToAllocation(page);

  await expect(page.getByText("Table 4")).toBeVisible(); // Noah Diaz's seeded cell.
  await page.getByRole("button", { name: "Clear table 4" }).click();

  await expect(page.getByText("Table 4")).toHaveCount(0);
  await expect(
    page.getByPlaceholder("Table #").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Mia Chen edited Noah Diaz's column"),
  ).toBeVisible();
});

test("selecting a previous day shows the read-only demo notice, with no editing or admin controls, and Back to today restores the live board", async ({
  page,
}) => {
  await signIn(page, "2468"); // Maya Singh, a manager -- the historical lock applies to her too.
  await goToAllocation(page);

  await expect(page.getByText("Table 12")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear board" })).toBeVisible();

  await page.getByRole("button", { name: "Previous day" }).click();

  await expect(page.getByText("Demo mode only shows today")).toBeVisible();
  await expect(page.getByText("Table 12")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear board" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Add row" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();

  await page.getByRole("button", { name: "Back to today" }).click();

  await expect(page.getByText("Demo mode only shows today")).toHaveCount(0);
  await expect(page.getByText("Table 12")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear board" })).toBeVisible();
});
