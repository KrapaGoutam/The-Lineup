import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(accountButton(page)).toBeVisible({ timeout: 60000 });
}

function accountButton(page: Page) {
  return page
    .getByRole("button", { name: "Account and quick settings" })
    .first();
}

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

// Records every title window.print() was called with -- not just a
// count -- since triggerPrintWithFilename's whole purpose is that
// document.title is a specific, correct value at the moment print
// fires, not merely that print fires at all.
async function stubPrint(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __printTitles: string[] }).__printTitles = [];
    window.print = () => {
      (window as unknown as { __printTitles: string[] }).__printTitles.push(
        document.title,
      );
    };
  });
}

// triggerPrintWithFilename defers window.print() behind a short
// setTimeout (to let document.title actually commit first -- see its
// own doc comment) -- an immediate post-click assertion would race it,
// so every check here polls instead.
async function waitForPrintTitles(page: Page, count: number) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __printTitles: string[] }).__printTitles
            ?.length ?? 0,
      ),
    )
    .toBe(count);
  return page.evaluate(
    () => (window as unknown as { __printTitles: string[] }).__printTitles,
  );
}

function printAreaText(page: Page): Promise<string> {
  return page
    .locator("#attendance-print-area")
    .evaluate((element) => (element as HTMLElement).innerText);
}

test.describe("Feature 030: Payroll UI, Option 1k, Timesheet Print & Statements", () => {
  test("lands on Table Allocation by default upon signing in", async ({
    page,
  }) => {
    await signIn(page, "2468");

    const allocationBtn = page.getByRole("button", {
      name: /Allocation/,
    });
    await expect(allocationBtn.first()).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("heading", { name: "Table Allocation" }),
    ).toBeVisible();
  });

  test("attendance dropdowns have proper dark/light theme contrast styling", async ({
    page,
  }) => {
    await signIn(page, "2468");
    await goToTab(page, "Attendance");

    const employeeSelect = page.getByLabel("Employee");
    await expect(employeeSelect).toBeVisible();
    await expect(employeeSelect).toHaveClass(/bg-popover/);
    await expect(employeeSelect).toHaveClass(/text-popover-foreground/);
  });

  test("timesheet print uses the shared vector letterhead, a dynamic filename, and one page per employee", async ({
    page,
  }) => {
    await signIn(page, "2468");
    await goToTab(page, "Attendance");
    await stubPrint(page);

    await page.getByRole("button", { name: "Print", exact: true }).click();
    const dialogPrint = page
      .getByRole("dialog")
      .getByRole("button", { name: "Print", exact: true });
    if (await dialogPrint.isVisible()) {
      await dialogPrint.click();
    }

    const titles = await waitForPrintTitles(page, 1);
    // Single-employee filename convention: "<Name> Attendance Report
    // <Mon> <Year>" -- proves triggerPrintWithFilename actually ran,
    // not just window.print().
    expect(titles[0]).toMatch(/^.+ Attendance Report [A-Z][a-z]{2} \d{4}$/);

    const printArea = page.locator("#attendance-print-area");
    await expect(printArea).toBeAttached();

    // Bug fix 1: zero raster images, one embedded vector logo -- never
    // an external, network-dependent <img>.
    expect(await printArea.locator("img").count()).toBe(0);
    expect(await printArea.locator("svg").count()).toBeGreaterThanOrEqual(1);

    const text = await printAreaText(page);
    expect(text).toContain("The Monk's Indian Fusion - Webster");
    expect(text).toContain("Monthly Attendance Timesheet");
    expect(text).toContain("Employee Signature");
    expect(text).toContain("Manager / Supervisor Signature");

    // Bug fix 3: exactly one page for a single employee, via the
    // shared .print-page-break class (not the old bespoke
    // .employee-timesheet one).
    expect(await printArea.locator(".print-page-break").count()).toBe(1);
  });

  test("'All employees' timesheet print produces one page per active employee with the roster filename", async ({
    page,
  }) => {
    await signIn(page, "2468");
    await goToTab(page, "Attendance");
    await page.getByLabel("Employee").selectOption("all");
    await stubPrint(page);

    await page.getByRole("button", { name: "Print", exact: true }).click();

    const titles = await waitForPrintTitles(page, 1);
    expect(titles[0]).toMatch(/^Staff attendance Report [A-Z][a-z]{2} \d{4}$/);

    const pageCount = await page
      .locator("#attendance-print-area .print-page-break")
      .count();
    expect(pageCount).toBeGreaterThan(1);
  });

  test("combined monthly statement modal shows the shared letterhead, one page's worth of content, and a dynamic filename", async ({
    page,
  }) => {
    await signIn(page, "2468");
    await goToTab(page, "Attendance");
    await stubPrint(page);

    const statementBtn = page.getByRole("button", {
      name: "Monthly Statement",
      exact: true,
    });
    await expect(statementBtn).toBeVisible();
    await statementBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Monthly Statement" }),
    ).toBeVisible();

    // Bug fix 1: the shared letterhead heading, not the old bare
    // organization-name text.
    await expect(
      dialog.getByText("The Monk's Indian Fusion - Webster"),
    ).toBeVisible();
    await expect(dialog.getByText("Part 1: Recorded Attendance")).toBeVisible();
    await expect(
      dialog.getByText("Part 2: Payroll & Compensation"),
    ).toBeVisible();
    await expect(dialog.getByText("Employee Signature & Date")).toBeVisible();

    // Bug fix 3: exactly one copy of the statement content -- the
    // duplicate-page bug's own confirmed root cause (a fragile
    // visibility/position isolation trick) would have shown here as a
    // second heading/img, not literally as two printed pages, since
    // Playwright can't inspect paginated print output directly. Scoped
    // to the print area itself, not the whole dialog -- the toolbar's
    // own Print/Close icons are also <svg>s.
    const printArea = dialog.locator("#combined-statement-print-area");
    await expect(printArea.locator("img")).toHaveCount(0);
    await expect(printArea.locator("svg")).toHaveCount(1);
    await expect(
      printArea.getByRole("heading", {
        name: "The Monk's Indian Fusion - Webster",
      }),
    ).toHaveCount(1);

    const printBtn = dialog.getByRole("button", { name: "Print", exact: true });
    await expect(printBtn).toBeVisible();
    await printBtn.click();

    const titles = await waitForPrintTitles(page, 1);
    // Combined statement filename convention: "<Name> Monthly Report
    // <Mon> <Year>".
    expect(titles[0]).toMatch(/^.+ Monthly Report [A-Z][a-z]{2} \d{4}$/);

    await dialog.getByRole("button", { name: "Close dialog" }).click();
    await expect(dialog).not.toBeVisible();
  });

  // Bug fix 4 (payroll multi-select batch print) has no e2e coverage
  // here on purpose: Payroll stays real-mode-only (`!demoMode`-gated,
  // unchanged since Feature 020), and this whole suite runs against
  // NEXT_PUBLIC_DEMO_MODE=true (playwright.config.ts) -- there is no
  // demo-mode path to the Payroll tab at all to click through. Covered
  // instead by payroll-print-dialog.test.tsx's 7 Vitest/jsdom tests,
  // the same precedent Feature 020/026 already established for every
  // other payroll-only surface in this app.
});
