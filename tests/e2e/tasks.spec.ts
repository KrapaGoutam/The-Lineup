import { expect, test, type Page } from "@playwright/test";

// Tasks V1 browser coverage in demo mode (in-memory engine that mirrors the
// database RPCs; the DB itself is covered by pgTAP 0026). Demo passcodes:
// 2468 Maya Singh (manager), 1357 Mia Chen (staff), 9999 owner.

async function signInOnCurrentPage(page: Page, passcode: string) {
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(accountButton(page)).toBeVisible({ timeout: 60000 });
}

function accountButton(page: Page) {
  return page
    .getByRole("button", { name: "Account and quick settings" })
    .first();
}

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  await signInOnCurrentPage(page, passcode);
}

async function signOut(page: Page) {
  await accountButton(page).click();
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page.getByLabel("Restaurant passcode")).toBeVisible();
}

async function openTasks(page: Page) {
  // Tasks is a primary module: a direct button on desktop and in the mobile dock.
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
}

test("Table Allocation and Tasks are the primary modules; the rest stay reachable (TASK-082)", async ({
  page,
}) => {
  await signIn(page, "2468");

  // The fixed dock exists below the lg breakpoint (phones, portrait tablets).
  const dock = page.getByRole("navigation", { name: "Mobile navigation" });
  if (await dock.isVisible()) {
    await expect(dock.getByRole("button", { name: "Tasks" })).toBeVisible();
    await expect(
      dock.getByRole("button", { name: /Allocation/ }),
    ).toBeVisible();
    // Everything else is one tap away in "More".
    await expect(dock.getByRole("button", { name: "Tip Split" })).toHaveCount(
      0,
    );
    await dock.getByRole("button", { name: "More" }).click();
    for (const label of ["Schedule", "Team", "Attendance", "Tip Split"]) {
      await expect(
        page.getByRole("dialog", { name: "More" }).getByRole("button", {
          name: label,
        }),
      ).toBeVisible();
    }
  } else {
    const primary = page.locator('[data-nav-tier="primary"]');
    await expect(primary).toHaveText([/Table Allocation/, /Tasks/]);
    const secondary = page.locator('[data-nav-tier="secondary"]');
    for (const label of ["Schedule", "Team", "Attendance", "Tip Split"]) {
      await expect(secondary.filter({ hasText: label })).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: "Settings", exact: true }),
    ).toBeVisible();
  }
});

test("staff see only their work, complete it, and get no manager controls (TASK-005/060/007)", async ({
  page,
}) => {
  await signIn(page, "1357"); // Mia Chen, staff
  await openTasks(page);

  await page.getByRole("button", { name: "My Tasks", exact: true }).click();
  const ice = page.getByRole("checkbox", {
    name: /Mark complete: Refill ice bins/,
  });
  await expect(ice).toBeVisible();
  // Other people's individual tasks are invisible to staff.
  await expect(page.getByText("Restock server station")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /New task/ })).toHaveCount(0);

  // Detail view: operational info, but no audit timeline or manager actions.
  await page.getByText("Refill ice bins").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("region", { name: "Task history" }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Reassign/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close" }).click();

  // One tap completes it; the server (engine) result is what is shown.
  await ice.click();
  await expect(
    page.getByRole("checkbox", { name: /Reopen: Refill ice bins/ }),
  ).toHaveAttribute("aria-checked", "true");
});

test("a manager creates a team task that staff then see (TASK-001)", async ({
  page,
}) => {
  await signIn(page, "2468"); // Maya Singh, manager
  await openTasks(page);

  await page.getByRole("button", { name: /New task/ }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill("E2E wipe down menus");
  await dialog.getByLabel("Assign to").selectOption("all_team");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "My Tasks", exact: true }).click();
  await expect(page.getByText("E2E wipe down menus")).toBeVisible();

  // Same in-memory session, different person: the staff member sees it.
  await signOut(page);
  await signInOnCurrentPage(page, "1357");
  await openTasks(page);
  await page.getByRole("button", { name: "My Tasks", exact: true }).click();
  await expect(page.getByText("E2E wipe down menus")).toBeVisible();
});

test("a stale-looking list reconciles after navigating away and back (TASK-084)", async ({
  page,
}) => {
  await signIn(page, "1357");
  await openTasks(page);
  await page.getByRole("button", { name: "My Tasks", exact: true }).click();
  await page
    .getByRole("checkbox", { name: /Mark complete: Refill ice bins/ })
    .click();
  await expect(
    page.getByRole("checkbox", { name: /Reopen: Refill ice bins/ }),
  ).toBeVisible();

  // Leave and come back: the module re-mounts and re-reads authoritative state.
  await page
    .getByRole("button", { name: /Allocation/ })
    .first()
    .click();
  await openTasks(page);
  await page.getByRole("button", { name: "My Tasks", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: /Reopen: Refill ice bins/ }),
  ).toHaveAttribute("aria-checked", "true");
});

async function openAssigned(page: Page) {
  await openTasks(page);
  await page.getByRole("button", { name: "Assigned", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Assigned tasks" }),
  ).toBeVisible();
}

test("staff never get the Assigned or Manage sections (TASK-002)", async ({
  page,
}) => {
  await signIn(page, "1357");
  await openTasks(page);
  await expect(
    page.getByRole("button", { name: "Assigned", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Manage", exact: true }),
  ).toHaveCount(0);
});

test("a manager completes on behalf and the assignee is preserved (TASK-006)", async ({
  page,
}) => {
  await signIn(page, "2468"); // Maya Singh
  await openAssigned(page);

  await page
    .getByRole("checkbox", { name: /Mark complete: Refill ice bins/ })
    .click();
  const done = page.getByRole("checkbox", {
    name: /Reopen: Refill ice bins/,
  });
  await expect(done).toHaveAttribute("aria-checked", "true");

  await page
    .getByRole("button", { name: /Refill ice bins/ })
    .last()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Mia Chen").first()).toBeVisible(); // still assigned
  await expect(dialog.getByText(/Maya Singh/).first()).toBeVisible(); // completed by
  const history = dialog.getByRole("region", { name: "Task history" }); // TASK-061
  await expect(history).toContainText("Completed on behalf of the assignee");
  await dialog.getByRole("button", { name: "Close" }).click();

  // The employee sees who actually completed it, but no timeline.
  await signOut(page);
  await signInOnCurrentPage(page, "1357");
  await openTasks(page);
  await page.getByRole("button", { name: "My Tasks", exact: true }).click();
  await page
    .getByRole("button", { name: "Completed", exact: false })
    .first()
    .click();
  await expect(page.getByText("Completed by Maya Singh")).toBeVisible();
});

test("a manager reassigns and cancels a task (TASK-008)", async ({ page }) => {
  await signIn(page, "2468");
  await openAssigned(page);

  await page.getByRole("button", { name: /Clean patio heaters/ }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Reassign…" }).click();
  await dialog.getByLabel("Person").selectOption({ label: "Ava Brooks" });
  await dialog.getByRole("button", { name: "Save assignment" }).click();
  await expect(dialog.getByText("Ava Brooks").first()).toBeVisible();
  await expect(
    dialog.getByRole("region", { name: "Task history" }),
  ).toContainText("Reassigned");
  await dialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /Clean patio heaters/ }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cancel task…" }).click();
  await dialog
    .getByRole("button", { name: "Cancel task", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Clean patio heaters/ }),
  ).toHaveCount(0);
});

test("a manager filters by person and hands off unfinished work (TASK-014)", async ({
  page,
}) => {
  await signIn(page, "2468");
  await openAssigned(page);

  await page
    .locator("label", { hasText: /^Person/ })
    .locator("select")
    .selectOption({ label: "Ava Brooks" });
  await expect(page.getByText("Restock server station")).toBeVisible();
  await expect(page.getByText("Refill ice bins")).toHaveCount(0);
  await expect(page.getByLabel("Progress by person, or progress")).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const panel = page.getByRole("region", { name: "Unfinished work" });
  await panel.getByLabel("Select Restock server station").check();
  await panel.getByRole("button", { name: /Carry forward/ }).click();
  await expect(panel.getByText("Restock server station")).toHaveCount(0);
});

async function openChecklist(page: Page, name: "Opening" | "Closing") {
  await openTasks(page);
  await page.getByRole("button", { name, exact: true }).click();
  await expect(
    page.getByRole("region", { name: `${name} checklist` }),
  ).toBeVisible();
}

test("opening: common and person-specific items, persisted completion (TASK-020/021/022)", async ({
  page,
}) => {
  await signIn(page, "1357"); // Mia Chen
  await openChecklist(page, "Opening");

  const day = page.getByRole("article", { name: "Weekday Opening" });
  await expect(day.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await expect(day.getByText("0 / 6 complete")).toBeVisible();

  // Common item: anyone.
  await day
    .getByRole("checkbox", { name: /Mark complete: Unlock entrance/ })
    .click();
  // Mia's own person-specific item: allowed. Leo's: not.
  await day.getByRole("checkbox", { name: /Mark complete: Set patio/ }).click();
  await expect(
    day.getByRole("checkbox", { name: /Mark complete: Count register/ }),
  ).toBeDisabled();
  await expect(day.getByText("2 / 6 complete")).toBeVisible();

  // Leave and return: state is re-read, not remembered by the screen.
  await page.getByRole("button", { name: "Closing", exact: true }).click();
  await page.getByRole("button", { name: "Opening", exact: true }).click();
  await expect(
    page
      .getByRole("article", { name: "Weekday Opening" })
      .getByText("2 / 6 complete"),
  ).toBeVisible();
});

test("opening: yesterday's checked state never appears today (TASK-025/026)", async ({
  page,
}) => {
  await signIn(page, "1357");
  await openChecklist(page, "Opening");

  // Yesterday (seeded 3 / 6) is history; today starts at 0 / 6.
  await expect(page.getByText("0 / 6 complete")).toBeVisible();
  const history = page.getByRole("region", { name: "Previous days" });
  await expect(history.getByText("3 / 6 · 50%")).toBeVisible();
  await history.getByRole("button", { expanded: false }).first().click();
  await expect(
    history.getByRole("checkbox", { name: /Reopen: Unlock entrance/ }),
  ).toBeDisabled(); // staff cannot rewrite history
  await expect(
    page
      .getByRole("article", { name: "Weekday Opening" })
      .getByRole("checkbox", { name: /Mark complete: Unlock entrance/ }),
  ).toBeVisible();
});

test("a manager completes a closing item for its assignee (TASK-033)", async ({
  page,
}) => {
  await signIn(page, "2468");
  await openChecklist(page, "Closing");

  const day = page.getByRole("article", { name: "Weekday Closing" });
  await expect(day.getByText("Still to do:")).toBeVisible();
  await day
    .getByRole("checkbox", { name: /Mark complete: Close register/ })
    .click();
  const row = day.getByRole("listitem").filter({ hasText: "Close register" });
  await expect(row).toContainText("Completed by Maya Singh");
  await expect(row).toContainText("Leo Park"); // assignee preserved
});

test("a manager builds a template that produces its own checklist (TASK-035)", async ({
  page,
}) => {
  await signIn(page, "2468");
  await openTasks(page);
  await page.getByRole("button", { name: "Manage", exact: true }).click();

  await page.getByRole("button", { name: "New closing template" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Template name").fill("Bar Closing");
  await dialog
    .getByRole("textbox", { name: "Item 1", exact: true })
    .fill("Wipe the bar");
  await dialog.getByRole("button", { name: "Add item" }).click();
  await dialog
    .getByRole("textbox", { name: "Item 2", exact: true })
    .fill("Restock garnish");
  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("region", { name: "Checklist templates" }),
  ).toContainText("Bar Closing");

  // A duplicate name is rejected with a plain message.
  await page.getByRole("button", { name: "New closing template" }).click();
  const again = page.getByRole("dialog");
  await again.getByLabel("Template name").fill("Bar Closing");
  await again.getByRole("textbox", { name: "Item 1", exact: true }).fill("x");
  await again.getByRole("button", { name: "Save template" }).click();
  await expect(again.getByRole("alert")).toContainText("already exists");
  await again.getByRole("button", { name: "Cancel" }).click();

  // Staff-facing result appears in the Closing tab.
  await page.getByRole("button", { name: "Closing", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "Bar Closing" }),
  ).toBeVisible();
});
