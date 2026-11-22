import { expect, test, type Page } from "@playwright/test";

// V2.0.13 Batch C browser coverage in demo mode: the in-memory engine mirrors the run
// RPCs (close, start, cancel, correct, sweep); the database, concurrency and RLS
// boundary are covered by pgTAP 0094 and tests/local/chore-wheel-v2-013-c.local.test.ts.
// Demo passcodes: 2468 Maya Singh (manager), 1357 Mia Chen (staff).

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

async function openTasksTab(page: Page, name: string) {
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

const isPhone = () => test.info().project.name === "server-mobile";

/** Manager (demo board allows manager entry): tick every required cell. */
async function completeAllRequired(page: Page) {
  const open = page.locator(
    '[data-testid="chore-cell"][data-state="required_open"]',
  );
  for (let guard = 0; guard < 40 && (await open.count()) > 0; guard += 1) {
    await open.first().click();
  }
  await expect(open).toHaveCount(0);
}

async function openRunHistory(page: Page) {
  await page.getByRole("button", { name: "History", exact: true }).click();
  const type = page.getByRole("group", { name: "History type" });
  await type.getByRole("button", { name: "Chore Wheel" }).click();
  const region = page.getByRole("region", { name: "Task history" });
  // Expand every month group.
  for (const header of await region
    .getByRole("button", { expanded: false })
    .all()) {
    if (/20\d\d/.test((await header.textContent()) ?? "")) await header.click();
  }
  return region;
}

test("manager: complete work is not close; closing saves the run to History as a frozen matrix and starts the next", async ({
  page,
}) => {
  test.skip(
    isPhone(),
    "Cell-by-cell completion is exercised on desktop and tablet.",
  );
  await signIn(page, "2468");
  await openTasksTab(page, "Chore Wheel");
  await expect(page.getByTestId("chore-recurrence")).toContainText(
    "a manager closes it",
  );
  await completeAllRequired(page);

  // Manual reset: finished work waits for a manager; nothing cleared by itself.
  const ready = page.getByTestId("chore-ready-to-close");
  await expect(ready).toContainText("Every required check is done");
  await expect(page.getByTestId("chore-stat-percent")).toContainText("100%");
  await page.getByTestId("chore-close-and-start").click();

  await expect(page.getByTestId("chore-ready-to-close")).toHaveCount(0);
  await expect(page.getByTestId("chore-stat-completed")).toContainText("0");
  await expect(page.getByText(/Run 2/).first()).toBeVisible();

  const history = await openRunHistory(page);
  const finished = history.getByTestId("history-run-row").filter({
    hasText: "Run 1",
  });
  await expect(finished).toContainText("Daily Refill & Prep");
  await expect(finished).toContainText("Completed");
  await expect(finished).toContainText("Closed by Maya Singh");
  await expect(
    history.getByTestId("history-completed").getByTestId("history-run-row"),
  ).toHaveCount(1);
  await expect(
    history
      .getByTestId("history-not-completed")
      .getByTestId("history-run-row")
      .filter({ hasText: "Run 2" }),
  ).toContainText("In progress");

  // The saved run is the matrix as it was, and a correction is appended, never overwritten.
  await finished.getByTestId("history-open-run").click();
  const detail = page.getByTestId("chore-run-detail");
  await expect(detail.getByRole("table")).toContainText(
    "Mango Lassi — Bucket 1",
  );
  await expect(detail).toContainText(
    "None. This is exactly what was recorded.",
  );
  await detail
    .getByRole("button", { name: /^Correct Mango Lassi — Bucket 1, Mia: done/ })
    .click();
  await detail.getByTestId("chore-correction-reason").fill("Mia was off shift");
  await detail.getByTestId("chore-correction-save").click();
  const list = detail.getByTestId("chore-corrections");
  await expect(list).toContainText("done → not done");
  await expect(list).toContainText("Mia was off shift");
  await expect(detail).toContainText("After corrections");
  await expectNoHorizontalScroll(page);
});

test("manager: cancelling a run needs a reason, is kept as Not completed, and the board waits for a manual start", async ({
  page,
}) => {
  test.skip(isPhone(), "Run controls are exercised on desktop and tablet.");
  await signIn(page, "2468");
  await openTasksTab(page, "Chore Wheel");
  await page
    .locator('[data-testid="chore-cell"][data-state="required_open"]')
    .first()
    .click();

  await page.getByTestId("chore-cancel-run").click();
  const confirm = page.getByTestId("chore-cancel-confirm");
  await expect(confirm).toBeDisabled(); // no reason yet
  await page
    .getByTestId("chore-cancel-reason")
    .fill("Closed early for an event");
  await page.getByLabel("Start a fresh run right away").uncheck();
  await confirm.click();

  const between = page.getByTestId("chore-between-runs");
  await expect(between).toContainText("No run is open");
  await expect(between).toContainText("Cancelled");
  await expect(page.getByTestId("chore-matrix")).toHaveCount(0);
  await page.getByTestId("chore-start-run").click();
  await expect(page.getByTestId("chore-between-runs")).toHaveCount(0);
  await expect(page.getByText(/Run 2/).first()).toBeVisible();

  const history = await openRunHistory(page);
  const cancelled = history
    .getByTestId("history-not-completed")
    .getByTestId("history-run-row")
    .filter({ hasText: "Run 1" });
  await expect(cancelled).toContainText("Cancelled");
  await expect(cancelled).toContainText("Reason: Closed early for an event");
  await expect(
    history.getByTestId("history-completed").getByTestId("history-run-row"),
  ).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("staff: no close, start or cancel controls; History shows run summaries but not the saved matrix", async ({
  page,
}) => {
  await signIn(page, "1357");
  await openTasksTab(page, "Chore Wheel");
  await expect(page.getByTestId("chore-cancel-run")).toHaveCount(0);
  await expect(page.getByTestId("chore-close-and-start")).toHaveCount(0);
  await expect(page.getByTestId("chore-start-run")).toHaveCount(0);
  await expect(page.getByTestId("chore-open-history")).toBeVisible();

  await page.getByTestId("chore-open-history").click();
  const region = page.getByRole("region", { name: "Task history" });
  await expect(region).toBeVisible();
  // The board's own runs only (the shortcut preselects the Chore Wheel scope).
  await expect(
    region.getByRole("group", { name: "History type" }).getByRole("button", {
      name: "Chore Wheel",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("history-open-run")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("History: a manager moves a completed task back to In Progress and it leaves Completed", async ({
  page,
}) => {
  await signIn(page, "2468");
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "Assigned", exact: true }).click();
  await page
    .getByRole("checkbox", { name: /Mark complete: Refill ice bins/ })
    .click();
  await expect(
    page.getByRole("checkbox", { name: /Reopen: Refill ice bins/ }),
  ).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "History", exact: true }).click();
  const history = page.getByRole("region", { name: "Task history" });
  const done = history.getByTestId("history-completed");
  await expect(done).toContainText("Refill ice bins");

  await history
    .getByRole("combobox", { name: "Status: Refill ice bins" })
    .selectOption("in_progress");
  await expect(
    history.getByTestId("history-completed").filter({
      hasText: "Refill ice bins",
    }),
  ).toHaveCount(0);
  const moved = history
    .getByTestId("history-task-row")
    .filter({ hasText: "Refill ice bins" });
  await expect(moved).toContainText("In Progress");
  await expect(
    history
      .getByTestId("history-not-completed")
      .filter({ hasText: "Refill ice bins" }),
  ).toBeVisible();
  // Edit / reassign stay available on work that is no longer completed.
  await expect(
    moved.getByRole("button", { name: "Reassign: Refill ice bins" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});
