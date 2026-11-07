import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import {
  createTipsFixture,
  must,
  tipsEnv,
  type TipsFixture,
  type TipsTestUser,
} from "../support/tips-fixture";

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

async function navigateToTips(page: Page) {
  const tab = page.getByRole("button", { name: /^Tips(?:\s|$)/i });
  if (!(await tab.isVisible())) {
    const more = page.getByRole("button", { name: /More/i });
    if (await more.isVisible()) await more.click();
  }
  if (await tab.isVisible()) await tab.click();
  await expect(page.getByText(/Tip Split/i).first()).toBeVisible({
    timeout: 30000,
  });
}

test.describe("Tips Location Scoping UI", () => {
  test.beforeAll(async () => {
    fx = await createTipsFixture();
  });

  test.afterAll(async () => {
    if (fx) await fx.teardown();
  });

  test("Manager at Location A sees manager controls and can add intervals", async ({
    page,
    context,
  }) => {
    await authenticate(context, fx.manager, fx.a);
    await page.goto(`/r/${fx.org.slug}`);
    await navigateToTips(page);

    // Verify manager controls are rendered
    await expect(page.getByText(/Tip Split/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Add interval/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Finalize tips/i }),
    ).toBeVisible();
  });

  test("Staff at Location A sees server view without manager controls", async ({
    page,
    context,
  }) => {
    await authenticate(context, fx.staff, fx.a);
    await page.goto(`/r/${fx.org.slug}`);
    await navigateToTips(page);

    // Verify staff sees "Your estimated tips" but not manager controls
    await expect(page.getByText(/Your estimated tips/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Add interval/i }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /Finalize tips/i }),
    ).not.toBeVisible();
  });
});
