/**
 * V2-003.003 real-mode browser check of `/` single-context auto resolution
 * (hosted DEV, real session cookies, synthetic org/users removed afterwards).
 * The Next dev server must run with NEXT_PUBLIC_RESTAURANT_SLUG=<DEFAULT_SLUG>
 * so that `/` treats the synthetic organization as the default tenant.
 */
import crypto from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { expect, test, type Page } from "@playwright/test";

import { adminClient, env } from "../support/harness";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const DEFAULT_SLUG = process.env.AUTO_DEFAULT_SLUG ?? "v2auto-default";

async function assertServerIsDev() {
  const html = await (await fetch(BASE)).text();
  const scripts = [...html.matchAll(/src="(\/_next\/[^"]+\.js[^"]*)"/g)].map(
    (m) => m[1],
  );
  let corpus = html;
  for (const src of scripts.slice(0, 40))
    corpus += await (await fetch(new URL(src, BASE))).text();
  if (corpus.includes("ftadewtkjlaotfdvtjcv"))
    throw new Error("The app under test references PROD. Refusing to run.");
  if (!corpus.includes("opmujepkemwcdxxorhfd"))
    throw new Error("The app under test is not pinned to the-lineup-dev.");
}

test.describe.configure({ mode: "serial" });

const admin = adminClient();
const runId = crypto.randomBytes(4).toString("hex");
const slugE = `v2auto-e-${runId}`;
const ids: {
  orgs: string[];
  users: string[];
  d1?: string;
  d2?: string;
  e1?: string;
} = { orgs: [], users: [] };
type Cookies = { name: string; value: string }[];
const jar: Record<
  string,
  { email: string; password: string; cookies: Cookies }
> = {};

async function sessionCookies(
  email: string,
  password: string,
): Promise<Cookies> {
  const store = new Map<string, string>();
  const client = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => [...store].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach((c) => store.set(c.name, c.value)),
    },
  });
  const r = await client.auth.signInWithPassword({ email, password });
  if (r.error) throw new Error(`signin: ${r.error.message}`);
  return [...store].map(([name, value]) => ({ name, value }));
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
  jar[key] = { email, password, cookies: [] };
  return id;
}

test.beforeAll(async () => {
  await assertServerIsDev();
  const exists = await admin
    .from("organizations")
    .select("id")
    .eq("slug", DEFAULT_SLUG);
  if ((exists.data ?? []).length)
    throw new Error("Synthetic default slug already exists on DEV.");
  const [jerry, tom, nina] = await Promise.all(
    ["jerry", "tom", "nina"].map(mkUser),
  );
  const org = async (name: string, slug: string, by: string) => {
    const r = await admin
      .from("organizations")
      .insert({ name, slug, created_by: by })
      .select("id")
      .single();
    ids.orgs.push(r.data!.id as string);
    return r.data!.id as string;
  };
  const orgD = await org(`Auto Default ${runId}`, DEFAULT_SLUG, jerry);
  const orgE = await org(`Auto Other ${runId}`, slugE, nina);
  const loc = async (o: string, name: string) =>
    (
      await admin
        .from("locations")
        .insert({ organization_id: o, name, time_zone: "America/Chicago" })
        .select("id")
        .single()
    ).data!.id as string;
  ids.d1 = await loc(orgD, "Webster");
  ids.d2 = await loc(orgD, "NASA");
  ids.e1 = await loc(orgE, "Solo Spot");
  const m = (o: string, p: string) => ({
    organization_id: o,
    profile_id: p,
    roles: ["server"],
    active: true,
  });
  await admin
    .from("memberships")
    .insert([m(orgD, jerry), m(orgD, tom), m(orgE, nina)]);
  const a = (p: string, l: string) => ({
    profile_id: p,
    location_id: l,
    role: "staff",
    active: true,
  });
  await admin
    .from("location_memberships")
    .insert([
      a(jerry, ids.d1),
      a(tom, ids.d1),
      a(tom, ids.d2),
      a(nina, ids.e1),
    ]);
  for (const k of Object.keys(jar))
    jar[k].cookies = await sessionCookies(jar[k].email, jar[k].password);
});

test.afterAll(async () => {
  if (ids.users.length)
    await admin
      .from("location_memberships")
      .delete()
      .in("profile_id", ids.users);
  if (ids.orgs.length) {
    await admin.from("memberships").delete().in("organization_id", ids.orgs);
    await admin.from("locations").delete().in("organization_id", ids.orgs);
    await admin.from("organizations").delete().in("id", ids.orgs);
  }
  await admin.from("profiles").delete().in("id", ids.users);
  for (const id of ids.users) await admin.auth.admin.deleteUser(id);
});

async function signInAs(page: Page, key: string) {
  const url = new URL(BASE);
  await page.context().clearCookies();
  await page
    .context()
    .addCookies(
      jar[key].cookies.map((c) => ({ ...c, domain: url.hostname, path: "/" })),
    );
}
const hydrated = (page: Page) =>
  page.waitForSelector('body[data-hydrated="true"]', { timeout: 90_000 });
/** Screens without the operations app (picker, login, denial) never set the marker. */
const settled = async (page: Page) => {
  await page.waitForLoadState("load");
  await page.waitForTimeout(2500);
};
const nav = (page: Page) => {
  const seen: string[] = [];
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame())
      seen.push(new URL(f.url()).pathname + new URL(f.url()).search);
  });
  return seen;
};
const trigger = (page: Page) =>
  page.getByRole("button", { name: /Switch workspace\. Current:/ });

test("LIVE-AUTO-01 default tenant, one location: `/` opens the workspace in place, no picker", async ({
  page,
}) => {
  await signInAs(page, "jerry");
  const seen = nav(page);
  await page.goto("/");
  await hydrated(page);
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByText("Choose a location")).toHaveCount(0);
  // Single-location users get a plain indicator (no dropdown trigger) with org + location.
  await expect(page.getByText(`Auto Default ${runId}`).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Webster").first()).toBeVisible();
  await expect(page.getByText("NASA")).toHaveCount(0);
  expect(seen.filter((s) => s.startsWith("/r/"))).toHaveLength(0);
  await page.reload();
  await hydrated(page);
  expect(new URL(page.url()).pathname).toBe("/");
});

test("LIVE-AUTO-02 non-default org: `/` redirects once to the verified route; refresh/back/forward stable", async ({
  page,
}) => {
  await signInAs(page, "nina");
  const seen = nav(page);
  await page.goto("/");
  await page.waitForURL(`**/r/${slugE}?location=${ids.e1}`, {
    timeout: 90_000,
  });
  await hydrated(page);
  await expect(page.getByText(`Auto Other ${runId}`).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Solo Spot").first()).toBeVisible();
  const toRoute = seen.filter((s) => s.startsWith(`/r/${slugE}`));
  expect(new Set(toRoute).size).toBe(1); // one canonical destination, no loop
  await page.waitForTimeout(3000);
  expect(new URL(page.url()).pathname).toBe(`/r/${slugE}`);
  await page.reload();
  await hydrated(page);
  expect(page.url()).toContain(`/r/${slugE}?location=${ids.e1}`);
  // Direct org URL (no ?location=) also resolves with no picker/redirect away.
  await page.goto(`/r/${slugE}`);
  await hydrated(page);
  await expect(page.getByText("Solo Spot").first()).toBeVisible({
    timeout: 60_000,
  });
  // History: back/forward never loops back through "/" unexpectedly or leaks.
  await page.goBack();
  await hydrated(page);
  await page.goForward();
  await hydrated(page);
  expect(page.url()).toContain(`/r/${slugE}`);
  await expect(page.getByText("Solo Spot").first()).toBeVisible({
    timeout: 60_000,
  });
});

test("LIVE-AUTO-03 two locations: selection required, explicit choice works", async ({
  page,
}) => {
  await signInAs(page, "tom");
  await page.goto("/");
  await settled(page);
  expect(new URL(page.url()).pathname).toBe("/"); // no redirect
  await expect(page.getByText(/choose|select/i).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.goto(`/r/${DEFAULT_SLUG}?location=${ids.d2}`);
  await hydrated(page);
  await expect(trigger(page)).toHaveAttribute(
    "aria-label",
    `Switch workspace. Current: Auto Default ${runId}, NASA`,
    { timeout: 60_000 },
  );
});

test("LIVE-AUTO-08 sign-out / sign-in as another user leaves no prior data", async ({
  page,
}) => {
  await signInAs(page, "nina");
  await page.goto("/");
  await page.waitForURL(`**/r/${slugE}**`, { timeout: 90_000 });
  await hydrated(page);
  await expect(page.getByText("Solo Spot").first()).toBeVisible({
    timeout: 60_000,
  });
  // Sign out (drop session cookies), then a different user on the same browser.
  await page.context().clearCookies();
  await page.goto("/");
  await settled(page);
  await expect(page.getByText("Solo Spot")).toHaveCount(0);
  await signInAs(page, "jerry");
  await page.goto("/");
  await hydrated(page);
  await expect(page.getByText("Webster").first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Solo Spot")).toHaveCount(0);
  await expect(page.getByText(`Auto Other ${runId}`)).toHaveCount(0);
  // Jerry may not open Nina's organization.
  await page.goto(`/r/${slugE}`);
  await settled(page);
  await expect(page.getByText("Solo Spot")).toHaveCount(0);
  // Back never resurrects Nina's data.
  await page.goBack();
  await settled(page);
  await expect(page.getByText("Solo Spot")).toHaveCount(0);
});
