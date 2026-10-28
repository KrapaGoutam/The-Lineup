import { expect, test, type Page } from "@playwright/test";

// Tasks V1.1 / T-2 (TS-010..TS-017, #169): Owner / Manager see Today as
// All Staff, My Tasks or one person, with the staff name on every row;
// staff get no selector and no coworker work. Demo mode (in-memory engine
// that mirrors the RPCs; RLS itself is covered by pgTAP 0026 / 0029).
// Demo passcodes: 2468 Maya Singh (manager), 9999 Krapa Goutam (owner),
// 1357 Mia Chen (staff). Seeded: Refill ice bins -> Mia, Clean patio
// heaters -> Leo, Take trash outside -> Mia + Leo + Ava, Restock server
// station -> Ava (overdue), Check restroom -> anyone (done).

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
}

const selector = (page: Page) => page.getByLabel("Show tasks for");
const row = (page: Page, title: string) =>
  page.locator(`[data-testid="task-row"][data-task-title="${title}"]`);
const staffOf = (page: Page, title: string) =>
  row(page, title).getByTestId("task-staff");

for (const [role, passcode] of [
  ["manager", "2468"],
  ["owner", "9999"],
] as const) {
  test(`TS-010/011: ${role} lands on Today with All Staff and a name on every row`, async ({
    page,
  }) => {
    await signIn(page, passcode);
    await expect(selector(page)).toHaveValue("all");

    await expect(staffOf(page, "Refill ice bins")).toHaveText("Mia Chen");
    await expect(staffOf(page, "Clean patio heaters")).toHaveText("Leo Park");
    await expect(staffOf(page, "Take trash outside")).toContainText("Mia Chen");
    await expect(staffOf(page, "Take trash outside")).toContainText("Ava");
    await expect(staffOf(page, "Restock server station")).toContainText("Ava");
    await expect(staffOf(page, "Check restroom")).toHaveText("Anyone");

    // Opening / General / Closing groups for the service date.
    for (const group of ["Opening work", "General work", "Closing work"]) {
      await expect(page.getByRole("region", { name: group })).toBeVisible();
    }
    await expect(
      page
        .getByRole("region", { name: "Opening work" })
        .getByTestId("task-staff")
        .first(),
    ).toBeVisible();
  });
}

test("TS-013/014: My Tasks and a specific person narrow Today", async ({
  page,
}) => {
  await signIn(page, "2468");

  await selector(page).selectOption("mine");
  await expect(row(page, "Refill ice bins")).toHaveCount(0);
  await expect(row(page, "Clean patio heaters")).toHaveCount(0);
  // Work open to anyone is part of a manager's own list, as on My Tasks.
  await expect(row(page, "Check restroom")).toBeVisible();

  const mia = selector(page).locator("option", { hasText: "Mia Chen" });
  await selector(page).selectOption(
    (await mia.getAttribute("value")) as string,
  );
  await expect(row(page, "Refill ice bins")).toBeVisible();
  await expect(row(page, "Take trash outside")).toBeVisible();
  await expect(row(page, "Clean patio heaters")).toHaveCount(0);
  // Shared work is not attributed to a person.
  await expect(row(page, "Check restroom")).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: /Mia Chen:/ }),
  ).toBeVisible();
});

test("TS-014: a person with nothing today gets an explanation", async ({
  page,
}) => {
  await signIn(page, "2468");
  const zara = selector(page).locator("option", { hasText: "Zara" });
  await selector(page).selectOption(
    (await zara.getAttribute("value")) as string,
  );
  await expect(page.getByText(/No tasks today for Zara/)).toBeVisible();
});

test("TS-016: staff have no selector and never see coworkers' individual work", async ({
  page,
}) => {
  await signIn(page, "1357");
  await expect(selector(page)).toHaveCount(0);
  await expect(page.getByText("Up next for you")).toBeVisible();
  await expect(page.getByText("Clean patio heaters")).toHaveCount(0);
  await expect(page.getByText("Restock server station")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Work by staff" })).toHaveCount(
    0,
  );
});

test("a manager completes a task from a person view; the manager is the actor", async ({
  page,
}) => {
  await signIn(page, "2468");
  const leo = selector(page).locator("option", { hasText: "Leo Park" });
  await selector(page).selectOption(
    (await leo.getAttribute("value")) as string,
  );

  await page
    .getByRole("checkbox", { name: /Mark complete: Clean patio heaters/ })
    .click();
  await expect(row(page, "Clean patio heaters")).toContainText(
    "Completed by Maya Singh",
  );
  await expect(staffOf(page, "Clean patio heaters")).toHaveText("Leo Park");

  // The choice survives hopping to another Tasks section and back.
  await page.getByRole("button", { name: "Opening", exact: true }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(selector(page)).toHaveValue(/^person:/);
});

test("TS-017: the selector is labelled, keyboard operable and fits the viewport", async ({
  page,
}) => {
  await signIn(page, "2468");
  const select = selector(page);
  await expect(page.getByLabel("Show tasks for")).toHaveRole("combobox");
  await select.focus();
  await expect(select).toBeFocused();
  // A native <select> is keyboard operable; assert the operation itself.
  await select.selectOption("mine");
  await expect(select).toHaveValue("mine");

  const box = await select.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
