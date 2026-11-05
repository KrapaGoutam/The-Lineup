/**
 * V2-003.004 real-browser verification (hosted DEV, real passcode sign-in,
 * real HttpOnly cookie storage). Run once per browser project, e.g.
 *
 *   npx playwright test --config <real config with desktop + host-tablet> \
 *     --project desktop tests/real/ui/context-persistence.real.spec.ts
 *
 * Synthetic organizations / users / passcodes are created for the run and
 * removed afterwards. The app under test must be pinned to the-lineup-dev
 * (the guard below refuses anything else). Credentials are random per run and
 * never printed.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { adminClient, env } from "../support/harness";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const COOKIE = "lineup_active_context";

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

function pepper(): string {
  const file = path.resolve(process.cwd(), ".env.development.local");
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("APP_PIN_PEPPER="));
  const value = (line ?? "")
    .slice("APP_PIN_PEPPER=".length)
    .replace(/^"|"$/g, "");
  if (value.length < 32) throw new Error("APP_PIN_PEPPER missing");
  return value;
}
const hmac = (input: string) =>
  crypto.createHmac("sha256", pepper()).update(input).digest("hex");
// Same derivations as src/lib/passcode-security.ts (kept inline: that module
// is "server-only").
const locatorOf = (org: string, pin: string) => hmac(`${org}:${pin}`);
const authPasswordOf = (org: string, pin: string) =>
  hmac(`authpw:${org}:${pin}`);

test.describe.configure({ mode: "serial" });

const admin = adminClient();
const runId = crypto.randomBytes(4).toString("hex");
const slugP = `v2cp-${runId}`;
const slugQ = `v2cq-${runId}`;
const nameA = `Aaa${runId}`;
const nameB = `Bbb${runId}`;
const nameQ = `Qqq${runId}`;

const ids = {
  orgP: "",
  orgQ: "",
  locA: "",
  locB: "",
  locQ: "",
  users: [] as string[],
};
const pins: Record<string, string> = {};
const takenPins = new Set<string>();

function freshPin() {
  for (;;) {
    const pin = String(crypto.randomInt(1000, 10000));
    if (!takenPins.has(pin)) {
      takenPins.add(pin);
      return pin;
    }
  }
}

async function ok<T>(
  p: PromiseLike<{ data: T; error: { message: string } | null }>,
  what: string,
): Promise<T> {
  const r = await p;
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

async function mkEmployee(
  key: string,
  assignments: Array<{ org: string; loc: string }>,
  loginOrg: string,
) {
  const pin = freshPin();
  pins[key] = pin;
  const email = `v2cp-${runId}-${key}@harness.invalid`;
  const created = await admin.auth.admin.createUser({
    email,
    password: authPasswordOf(loginOrg, pin),
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(`createUser ${key}: ${created.error?.message}`);
  const id = created.data.user.id;
  ids.users.push(id);
  await ok(
    admin.from("profiles").insert({ id, display_name: `V2CP ${key} ${runId}` }),
    "profile",
  );
  const orgs = [...new Set(assignments.map((a) => a.org))];
  await ok(
    admin.from("memberships").insert(
      orgs.map((org) => ({
        organization_id: org,
        profile_id: id,
        roles: ["general_manager"],
        active: true,
      })),
    ),
    "membership",
  );
  await ok(
    admin.from("location_memberships").insert(
      assignments.map((a) => ({
        profile_id: id,
        location_id: a.loc,
        role: "manager",
        active: true,
      })),
    ),
    "assignment",
  );
  await ok(
    admin.from("passcode_credentials").insert({
      organization_id: loginOrg,
      profile_id: id,
      locator: locatorOf(loginOrg, pin),
      synthetic_email: email,
      active: true,
    }),
    "credential",
  );
  return { id, email };
}

test.beforeAll(async () => {
  await assertServerIsDev();
  const creator = await admin.auth.admin.createUser({
    email: `v2cp-${runId}-creator@harness.invalid`,
    password: crypto.randomBytes(18).toString("base64url"),
    email_confirm: true,
  });
  if (creator.error || !creator.data.user) throw new Error("creator");
  ids.users.push(creator.data.user.id);
  await ok(
    admin.from("profiles").insert({
      id: creator.data.user.id,
      display_name: `V2CP creator ${runId}`,
    }),
    "creator profile",
  );
  const org = (name: string, slug: string) =>
    ok(
      admin
        .from("organizations")
        .insert({ name, slug, created_by: creator.data.user!.id })
        .select("id")
        .single(),
      "org",
    ).then((r) => (r as { id: string }).id);
  ids.orgP = await org(`V2CP P ${runId}`, slugP);
  ids.orgQ = await org(`V2CP Q ${runId}`, slugQ);
  const loc = (orgId: string, name: string, tz: string) =>
    ok(
      admin
        .from("locations")
        .insert({ organization_id: orgId, name, time_zone: tz })
        .select("id")
        .single(),
      "loc",
    ).then((r) => (r as { id: string }).id);
  ids.locA = await loc(ids.orgP, nameA, "America/New_York");
  ids.locB = await loc(ids.orgP, nameB, "America/Los_Angeles");
  ids.locQ = await loc(ids.orgQ, nameQ, "America/Denver");

  const both = [
    { org: ids.orgP, loc: ids.locA },
    { org: ids.orgP, loc: ids.locB },
  ];
  await mkEmployee("emp1", both, ids.orgP);
  await mkEmployee("emp2", both, ids.orgP);
  await mkEmployee("solo", [{ org: ids.orgP, loc: ids.locB }], ids.orgP);
  await mkEmployee(
    "xorg",
    [...both, { org: ids.orgQ, loc: ids.locQ }],
    ids.orgP,
  );
});

test.afterAll(async () => {
  const orgs = [ids.orgP, ids.orgQ].filter(Boolean);
  if (orgs.length) {
    await admin.from("tasks").delete().in("organization_id", orgs);
    await admin
      .from("passcode_login_attempts")
      .delete()
      .in("organization_id", orgs);
    await admin
      .from("passcode_credentials")
      .delete()
      .in("organization_id", orgs);
  }
  if (ids.users.length) {
    await admin
      .from("location_memberships")
      .delete()
      .in("profile_id", ids.users);
    await admin.from("overall_roles").delete().in("profile_id", ids.users);
  }
  if (orgs.length) {
    await admin.from("memberships").delete().in("organization_id", orgs);
    await admin.from("locations").delete().in("organization_id", orgs);
    await admin.from("organizations").delete().in("id", orgs);
  }
  await admin.from("profiles").delete().in("id", ids.users);
  for (const id of ids.users) await admin.auth.admin.deleteUser(id);
});

// - helpers -

const host = new URL(BASE).hostname;
const trigger = (page: Page) =>
  page.getByRole("button", { name: /Switch workspace\. Current:/ });
const unavailable = (page: Page) => page.getByTestId("context-unavailable");

async function ctxCookie(context: BrowserContext) {
  return (await context.cookies()).find((c) => c.name === COOKIE);
}
function parsed(value: string) {
  return JSON.parse(decodeURIComponent(value)) as {
    v: number;
    o: string;
    l: string;
  };
}

/** Real passcode sign-in through the login screen. */
async function uiLogin(page: Page, who: string, slug = slugP) {
  await page.goto(`/r/${slug}`);
  await page.waitForSelector('body[data-hydrated="true"]', { timeout: 60_000 });
  const responded = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/auth/passcode") && r.request().method() === "POST",
  );
  await page.locator("#passcode").fill(pins[who]);
  const response = await responded;
  expect(response.status()).toBe(200);
  return response;
}

async function pickLocation(page: Page, locationId: string) {
  await unavailable(page).waitFor({ timeout: 60_000 });
  await page.locator(`[data-location-id="${locationId}"]`).click();
  await expect(trigger(page)).toBeVisible({ timeout: 60_000 });
}

async function tasksFor(title: string) {
  const r = await admin
    .from("tasks")
    .select("id, location_id, organization_id")
    .eq("title", title);
  return r.data ?? [];
}

async function seedCookie(context: BrowserContext, org: string, loc: string) {
  await context.addCookies([
    {
      name: COOKIE,
      value: encodeURIComponent(JSON.stringify({ v: 1, o: org, l: loc })),
      domain: host,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);
}

// - tests -

test("PASSCODE-1 a real passcode sign-in removes a previously saved workspace and a multi-location user must choose", async ({
  page,
  context,
}) => {
  await seedCookie(context, ids.orgP, ids.locA);
  expect(await ctxCookie(context)).toBeDefined();
  const response = await uiLogin(page, "emp1");
  const setCookie = (await response.allHeaders())["set-cookie"] ?? "";
  expect(setCookie).toMatch(new RegExp(`${COOKIE}=;`));
  expect(setCookie).toMatch(/Max-Age=0/i);
  // Multi-location: the picker is shown, not the previously saved workspace.
  await expect(unavailable(page)).toBeVisible({ timeout: 60_000 });
  await expect(unavailable(page)).toHaveAttribute(
    "data-context-status",
    "selection_required",
  );
  await expect(trigger(page)).toHaveCount(0);
  expect(await ctxCookie(context)).toBeUndefined();
});

test("PASSCODE-2 a failed passcode attempt does not touch the saved workspace", async ({
  page,
  context,
}) => {
  await seedCookie(context, ids.orgP, ids.locA);
  await page.goto(`/r/${slugP}`);
  const wrong = [...Array(10_000).keys()]
    .map((n) => String(n).padStart(4, "0"))
    .find((n) => !takenPins.has(n))!;
  const res = await page.request.post("/api/auth/passcode", {
    data: { restaurantSlug: slugP, passcode: wrong },
  });
  expect(res.status()).toBe(401);
  expect(res.headers()["set-cookie"] ?? "").not.toContain(COOKIE);
  expect(parsed((await ctxCookie(context))!.value)).toMatchObject({
    l: ids.locA,
  });
});

test("PASSCODE-3 a single-location user enters automatically after a real sign-in", async ({
  page,
  context,
}) => {
  await uiLogin(page, "solo");
  await expect(
    trigger(page).or(page.getByTestId("context-indicator").first()),
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(unavailable(page)).toHaveCount(0);
  expect(await ctxCookie(context)).toBeUndefined();
});

test("PERSIST-1 selection is stored by the real browser (HttpOnly, Lax, 7 days), survives reload / new tab / ?tab= / restart", async ({
  page,
  context,
  browser,
  browserName,
}, info) => {
  const actionSetCookies: string[] = [];
  page.on("response", async (r) => {
    if (r.request().headers()["next-action"]) {
      const sc = (await r.allHeaders())["set-cookie"];
      if (sc?.includes(COOKIE)) actionSetCookies.push(sc);
    }
  });
  await uiLogin(page, "emp1");
  await pickLocation(page, ids.locB);

  // Wire-level attributes of the Server Action response.
  expect(actionSetCookies.length).toBeGreaterThan(0);
  const raw = actionSetCookies[0];
  console.log(
    `[${info.project.name}] Set-Cookie: ${raw.replace(/=[^;]*/, "=<value>")}`,
  );
  expect(raw).toMatch(/Max-Age=604800/i);
  expect(raw).toMatch(/Path=\//i);
  expect(raw).toMatch(/HttpOnly/i);
  expect(raw).toMatch(/SameSite=lax/i);
  expect(raw).not.toMatch(/Domain=/i);
  if (!BASE.startsWith("https://")) expect(raw).not.toMatch(/;\s*Secure/i);

  // What the real browser actually stored.
  const stored = (await ctxCookie(context))!;
  expect(stored).toBeDefined();
  expect(stored.httpOnly).toBe(true);
  // Playwright's WebKit build reports sameSite "None" for every cookie (even
  // Strict) through its cookie API, so SameSite=Lax is asserted from the wire
  // header above there and from the stored cookie in Chromium.
  if (browserName !== "webkit") expect(stored.sameSite).toBe("Lax");
  expect(stored.path).toBe("/");
  const lifetime = stored.expires - Date.now() / 1000;
  expect(lifetime).toBeGreaterThan(6.9 * 86400);
  expect(lifetime).toBeLessThanOrEqual(7 * 86400 + 60);
  expect(parsed(stored.value)).toEqual({ v: 1, o: ids.orgP, l: ids.locB });
  expect(await page.evaluate(() => document.cookie)).not.toContain(COOKIE);

  const label = new RegExp(nameB);
  await expect(trigger(page)).toHaveAttribute("aria-label", label);

  // Reload.
  await page.reload();
  await page.waitForSelector('body[data-hydrated="true"]');
  await expect(trigger(page)).toHaveAttribute("aria-label", label, {
    timeout: 60_000,
  });

  // New tab, bare org route, and an existing ?tab= is kept.
  const second = await context.newPage();
  await second.goto(`/r/${slugP}?tab=tasks`);
  await second.waitForSelector('body[data-hydrated="true"]');
  await expect(trigger(second)).toHaveAttribute("aria-label", label, {
    timeout: 60_000,
  });
  await expect(second.getByRole("heading", { name: "Tasks" })).toBeVisible({
    timeout: 30_000,
  });
  await second.close();

  // Navigate to another module: location unchanged.
  await page
    .getByRole("button", { name: "Tasks", exact: true })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await expect(trigger(page)).toHaveAttribute("aria-label", label);

  // Browser restart: persistent cookies survive, session cookies do not.
  const all = await context.cookies();
  const persistent = all.filter((c) => c.expires > 0);
  expect(persistent.some((c) => c.name === COOKIE)).toBe(true);
  const restarted = await browser.newContext(
    info.project.use as Parameters<typeof browser.newContext>[0],
  );
  await restarted.addCookies(persistent);
  const reopened = await restarted.newPage();
  await reopened.goto(`/r/${slugP}`);
  await reopened.waitForSelector('body[data-hydrated="true"]');
  await expect(trigger(reopened)).toHaveAttribute("aria-label", label, {
    timeout: 60_000,
  });
  await restarted.close();
});

test("PERSIST-2 a Server Action with NO Referer writes only to the persisted location; a contradicting Referer is refused", async ({
  page,
  context,
}) => {
  await uiLogin(page, "emp1");
  await pickLocation(page, ids.locB);

  // Create a task through the real UI and capture the real Server Action.
  const captured: {
    url: string;
    headers: Record<string, string>;
    body: string;
  }[] = [];
  page.on("request", (request) => {
    const headers = request.headers();
    if (
      request.method() === "POST" &&
      headers["next-action"] &&
      request.postData()?.includes("PERSIST2-ui")
    ) {
      captured.push({ url: request.url(), headers, body: request.postData()! });
    }
  });
  await page
    .getByRole("button", { name: "Tasks", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /New task/ }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  const uiTitle = `PERSIST2-ui-${runId}`;
  await dialog.getByLabel("Title").fill(uiTitle);
  await dialog.getByLabel("Assign to").selectOption("anyone");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  expect(captured.length).toBeGreaterThan(0);
  const uiRows = await tasksFor(uiTitle);
  expect(uiRows).toHaveLength(1);
  expect(uiRows[0]).toMatchObject({
    location_id: ids.locB,
    organization_id: ids.orgP,
  });

  // Replay the identical action with the Referer REMOVED (browser-privacy case).
  const base = captured[0];
  const replay = async (title: string, referer: string | null) => {
    const headers = { ...base.headers };
    delete headers["referer"];
    delete headers["content-length"];
    if (referer) headers["referer"] = referer;
    return context.request.post(base.url, {
      headers,
      data: base.body.replace(uiTitle, title),
    });
  };
  const noRefTitle = `PERSIST2-noref-${runId}`;
  const res = await replay(noRefTitle, null);
  expect(res.status()).toBeLessThan(400);
  const rows = await tasksFor(noRefTitle);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    location_id: ids.locB,
    organization_id: ids.orgP,
  });

  // A Referer naming the OTHER location must fail closed, with no row anywhere.
  const mismatchTitle = `PERSIST2-mismatch-${runId}`;
  await replay(mismatchTitle, `${BASE}/r/${slugP}?location=${ids.locA}`);
  expect(await tasksFor(mismatchTitle)).toHaveLength(0);

  // Nothing at all was written at A.
  const atA = await admin
    .from("tasks")
    .select("id")
    .eq("location_id", ids.locA)
    .like("title", `PERSIST2-%${runId}`);
  expect(atA.data ?? []).toHaveLength(0);
});

test("DEEPLINK deep link to B while the cookie says A: workspace stays closed until the server confirms; failures never change the cookie", async ({
  page,
  context,
}) => {
  await uiLogin(page, "emp1");
  await pickLocation(page, ids.locA);
  expect(parsed((await ctxCookie(context))!.value).l).toBe(ids.locA);

  // Hold the confirming Server Action so the interim state is observable.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/r/**", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      await held;
    }
    await route.continue();
  });
  await page.goto(`/r/${slugP}?location=${ids.locB}`);
  await expect(page.getByTestId("context-reconciling")).toBeVisible({
    timeout: 60_000,
  });
  await expect(trigger(page)).toHaveCount(0); // nothing actionable yet
  expect(parsed((await ctxCookie(context))!.value).l).toBe(ids.locA); // not yet
  release();
  await expect(trigger(page)).toHaveAttribute("aria-label", new RegExp(nameB), {
    timeout: 60_000,
  });
  expect(parsed((await ctxCookie(context))!.value).l).toBe(ids.locB);
  await page.unroute("**/r/**");

  // Failure: abort the confirming action - recovery UI, cookie untouched.
  await page.route("**/r/**", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(`/r/${slugP}?location=${ids.locA}`);
  await expect(page.getByTestId("context-reconcile-failed")).toBeVisible({
    timeout: 60_000,
  });
  await expect(trigger(page)).toHaveCount(0);
  expect(parsed((await ctxCookie(context))!.value).l).toBe(ids.locB); // unchanged
  // Retry with the network restored recovers.
  await page.unroute("**/r/**");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(trigger(page)).toHaveAttribute("aria-label", new RegExp(nameA), {
    timeout: 60_000,
  });
  expect(parsed((await ctxCookie(context))!.value).l).toBe(ids.locA);
  // The address now names the verified location; no redirect loop.
  expect(page.url()).toContain(`location=${ids.locA}`);

  // "Choose a location" recovery.
  await page.route("**/r/**", async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      request.headers()["next-action"]?.length &&
      request.postData()?.includes(ids.locB)
    ) {
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(`/r/${slugP}?location=${ids.locB}`);
  await expect(page.getByTestId("context-reconcile-failed")).toBeVisible({
    timeout: 60_000,
  });
  await page.unroute("**/r/**");
  await page.getByRole("button", { name: "Choose a location" }).click();
  await expect(unavailable(page)).toHaveAttribute(
    "data-context-status",
    "selection_required",
    {
      timeout: 60_000,
    },
  );
  expect(await ctxCookie(context)).toBeUndefined();
});

test("DEEPLINK-2 an unauthorized ?location= is refused and persists nothing", async ({
  page,
  context,
}) => {
  await uiLogin(page, "solo"); // only assigned to B
  // Let the post-sign-in navigation finish before navigating away.
  await expect(
    trigger(page).or(page.getByTestId("context-indicator").first()),
  ).toBeVisible({ timeout: 60_000 });
  await page.goto(`/r/${slugP}?location=${ids.locA}`);
  await expect(unavailable(page)).toBeVisible({ timeout: 60_000 });
  await expect(trigger(page)).toHaveCount(0);
  expect(await ctxCookie(context)).toBeUndefined();
});

test("XORG a verified cross-organization switch changes the cookie to that organization only", async ({
  page,
  context,
}) => {
  await uiLogin(page, "xorg");
  await pickLocation(page, ids.locA);
  expect(parsed((await ctxCookie(context))!.value)).toEqual({
    v: 1,
    o: ids.orgP,
    l: ids.locA,
  });
  await trigger(page).click();
  await page
    .getByTestId("context-switcher-menu")
    .getByRole("menuitemradio", { name: new RegExp(nameQ) })
    .click();
  await expect(page).toHaveURL(new RegExp(`/r/${slugQ}`), { timeout: 60_000 });
  await expect(trigger(page)).toHaveAttribute("aria-label", new RegExp(nameQ), {
    timeout: 60_000,
  });
  expect(parsed((await ctxCookie(context))!.value)).toEqual({
    v: 1,
    o: ids.orgQ,
    l: ids.locQ,
  });
  await page.reload();
  await page.waitForSelector('body[data-hydrated="true"]');
  await expect(trigger(page)).toHaveAttribute("aria-label", new RegExp(nameQ), {
    timeout: 60_000,
  });
  // P's data never leaks into Q.
  await expect(page.getByText(nameA)).toHaveCount(0);
  await expect(page.getByText(nameB)).toHaveCount(0);
});

test("SIGNOUT shared device: sign-out expires the preference and the next employee does not inherit it", async ({
  page,
  context,
}) => {
  await uiLogin(page, "emp1");
  await pickLocation(page, ids.locB);
  expect(await ctxCookie(context)).toBeDefined();

  // Real sign-out through the UI - /api/auth/signout.
  const signedOut = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/auth/signout") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: /account|menu|profile/i })
    .first()
    .click()
    .catch(() => {});
  await page.getByText("Sign out", { exact: true }).first().click();
  const so = await signedOut;
  expect(so.status()).toBe(200);
  expect((await so.allHeaders())["set-cookie"] ?? "").toMatch(/Max-Age=0/i);
  await expect(page.locator("#passcode")).toBeVisible({ timeout: 30_000 });
  expect(await ctxCookie(context)).toBeUndefined();

  // Employee 2 signs in on the same browser: does not inherit B.
  await page.goto(`/r/${slugP}`);
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.locator("#passcode").fill(pins.emp2);
  await expect(unavailable(page)).toHaveAttribute(
    "data-context-status",
    "selection_required",
    {
      timeout: 60_000,
    },
  );
  expect(await ctxCookie(context)).toBeUndefined();
});

// - races, stale tabs, history -

const isActionPost = (r: {
  method(): string;
  headers(): Record<string, string>;
}) => r.method() === "POST" && !!r.headers()["next-action"];

const where = (locationId: string) =>
  locationId === ids.locA ? "A" : locationId === ids.locB ? "B" : "?";

/** Creates a task through the real UI and waits for the Server Action answer. */
async function createTaskUI(page: Page, title: string) {
  const heading = page.getByRole("heading", { name: "Tasks" });
  if (!(await heading.isVisible().catch(() => false))) {
    await page
      .getByRole("button", { name: "Tasks", exact: true })
      .first()
      .click();
  }
  await page.getByRole("button", { name: /New task/ }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Assign to").selectOption("anyone");
  const answered = page.waitForResponse(
    (r) =>
      isActionPost(r.request()) &&
      (r.request().postData() ?? "").includes(title),
    { timeout: 60_000 },
  );
  await dialog.getByRole("button", { name: "Create task" }).click();
  const response = await answered;
  await page.waitForTimeout(1500);
  const alerts = await page.getByRole("alert").allInnerTexts();
  return { dialog, request: response.request(), alerts };
}

async function switchViaMenu(page: Page, name: string) {
  await trigger(page).click();
  await page
    .getByTestId("context-switcher-menu")
    .getByRole("menuitemradio", { name: new RegExp(name) })
    .click();
  await expect(trigger(page)).toHaveAttribute("aria-label", new RegExp(name), {
    timeout: 60_000,
  });
}

test("RACE-A two quick selections never leave the page and the cookie describing different locations", async ({
  page,
  context,
}) => {
  await uiLogin(page, "emp2");
  await unavailable(page).waitFor({ timeout: 60_000 });
  const a = page.locator(`[data-location-id="${ids.locA}"]`);
  const b = page.locator(`[data-location-id="${ids.locB}"]`);
  // The second submission arrives while the first is still in flight: the
  // buttons are disabled and the hook ignores re-entrant selections.
  await a.click();
  await b.click({ force: true, timeout: 2_000 }).catch(() => {});
  await expect(trigger(page)).toBeVisible({ timeout: 60_000 });
  const urlLoc = new URL(page.url()).searchParams.get("location");
  const label = await trigger(page).getAttribute("aria-label");
  const cookie = parsed((await ctxCookie(context))!.value);
  console.log(
    `RACE-A: url=${where(urlLoc ?? "")} cookie=${where(cookie.l)} label=${label}`,
  );
  expect(cookie.l).toBe(urlLoc);
  expect(label).toContain(urlLoc === ids.locA ? nameA : nameB);
});

test("RACE-C stale tab: a tab still showing A is blocked (V2-003.005) after another tab switched to B, so it cannot write", async ({
  page,
  context,
}) => {
  await uiLogin(page, "emp1");
  await pickLocation(page, ids.locA);
  const tab2 = await context.newPage();
  await tab2.goto(`/r/${slugP}`);
  await tab2.waitForSelector('body[data-hydrated="true"]');
  await switchViaMenu(tab2, nameB);
  expect(parsed((await ctxCookie(context))!.value).l).toBe(ids.locB);
  await page.bringToFront();
  // Before V2-003.005 this tab kept showing A and relied on the Referer check.
  // Now it learns (channel / focus / a refused read) and its workspace closes;
  // the refused-write proof (0 rows at A and B) lives in
  // multi-tab-context.real.spec.ts MT-11/12.
  await expect(page.getByTestId("context-stale")).toBeVisible({
    timeout: 30_000,
  });
  await expect(trigger(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /New task/ })).toHaveCount(0);
  await tab2.close();
});

test("RACE-D an action held in flight while the workspace is switched is never applied to the wrong location", async ({
  page,
  context,
}) => {
  await uiLogin(page, "emp1");
  await pickLocation(page, ids.locA);
  const title = `RACED-${runId}`;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let heldReached!: () => void;
  const reached = new Promise<void>((resolve) => (heldReached = resolve));
  await page.route("**/r/**", async (route) => {
    if (
      isActionPost(route.request()) &&
      (route.request().postData() ?? "").includes(title)
    ) {
      heldReached();
      await held;
    }
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Tasks", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /New task/ }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Assign to").selectOption("anyone");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await reached; // the create-for-A request is now in flight

  const tab2 = await context.newPage();
  await tab2.goto(`/r/${slugP}`);
  await tab2.waitForSelector('body[data-hydrated="true"]');
  await switchViaMenu(tab2, nameB); // cookie is now B
  release();
  await page.waitForTimeout(4000);
  const rows = await tasksFor(title);
  console.log(
    `RACE-D rows=${JSON.stringify(rows.map((r) => where(r.location_id)))}`,
  );
  // Applied to A (what the user was looking at) or refused - never to B.
  expect(rows.filter((r) => r.location_id === ids.locB)).toHaveLength(0);
  await tab2.close();
});

test("RACE-E one employee on two devices keeps independent preferences and each write lands on its own location", async ({
  page,
  context,
  browser,
}, info) => {
  await uiLogin(page, "emp2");
  await pickLocation(page, ids.locA);
  const other = await browser.newContext(
    info.project.use as Parameters<typeof browser.newContext>[0],
  );
  const page2 = await other.newPage();
  await uiLogin(page2, "emp2");
  await pickLocation(page2, ids.locB);
  expect(parsed((await ctxCookie(context))!.value).l).toBe(ids.locA);
  expect(parsed((await ctxCookie(other))!.value).l).toBe(ids.locB);
  const t1 = `RACEE-1-${runId}`;
  const t2 = `RACEE-2-${runId}`;
  await createTaskUI(page, t1);
  await createTaskUI(page2, t2);
  expect((await tasksFor(t1)).map((r) => r.location_id)).toEqual([ids.locA]);
  expect((await tasksFor(t2)).map((r) => r.location_id)).toEqual([ids.locB]);
  await other.close();
});

test("RESIDUAL-CLOSED a stale tab's action replayed with the Referer stripped (privacy) is REFUSED -- it no longer lands at the persisted location (V2-003.005)", async ({
  page,
  context,
}) => {
  await uiLogin(page, "emp1");
  await pickLocation(page, ids.locA);
  const captured: {
    url: string;
    headers: Record<string, string>;
    body: string;
  }[] = [];
  const title = `RESID-${runId}`;
  page.on("request", (request) => {
    if (isActionPost(request) && request.postData()?.includes(title)) {
      captured.push({
        url: request.url(),
        headers: request.headers(),
        body: request.postData()!,
      });
    }
  });
  // A genuine create at A, captured: its arguments carry the workspace A.
  await createTaskUI(page, title);
  expect((await tasksFor(title)).map((r) => r.location_id)).toEqual([ids.locA]);
  const tab2 = await context.newPage();
  await tab2.goto(`/r/${slugP}`);
  await tab2.waitForSelector('body[data-hydrated="true"]');
  await switchViaMenu(tab2, nameB); // the shared cookie is now B
  const replayTitle = `${title}-noref`;
  const headers = { ...captured[0].headers };
  delete headers["referer"];
  delete headers["content-length"];
  await context.request.post(captured[0].url, {
    headers,
    data: captured[0].body.replace(title, replayTitle),
  });
  const rows = await tasksFor(replayTitle);
  console.log(
    `RESIDUAL-CLOSED stripped-Referer replay rows at: ${JSON.stringify(rows.map((r) => where(r.location_id)))}`,
  );
  // V2-003.004 accepted this landing at B. The server now compares the
  // asserted workspace (A) with the verified one (B) and refuses: no row.
  expect(rows).toHaveLength(0);
  await tab2.close();
});

test("HISTORY back/forward after a switch never loops and never writes to a location other than the one on screen", async ({
  page,
  context,
}) => {
  await uiLogin(page, "emp1");
  await pickLocation(page, ids.locA);
  await switchViaMenu(page, nameB);
  await expect(page).toHaveURL(new RegExp(`location=${ids.locB}`), {
    timeout: 30_000,
  });

  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations += 1;
  });
  await page.goBack();
  await page.waitForTimeout(6000);
  const url = page.url();
  // V2-003.005: after Back the old entry is NOT re-persisted, so the workspace
  // may be closed (confirmation / stale panel) and the trigger absent. Probe
  // without waiting (Playwright actions have no default timeout here).
  const label = (await trigger(page).count())
    ? await trigger(page).getAttribute("aria-label")
    : null;
  const stored = await ctxCookie(context);
  const cookie = stored ? parsed(stored.value).l : null;
  console.log(
    `HISTORY after back: url=${url.includes(ids.locA) ? "A" : "B"} label=${label} cookie=${where(cookie ?? "")} navigations=${navigations}`,
  );
  expect(navigations).toBeLessThan(6); // no redirect loop
  const title = `HIST-${runId}`;
  if (
    await trigger(page)
      .isVisible()
      .catch(() => false)
  ) {
    await createTaskUI(page, title);
    const rows = await tasksFor(title);
    console.log(
      `HISTORY write from restored entry -> ${JSON.stringify(rows.map((r) => where(r.location_id)))}`,
    );
    // The displayed location must be the location of any resulting row.
    const shown = label?.includes(nameA) ? ids.locA : ids.locB;
    for (const row of rows) expect(row.location_id).toBe(shown);
  }
  await page.goForward();
  await page.waitForTimeout(4000);
  expect(navigations).toBeLessThan(12);
});

test("CANON ?tab= survives URL canonicalization without extra history entries", async ({
  page,
  context,
}) => {
  await uiLogin(page, "emp1");
  await pickLocation(page, ids.locB);
  await page.goto(`/r/${slugP}?tab=tasks`);
  await page.waitForSelector('body[data-hydrated="true"]');
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(() => new URL(page.url()).searchParams.get("location"), {
      timeout: 30_000,
    })
    .toBe(ids.locB);
  expect(new URL(page.url()).searchParams.get("tab")).toBe("tasks");
  const before = await page.evaluate(() => history.length);
  await page.reload();
  await page.waitForSelector('body[data-hydrated="true"]');
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({
    timeout: 60_000,
  });
  expect(await page.evaluate(() => history.length)).toBe(before);
  expect(parsed((await ctxCookie(context))!.value).l).toBe(ids.locB);
});

// - revocation, failures, delayed sign-out -

/** Ends every Auth session of `who` server-side (what a revoked session is). */
async function revokeSessions(who: string) {
  const email = `v2cp-${runId}-${who}@harness.invalid`;
  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({
    email,
    password: authPasswordOf(ids.orgP, pins[who]),
  });
  if (signedIn.error || !signedIn.data.session)
    throw new Error(`revoke sign-in: ${signedIn.error?.message}`);
  const out = await admin.auth.admin.signOut(
    signedIn.data.session.access_token,
    "global",
  );
  if (out.error) throw new Error(`revoke: ${out.error.message}`);
}

test("REVOKE immediate revocation: the next action and the next load both deny access", async ({
  page,
  context,
}) => {
  await uiLogin(page, "emp2");
  await pickLocation(page, ids.locB);
  // Capture a genuine task action (works while access is valid).
  const first = `REVOKE-ok-${runId}`;
  const captured: {
    url: string;
    headers: Record<string, string>;
    body: string;
  }[] = [];
  page.on("request", (request) => {
    if (isActionPost(request) && request.postData()?.includes(first)) {
      captured.push({
        url: request.url(),
        headers: request.headers(),
        body: request.postData()!,
      });
    }
  });
  await createTaskUI(page, first);
  expect((await tasksFor(first)).map((r) => r.location_id)).toEqual([ids.locB]);
  const emp2 = (
    await admin
      .from("profiles")
      .select("id")
      .eq("display_name", `V2CP emp2 ${runId}`)
      .single()
  ).data!.id as string;
  await admin
    .from("location_memberships")
    .update({ active: false })
    .eq("profile_id", emp2)
    .eq("location_id", ids.locB);
  try {
    const title = `REVOKE-after-${runId}`;
    const headers = { ...captured[0].headers };
    delete headers["content-length"];
    await context.request.post(captured[0].url, {
      headers,
      data: captured[0].body.replace(first, title),
    });
    expect(await tasksFor(title)).toHaveLength(0); // the very next action is denied
    await page.reload();
    await expect(unavailable(page)).toBeVisible({ timeout: 60_000 });
    const status = await unavailable(page).getAttribute("data-context-status");
    console.log(`REVOKE next load status=${status}`);
    expect(["invalid_context", "selection_required"]).toContain(status);
    await expect(trigger(page)).toHaveCount(0);
  } finally {
    await admin
      .from("location_memberships")
      .update({ active: true })
      .eq("profile_id", emp2)
      .eq("location_id", ids.locB);
  }
});

test("SWITCHFAIL a failed location switch says so, keeps the cookie, and a retry works", async ({
  page,
  context,
}) => {
  await uiLogin(page, "emp2");
  await unavailable(page).waitFor({ timeout: 60_000 });
  await page.route("**/r/**", (route) =>
    isActionPost(route.request()) ? route.abort() : route.continue(),
  );
  await page.locator(`[data-location-id="${ids.locA}"]`).click();
  await expect(unavailable(page).getByRole("alert")).toContainText(
    "couldn't switch to that location",
    { timeout: 30_000 },
  );
  expect(await ctxCookie(context)).toBeUndefined(); // nothing falsely persisted
  await expect(trigger(page)).toHaveCount(0); // and no workspace opened
  await page.unroute("**/r/**");
  await page.locator(`[data-location-id="${ids.locA}"]`).click();
  await expect(trigger(page)).toBeVisible({ timeout: 60_000 });
  expect(parsed((await ctxCookie(context))!.value).l).toBe(ids.locA);
});

test("RACE-B a delayed sign-out can never end the NEXT person's session", async ({
  page,
  context,
}) => {
  await uiLogin(page, "emp1");
  await pickLocation(page, ids.locB);
  await revokeSessions("emp1"); // the server no longer honours this session

  const events: string[] = [];
  const t0 = Date.now();
  const stamp = (label: string) => events.push(`${Date.now() - t0}ms ${label}`);
  page.on("request", (r) => {
    if (r.url().endsWith("/api/auth/signout")) stamp("signout request");
    if (r.url().endsWith("/api/auth/passcode")) stamp("passcode request");
  });
  page.on("response", (r) => {
    if (r.url().endsWith("/api/auth/signout"))
      stamp(`signout response ${r.status()}`);
    if (r.url().endsWith("/api/auth/passcode"))
      stamp(`passcode response ${r.status()}`);
  });
  // Hold the forced sign-out for 10 s.
  await page.route("**/api/auth/signout", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    await route.continue();
  });

  // Any authenticated action reveals the dead session; whichever step the
  // forced sign-out interrupts is fine, so the clicks are best-effort.
  page.setDefaultTimeout(8_000); // elements vanish once the app signs out
  const interrupted = (async () => {
    await page
      .getByRole("button", { name: "Tasks", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: /New task/ }).click();
    const dialog = page.getByRole("dialog", { name: "New task" });
    await dialog.getByLabel("Title").fill(`RACEB-${runId}`);
    await dialog.getByLabel("Assign to").selectOption("anyone");
    await dialog.getByRole("button", { name: "Create task" }).click();
  })().catch(() => {});
  await expect(page.locator("#passcode")).toBeVisible({ timeout: 60_000 });
  stamp("login screen visible");
  // The next employee types their passcode immediately, while sign-out is in flight.
  await page.locator("#passcode").fill(pins.emp2);
  await expect(unavailable(page)).toHaveAttribute(
    "data-context-status",
    "selection_required",
    { timeout: 60_000 },
  );
  await interrupted;
  page.setDefaultTimeout(0);
  console.log(`RACE-B order: ${events.join(" | ")}`);
  const signoutDone = events.findIndex((e) => e.includes("signout response"));
  const passcodeStart = events.findIndex((e) => e.includes("passcode request"));
  expect(signoutDone).toBeGreaterThanOrEqual(0);
  expect(passcodeStart).toBeGreaterThan(signoutDone); // strictly ordered

  // The new session is alive and unaffected by the old sign-out.
  await page.unroute("**/api/auth/signout");
  await page.reload();
  await expect(page.locator("#passcode")).toHaveCount(0);
  await expect(unavailable(page)).toHaveAttribute(
    "data-context-status",
    "selection_required",
    { timeout: 60_000 },
  );
  expect(await ctxCookie(context)).toBeUndefined();
});
