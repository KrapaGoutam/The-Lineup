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
 * New app build against the PREVIOUS (77-migration) schema, i.e. a Preview
 * deployed before the Tips migration reaches the database. Run only against the
 * disposable local stack reset to the pre-Tips migration. The Tips view must
 * fail closed: an explicit notice, no people, no money, no write controls.
 */

let fx: TipsFixture;

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
    page.getByRole("heading", { level: 1, name: /Tip split/i }),
  ).toBeVisible({ timeout: 60000 });
}

test.beforeAll(async () => {
  fx = await createTipsFixture();
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

test("new app on the old schema: Tips fails closed with a clear notice and no data or write controls", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.manager, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await openTips(page);

  await expect(page.getByRole("status")).toContainText(
    /isn't available yet for this environment/i,
  );
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add and calculate" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Finalize day" })).toHaveCount(
    0,
  );
  // Nothing from the organization-wide roster leaks as a fallback.
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("Tips staff-a");
  expect(text).not.toContain("Tips staff-ab");
});
