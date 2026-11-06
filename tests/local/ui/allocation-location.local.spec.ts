import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import {
  Board,
  createFixture,
  env,
  type Fixture,
  type TestUser,
} from "../../real/support/harness";

// Real local Auth cookies, issued by Supabase SSR. No passcodes, JWTs, or traces
// are written to disk. This suite refuses every target except restaurant-roster.
let fx: Fixture;
let slug: string;
let a: Board;
let b: Board;
const base = "http://localhost:3127";
async function authenticate(
  context: BrowserContext,
  user: TestUser,
  location: string,
) {
  const session = (await user.client.auth.getSession()).data.session!;
  const client = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => [],
      setAll: async (values) => {
        await context.addCookies(
          values.map(({ name, value }) => ({
            name,
            value,
            domain: "localhost",
            path: "/",
            httpOnly: true,
            sameSite: "Lax",
          })),
        );
      },
    },
  });
  expect((await client.auth.setSession(session)).error).toBeNull();
  await context.addCookies([
    {
      name: "lineup_active_context",
      value: JSON.stringify({ v: 1, o: fx.orgId, l: location }),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
async function allocation(page: Page) {
  // Allocation is the only enabled optional module in this synthetic fixture.
  // Wait for its mounted grid rather than racing hydration with the mobile More sheet.
  const grid = page.getByRole("tab", { name: "Grid", exact: true });
  await expect(grid).toBeVisible({ timeout: 30000 });
  await grid.click();
}
async function switchTo(page: Page, location: string) {
  await page
    .getByRole("button", { name: /^Switch workspace\. Current:/ })
    .click();
  await page
    .locator(`[role="menuitemradio"][data-location-id="${location}"]`)
    .click();
  await expect(
    page.getByRole("button", { name: /^Switch workspace\. Current:/ }),
  ).toContainText(location === fx.locA ? "Harness A" : "Harness B");
}

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  if (
    process.env.LINEUP_REAL_LOCAL !== "1" ||
    env.url !== "http://127.0.0.1:54321"
  )
    throw new Error("Verified local stack required");
  fx = await createFixture();
  const org = await fx.admin
    .from("organizations")
    .select("slug")
    .eq("id", fx.orgId)
    .single();
  slug = org.data!.slug;
  for (const [user, location] of [
    [fx.owner, fx.locA],
    [fx.owner, fx.locB],
    [fx.server2, fx.locB],
  ] as const) {
    expect(
      (
        await fx.admin
          .from("location_memberships")
          .upsert(
            { profile_id: user.id, location_id: location, active: true },
            { onConflict: "location_id,profile_id" },
          )
      ).error,
    ).toBeNull();
  }
  expect(
    (
      await fx.admin.from("location_module_configs").insert(
        [fx.locA, fx.locB].map((location_id) => ({
          location_id,
          module_key: "table_allocation",
          is_enabled: true,
        })),
      )
    ).error,
  ).toBeNull();
  a = new Board(fx, fx.locA);
  b = new Board(fx, fx.locB);
  await a.addServer(fx.owner, fx.server1);
  await b.addServer(fx.owner, fx.server2);
});
test.afterAll(async () => {
  if (!fx) return;
  expect(
    (
      await fx.admin
        .from("location_module_configs")
        .delete()
        .in("location_id", [fx.locA, fx.locB])
    ).error,
  ).toBeNull();
  await fx.teardown();
  expect(
    (
      await fx.admin
        .from("organizations")
        .select("id")
        .in("id", [fx.orgId, fx.otherOrgId])
    ).data,
  ).toEqual([]);
});

test("authenticated location switches keep boards independent; assignment and undo/redo persist", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await authenticate(context, fx.owner, fx.locA);
  await page.goto(`${base}/r/${slug}?location=${fx.locA}`);
  await allocation(page);
  const cell = page.locator(`input[data-cell^="${fx.server1.name}|"]`).first();
  await expect(cell).toBeVisible();
  await expect(
    page.locator(`input[data-cell^="${fx.server2.name}|"]`),
  ).toHaveCount(0);
  await cell.fill("10");
  await cell.press("Enter");
  await expect
    .poll(async () => (await a.claims()).has("10"), { timeout: 20000 })
    .toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await a.claims()).has("10"), { timeout: 20000 })
    .toBe(false);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(async () => (await a.claims()).has("10"), { timeout: 20000 })
    .toBe(true);
  await switchTo(page, fx.locB);
  await allocation(page);
  await expect(
    page.locator(`input[data-cell^="${fx.server2.name}|"]`).first(),
  ).toBeVisible();
  await expect(
    page.locator(`input[data-cell^="${fx.server1.name}|"]`),
  ).toHaveCount(0);
  expect((await b.claims()).size).toBe(0);
  expect(a.sid).not.toBe(b.sid);
  await page.reload();
  await allocation(page);
  await expect(
    page.locator(`input[data-cell^="${fx.server1.name}|"]`),
  ).toHaveCount(0);
  await page.goBack();
  await expect(
    page.locator(`input[data-cell^="${fx.server1.name}|"]`),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("unassigned deep link and disabled allocation never mount a foreign board", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.server1, fx.locA);
  await page.goto(`${base}/r/${slug}?location=${fx.locB}`);
  await expect(page.locator("input[data-cell]")).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Grid", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await fx.admin
        .from("location_module_configs")
        .update({ is_enabled: false })
        .eq("location_id", fx.locB)
        .eq("module_key", "table_allocation")
    ).error,
  ).toBeNull();
  await context.clearCookies();
  await authenticate(context, fx.owner, fx.locB);
  await page.goto(`${base}/r/${slug}?location=${fx.locB}&tab=allocation`);
  await expect(
    page.getByRole("button", { name: /^Switch workspace\. Current:/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Grid", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("input[data-cell]")).toHaveCount(0);
});
