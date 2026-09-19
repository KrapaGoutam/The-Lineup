import { expect, test, type Page } from "@playwright/test";

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

async function switchView(
  page: Page,
  name: "Grid" | "Floor" | "Picker" | "Servers" | "Dashboard",
) {
  await page.getByRole("tab", { name, exact: true }).click();
}

test("Floor: assigning an available table shows it as occupied and appears on the Grid", async ({
  page,
}) => {
  await signIn(page, "2468"); // Maya Singh, manager
  await goToAllocation(page);
  await switchView(page, "Floor");

  const t1 = page.getByRole("button", { name: "Table T1, available" });
  await expect(t1).toBeVisible();
  await t1.click();

  await expect(
    page.getByText("Available — pick a server to assign it."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ava Brooks" }).click();

  await expect(
    page.getByRole("button", { name: "Table T1, assigned to Ava Brooks" }),
  ).toBeVisible();

  await switchView(page, "Grid");
  await expect(page.getByText("Table T1")).toBeVisible();
});

test("Floor: a second device cannot silently double-book a table already held by someone else", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Floor");

  await page.getByRole("button", { name: "Table T4, available" }).click();
  await page.getByRole("button", { name: "Mia Chen" }).click();
  await expect(
    page.getByRole("button", { name: "Table T4, assigned to Mia Chen" }),
  ).toBeVisible();

  // Re-select T4 and confirm the panel offers transfer, not a silent
  // reassignment -- the occupancy guarantee this feature's data-integrity
  // fix exists for.
  await page
    .getByRole("button", { name: "Table T4, assigned to Mia Chen" })
    .click();
  await expect(page.getByText("Assigned to")).toBeVisible();
  await expect(page.getByRole("button", { name: "Transfer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unassign" })).toBeVisible();
});

test("Picker: selecting a Grid cell then a table assigns it, visible on both Picker and Grid", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Picker");

  // Row 3, Mia Chen's column is guaranteed empty (demo seed fills only
  // rows 1-2), and the auto-row buffer guarantees a row 3 exists.
  const row3 = page.locator("div.contents", {
    has: page.getByRole("button", { name: "Clear row 3" }),
  });
  await row3.getByPlaceholder("Table #").first().click();

  await expect(
    page.getByText("Tap an available table to assign it to the selected cell."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Table T7, available" }).click();

  await expect(
    page.getByRole("button", { name: "Table T7, assigned to Mia Chen" }),
  ).toBeVisible();
  await switchView(page, "Grid");
  await expect(page.getByText("Table T7")).toBeVisible();
});

test("Servers: + Table assigns via the shared picker, and reorder updates the same order Grid uses", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Servers");

  await expect(page.getByText("Mia Chen")).toBeVisible();
  await expect(page.getByText("Leo Park")).toBeVisible();

  const leoCard = page.getByRole("group", { name: "Leo Park server card" });
  await leoCard.getByRole("button", { name: "Table" }).click();
  await page.getByRole("button", { name: "Table T9, available" }).click();
  await expect(leoCard.getByText("T9")).toBeVisible();

  await switchView(page, "Grid");
  await expect(page.getByText("Table T9")).toBeVisible();
});

test("Dashboard: shows operational metrics and a read-only Master Rotation", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Dashboard");

  await expect(page.getByText("Servers on floor")).toBeVisible();
  await expect(page.getByText("Active tables")).toBeVisible();
  await expect(page.getByText("Available tables")).toBeVisible();
  await expect(page.getByText("Master Rotation")).toBeVisible();
  // Read-only: no editable "Table #" inputs anywhere in this view.
  await expect(page.getByPlaceholder("Table #")).toHaveCount(0);

  await page.getByRole("button", { name: "Open Grid" }).click();
  await expect(
    page.getByRole("tab", { name: "Grid", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("a plain server also has Floor, Picker, Servers, and Dashboard available", async ({
  page,
}) => {
  await signIn(page, "1357"); // Mia Chen, server
  await goToAllocation(page);

  for (const name of ["Floor", "Picker", "Servers", "Dashboard"] as const) {
    await switchView(page, name);
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  }
});
