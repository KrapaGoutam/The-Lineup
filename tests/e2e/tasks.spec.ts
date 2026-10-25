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
