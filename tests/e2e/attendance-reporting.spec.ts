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

// For signing back in after "Sign out" within the same test, without a
// page.goto() -- a full navigation would reload the page and wipe every
// bit of in-memory demo state, not just end the session.
async function signInOnCurrentPage(page: Page, passcode: string) {
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

async function signOut(page: Page) {
  await accountButton(page).click();
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page.getByLabel("Restaurant passcode")).toBeVisible();
}

// The Attendance/Team tabs live behind the mobile "More" sheet on narrow
// viewports (desktop's second nav row shows them directly) -- mirrors
// tests/e2e/dashboard.spec.ts's navigateToTab.
async function goToTab(page: Page, name: string) {
  await expect(accountButton(page)).toBeVisible();
  const direct = page.getByRole("button", { name, exact: true });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  const moreButton = page.getByRole("button", { name: "More" });
  if ((await moreButton.getAttribute("aria-expanded")) !== "true") {
    await moreButton.click();
  }
  await page.getByRole("button", { name, exact: true }).click();
}

// window.print() can't be literally driven by browser automation (there
// is no OS print dialog in a headless/CI browser) -- stubbed to a
// counter instead, matching this app's own established live-testing
// discipline for anything a tool can't directly observe.
async function stubPrint(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __printCount: number }).__printCount = 0;
    window.print = () => {
      (window as unknown as { __printCount: number }).__printCount += 1;
    };
  });
}

function printCallCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __printCount: number }).__printCount ?? 0,
  );
}

// Feature 030 bug fix: window.print() is now deferred behind
// triggerPrintWithFilename's short setTimeout (so document.title
// actually commits before the print dialog reads it) -- an immediate
// post-click equality check on printCallCount races that timeout, so
// every call site polls instead.
async function waitForPrintCallCount(page: Page, expected: number) {
  await expect.poll(() => printCallCount(page)).toBe(expected);
}

// The printable area is `hidden print:block` (display:none on screen,
// shown only inside @media print) -- read directly rather than through
// an actionability-gated Playwright assertion, since it's never meant to
// be visible outside an actual print.
function printAreaText(page: Page): Promise<string> {
  return page
    .locator("#attendance-print-area")
    .evaluate((element) => (element as HTMLElement).innerText);
}

function printSubmitButton(page: Page) {
  return page
    .getByRole("dialog")
    .getByRole("button", { name: "Print", exact: true });
}

test("switching months updates the ledger and stat cards to different, known values", async ({
  page,
}, testInfo) => {
  await signIn(page, "2468");
  await goToTab(page, "Attendance");

  // Defaults to Anil (Host), alphabetically first -- her one September
  // row (design-system-reference.html-adjacent demo fixture).
  await expect(
    page.getByRole("heading", { name: "Anil (Host)" }),
  ).toBeVisible();
  await expect(page.getByText("of 30 days in September")).toBeVisible();
  // Below the sm breakpoint the desktop <table> is replaced entirely by
  // the compact mobile card ledger (no table/row/cell roles at all) --
  // the stat-tile assertion above already proves September's real data
  // rendered, so this second check is desktop/tablet-only.
  if (testInfo.project.name !== "server-mobile") {
    const septemberTable = page.locator("table");
    await expect(
      septemberTable.getByRole("cell", { name: "8h" }),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: "Previous month" }).click();

  // Anil (Host) has zero August rows in the demo fixture -- the stat
  // tiles disappear entirely (PersonSection only renders them when
  // rows.length > 0) and the explicit zero-attendance state takes over,
  // a real, different rendering from September's populated one, not
  // just a re-render of the same numbers.
  await expect(page.getByText("of 30 days in September")).toHaveCount(0);
  await expect(
    page.getByText("No attendance recorded for this period."),
  ).toBeVisible();
  await expect(page.getByText("August total")).toBeVisible();
});

test("the Day column matches the real calendar weekday, desktop and mobile alike", async ({
  page,
}, testInfo) => {
  await signIn(page, "2468");
  await goToTab(page, "Attendance");

  // Anil (Host)'s one September row is 2026-09-02, a Wednesday --
  // independently verified against a real Date computation (see
  // src/features/attendance/domain/attendance-metrics.test.ts). Below
  // the sm breakpoint the desktop <table> is replaced by the compact
  // card ledger (day digit + weekday as two stacked spans, no table/
  // row/cell roles) -- same calendarWeekday/dayOfMonth functions behind
  // both, so this checks whichever shape is actually rendered.
  if (testInfo.project.name === "server-mobile") {
    // The desktop <table> stays in the DOM (just visually hidden via
    // `hidden sm:block`) even at this viewport, so an unscoped text
    // match resolves to both it and the visible mobile ledger --
    // scoped to the ledger's own `sm:hidden` container, matching the
    // precedent already set in tests/e2e/dashboard.spec.ts for this
    // exact desktop/mobile dual-render situation.
    const mobileLedger = page.locator(".sm\\:hidden");
    await expect(mobileLedger.getByText("02", { exact: true })).toBeVisible();
    await expect(mobileLedger.getByText("Wed", { exact: true })).toBeVisible();
    return;
  }
  const row = page.getByRole("row").filter({ hasText: "2026-09-02" });
  await expect(
    row.getByRole("cell", { name: "Wed", exact: true }),
  ).toBeVisible();
});

test("print dialog: current/selected/all resolve to the right people", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToTab(page, "Attendance");
  await stubPrint(page);

  // 1) Print current employee -- defaults to Anil (Host).
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: /Print current employee/ }),
  ).toBeChecked();
  await printSubmitButton(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await waitForPrintCallCount(page, 1);
  const currentText = await printAreaText(page);
  expect(currentText).toContain("Anil (Host)");
  expect(currentText).not.toContain("Deepak Rao");

  // 2) Print selected employees -- nothing checked yet should be
  // refused, not silently print an empty report.
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.getByRole("radio", { name: "Print selected employees" }).click();
  await printSubmitButton(page).click();
  await expect(page.getByText("Choose at least one employee.")).toBeVisible();
  await waitForPrintCallCount(page, 1); // unchanged -- refused, not printed

  await page.getByRole("checkbox", { name: "Deepak Rao (Server)" }).check();
  await printSubmitButton(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await waitForPrintCallCount(page, 2);
  const selectedText = await printAreaText(page);
  expect(selectedText).toContain("Deepak Rao");
  expect(selectedText).not.toContain("Anil (Host)");
  expect(selectedText).not.toContain("Priya Nair");

  // 3) Print all employees.
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.getByRole("radio", { name: "Print all employees" }).click();
  await printSubmitButton(page).click();
  await waitForPrintCallCount(page, 3);
  const allText = await printAreaText(page);
  for (const label of [
    "Anil (Host)",
    "Anil (Server)",
    "Deepak Rao (Server)",
    "Priya Nair (Manager)",
    "Zoya Khan (server)",
  ]) {
    expect(allText).toContain(label);
  }
});

test("a linked server's Print button skips the dialog and never exposes another employee's data", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToTab(page, "Team");
  await page
    .getByRole("button", { name: "Link Mia Chen's attendance record" })
    .click();
  await page
    .getByLabel("Attendance-system record")
    .selectOption({ label: "Anil (Server)" });
  await page.getByRole("button", { name: "Save link" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await signOut(page);
  await signInOnCurrentPage(page, "1357");
  await goToTab(page, "Attendance");
  await stubPrint(page);

  await expect(
    page.getByRole("heading", { name: "Anil (Server)" }),
  ).toBeVisible();
  // No switcher, no dialog trigger for a choice that doesn't exist --
  // there is exactly one possible thing for a self-scoped viewer to
  // print.
  await expect(page.getByLabel("Employee")).toHaveCount(0);

  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await waitForPrintCallCount(page, 1);
  const text = await printAreaText(page);
  expect(text).toContain("Anil (Server)");
  expect(text).not.toContain("Deepak Rao");
  expect(text).not.toContain("Priya Nair");
  expect(text).not.toContain("Anil (Host)");
});

test("Feature 029 Phase 0: 'All employees' shows the combined roster with aggregate cards and prints directly", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToTab(page, "Attendance");
  await stubPrint(page);

  await page.getByLabel("Employee").selectOption("all");

  // Two new aggregate cards, not the single-person "Days worked" stat
  // set -- the whole fixture's September rows are 8 shifts (6 original
  // + Feature 029's own 2 new open-shift rows on DEMO_ANCHOR_DATE) /
  // 32.8 total hours (the 2 new rows are still-open, null-hoursWorked
  // shifts -- counted as shifts, excluded from the hours sum, same as
  // every other null-hours row), independently known from this same
  // fixture (see demoNeonAttendance) and already live-verified during
  // development. Each StatTile is a label span followed immediately by
  // its value span -- scoped this way (rather than a bare
  // page.getByText("8")) since a lone digit or "32.8h" isn't otherwise
  // a unique string on the page.
  const totalShiftsValue = page
    .getByText("Total shifts", { exact: true })
    .locator("xpath=following-sibling::span[1]");
  await expect(totalShiftsValue).toHaveText("8");
  const totalHoursValue = page
    .getByText("Total hours", { exact: true })
    .first()
    .locator("xpath=following-sibling::span[1]");
  await expect(totalHoursValue).toHaveText("32.8h");

  // Every active employee gets their own section, including one with
  // zero rows this period -- the existing zero-attendance state,
  // unmodified.
  for (const label of [
    "Anil (Host)",
    "Anil (Server)",
    "Deepak Rao (Server)",
    "Priya Nair (Manager)",
    "Zoya Khan (server)",
  ]) {
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }
  await expect(
    page.getByText("No attendance recorded for this period."),
  ).toBeVisible();

  // Print skips the choice dialog entirely -- there's only one thing to
  // print once "All" is already the selection.
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await waitForPrintCallCount(page, 1);
  const text = await printAreaText(page);
  for (const label of [
    "Anil (Host)",
    "Anil (Server)",
    "Deepak Rao (Server)",
    "Priya Nair (Manager)",
    "Zoya Khan (server)",
  ]) {
    expect(text).toContain(label);
  }
});
