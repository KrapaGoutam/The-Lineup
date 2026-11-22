import { expect, test, type Page } from "@playwright/test";

// V2.0.13 Batch A browser coverage in demo mode (the in-memory engine mirrors
// the RPCs; the database and real-JWT boundary are covered by pgTAP 0092 and
// tests/local/tasks-v2-013.local.test.ts). Runs on the desktop, tablet and
// phone projects. Demo passcodes: 2468 Maya Singh (manager), 1357 Mia Chen (staff).

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

async function openTab(page: Page, name: string) {
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await page.getByRole("button", { name, exact: true }).click();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("a manager builds a checklist task, ticks steps, changes status and archives it (All Tasks + Checklists)", async ({
  page,
}) => {
  await signIn(page, "2468");
  await page.getByRole("button", { name: "Tasks", exact: true }).click();

  await page.getByRole("button", { name: /New task/ }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill("E2E opening kitchen");
  await dialog.getByLabel("Assign to").selectOption("all_team");
  await dialog.getByRole("button", { name: "Add step" }).click();
  await dialog.getByLabel("Step 1", { exact: true }).fill("Check fridge temps");
  await dialog.getByRole("button", { name: "Add step" }).click();
  await dialog.getByLabel("Step 2", { exact: true }).fill("Refill lassi");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();

  // All Tasks: the row shows checklist progress, and search reaches steps.
  await page.getByRole("button", { name: "All Tasks", exact: true }).click();
  const register = page.getByRole("region", { name: "All tasks" });
  await register.getByRole("searchbox", { name: "Search tasks" }).fill("lassi");
  const row = register.getByTestId("task-row").filter({
    hasText: "E2E opening kitchen",
  });
  await expect(row).toBeVisible();
  await expect(row.getByText("0 of 2 steps")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Status from the row: In Progress, then it shows under that filter.
  await row
    .getByRole("combobox", { name: "Status: E2E opening kitchen" })
    .selectOption("in_progress");
  await register.getByRole("searchbox").fill("");
  await register.getByRole("button", { name: /^In Progress/ }).click();
  await expect(register.getByText("E2E opening kitchen")).toBeVisible();

  // Checklists tab: tick a step; the task itself is not completed.
  await page.getByRole("button", { name: "Checklists", exact: true }).click();
  const card = page
    .getByTestId("checklist-card")
    .filter({ hasText: "E2E opening kitchen" });
  await card
    .getByRole("checkbox", { name: "Check: Check fridge temps" })
    .click();
  await expect(card.getByText("1 of 2 completed")).toBeVisible();
  await card.getByRole("checkbox", { name: "Check: Refill lassi" }).click();
  await expect(card.getByText("2 of 2 completed")).toBeVisible();
  await expect(card.getByText("In Progress")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // The task has history now: Delete archives it instead of erasing it.
  await page.getByRole("button", { name: "All Tasks", exact: true }).click();
  await register
    .getByRole("button", { name: "Delete: E2E opening kitchen" })
    .click();
  const confirm = page.getByRole("dialog", { name: "Delete task" });
  await expect(confirm.getByText(/archived instead/)).toBeVisible();
  await confirm.getByRole("button", { name: "Delete task" }).click();
  await expect(page.getByRole("status")).toContainText("archived");
  await expect(register.getByText("E2E opening kitchen")).toHaveCount(0);
});

test("staff see All Tasks and Checklists without manager controls and can tick their steps", async ({
  page,
}) => {
  await signIn(page, "1357");
  await openTab(page, "All Tasks");
  const register = page.getByRole("region", { name: "All tasks" });
  await expect(register).toBeVisible();
  await expect(register.getByRole("button", { name: /^Delete:/ })).toHaveCount(
    0,
  );
  await expect(
    register.getByRole("button", { name: /^Reassign:/ }),
  ).toHaveCount(0);
  await expect(register.getByRole("button", { name: /^Edit:/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /New task/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Checklists", exact: true }).click();
  await expect(page.getByRole("button", { name: /New checklist/ })).toHaveCount(
    0,
  );
  await expectNoHorizontalScroll(page);
});
