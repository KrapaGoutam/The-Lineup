import { expect, test, type Page } from "@playwright/test";

// Tasks → History in demo mode. Demo passcodes: 2468 Maya Singh (manager),
// 1357 Mia Chen (staff).

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

async function openTasks(page: Page) {
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
}

test("History lists a completed task with who was assigned and who completed it, without horizontal scroll", async ({
  page,
}) => {
  await signIn(page, "2468"); // Maya Singh
  await openTasks(page);

  // Complete a task Mia Chen was assigned, on her behalf.
  await page.getByRole("button", { name: "Assigned", exact: true }).click();
  await page
    .getByRole("checkbox", { name: /Mark complete: Refill ice bins/ })
    .click();
  await expect(
    page.getByRole("checkbox", { name: /Reopen: Refill ice bins/ }),
  ).toHaveAttribute("aria-checked", "true");

  // The existing sections are untouched; History is one more.
  for (const name of ["Today", "My Tasks", "Opening", "Closing", "Manage"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "History", exact: true }).click();

  const history = page.getByRole("region", { name: "Completed task history" });
  await expect(history).toBeVisible();
  const row = history.getByRole("listitem").filter({
    hasText: "Refill ice bins",
  });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Mia Chen"); // assigned to
  await expect(row).toContainText("Maya Singh"); // completed by
  await expect(row).toContainText("Regular");
  await expect(
    history.getByRole("heading", { level: 2 }).first(),
  ).toContainText(/\d{4} · \d+ tasks?/);

  // Search narrows; a miss explains itself.
  await page
    .getByRole("searchbox", { name: "Search task history" })
    .fill("zzz");
  await expect(
    page.getByText("No completed tasks match your search."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(row).toBeVisible();

  // No horizontal scrolling at any viewport project (desktop, tablet, phone).
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
