import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import {
  createScheduleFixture,
  must,
  scheduleEnv,
  type ScheduleFixture,
  type ScheduleTestUser,
} from "../support/schedule-fixture";

/**
 * V2-005.004 / V2-005.008 authenticated browser acceptance against the
 * DISPOSABLE local stack (real Supabase Auth sessions, real RPCs/RLS, a
 * production-mode app server). Manager at Location A (staff at B), Staff at A,
 * Staff at B, a departed former Location-A employee, an Overall manager with
 * no tenant membership and an organization owner. Desktop, tablet and phone.
 */

let fx: ScheduleFixture;
let departedId: string;

const NAMES = {
  manager: "Maya Manager",
  staffA: "Sam Staff",
  staffB: "Ben Bravo",
  managerB: "Bea Bravo-Boss",
  overall: "Olive Overall",
  owner: "Owen Owner",
  departed: "Hal Historic",
} as const;

async function authenticate(
  context: BrowserContext,
  user: ScheduleTestUser,
  location: string,
) {
  const session = must(await user.client.auth.getSession()).session!;
  const client = createServerClient(scheduleEnv.url, scheduleEnv.anon, {
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

async function openTab(page: Page, name: RegExp, heading: RegExp) {
  const tab = page.getByRole("button", { name });
  if (!(await tab.isVisible())) {
    const more = page.getByRole("button", { name: /More/ });
    if (await more.isVisible()) await more.click();
  }
  if (await tab.isVisible()) await tab.click();
  await expect(
    page.getByRole("heading", { level: 1, name: heading }),
  ).toBeVisible({ timeout: 60000 });
}

const openSchedule = (page: Page) =>
  openTab(page, /^Schedule(?:\s|$)/, /Weekly & monthly roster/i);

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
}

async function personOptions(page: Page) {
  return page.locator("select#employeeId option").allTextContents();
}

const shiftsAt = async (location: string) =>
  must(
    await fx.admin
      .from("shifts")
      .select(
        "id, location_id, schedule_period_id, kind, shift_assignments!shift_assignments_shift_tenant_fk(profile_id)",
      )
      .eq("organization_id", fx.org.id)
      .eq("location_id", location)
      .neq("service_date", "2020-03-03")
      .order("id"),
  )!;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  fx = await createScheduleFixture();
  const names: Array<[string, string]> = [
    [fx.managerA.id, NAMES.manager],
    [fx.staffA.id, NAMES.staffA],
    [fx.staffB.id, NAMES.staffB],
    [fx.managerB.id, NAMES.managerB],
    [fx.overallManager.id, NAMES.overall],
    [fx.owner.id, NAMES.owner],
  ];
  for (const [id, display_name] of names) {
    must(await fx.admin.from("profiles").update({ display_name }).eq("id", id));
  }
  // A former Location-A employee: still a tenant member, no longer Location-A workforce,
  // but their past published shift keeps them in the historical roster.
  const created = must(
    await fx.admin.auth.admin.createUser({
      email: `sch-${fx.run}-departed@harness.invalid`,
      password: `Pw-${fx.run}-departed-1`,
      email_confirm: true,
    }),
  );
  departedId = created.user!.id;
  must(
    await fx.admin
      .from("profiles")
      .insert({ id: departedId, display_name: NAMES.departed }),
  );
  must(
    await fx.admin.from("memberships").insert({
      organization_id: fx.org.id,
      profile_id: departedId,
      roles: ["server"],
    }),
  );
  must(
    await fx.admin.from("location_memberships").insert({
      location_id: fx.a,
      profile_id: departedId,
      role: "staff",
      active: false,
    }),
  );
  const period = must(
    await fx.admin
      .from("schedule_periods")
      .insert({
        organization_id: fx.org.id,
        location_id: fx.a,
        starts_on: "2020-01-01",
        ends_on: "2020-12-31",
        status: "published",
        published_version: 1,
        published_at: "2020-01-02T00:00:00Z",
        published_by: fx.managerA.id,
      })
      .select("id")
      .single(),
  )!;
  const past = must(
    await fx.admin
      .from("shifts")
      .insert({
        organization_id: fx.org.id,
        location_id: fx.a,
        schedule_period_id: period.id,
        service_date: "2020-03-03",
        end_date: "2020-03-03",
        kind: "evening",
        starts_at: "2020-03-03T22:00:00Z",
        ends_at: "2020-03-04T04:00:00Z",
        role_label: "Server",
      })
      .select("id")
      .single(),
  )!;
  must(
    await fx.admin.from("shift_assignments").insert({
      organization_id: fx.org.id,
      shift_id: past.id,
      profile_id: departedId,
    }),
  );
  // The organization owner works from Location A (V2 contexts require a location assignment).
  must(
    await fx.admin
      .from("location_memberships")
      .insert({ location_id: fx.a, profile_id: fx.owner.id, role: "manager" }),
  );
  must(
    await fx.admin.from("location_module_configs").insert(
      [fx.a, fx.b].flatMap((location_id) =>
        (["schedule", "team"] as const).map((module_key) => ({
          location_id,
          module_key,
          is_enabled: true,
        })),
      ),
    ),
  );
});

test.afterAll(async () => {
  if (!fx) return;
  await fx.admin
    .from("shift_assignments")
    .delete()
    .eq("organization_id", fx.org.id);
  await fx.admin
    .from("location_memberships")
    .delete()
    .eq("profile_id", departedId);
  await fx.admin.from("memberships").delete().eq("profile_id", departedId);
  await fx.teardown().catch((error) => console.error("teardown", error));
  await fx.admin.from("profiles").delete().eq("id", departedId);
  await fx.admin.auth.admin.deleteUser(departedId);
});

test("manager at A: workforce is Location A only; a shift is added, edited, published and attributed", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.managerA, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await openSchedule(page);
  await expect(page.getByTestId("schedule-roster-unavailable")).toHaveCount(0);

  await page
    .getByRole("button", { name: /Add shift/ })
    .first()
    .click();
  const options = await personOptions(page);
  expect(options).toEqual(
    expect.arrayContaining([NAMES.manager, NAMES.staffA]),
  );
  for (const absent of [NAMES.staffB, NAMES.managerB, NAMES.departed]) {
    expect(
      options,
      `${absent} must not be assignable at Location A`,
    ).not.toContain(absent);
  }

  await page.locator("select#employeeId").selectOption({ label: NAMES.staffA });
  await page.getByRole("button", { name: "Add to draft" }).click();
  await expect(
    page.getByRole("button", { name: /^Edit Morning shift/ }).first(),
  ).toBeVisible({ timeout: 30000 });
  const created = (await shiftsAt(fx.a)).filter((s) => s.kind === "morning");
  expect(created).toHaveLength(1);
  expect(created[0].shift_assignments).toEqual([{ profile_id: fx.staffA.id }]);
  expect((await shiftsAt(fx.b)).length).toBe(0);

  // Edit through the dialog; its picker offers no foreign or departed staff.
  await page
    .getByRole("button", { name: /^Edit Morning shift/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  const dialogOptions = await dialog
    .locator("select")
    .first()
    .locator("option")
    .allTextContents();
  expect(dialogOptions).not.toContain(NAMES.staffB);
  expect(dialogOptions).not.toContain(NAMES.departed);
  await dialog.locator("select").nth(1).selectOption("evening");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByRole("button", { name: /^Edit Evening shift/ }).first(),
  ).toBeVisible({ timeout: 30000 });

  // Publish: the DB records the real actor and location; audit trail is location-scoped.
  await page.getByRole("button", { name: /^Publish/ }).click();
  await expect
    .poll(
      async () => {
        const p = await fx.admin
          .from("schedule_periods")
          .select("status, published_by, location_id")
          .eq("location_id", fx.a)
          .eq("status", "published")
          .neq("starts_on", "2020-01-01")
          .maybeSingle();
        return p.data;
      },
      { timeout: 30000 },
    )
    .toMatchObject({
      status: "published",
      published_by: fx.managerA.id,
      location_id: fx.a,
    });
  const events = must(
    await fx.admin
      .from("audit_events")
      .select("action, actor_profile_id, location_id, entity_type")
      .eq("organization_id", fx.org.id)
      .in("entity_type", ["schedule_period", "shift"]),
  )!;
  expect(events.length).toBeGreaterThan(0);
  expect(events.every((e) => e.actor_profile_id === fx.managerA.id)).toBe(true);
  expect(events.every((e) => e.location_id === fx.a)).toBe(true);
  expect(events.map((e) => e.action)).toContain("publish_schedule");
});

test("manager at A is only staff at B: switching shows B without manager controls or A's shifts", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.managerA, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await openSchedule(page);
  await expect(
    page.getByRole("button", { name: /^Edit Evening shift/ }).first(),
  ).toBeVisible();

  await switchTo(page, fx.b, "Loc B");
  await openSchedule(page);
  await expect(page.getByRole("button", { name: /Add shift/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Publish/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Edit .* shift/ }),
  ).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(NAMES.departed);
});

test("staff at A sees the published shift without manager controls; staff at B sees nothing of A", async ({
  page,
  context,
  browser,
}) => {
  await authenticate(context, fx.staffA, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await openSchedule(page);
  await expect(page.getByRole("button", { name: /Add shift/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Publish/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Edit .* shift/ }),
  ).toHaveCount(0);
  await expect(page.locator("body")).toContainText(NAMES.staffA.split(" ")[0]);

  const other = await browser.newContext();
  const pageB = await other.newPage();
  await authenticate(other, fx.staffB, fx.b);
  await pageB.goto(`http://localhost:3137/r/${fx.org.slug}`);
  await openSchedule(pageB);
  await expect(pageB.getByRole("button", { name: /Add shift/ })).toHaveCount(0);
  const bodyB = await pageB.locator("body").innerText();
  expect(bodyB).not.toContain(NAMES.staffA);
  expect(bodyB).not.toContain(NAMES.departed);
  await other.close();
});

test("a stale tab cannot write after the active location changed in another tab (Overall manager)", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.overallManager, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await openSchedule(page);
  const beforeB = (await shiftsAt(fx.b)).length;
  const beforeA = (await shiftsAt(fx.a)).length;

  // Another tab moves the persisted workspace to Location B.
  await setLocationCookie(context, fx.b);

  await page
    .getByRole("button", { name: /Add shift/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Add to draft" }).click();
  await expect(page.getByText(/changed in another tab/i)).toBeVisible({
    timeout: 30000,
  });
  expect((await shiftsAt(fx.b)).length).toBe(beforeB);
  expect((await shiftsAt(fx.a)).length).toBe(beforeA);
});

async function renameInTeamTab(page: Page, from: string, to: string) {
  await openTab(page, /^Team(?:\s|$)/, /./);
  await page.getByRole("button", { name: `Rename ${from}` }).click();
  await page.locator("input#rename-name").fill(to);
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Their name has been updated.")).toBeVisible({
    timeout: 30000,
  });
}

const displayName = async (id: string) =>
  must(
    await fx.admin
      .from("profiles")
      .select("display_name")
      .eq("id", id)
      .single(),
  )!.display_name;

test("Team: a location-only manager has no organization Team controls and changes nothing", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.managerA, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await openSchedule(page);
  const more = page.getByRole("button", { name: /More/ });
  if (await more.isVisible()) await more.click();
  await expect(page.getByRole("button", { name: /^Team(?:\s|$)/ })).toHaveCount(
    0,
  );
  expect(await displayName(fx.staffA.id)).toBe(NAMES.staffA);
  const roles = must(
    await fx.admin
      .from("memberships")
      .select("roles")
      .eq("organization_id", fx.org.id)
      .eq("profile_id", fx.managerA.id)
      .single(),
  )!;
  expect(roles.roles).toEqual(["server"]);
});

test("Team: the organization owner and an Overall manager can rename members", async ({
  context,
  page,
  browser,
}) => {
  await authenticate(context, fx.owner, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await renameInTeamTab(page, NAMES.staffA, "Samuel Staff");
  expect(await displayName(fx.staffA.id)).toBe("Samuel Staff");

  const other = await browser.newContext();
  const overallPage = await other.newPage();
  await authenticate(other, fx.overallManager, fx.a);
  await overallPage.goto(`http://localhost:3137/r/${fx.org.slug}`);
  await renameInTeamTab(overallPage, "Samuel Staff", "Sammy Staff");
  expect(await displayName(fx.staffA.id)).toBe("Sammy Staff");
  await other.close();
});
