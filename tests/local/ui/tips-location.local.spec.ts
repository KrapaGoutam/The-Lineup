import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import {
  createTipsFixture,
  must,
  tipsEnv,
  type TipsFixture,
  type TipsTestUser,
} from "../support/tips-fixture";

/**
 * V2-005.003 authenticated browser acceptance against the DISPOSABLE local
 * stack (real Supabase Auth sessions, real RPCs, a production-mode app server).
 * Manager at Location A, Staff at Location B, a dual-location manager, a
 * Location-A-only staff member and an Overall administrator with no tenant
 * membership. Runs on desktop, tablet and phone viewports.
 */

let fx: TipsFixture;
let staffB: TipsTestUser;

const NAMES = {
  manager: "Maya Manager",
  staff: "Sam Staff",
  dual: "Dana Dual",
  unassigned: "Uma Unassigned",
  foreign: "Fay Foreign",
  overall: "Olive Overall",
  staffB: "Ben Bravo",
} as const;

// Checkbox labels show the short (first) name; totals and history show the full name.
const shortName = (full: string) => new RegExp("^" + full.split(" ")[0] + "$");

async function authenticate(
  context: BrowserContext,
  user: TipsTestUser,
  location: string,
) {
  const session = must(await user.client.auth.getSession()).session!;
  const client = createServerClient(tipsEnv.url, tipsEnv.anon, {
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
      value: JSON.stringify({ v: 1, o: fx.org.id, l: location }),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function openTips(page: Page) {
  const tab = page.getByRole("button", { name: /^Tip Split(?:\s|$)/ });
  if (!(await tab.isVisible())) {
    const more = page.getByRole("button", { name: /More/ });
    if (await more.isVisible()) await more.click();
  }
  if (await tab.isVisible()) await tab.click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Tip split|My tip estimate/i }),
  ).toBeVisible({ timeout: 60000 });
}

async function switchTo(page: Page, location: string, label: string) {
  await page
    .getByRole("button", { name: /^Switch workspace\. Current:/ })
    .click();
  await page
    .locator(`[role="menuitemradio"][data-location-id="${location}"]`)
    .click();
  await expect(
    page.getByRole("button", { name: /^Switch workspace\. Current:/ }),
  ).toContainText(label);
  await openTips(page);
}

async function choosePeople(page: Page, names: string[]) {
  const boxes = page.getByRole("checkbox");
  const count = await boxes.count();
  for (let i = 0; i < count; i += 1) {
    const box = boxes.nth(i);
    if (await box.isChecked()) await box.uncheck();
  }
  for (const name of names) {
    await page.getByRole("checkbox", { name: shortName(name) }).check();
  }
}

async function addInterval(
  page: Page,
  input: { from: string; to: string; amount: string; people: string[] },
) {
  await page.getByLabel("From").fill(input.from);
  await page.getByLabel("To").fill(input.to);
  await page.getByLabel("Tips received").fill(input.amount);
  await choosePeople(page, input.people);
  await page.getByRole("button", { name: "Add and calculate" }).click();
}

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );

async function poolAt(location: string) {
  return must(
    await fx.admin
      .from("tip_pools")
      .select("id, status, finalized_by")
      .eq("location_id", location)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  fx = await createTipsFixture();
  staffB = await fx.makeUser("staff-b");
  must(
    await fx.admin.from("memberships").insert({
      organization_id: fx.org.id,
      profile_id: staffB.id,
      roles: ["server"],
      active: true,
    }),
  );
  must(
    await fx.admin.from("location_memberships").insert({
      location_id: fx.b,
      profile_id: staffB.id,
      role: "staff",
    }),
  );
  const people: Array<[string, string]> = [
    [fx.manager.id, NAMES.manager],
    [fx.staff.id, NAMES.staff],
    [fx.dual.id, NAMES.dual],
    [fx.unassigned.id, NAMES.unassigned],
    [fx.foreign.id, NAMES.foreign],
    [fx.overall.id, NAMES.overall],
    [staffB.id, NAMES.staffB],
  ];
  for (const [id, display_name] of people) {
    must(await fx.admin.from("profiles").update({ display_name }).eq("id", id));
  }
  must(
    await fx.admin.from("location_module_configs").insert(
      [fx.a, fx.b].map((location_id) => ({
        location_id,
        module_key: "tips",
        is_enabled: true,
      })),
    ),
  );
});

test.afterAll(async () => {
  if (fx) await fx.teardown();
});

test("manager at A: only Location A's current workforce is selectable; interval math reconciles and persists", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.manager, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await openTips(page);

  for (const present of [NAMES.manager, NAMES.staff, NAMES.dual]) {
    await expect(
      page.getByRole("checkbox", { name: shortName(present) }),
    ).toBeVisible();
  }
  for (const absent of [
    NAMES.staffB,
    NAMES.unassigned,
    NAMES.foreign,
    NAMES.overall,
  ]) {
    await expect(
      page.getByRole("checkbox", { name: shortName(absent) }),
    ).toHaveCount(0);
  }

  await addInterval(page, {
    from: "11:00",
    to: "13:00",
    amount: "100.01",
    people: [NAMES.staff, NAMES.dual],
  });
  await expect(
    page.getByText(money(10001), { exact: true }).first(),
  ).toBeVisible({ timeout: 30000 });

  const pool = await poolAt(fx.a);
  expect(pool).not.toBeNull();
  const allocations = must(
    await fx.admin
      .from("tip_allocations")
      .select("profile_id, amount_cents")
      .eq("tip_pool_id", pool!.id),
  )!;
  expect(allocations).toHaveLength(2);
  const cents = allocations.map((a) => a.amount_cents).sort();
  expect(cents).toEqual([5000, 5001]); // the odd cent is assigned, never lost
  expect(cents[0] + cents[1]).toBe(10001);
  for (const a of allocations) {
    const who = a.profile_id === fx.staff.id ? NAMES.staff : NAMES.dual;
    await expect(
      page
        .getByText(who, { exact: true })
        .locator("xpath=ancestor::div[1]")
        .getByText(money(a.amount_cents)),
    ).toBeVisible();
  }
  await expect(page.getByText("Reconciled total")).toBeVisible();
  await expect(
    page.getByText("Reconciled total").locator("xpath=following-sibling::p"),
  ).toHaveText(money(10001));

  await page.reload();
  await openTips(page);
  await expect(
    page.getByText(money(10001), { exact: true }).first(),
  ).toBeVisible();
});

test("manager finalizes then reopens with a reason; the audit trail is attributed and survives a reload", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.manager, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await openTips(page);

  await page.getByRole("button", { name: "Finalize day" }).click();
  await expect(page.getByText("Finalized", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByRole("button", { name: "Add and calculate" }),
  ).toBeDisabled();
  const finalized = await poolAt(fx.a);
  expect(finalized!.status).toBe("finalized");
  expect(finalized!.finalized_by).toBe(fx.manager.id);
  await expect(page.getByText(/Last: finalized by Maya Manager/)).toBeVisible();

  await page.getByRole("button", { name: "Reopen for corrections" }).click();
  await page.getByLabel("Reason for reopening tips").fill("Late cash tip");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Live estimate")).toBeVisible({ timeout: 30000 });
  expect((await poolAt(fx.a))!.status).toBe("draft");

  await page.reload();
  await openTips(page);
  await expect(
    page.getByText(/Last: reopened by Maya Manager — Late cash tip/),
  ).toBeVisible();
  const events = must(
    await fx.admin
      .from("audit_events")
      .select("action, actor_profile_id, location_id")
      .eq("entity_type", "tip_pool")
      .eq("organization_id", fx.org.id),
  )!;
  expect(events.map((e) => e.action).sort()).toEqual(["finalized", "reopened"]);
  expect(events.every((e) => e.actor_profile_id === fx.manager.id)).toBe(true);
  expect(events.every((e) => e.location_id === fx.a)).toBe(true);
});

test("staff at A sees only their own estimate: no manager controls, no co-worker names, no other people's money", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.staff, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await openTips(page);

  await expect(
    page.getByRole("heading", { level: 1, name: "My tip estimate" }),
  ).toBeVisible();
  const own = must(
    await fx.admin
      .from("tip_allocations")
      .select("amount_cents")
      .eq("profile_id", fx.staff.id)
      .single(),
  )!;
  await expect(page.getByText(money(own.amount_cents)).first()).toBeVisible();
  await expect(
    page.getByText("Across 1 confirmed work intervals"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add and calculate" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Finalize day" })).toHaveCount(
    0,
  );
  const text = await page.locator("body").innerText();
  for (const other of [
    NAMES.dual,
    NAMES.manager,
    NAMES.staffB,
    NAMES.foreign,
  ]) {
    expect(text).not.toContain(other);
  }
});

test("staff at B sees nothing from Location A, even with a cookie pointing at A", async ({
  page,
  context,
}) => {
  await authenticate(context, staffB, fx.b);
  await page.goto(`/r/${fx.org.slug}`);
  await openTips(page);
  await expect(
    page.getByText("Across 0 confirmed work intervals"),
  ).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain(money(10001));

  // A cookie naming a location this person is not assigned to must not unlock A.
  await setLocationCookie(context, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await page.waitForLoadState("networkidle");
  const text = await page.locator("body").innerText();
  expect(text).not.toContain(money(10001));
  expect(text).not.toContain(NAMES.staff);
  expect(text).not.toContain(NAMES.dual);
});

test("a dual-location manager's switch changes the dataset with no leakage, then back again", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.manager, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await openTips(page);
  await expect(
    page.getByText(money(10001), { exact: true }).first(),
  ).toBeVisible();

  await switchTo(page, fx.b, "Tips B");
  // B has no history and its roster is B's workforce only.
  await expect(page.getByText(money(10001))).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: shortName(NAMES.staffB) }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: shortName(NAMES.staff) }),
  ).toHaveCount(0);

  await addInterval(page, {
    from: "12:00",
    to: "16:00",
    amount: "50.00",
    people: [NAMES.dual, NAMES.staffB],
  });
  await expect(
    page.getByText(money(5000), { exact: true }).first(),
  ).toBeVisible({ timeout: 30000 });
  const poolB = await poolAt(fx.b);
  expect(poolB).not.toBeNull();
  expect(
    must(
      await fx.admin
        .from("tip_intervals")
        .select("amount_cents")
        .eq("tip_pool_id", poolB!.id),
    ),
  ).toEqual([{ amount_cents: 5000 }]);

  await switchTo(page, fx.a, "Tips A");
  await expect(
    page.getByText(money(10001), { exact: true }).first(),
  ).toBeVisible();
  // B's $50.00 interval split two ways ($25.00 each) must not appear at A. (A's own
  // $100.01 split legitimately contains a $50.00 total, so assert on B's share.)
  await expect(page.getByText(money(2500), { exact: true })).toHaveCount(0);
  await expect(page.getByText(NAMES.staffB, { exact: true })).toHaveCount(0);
});

test("a stale browser cannot add Location A tips after its verified context moves to B", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.manager, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await openTips(page);
  const before = must(
    await fx.admin
      .from("tip_intervals")
      .select("id")
      .eq("organization_id", fx.org.id),
  )!.length;

  await setLocationCookie(context, fx.b);
  await page.getByLabel("From").fill("17:00");
  await page.getByLabel("To").fill("18:00");
  await page.getByLabel("Tips received").fill("9.99");
  await page.getByRole("button", { name: "Add and calculate" }).click();

  await expect(
    page.getByText(/Your active location changed/).first(),
  ).toBeVisible({ timeout: 30000 });
  expect(
    must(
      await fx.admin
        .from("tip_intervals")
        .select("id")
        .eq("organization_id", fx.org.id),
    ),
  ).toHaveLength(before);
});

test("Overall administrator with no tenant membership finalizes with real attribution", async ({
  page,
  context,
}) => {
  must(
    await fx.admin
      .from("overall_roles")
      .upsert(
        { profile_id: fx.overall.id, role: "owner" },
        { onConflict: "profile_id" },
      ),
  );
  await authenticate(context, fx.overall, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await openTips(page);
  await page.getByRole("button", { name: "Finalize day" }).click();
  await expect(page.getByText("Finalized", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  const pool = await poolAt(fx.a);
  expect(pool!.status).toBe("finalized");
  expect(pool!.finalized_by).toBe(fx.overall.id);
  await expect(
    page.getByText(/Last: finalized by Olive Overall/),
  ).toBeVisible();
  expect(
    must(
      await fx.admin
        .from("memberships")
        .select("id")
        .eq("profile_id", fx.overall.id),
    ),
  ).toEqual([]);
});
