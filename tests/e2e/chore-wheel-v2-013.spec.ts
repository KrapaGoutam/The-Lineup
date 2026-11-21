import { expect, test, type Page } from "@playwright/test";

// V2.0.13 Batch B browser coverage in demo mode: the in-memory engine mirrors the
// chore RPCs; the database, RLS and real-JWT boundary are covered by pgTAP 0093 and
// tests/local/chore-wheel-v2-013.local.test.ts. Runs on the desktop, tablet and phone
// projects (the phone gets the person list, the others the matrix).
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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function cell(page: Page, chore: string, person: string) {
  return page.getByRole("checkbox", {
    name: new RegExp(`^${escapeRe(chore)} — ${escapeRe(person)}:`),
  });
}

const isPhone = () => test.info().project.name === "server-mobile";

test("staff: the board shows, own cells persist across tabs, others are read-only, progress counts", async ({
  page,
}) => {
  await signIn(page, "1357");
  await openTasksTab(page, "Chore Wheel");

  // Staff get the board but no management entry.
  await expect(page.getByTestId("chore-board-name")).toHaveText(
    "Daily Refill & Prep",
  );
  await expect(
    page.getByRole("button", { name: "Manage", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Manage board" })).toHaveCount(
    0,
  );

  // 6 all-column chores x 3 people + 1 any-one chore; the optional chore is excluded.
  const summary = page.getByTestId("chore-summary");
  await expect(summary).toContainText("Required checks");
  await expect(summary.getByTestId("chore-stat-required")).toContainText("19");
  await expect(summary.getByTestId("chore-stat-percent")).toContainText("0%");

  // Own column: tick, and the counts move.
  const mine = cell(page, "Mango Lassi — Bucket 1", "Mia");
  await expect(mine).toHaveAttribute("aria-checked", "false");
  await mine.click();
  await expect(mine).toHaveAttribute("aria-checked", "true");
  await expect(summary.getByTestId("chore-stat-completed")).toContainText("1");
  await expect(summary.getByTestId("chore-stat-remaining")).toContainText("18");
  await expect(summary.getByTestId("chore-stat-percent")).toContainText("5%");

  // Someone else's column is not operable (phone: pick them from the list first).
  if (isPhone()) {
    await page.getByLabel("Person").selectOption({ label: "Leo" });
  }
  const theirs = cell(page, "Mango Lassi — Bucket 1", "Leo");
  await expect(theirs).toHaveAttribute("aria-disabled", "true");
  await theirs.click({ force: true });
  await expect(theirs).toHaveAttribute("aria-checked", "false");

  // The state is server-held, not component-local: leave and come back.
  await page.getByRole("button", { name: "All Tasks", exact: true }).click();
  await page.getByRole("button", { name: "Chore Wheel", exact: true }).click();
  if (isPhone()) {
    await expect(page.getByLabel("Person")).toBeVisible();
  }
  await expect(cell(page, "Mango Lassi — Bucket 1", "Mia")).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Untick persists too.
  if (isPhone()) {
    await page.getByLabel("Person").selectOption({ label: "Mia (you)" });
  }
  await cell(page, "Mango Lassi — Bucket 1", "Mia").click();
  await expect(cell(page, "Mango Lassi — Bucket 1", "Mia")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(summary.getByTestId("chore-stat-percent")).toContainText("0%");
  await expectNoHorizontalScroll(page);
});

test("layout: matrix with sticky chore labels on desktop/tablet, person list on a phone", async ({
  page,
}) => {
  await signIn(page, "1357");
  await openTasksTab(page, "Chore Wheel");
  if (isPhone()) {
    await expect(page.getByTestId("chore-person-list")).toBeVisible();
    await expect(page.getByTestId("chore-matrix")).toHaveCount(0);
    // Every checkbox target is at least 44px.
    const box = await page
      .getByRole("checkbox", { name: /Mia:/ })
      .first()
      .boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  } else {
    await expect(page.getByTestId("chore-matrix")).toBeVisible();
    await expect(page.getByTestId("chore-person-list")).toHaveCount(0);
    await expect(page.getByTestId("chore-column-header")).toHaveCount(3);
    const box = await page
      .getByRole("checkbox", { name: /Mia:/ })
      .first()
      .boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await expectNoHorizontalScroll(page);
});

test("manager: builds a board end to end (create, people, chores, rules, access) and it drives the Chore Wheel", async ({
  page,
}) => {
  test.skip(isPhone(), "Manager setup is exercised on desktop and tablet.");
  await signIn(page, "2468");
  await openTasksTab(page, "Manage");

  // The existing setup panels stay; the chore settings sit beside them.
  await expect(page.getByRole("button", { name: "Task setup" })).toBeVisible();
  for (const name of [
    "Boards",
    "People / Columns",
    "Chores / Rows",
    "Completion Rules",
    "Access / Permissions",
  ]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }

  // Create a board; it is selected automatically.
  await page.getByRole("button", { name: "Boards", exact: true }).click();
  await page.getByRole("button", { name: "New board" }).click();
  let dialog = page.getByRole("dialog", { name: "New board" });
  await dialog.getByLabel("Board name").fill("Evening Close");
  await dialog.getByLabel("Description (optional)").fill("Close the line");
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByTestId("chore-board-item").filter({ hasText: "Evening Close" }),
  ).toBeVisible();

  // A duplicate live name is refused with a plain message.
  await page.getByRole("button", { name: "New board" }).click();
  dialog = page.getByRole("dialog", { name: "New board" });
  await dialog.getByLabel("Board name").fill("evening close");
  await dialog.getByRole("button", { name: "Create board" }).click();
  await expect(dialog.getByRole("alert")).toContainText("already exists");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // People: an employee column, a renamed label, and an unassigned position.
  await page.getByRole("button", { name: "People / Columns" }).click();
  await expect(
    page.getByLabel("Board", { exact: true }).locator("option:checked"),
  ).toHaveText("Evening Close");
  await page.getByRole("button", { name: "Add column" }).first().click();
  dialog = page.getByRole("dialog", { name: "Add column" });
  await dialog.getByLabel("Employee").selectOption({ label: "Mia Chen" });
  await dialog.getByLabel("Column label").fill("Mia (grill)");
  await dialog.getByRole("button", { name: "Add column" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Add column" }).first().click();
  dialog = page.getByRole("dialog", { name: "Add column" });
  await dialog.getByLabel("Column label").fill("Dish pit");
  await dialog.getByRole("button", { name: "Add column" }).click();
  await expect(dialog).toBeHidden();
  const miaColumn = page
    .getByTestId("chore-column-item")
    .filter({ hasText: "Mia (grill)" });
  await expect(miaColumn).toContainText("Assigned to Mia Chen");
  await expect(
    page.getByTestId("chore-column-item").filter({ hasText: "Dish pit" }),
  ).toContainText("Position");

  // The same person cannot hold two live columns.
  await page.getByRole("button", { name: "Add column" }).first().click();
  dialog = page.getByRole("dialog", { name: "Add column" });
  await expect(
    dialog.getByRole("option", { name: /Mia Chen \(already has a column\)/ }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // Chores: several at once, then a selected-people rule and an optional chore.
  await page.getByRole("button", { name: "Chores / Rows" }).click();
  await page.getByRole("button", { name: "Add several" }).click();
  dialog = page.getByRole("dialog", { name: "Add several chores" });
  await dialog
    .getByLabel("Chores")
    .fill("Scrape the grill\nFill sanitizer\nMop the line");
  await dialog.getByRole("button", { name: "Add 3 chores" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("chore-row-item")).toHaveCount(3);

  const fill = page
    .getByTestId("chore-row-item")
    .filter({ hasText: "Fill sanitizer" });
  await fill.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog", { name: "Edit chore" });
  await dialog
    .getByLabel("Who must complete it")
    .selectOption("selected_columns");
  await dialog.getByLabel("Dish pit").check();
  await dialog.getByRole("button", { name: "Save chore" }).click();
  await expect(dialog).toBeHidden();
  await expect(fill).toContainText("Selected people required: Dish pit");

  const mop = page
    .getByTestId("chore-row-item")
    .filter({ hasText: "Mop the line" });
  await mop.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog", { name: "Edit chore" });
  await dialog.getByLabel("Required").uncheck();
  await dialog.getByRole("button", { name: "Save chore" }).click();
  await expect(dialog).toBeHidden();
  await expect(mop).toContainText("Optional");

  // Reorder: move "Mop the line" to the top.
  await mop.getByRole("button", { name: "Move Mop the line up" }).click();
  await mop.getByRole("button", { name: "Move Mop the line up" }).click();
  await expect(page.getByTestId("chore-row-item").first()).toContainText(
    "Mop the line",
  );

  // Completion rules: the reserved controls are labelled as not active.
  await page.getByRole("button", { name: "Completion Rules" }).click();
  await expect(page.getByText("Reserved — not active yet")).toBeVisible();
  await page.getByLabel("Intended repeat").selectOption("weekly");
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved." }),
  ).toBeVisible();

  // Access: allow manager corrections.
  await page.getByRole("button", { name: "Access / Permissions" }).click();
  await page.getByLabel(/Managers can correct other people/).check();
  await page.getByRole("button", { name: "Save access" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved." }),
  ).toBeVisible();

  // The Chore Wheel now runs the new board: 2 required chores x 2 columns, except
  // the selected-people chore (1) and the optional chore (not counted) => 2 + 1 = 3.
  await page.getByRole("button", { name: "Chore Wheel", exact: true }).click();
  await page.getByRole("button", { name: "Evening Close" }).click();
  await expect(page.getByTestId("chore-board-name")).toHaveText(
    "Evening Close",
  );
  const summary = page.getByTestId("chore-summary");
  await expect(summary.getByTestId("chore-stat-required")).toContainText("3");
  await expect(
    page.getByRole("img", {
      name: /Fill sanitizer — Mia \(grill\): not applicable/,
    }),
  ).toBeVisible();

  // The override is on, so the manager can tick a column that is not theirs.
  const grill = cell(page, "Scrape the grill", "Mia \(grill\)");
  await grill.click();
  await expect(grill).toHaveAttribute("aria-checked", "true");
  await expect(summary.getByTestId("chore-stat-percent")).toContainText("33%");
  await expectNoHorizontalScroll(page);
});

test("manager: reassign keeps the history, duplicate copies configuration only, archive leaves the list", async ({
  page,
}) => {
  test.skip(isPhone(), "Manager setup is exercised on desktop and tablet.");
  await signIn(page, "2468");

  // Tick a cell on the seeded board first (manager override is on in the demo).
  await openTasksTab(page, "Chore Wheel");
  await cell(page, "Clean Prep Counter", "Leo").click();
  await expect(cell(page, "Clean Prep Counter", "Leo")).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await page.getByRole("button", { name: "Manage board" }).click();
  await expect(page.getByTestId("chore-board-item")).toHaveCount(1);

  // Duplicate: configuration only, no checked cells.
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Duplicate board" });
  await dialog.getByLabel("Name of the new board").fill("Prep copy");
  await dialog.getByRole("button", { name: "Duplicate board" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("chore-board-item")).toHaveCount(2);

  await page.getByRole("button", { name: "People / Columns" }).click();
  await expect(
    page.getByLabel("Board", { exact: true }).locator("option:checked"),
  ).toHaveText("Prep copy");
  await expect(page.getByTestId("chore-column-item")).toHaveCount(3);

  // Reassign Leo's column on the ORIGINAL board to Ava: label changes, history kept.
  await page.getByLabel("Board", { exact: true }).selectOption({
    label: "Daily Refill & Prep",
  });
  const leo = page
    .getByTestId("chore-column-item")
    .filter({ hasText: "Assigned to Leo Park" });
  await leo.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog", { name: "Edit column" });
  // Ava already has a column on this board, so she cannot be chosen yet.
  await expect(
    dialog.getByRole("option", { name: /Ava Brooks \(already has a column\)/ }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // Free Ava by switching her column off, then the reassignment goes through.
  await page
    .getByTestId("chore-column-item")
    .filter({ hasText: "Assigned to Ava Brooks" })
    .getByRole("button", { name: "Turn off" })
    .click();
  await leo.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog", { name: "Edit column" });
  await dialog.getByLabel("Column label").fill("Closer");
  await dialog.getByLabel("Employee").selectOption({ label: "Ava Brooks" });
  await dialog.getByRole("button", { name: "Save column" }).click();
  await expect(dialog).toBeHidden();
  const closer = page
    .getByTestId("chore-column-item")
    .filter({ hasText: "Closer" });
  await expect(closer).toContainText("Assigned to Ava Brooks");
  await closer.getByText(/Assignment history/).click();
  await expect(closer).toContainText("Leo Park");

  // The check Leo made earlier still stands under his name after the reassignment.
  await page.getByRole("button", { name: "Chore Wheel", exact: true }).click();
  await expect(cell(page, "Clean Prep Counter", "Closer")).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Archive the copy: it leaves the list.
  await page.getByRole("button", { name: "Manage board" }).click();
  await page.getByRole("button", { name: "Boards", exact: true }).click();
  await page
    .getByTestId("chore-board-item")
    .filter({ hasText: "Prep copy" })
    .getByRole("button", { name: "Archive" })
    .click();
  const confirm = page.getByRole("dialog", { name: "Archive this board?" });
  await confirm.getByRole("button", { name: "Archive board" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByTestId("chore-board-item")).toHaveCount(1);
  await expect(page.getByText("Archived boards (1)")).toBeVisible();
});

test("existing Tasks views are untouched (All Tasks, Checklists, Opening, Closing, Assigned, Today)", async ({
  page,
}) => {
  await signIn(page, "2468");
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  for (const name of [
    "Today",
    "My Tasks",
    "All Tasks",
    "Checklists",
    "Chore Wheel",
    "Opening",
    "Closing",
    "Assigned",
    "Manage",
    "History",
  ]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "All Tasks", exact: true }).click();
  await expect(page.getByRole("region", { name: "All tasks" })).toBeVisible();
  // The original Manage content is still the default section there.
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Task setup" }),
  ).toHaveAttribute("aria-current", "page");
});
