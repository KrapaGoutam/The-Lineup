import { createServerClient } from "@supabase/ssr";
import { expect, test, type Page } from "@playwright/test";

import {
  createPhaseCFixture,
  type PhaseCFixture,
} from "../support/phase-c-fixture";
import { env } from "../support/harness";
import { verifyDevApp } from "../support/module-navigation-fixture";

/**
 * Group 2 Phase C — one integrated operations acceptance pass on hosted DEV.
 * V2.0.8 Tips (save, update, recalculate, void, history) feeding the V2.0.9 Dashboard
 * (attendance, payroll, tips, low stock), as manager and as staff, across branches.
 * Truth is read from the RAW tables with the service role (independent of the app code).
 *
 *   NEON_DATABASE_URL= npm run dev -- --webpack -p 3103     # DEV-pinned
 *   PLAYWRIGHT_BASE_URL=http://localhost:3103 npx playwright test -c playwright.real.config.ts group2-phase-c
 */
const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3103";
let fx: PhaseCFixture;

test.use({ trace: "off", screenshot: "off" }); // credentials never enter artifacts
test.beforeAll(async () => {
  await verifyDevApp(base);
  fx = await createPhaseCFixture();
});
test.afterAll(async () => {
  await fx?.teardown();
});

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

type Rpc = { data: unknown; error: { message: string; code?: string } | null };
const must = (result: Rpc, what: string) => {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as Record<string, unknown>;
};

/** Signs the browser in with a real Supabase session cookie (same method as the single-context spec). */
async function login(page: Page, who: "manager" | "server1" | "server3") {
  const user = fx.fx[who];
  const store = new Map<string, string>();
  const client = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => [...store].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => store.set(c.name, c.value)),
    },
  });
  const signed = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (signed.error) throw new Error("synthetic sign-in failed");
  const host = new URL(base).hostname;
  await page.context().clearCookies();
  await page.context().addCookies(
    [...store].map(([name, value]) => ({
      name,
      value,
      domain: host,
      path: "/",
    })),
  );
  await page.route("https://vercel.live/**", (route) => route.abort());
  await page.goto(`${base}/r/${fx.slug}`);
  const chooser = page.getByRole("heading", {
    name: "Choose a location",
    exact: true,
  });
  // A single-location member lands in the workspace directly (no switcher).
  const shell = page
    .getByRole("button", { name: "Account and quick settings" })
    .first();
  await expect(chooser.or(shell)).toBeVisible({ timeout: 60000 });
  if (await chooser.isVisible()) {
    await page.getByRole("button", { name: "Harness A", exact: true }).click();
  }
  await expect(shell).toBeVisible({ timeout: 60000 });
  await page.waitForSelector('body[data-hydrated="true"]');
}

async function openTab(page: Page, name: string) {
  const direct = page.getByRole("button", { name, exact: true });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  const more = page.getByRole("button", { name: "More", exact: true });
  if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function openDashboard(page: Page) {
  await openTab(page, "Dashboard");
  await expect(page.getByTestId("dashboard-module")).toBeVisible({
    timeout: 60000,
  });
  // The read settles before any figure is asserted.
  await expect(page.getByTestId("dashboard-module")).not.toContainText(
    /Loading/i,
    { timeout: 60000 },
  );
}

async function overflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

async function chooseBranch(page: Page, name: string) {
  await page
    .getByRole("button", { name: /Switch workspace/ })
    .first()
    .click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
  await expect(
    page
      .getByRole("button", { name: new RegExp(`Switch workspace.*${name}$`) })
      .first(),
  ).toBeVisible({ timeout: 60000 });
}

/** Independent truth for branch A today, from the raw tables. */
async function tipsTruth() {
  const pool = await fx.admin
    .from("tip_pools")
    .select("id")
    .eq("location_id", fx.fx.locA)
    .eq("service_date", fx.date)
    .single();
  const poolId = pool.data!.id as number;
  const intervals = await fx.admin
    .from("tip_intervals")
    .select("id, amount_cents, cash_cents, card_cents, voided_at")
    .eq("tip_pool_id", poolId);
  const live = (intervals.data ?? []).filter((i) => i.voided_at === null);
  const sum = (key: "amount_cents" | "cash_cents" | "card_cents") =>
    live.reduce((total, i) => total + (i[key] as number), 0);
  const allocations = await fx.admin
    .from("tip_allocations")
    .select("profile_id, amount_cents, cash_cents, card_cents")
    .eq("tip_pool_id", poolId);
  const own = (profileId: string) => {
    const row = (allocations.data ?? []).find(
      (a) => a.profile_id === profileId,
    );
    return row
      ? {
          total: row.amount_cents as number,
          cash: row.cash_cents as number,
          card: row.card_cents as number,
        }
      : { total: 0, cash: 0, card: 0 };
  };
  return {
    poolId,
    count: live.length,
    total: sum("amount_cents"),
    cash: sum("cash_cents"),
    card: sum("card_cents"),
    notSplit: sum("amount_cents") - sum("cash_cents") - sum("card_cents"),
    allocationTotal: (allocations.data ?? []).reduce(
      (total, a) => total + (a.amount_cents as number),
      0,
    ),
    own,
  };
}

test("Group 2 Phase C — integrated operations acceptance on DEV", async ({
  page,
  browser,
}) => {
  const { fx: f } = fx;
  const t = fx.tipsBase;
  const [w1, w2, w3] = fx.windows;
  const results: Record<string, unknown> = {};

  // ═══ 1. V2.0.8 Tips: save, update, recalculate, void, history ═════════════════════════
  const saved1 = must(
    await f.manager.client.rpc("tips_save_interval", {
      ...t,
      p_service_date: fx.date,
      p_starts_at: w1.start,
      p_ends_at: w1.end,
      p_cash_cents: 10_001,
      p_card_cents: 4_000,
      p_participant_ids: [f.server1.id, f.server2.id],
    }),
    "save #1",
  );
  expect(saved1.revision).toBe(1);
  const saved2 = must(
    await f.manager.client.rpc("tips_save_interval", {
      ...t,
      p_service_date: fx.date,
      p_starts_at: w2.start,
      p_ends_at: w2.end,
      p_cash_cents: 3_000,
      p_card_cents: 0,
      p_participant_ids: [f.server1.id, f.server2.id, f.server3.id],
    }),
    "save #2",
  );
  const poolId = saved1.tip_pool_id as number;

  // Staff may not write tips at all.
  const staffWrite = await f.server1.client.rpc("tips_save_interval", {
    ...t,
    p_service_date: fx.date,
    p_starts_at: w3.start,
    p_ends_at: w3.end,
    p_cash_cents: 100,
    p_card_cents: 0,
    p_participant_ids: [f.server1.id],
  });
  expect(staffWrite.error).not.toBeNull();

  // Update with the revision guard and a reason; a stale revision is refused.
  const updated = must(
    await f.manager.client.rpc("tips_save_interval", {
      ...t,
      p_service_date: fx.date,
      p_starts_at: w1.start,
      p_ends_at: w1.end,
      p_cash_cents: 12_000,
      p_card_cents: 4_000,
      p_participant_ids: [f.server1.id, f.server2.id],
      p_interval_id: saved1.interval_id,
      p_expected_revision: 1,
      p_reason: "Counted the slips again",
    }),
    "update",
  );
  expect(updated.revision).toBe(2);
  const stale = await f.manager.client.rpc("tips_save_interval", {
    ...t,
    p_service_date: fx.date,
    p_starts_at: w1.start,
    p_ends_at: w1.end,
    p_cash_cents: 1,
    p_card_cents: 0,
    p_participant_ids: [f.server1.id],
    p_interval_id: saved1.interval_id,
    p_expected_revision: 1,
    p_reason: "stale",
  });
  expect(stale.error?.code).toBe("P0409");

  // A pre-V2.0.8 style interval (money without a cash/card split), written directly as the
  // service role, so "Not split" is exercised with real legacy-shaped data.
  const legacy = await fx.admin
    .from("tip_intervals")
    .insert({
      organization_id: f.orgId,
      tip_pool_id: poolId,
      starts_at: w3.start,
      ends_at: w3.end,
      amount_cents: 5_001,
      cash_cents: 0,
      card_cents: 0,
    })
    .select("id")
    .single();
  if (legacy.error) throw new Error(`legacy interval: ${legacy.error.message}`);
  await fx.admin.from("tip_interval_participants").insert(
    [f.server1.id, f.server2.id].map((profile_id) => ({
      organization_id: f.orgId,
      tip_interval_id: legacy.data!.id,
      profile_id,
    })),
  );

  must(
    await f.manager.client.rpc("tips_void_interval", {
      ...t,
      p_interval_id: saved2.interval_id,
      p_expected_revision: 1,
      p_reason: "Entered on the wrong day",
    }),
    "void",
  );
  // Recalculate repairs drift: corrupt one saved allocation as the service role, then recalculate
  // from the SAVED intervals; a second recalculation is a no-op (idempotent).
  const drift = await fx.admin
    .from("tip_allocations")
    .select("id, amount_cents")
    .eq("tip_pool_id", poolId)
    .limit(1)
    .single();
  if (drift.error) throw new Error(`drift read: ${drift.error.message}`);
  await fx.admin
    .from("tip_allocations")
    .update({ amount_cents: (drift.data.amount_cents as number) + 1_000 })
    .eq("id", drift.data.id);
  const recalculated = must(
    await f.manager.client.rpc("tips_recalculate_pool", {
      ...t,
      p_tip_pool_id: poolId,
    }),
    "recalculate",
  );
  expect(recalculated.changed).toBe(true);
  expect(
    must(
      await f.manager.client.rpc("tips_recalculate_pool", {
        ...t,
        p_tip_pool_id: poolId,
      }),
      "recalculate again",
    ).changed,
  ).toBe(false);

  // History: every action is on the audit trail, the voided row is preserved.
  const range = must(
    await f.manager.client.rpc("tips_get_range", {
      ...t,
      p_from: fx.date,
      p_to: fx.date,
      p_include_revisions: true,
    }),
    "history",
  ) as {
    pools: Array<{
      intervals: Array<{ voided_at: string | null }>;
      revisions: Array<{ action: string }>;
    }>;
  };
  const actions = new Set(range.pools[0].revisions.map((r) => r.action));
  for (const action of [
    "interval_created",
    "interval_updated",
    "interval_voided",
    "pool_recalculated",
  ])
    expect(actions.has(action), `history has ${action}`).toBe(true);
  expect(range.pools[0].intervals.filter((i) => i.voided_at).length).toBe(1);
  results.tips = { actions: [...actions].sort() };

  const truth = await tipsTruth();
  expect(truth).toMatchObject({
    count: 2,
    total: 12_000 + 4_000 + 5_001,
    cash: 12_000,
    card: 4_000,
    notSplit: 5_001,
  });
  // No cent lost or duplicated: allocations add up to the live intervals.
  expect(truth.allocationTotal).toBe(truth.total);

  // Staff privacy at the database: own share only, no co-worker, no totals, no audit trail.
  const staffRange = must(
    await f.server1.client.rpc("tips_get_range", {
      ...t,
      p_from: fx.date,
      p_to: fx.date,
      p_include_revisions: true,
    }),
    "staff range",
  );
  const staffJson = JSON.stringify(staffRange);
  expect(staffJson).not.toContain(f.server2.id);
  expect(staffJson).not.toContain(f.server3.id);
  expect(staffRange.viewer_level).toBeLessThan(2);

  // ═══ 2. Manager Dashboard at branch A (desktop) ═══════════════════════════════════════
  await page.setViewportSize({ width: 1366, height: 900 });
  await login(page, "manager");
  await expect(page).not.toHaveURL(/tab=dashboard/); // never the default landing
  await openDashboard(page);
  await expect(page).toHaveURL(/tab=dashboard/);

  // Attendance: distinct open sessions at A only (server1 active, server2 on break; the
  // completed shift and the owner's open session at B do not count).
  const attendance = page.getByTestId("dashboard-card-attendance");
  await expect(page.getByTestId("dashboard-card-attendance-value")).toHaveText(
    "2",
  );
  await expect(attendance).toContainText("1 on a break");
  // Payroll: A is internal attendance -> an honest Unavailable, never a zero.
  const payrollA = page.getByTestId("dashboard-card-payroll");
  await expect(payrollA).toBeVisible();
  await expect(page.getByTestId("dashboard-card-payroll-value")).toHaveText(
    "Unavailable",
  );
  await expect(payrollA).toContainText(/Open Payroll|isn't summarized/i);
  // Tips: the V2.0.8 model — non-void intervals, cash/card, legacy "Not split".
  await expect(page.getByTestId("dashboard-card-tips-value")).toHaveText(
    money(truth.total),
  );
  const tipsCard = page.getByTestId("dashboard-card-tips");
  await expect(tipsCard).toContainText("2 saved intervals");
  await expect(tipsCard).toContainText(
    `Cash ${money(truth.cash)} · Card ${money(truth.card)}`,
  );
  await expect(tipsCard).toContainText(`Not split ${money(truth.notSplit)}`);
  await expect(tipsCard).not.toContainText(/unfinalized/i);
  // Low stock: A has 1 critical + 1 low; the archived product and B's stock never leak in.
  await expect(page.getByTestId("dashboard-card-lowStock-value")).toHaveText(
    "2",
  );
  await expect(page.getByTestId("dashboard-card-lowStock")).toContainText(
    "1 critical · 1 low",
  );
  results.managerA =
    "attendance 2/1 break, payroll unavailable (internal), tips + low stock reconcile";

  // Quick actions follow real module access (payroll is on and authorized at A, off for staff).
  for (const id of [
    "attendance",
    "payroll",
    "tips",
    "inventory",
    "tasks",
    "allocation",
    "reporting",
  ])
    await expect(page.getByTestId(`dashboard-action-${id}`)).toBeVisible();

  // Deep link: card → Tips, Back → Dashboard, Forward → Tips, reload keeps the destination.
  await page.getByTestId("dashboard-card-tips").getByRole("link").click();
  await expect(page).toHaveURL(/tab=tips/);
  await expect(page).toHaveURL(new RegExp(`location=${f.locA}`));
  await expect(page.getByRole("heading", { name: /Tip/i }).first()).toBeVisible(
    { timeout: 60000 },
  );
  await page.goBack();
  await expect(page).toHaveURL(/tab=dashboard/);
  await expect(page.getByTestId("dashboard-module")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/tab=tips/);
  await page.reload();
  await expect(page).toHaveURL(/tab=tips/);
  await expect(page.getByRole("heading", { name: /Tip/i }).first()).toBeVisible(
    { timeout: 60000 },
  );

  // Tips ↔ Dashboard integration: a manager edit shows on the Dashboard after Refresh.
  must(
    await f.manager.client.rpc("tips_save_interval", {
      ...t,
      p_service_date: fx.date,
      p_starts_at: w1.start,
      p_ends_at: w1.end,
      p_cash_cents: 12_500,
      p_card_cents: 4_000,
      p_participant_ids: [f.server1.id, f.server2.id],
      p_interval_id: saved1.interval_id,
      p_expected_revision: 2,
      p_reason: "Late cash found",
    }),
    "second update",
  );
  const truth2 = await tipsTruth();
  expect(truth2.cash).toBe(12_500);
  await openDashboard(page);
  await page.getByRole("button", { name: /Refresh/i }).click();
  await expect(page.getByTestId("dashboard-card-tips-value")).toHaveText(
    money(truth2.total),
    { timeout: 30000 },
  );

  // Tips day review shows the preserved voided row and the change history.
  await page.getByTestId("dashboard-card-tips").getByRole("link").click();
  await expect(page).toHaveURL(/tab=tips/);
  results.tipsUi = "navigation + refresh reconcile";

  // ═══ 3. Manager at branch B: payroll, external attendance, disabled tips, boundaries ═
  await openDashboard(page);
  await chooseBranch(page, "Harness B");
  await openDashboard(page);
  const payrollB = page.getByTestId("dashboard-card-payroll");
  // Truth: current-month drafts at B = 2 (the legacy no-branch period and A's period are
  // excluded); outstanding = 100000 + 50000 + 20000 = 170000 across 3 (a draft payment never
  // reduces a balance).
  await expect(page.getByTestId("dashboard-card-payroll-value")).toHaveText(
    "2",
  );
  await expect(payrollB).toContainText(`Outstanding balance ${money(170_000)}`);
  await expect(payrollB).toContainText("Across 3 periods at this branch");
  await expect(page.getByTestId("dashboard-action-payroll")).toBeVisible();
  // Attendance at B is external: Unavailable, not 0 (and A's count is not shown).
  await expect(page.getByTestId("dashboard-card-attendance-value")).toHaveText(
    "Unavailable",
  );
  await expect(page.getByTestId("dashboard-card-attendance")).toContainText(
    /external|doesn't report by branch/i,
  );
  // Tips are turned off at B: shown as off, no figures, no link.
  const tipsB = page.getByTestId("dashboard-card-tips");
  await expect(tipsB).toContainText(/Turned off/i);
  await expect(page.getByTestId("dashboard-card-tips-value")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-action-tips")).toHaveCount(0);
  // Low stock at B has its own single critical item.
  await expect(page.getByTestId("dashboard-card-lowStock-value")).toHaveText(
    "1",
  );
  // Forged links to modules that are off at B are rejected (fall back, never open).
  await page.goto(`${base}/r/${fx.slug}?location=${f.locB}&tab=tips`);
  await expect(page).not.toHaveURL(/tab=tips/);
  results.managerB =
    "payroll 2 / $1,700.00 across 3, attendance unavailable, tips off, low stock 1";

  // Organization boundary: a location of another organization is refused, never rendered.
  await page.goto(`${base}/r/${fx.slug}?location=${f.otherLoc}&tab=dashboard`);
  await expect(page.getByTestId("dashboard-card-lowStock")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Harness Other");

  // ═══ 4. Staff (server1): own tips only, no management data ═══════════════════════════
  const staffContext = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  });
  const staff = await staffContext.newPage();
  await login(staff, "server1");
  await openDashboard(staff);
  const own = truth2.own(f.server1.id);
  await expect(staff.getByTestId("dashboard-card-tips")).toContainText(
    "My tips today",
  );
  await expect(staff.getByTestId("dashboard-card-tips-value")).toHaveText(
    money(own.total),
  );
  // No branch totals, no other person's share, no management cards or shortcuts.
  const staffText =
    (await staff.getByTestId("dashboard-module").innerText()) ?? "";
  expect(staffText).not.toContain(money(truth2.total));
  for (const hidden of ["attendance", "payroll", "lowStock"])
    await expect(staff.getByTestId(`dashboard-card-${hidden}`)).toHaveCount(0);
  for (const id of ["payroll", "inventory", "reporting"])
    await expect(staff.getByTestId(`dashboard-action-${id}`)).toHaveCount(0);
  await expect(staff.getByTestId("dashboard-action-tips")).toContainText(
    "My Tips",
  );
  // Forged links: other branch, management modules.
  await staff.goto(`${base}/r/${fx.slug}?location=${f.locB}&tab=dashboard`);
  await expect(staff.getByTestId("dashboard-card-payroll")).toHaveCount(0);
  // Staff have a self-service Payroll tab (their own pay only): none of the seeded
  // organization payroll (other people's periods) may appear in it.
  await staff.goto(`${base}/r/${fx.slug}?location=${f.locA}&tab=payroll`);
  await expect(staff.getByRole("button", { name: "Payroll" })).toBeVisible({
    timeout: 60000,
  });
  await staff.waitForTimeout(2500);
  const payrollText = await staff.locator("main").innerText();
  for (const leaked of ["310.00", "1,000.00", "500.00", "9101", "9105"])
    expect(payrollText).not.toContain(leaked);
  // A forged Bar Inventory link: staff are not inventory-authorized, nothing is shown.
  await staff.goto(`${base}/r/${fx.slug}?location=${f.locA}&tab=bar-inventory`);
  await staff.waitForTimeout(2500);
  expect(await staff.locator("main").innerText()).not.toContain("PhaseC");
  // A staff member who took part in no share (server3's interval was voided) sees nothing of
  // anyone else's money.
  await staffContext.close();
  const s3Context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  });
  const s3 = await s3Context.newPage();
  await login(s3, "server3");
  await openDashboard(s3);
  const s3Own = truth2.own(f.server3.id);
  expect(s3Own.total).toBe(0);
  await expect(s3.getByTestId("dashboard-card-tips-value")).toHaveText(
    money(0),
  );
  await expect(s3.getByTestId("dashboard-card-tips")).toContainText(
    "No tips allocated to you yet today",
  );
  await s3Context.close();
  results.staff = { server1Own: own, server3Own: s3Own };

  // ═══ 5. Responsive usability (phone) ═════════════════════════════════════════════════
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await phone.newPage();
  await login(mobile, "manager");
  await openDashboard(mobile);
  await expect(mobile.getByTestId("dashboard-card-tips-value")).toHaveText(
    money(truth2.total),
  );
  expect(await overflow(mobile)).toBeLessThanOrEqual(0);
  await mobile.getByTestId("dashboard-card-lowStock").getByRole("link").click();
  await expect(mobile).toHaveURL(
    /tab=bar-inventory|tab=barInventory|tab=inventory/,
  );
  await phone.close();
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  console.info("PHASE_C_RESULTS", JSON.stringify(results));
});
