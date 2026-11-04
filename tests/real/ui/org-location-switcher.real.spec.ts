/**
 * V2-003.002 real-mode browser check of the Organization / Location switcher
 * (hosted DEV, real session cookies, synthetic org/users removed afterwards).
 * A multi-location user (Manager at Webster, Staff at NASA) is signed in by
 * injecting the exact cookies the SSR client would have set, then the switcher
 * is exercised at 390 / 768 / 1366 and (via the project) WebKit iPad.
 */
import crypto from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { expect, test, type Page } from "@playwright/test";

import { adminClient, env } from "../support/harness";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// Same guard as support/dev-app.ts, inlined: that module also loads local
// PIN files this spec does not need.
async function assertServerIsDev() {
  const html = await (await fetch(BASE)).text();
  const scripts = [...html.matchAll(/src="(\/_next\/[^"]+\.js[^"]*)"/g)].map(
    (m) => m[1],
  );
  let corpus = html;
  for (const src of scripts.slice(0, 40)) {
    corpus += await (await fetch(new URL(src, BASE))).text();
  }
  if (corpus.includes("ftadewtkjlaotfdvtjcv")) {
    throw new Error("The app under test references PROD. Refusing to run.");
  }
  if (!corpus.includes("opmujepkemwcdxxorhfd")) {
    throw new Error("The app under test is not pinned to the-lineup-dev.");
  }
}

test.describe.configure({ mode: "serial" });

const admin = adminClient();
const runId = crypto.randomBytes(4).toString("hex");
const slug = `v2ui-${runId}`;
const SHOTS = process.env.SWITCHER_SHOT_DIR;
const ids: { org?: string; users: string[]; webster?: string; nasa?: string } =
  {
    users: [],
  };
let multiCookies: { name: string; value: string }[] = [];
let singleCookies: { name: string; value: string }[] = [];

async function cookiesFor(email: string, password: string) {
  const jar = new Map<string, string>();
  const client = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)),
    },
  });
  const r = await client.auth.signInWithPassword({ email, password });
  if (r.error) throw new Error(`signin: ${r.error.message}`);
  return [...jar].map(([name, value]) => ({ name, value }));
}

async function mkUser(key: string) {
  const email = `v2ui-${runId}-${key}@harness.invalid`;
  const password = crypto.randomBytes(18).toString("base64url");
  const c = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (c.error || !c.data.user)
    throw new Error(`createUser: ${c.error?.message}`);
  const id = c.data.user.id;
  await admin
    .from("profiles")
    .insert({ id, display_name: `V2UI ${key} ${runId}` });
  ids.users.push(id);
  return { id, email, password };
}

test.beforeAll(async () => {
  await assertServerIsDev();
  const multi = await mkUser("multi");
  const single = await mkUser("single");
  const org = await admin
    .from("organizations")
    .insert({ name: `Monks UI ${runId}`, slug, created_by: multi.id })
    .select("id")
    .single();
  ids.org = org.data!.id as string;
  const loc = async (name: string, tz: string) =>
    (
      await admin
        .from("locations")
        .insert({ organization_id: ids.org, name, time_zone: tz })
        .select("id")
        .single()
    ).data!.id as string;
  ids.webster = await loc("Webster", "America/New_York");
  ids.nasa = await loc("NASA", "America/Los_Angeles");
  await admin.from("memberships").insert([
    {
      organization_id: ids.org,
      profile_id: multi.id,
      roles: ["server"],
      active: true,
    },
    {
      organization_id: ids.org,
      profile_id: single.id,
      roles: ["server"],
      active: true,
    },
  ]);
  await admin.from("location_memberships").insert([
    {
      profile_id: multi.id,
      location_id: ids.webster,
      role: "manager",
      active: true,
    },
    {
      profile_id: multi.id,
      location_id: ids.nasa,
      role: "staff",
      active: true,
    },
    {
      profile_id: single.id,
      location_id: ids.nasa,
      role: "staff",
      active: true,
    },
  ]);
  multiCookies = await cookiesFor(multi.email, multi.password);
  singleCookies = await cookiesFor(single.email, single.password);
});

test.afterAll(async () => {
  if (ids.users.length) {
    await admin
      .from("location_memberships")
      .delete()
      .in("profile_id", ids.users);
  }
  if (ids.org) {
    await admin.from("memberships").delete().eq("organization_id", ids.org);
    await admin.from("locations").delete().eq("organization_id", ids.org);
    await admin.from("organizations").delete().eq("id", ids.org);
  }
  await admin.from("profiles").delete().in("id", ids.users);
  for (const id of ids.users) await admin.auth.admin.deleteUser(id);
});

async function open(page: Page, cookies: typeof multiCookies, query: string) {
  const url = new URL(BASE);
  await page
    .context()
    .addCookies(
      cookies.map((c) => ({ ...c, domain: url.hostname, path: "/" })),
    );
  await page.goto(`/r/${slug}${query}`);
  await page.waitForSelector('body[data-hydrated="true"]');
}

const trigger = (page: Page) =>
  page.getByRole("button", { name: /Switch workspace\. Current:/ });

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

for (const vp of [
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 1366, h: 768 },
]) {
  test(`switcher at ${vp.w}px: fits header, menu usable, keyboard + history`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await open(page, multiCookies, `?location=${ids.nasa}`);

    // Current org + location visible; selected location announced via label.
    await expect(trigger(page)).toBeVisible({ timeout: 60_000 });
    await expect(trigger(page)).toHaveAttribute(
      "aria-label",
      `Switch workspace. Current: Monks UI ${runId}, NASA`,
    );
    // Header stays intact: no horizontal overflow, trigger inside viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const tb = (await trigger(page).boundingBox())!;
    expect(tb.x).toBeGreaterThanOrEqual(0);
    expect(tb.x + tb.width).toBeLessThanOrEqual(vp.w);
    expect(tb.height).toBeGreaterThanOrEqual(44);
    await shot(page, `${info.project.name}-${vp.w}-closed`);

    // Open: only the 2 eligible locations, not clipped, touch targets >= 44.
    await trigger(page).click();
    const menu = page.getByTestId("context-switcher-menu");
    await expect(menu).toBeVisible();
    const items = menu.getByRole("menuitemradio");
    await expect(items).toHaveCount(2);
    await expect(items.filter({ hasText: "NASA" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const mb = (await menu.boundingBox())!;
    expect(mb.x).toBeGreaterThanOrEqual(-1);
    expect(mb.x + mb.width).toBeLessThanOrEqual(vp.w + 1);
    expect(mb.y).toBeGreaterThanOrEqual(0);
    expect(mb.y + mb.height).toBeLessThanOrEqual(vp.h + 1);
    for (const box of await items.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().height),
    )) {
      expect(box).toBeGreaterThanOrEqual(44);
    }
    await shot(page, `${info.project.name}-${vp.w}-open`);

    // Escape closes and returns focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger(page)).toBeFocused();

    // Keyboard open + arrow navigation, then select Webster.
    await trigger(page).focus();
    await page.keyboard.press("ArrowDown");
    await expect(menu).toBeVisible();
    await expect(items.filter({ hasText: "NASA" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(items.filter({ hasText: "Webster" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`location=${ids.webster}`));
    await expect(trigger(page)).toHaveAttribute(
      "aria-label",
      `Switch workspace. Current: Monks UI ${runId}, Webster`,
      { timeout: 30_000 },
    );
    await shot(page, `${info.project.name}-${vp.w}-switched`);

    // Reload keeps the temporary selection.
    await page.reload();
    await page.waitForSelector('body[data-hydrated="true"]');
    await expect(trigger(page)).toHaveAttribute("aria-label", /Webster/);

    // Back returns to the previous temporary selection (NASA).
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`location=${ids.nasa}`));
    await expect(trigger(page)).toHaveAttribute("aria-label", /NASA/, {
      timeout: 30_000,
    });
    await page.goForward();
    await expect(trigger(page)).toHaveAttribute("aria-label", /Webster/, {
      timeout: 30_000,
    });
  });
}

test("single-location user sees a plain indicator and a foreign ?location= is denied", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, singleCookies, `?location=${ids.nasa}`);
  // The indicator is rendered in more than one header slot (responsive).
  await expect(
    page.getByTestId("context-indicator").locator("visible=true").first(),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("context-switcher")).toHaveCount(0);

  // Webster is not assigned to this user: recovery screen, no workspace.
  const denied = await page.goto(`/r/${slug}?location=${ids.webster}`);
  expect(denied?.status()).toBeLessThan(500);
  await expect(page.getByTestId("context-unavailable")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("context-indicator")).toHaveCount(0);
});

test("Server Action POSTs carry the selected ?location= in Referer (follow-up writes stay on the selected location)", async ({
  page,
}) => {
  const posts: { url: string; referer: string | undefined }[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) {
      posts.push({ url: request.url(), referer: request.headers()["referer"] });
    }
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page, multiCookies, `?location=${ids.nasa}`);
  await expect(trigger(page)).toBeVisible({ timeout: 60_000 });
  // Trigger a client-initiated read (Schedule → next week navigator).
  await page
    .locator('[data-nav-tier="secondary"], [data-nav-tier="primary"]')
    .filter({ hasText: "Schedule" })
    .first()
    .click();
  await page
    .getByRole("button", { name: /next week/i })
    .first()
    .click({ timeout: 30_000 })
    .catch(() => {});
  await page.waitForTimeout(3000);
  console.log(
    "server-action POSTs:",
    JSON.stringify(posts.map((p) => p.referer)),
  );
  expect(posts.length).toBeGreaterThan(0);
  for (const post of posts) {
    expect(post.referer).toContain(`location=${ids.nasa}`);
  }
});
