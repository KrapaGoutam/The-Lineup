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

    // Allocation is the primary first tab and should be active by default
    const allocationBtn = page.getByRole("button", {
      name: /Allocation/,
    });
    await expect(allocationBtn.first()).toHaveAttribute("aria-current", "page");

    // Allocation board heading or table assignment content is visible
    await expect(
      page.getByRole("heading", { name: "Table Allocation" }),
    ).toBeVisible();
  });

  test("attendance dropdowns have proper dark/light theme contrast styling", async ({
    page,
  }) => {
    await signIn(page, "2468");
    await goToTab(page, "Attendance");

    // The employee select dropdown should have the contrast popover classes
    const employeeSelect = page.getByLabel("Employee");
    await expect(employeeSelect).toBeVisible();
    await expect(employeeSelect).toHaveClass(/bg-popover/);
    await expect(employeeSelect).toHaveClass(/text-popover-foreground/);
  });

  test("timesheet print contains corporate letterhead, logo, signatures, and pagination", async ({
    page,
  }) => {
    await signIn(page, "2468");
    await goToTab(page, "Attendance");
    await stubPrint(page);

    // Click Print button
    await page.getByRole("button", { name: "Print", exact: true }).click();

    // If a dialog opens (e.g. choice of which to print), click Print inside dialog
    const dialogPrint = page
      .getByRole("dialog")
      .getByRole("button", { name: "Print", exact: true });
    if (await dialogPrint.isVisible()) {
      await dialogPrint.click();
    }

    expect(await printCallCount(page)).toBe(1);

    // Verify the printable area has the corporate letterhead details
    const printArea = page.locator("#attendance-print-area");
    await expect(printArea).toBeAttached();

    // Logo image is present
    const logo = printArea.locator('img[alt="The Monk\'s Logo"]').first();
    await expect(logo).toBeAttached();
    expect(await logo.getAttribute("src")).toContain("logo-light.png");

    const text = await printAreaText(page);
    expect(text).toContain("The Monk's");
    expect(text).toContain("Employee Timesheet");
    expect(text).toContain("Employee Signature");
    expect(text).toContain("Manager / Supervisor Signature");

    // Check pagination class
    const timesheetBlocks = printArea.locator(".employee-timesheet");
    expect(await timesheetBlocks.count()).toBeGreaterThanOrEqual(1);
  });

  test("combined monthly statement modal displays letterhead, attendance log, payroll breakdown, and print action", async ({
    page,
  }) => {
    await signIn(page, "2468");
    await goToTab(page, "Attendance");
    await stubPrint(page);

    // Click "Monthly Statement" button
    const statementBtn = page.getByRole("button", {
      name: "Monthly Statement",
      exact: true,
    });
    await expect(statementBtn).toBeVisible();
    await statementBtn.click();

    // Modal dialog opens
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Monthly Statement" }),
    ).toBeVisible();

    // Contains corporate letterhead
    await expect(dialog.getByText("The Monk's Restaurant & Bar")).toBeVisible();
    await expect(dialog.getByText("Part 1: Recorded Attendance")).toBeVisible();
    await expect(
      dialog.getByText("Part 2: Payroll & Compensation"),
    ).toBeVisible();
    await expect(dialog.getByText("Employee Signature & Date")).toBeVisible();

    // Click Print button inside dialog
    const printBtn = dialog.getByRole("button", { name: "Print", exact: true });
    await expect(printBtn).toBeVisible();
    await printBtn.click();

    expect(await printCallCount(page)).toBe(1);

    // Close the dialog
    await dialog.getByRole("button", { name: "Close dialog" }).click();
    await expect(dialog).not.toBeVisible();
  });
});
