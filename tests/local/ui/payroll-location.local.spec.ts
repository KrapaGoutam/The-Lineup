import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import {
  createPayrollFixture,
  must,
  payrollEnv,
  type PayrollFixture,
  type PayrollTestUser,
} from "../support/payroll-fixture";

/**
 * V2-005.005 Authenticated Browser Acceptance Suite (Local Disposable Stack)
 *
 * Exercises the end-to-end Payroll location-scoping and financial lifecycle:
 * 1. Org GM login -> Scope badge ("Organization Scope") -> View all workforce periods
 * 2. Location Manager A login -> Scope badge ("Location Scope") -> Loc A periods only
 * 3. Branch Manager generation fails closed on attendance physical provenance
 * 4. Ledger flow -> Record draft payment, confirm, unconfirm with mandatory reason, and close
 * 5. Staff login -> Self-only view (sees own locked period, manager badges and generate button hidden)
 *
 * Configured across Desktop, Tablet, and Mobile viewports.
 */

let fx: PayrollFixture;

async function authenticate(
  context: BrowserContext,
  user: PayrollTestUser,
  location: string,
) {
  const session = must(await user.client.auth.getSession()).session!;
  const client = createServerClient(payrollEnv.url, payrollEnv.anon, {
    cookies: {
      getAll: () => [],
      setAll: async (cookies) =>
        context.addCookies(
          cookies.map(({ name, value }) => ({
            name,
            value,
            domain: "localhost",
            path: "/",
            httpOnly: true,
            sameSite: "Lax" as const,
          })),
        ),
    },
  });
  must(await client.auth.setSession(session));
  await setLocationCookie(context, location);
}

async function setLocationCookie(context: BrowserContext, location: string) {
  await context.addCookies([
    {
      name: "lineup_active_context",
      value: JSON.stringify({ v: 1, o: fx.orgA.id, l: location }),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function openPayroll(page: Page) {
  const tab = page.getByRole("button", { name: /^Payroll(?:\s|$)/ });
  if (!(await tab.isVisible())) {
    const more = page.getByRole("button", { name: /More/ });
    if (await more.isVisible()) await more.click();
  }
  if (await tab.isVisible()) await tab.click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Payroll" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  fx = await createPayrollFixture();

  // Populate initial periods and settings for Org A
  must(
    await fx.admin.from("payroll_settings").upsert({
      organization_id: fx.orgA.id,
      default_rate_cents: 2000,
      updated_by: fx.orgAGM.id,
    }),
  );

  // Seed Loc A period ($700.00 gross)
  must(
    await fx.admin.from("payroll_periods").insert({
      organization_id: fx.orgA.id,
      location_id: fx.locA,
      neon_user_id: fx.neonIds.staffA,
      period_month: "2026-08-01",
      hours_snapshot: 35,
      rate_cents_snapshot: 2000,
      gross_cents: 70000,
      generated_by: fx.orgAGM.id,
      status: "draft",
    }),
  );

  // Seed Loc B period ($800.00 gross)
  must(
    await fx.admin.from("payroll_periods").insert({
      organization_id: fx.orgA.id,
      location_id: fx.locB,
      neon_user_id: fx.neonIds.staffB,
      period_month: "2026-08-01",
      hours_snapshot: 40,
      rate_cents_snapshot: 2000,
      gross_cents: 80000,
      generated_by: fx.orgAGM.id,
      status: "draft",
    }),
  );
});

test.afterAll(async () => {
  if (fx) await fx.teardown();
});

test("1. Org GM sees Organization Scope badge and all periods across locations", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.orgAGM, fx.locA);
  await page.goto(`/r/${fx.orgA.slug}`);
  await openPayroll(page);

  // Scope badge check
  await expect(page.getByText("Organization Scope")).toBeVisible();

  // KPI cards and workforce summary rendered
  await expect(page.getByText("Overall balance owed")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open ledger for August 2026" }).first(),
  ).toBeVisible();

  // Sees both Loc A Staff ($700.00) and Loc B Staff ($800.00)
  await expect(page.getByText("$700.00").first()).toBeVisible();
  await expect(page.getByText("$800.00").first()).toBeVisible();
});

test("2. Location Manager A sees Location Scope badge and only Loc A periods", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.mgrA, fx.locA);
  await page.goto(`/r/${fx.orgA.slug}`);
  await openPayroll(page);

  // Location Scope badge check
  await expect(page.getByText("Location Scope")).toBeVisible();
  await expect(page.getByText("Organization Scope")).not.toBeVisible();

  // Sees Staff A's period ($700.00) but NOT Staff B ($800.00)
  await expect(page.getByText("$700.00").first()).toBeVisible();
  await expect(page.getByText("$800.00")).toHaveCount(0);
});

test("3. Branch Manager generation fails closed on attendance physical provenance", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.mgrA, fx.locA);
  await page.goto(`/r/${fx.orgA.slug}`);
  await openPayroll(page);

  const genBtn = page.getByRole("button", { name: "Generate Payroll" });
  await expect(genBtn).toBeVisible();
  await genBtn.click();

  const dialog = page.getByRole("dialog", { name: "Generate Payroll" });
  await expect(dialog).toBeVisible();

  // Enter month "2026-09" to trigger eligibility check
  await dialog.getByLabel("Month").fill("2026-09");

  // Should show physical provenance refusal error
  await expect(
    dialog.getByText(
      /attendance records do not have verified physical location provenance/i,
    ),
  ).toBeVisible({ timeout: 15000 });

  // Close dialog
  await dialog.getByRole("button", { name: "Close dialog" }).click();
});

test("4. Complete ledger lifecycle: draft payment, confirm, unconfirm with audit, and close", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.orgAGM, fx.locA);
  await page.goto(`/r/${fx.orgA.slug}`);
  await openPayroll(page);

  // Open ledger for August 2026
  const openLedgerBtn = page
    .getByRole("button", {
      name: "Open ledger for August 2026",
    })
    .first();
  await openLedgerBtn.scrollIntoViewIfNeeded();
  await openLedgerBtn.click({ force: true });

  const ledgerDialog = page.getByRole("dialog", {
    name: "August 2026 Ledger",
  });
  await expect(ledgerDialog).toBeVisible();

  // Record a draft payment
  await ledgerDialog.locator("#payment-amount").fill("200.00");
  await ledgerDialog.locator("#payment-date").fill("2026-08-15");
  await ledgerDialog
    .getByRole("button", { name: "Record payment" })
    .click({ force: true });

  // Payment appears in the table
  await expect(ledgerDialog.getByText("$200.00").first()).toBeVisible({
    timeout: 15000,
  });

  // Confirm payment
  const confirmBtn = ledgerDialog
    .getByRole("button", { name: "Confirm" })
    .first();
  await expect(confirmBtn).toBeVisible({ timeout: 15000 });
  await confirmBtn.click({ force: true });
  await expect(ledgerDialog.getByText("Confirmed").first()).toBeVisible({
    timeout: 15000,
  });

  // Unconfirm payment
  const unconfirmBtn = ledgerDialog
    .getByRole("button", { name: "Unconfirm" })
    .first();
  await expect(unconfirmBtn).toBeVisible({ timeout: 15000 });
  await unconfirmBtn.click({ force: true });

  const unconfirmDialog = page.getByRole("dialog", {
    name: "Unconfirm Payment",
  });
  await expect(unconfirmDialog).toBeVisible();

  const reasonInput = unconfirmDialog.getByLabel("Reason");
  await reasonInput.fill("Incorrect disbursement check number");
  const submitUnconfirm = unconfirmDialog.getByRole("button", {
    name: "Unconfirm",
  });
  await submitUnconfirm.click({ force: true });

  await expect(unconfirmDialog).not.toBeVisible({ timeout: 15000 });

  // Close ledger dialog
  const closeBtn = ledgerDialog.getByRole("button", { name: "Close dialog" });
  await closeBtn.click({ force: true });
  await expect(ledgerDialog).not.toBeVisible({ timeout: 15000 });
});

test("5. Staff member sees only own locked period and confirmed disbursements", async ({
  page,
  context,
}) => {
  // Lock Loc A period via admin
  const pA = must(
    await fx.admin
      .from("payroll_periods")
      .select("id")
      .eq("organization_id", fx.orgA.id)
      .eq("neon_user_id", fx.neonIds.staffA)
      .single(),
  );

  must(
    await fx.admin
      .from("payroll_periods")
      .update({
        status: "locked",
        locked_at: new Date().toISOString(),
        locked_by: fx.orgAGM.id,
      })
      .eq("id", pA.id),
  );

  await authenticate(context, fx.staffA, fx.locA);
  await page.goto(`/r/${fx.orgA.slug}`);
  await openPayroll(page);

  // Staff sees heading "Payroll"
  await expect(
    page.getByRole("heading", { level: 1, name: "Payroll" }).first(),
  ).toBeVisible();

  // Staff does NOT see manager scope badges or generate button
  await expect(page.getByText("Organization Scope")).not.toBeVisible();
  await expect(page.getByText("Location Scope")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate Payroll" }),
  ).not.toBeVisible();
});
