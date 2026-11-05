/**
 * V2-003.005 real-browser verification (hosted DEV, real passcode sign-in,
 * real HttpOnly cookie shared by real tabs). Run once per browser project:
 *
 *   npx playwright test --config <real config> --project desktop \
 *     tests/real/ui/multi-tab-context.real.spec.ts
 *
 * "Two tabs" are two pages of ONE BrowserContext (shared cookie jar and shared
 * BroadcastChannel scope); "two devices" are two BrowserContexts. Synthetic
 * organizations / users / passcodes are created for the run and removed
 * afterwards (task family first; verified against a pre-run count baseline).
 * The app under test must be pinned to the-lineup-dev (guard below).
 * Credentials are random per run and never printed.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";

import { adminClient } from "../support/harness";
import {
  cleanupFixtures,
  countDev,
  diffCounts,
  type DevCounts,
} from "../support/dev-counts";

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

// Tests are independent (each signs in itself); the Playwright config runs one
// worker in file order, so CLEANUP is last even when an earlier test fails.
const admin = adminClient();
const runId = crypto.randomBytes(4).toString("hex");
const slugP = `v2mt-${runId}`;
const slugQ = `v2mq-${runId}`;
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
const profileOf: Record<string, string> = {};
const pins: Record<string, string> = {};
const takenPins = new Set<string>();
let baseline: DevCounts;

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
  const email = `v2mt-${runId}-${key}@harness.invalid`;
  const created = await admin.auth.admin.createUser({
    email,
    password: authPasswordOf(loginOrg, pin),
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(`createUser ${key}: ${created.error?.message}`);
  const id = created.data.user.id;
  ids.users.push(id);
  profileOf[key] = id;
  await ok(
    admin.from("profiles").insert({ id, display_name: `V2MT ${key} ${runId}` }),
    "profile",
  );
  const orgs = [...new Set([loginOrg, ...assignments.map((a) => a.org)])];
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
  if (assignments.length) {
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
  }
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
}

test.beforeAll(async () => {
  await assertServerIsDev();
  baseline = await countDev(admin);
  console.info("DEV baseline counts", JSON.stringify(baseline));
  const creator = await admin.auth.admin.createUser({
    email: `v2mt-${runId}-creator@harness.invalid`,
    password: crypto.randomBytes(18).toString("base64url"),
    email_confirm: true,
  });
  if (creator.error || !creator.data.user) throw new Error("creator");
  ids.users.push(creator.data.user.id);
  await ok(
    admin.from("profiles").insert({
      id: creator.data.user.id,
      display_name: `V2MT creator ${runId}`,
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
  ids.orgP = await org(`V2MT P ${runId}`, slugP);
  ids.orgQ = await org(`V2MT Q ${runId}`, slugQ);
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
  await mkEmployee("revoke", both, ids.orgP);
  await mkEmployee("solo", [{ org: ids.orgP, loc: ids.locB }], ids.orgP);
  await mkEmployee(
    "xorg",
    [...both, { org: ids.orgQ, loc: ids.locQ }],
    ids.orgP,
  );
  await mkEmployee("noloc", [], ids.orgP);
});

test.afterAll(async () => {
  // Safety net; the explicit CLEANUP test below asserts the baseline.
  const errors = await cleanupFixtures(admin, {
    orgIds: [ids.orgP, ids.orgQ].filter(Boolean),
    userIds: ids.users,
  });
  if (errors.length) console.error("cleanup", errors.join("; "));
});

// - helpers -

const trigger = (page: Page) =>
  page.getByRole("button", { name: /Switch workspace\. Current:/ });
const unavailable = (page: Page) => page.getByTestId("context-unavailable");
const stale = (page: Page) => page.getByTestId("context-stale");
const confirmGate = (page: Page) =>
  page.getByTestId("context-reconcile-confirm");
const hydrated = (page: Page) =>
  page.waitForSelector('body[data-hydrated="true"]', { timeout: 60_000 });
const labelOf = (name: string) => new RegExp(name);

async function ctxCookie(context: BrowserContext) {
  return (await context.cookies()).find((c) => c.name === COOKIE);
}
async function cookieLoc(context: BrowserContext): Promise<string | null> {
  const cookie = await ctxCookie(context);
  if (!cookie) return null;
  return (JSON.parse(decodeURIComponent(cookie.value)) as { l: string }).l;
}

type Win = { __ctxMsgs: Array<{ type: string; source: string }> };
/** Records every cross-tab message that reaches this page (own included). */
const CAPTURE = () => {
  (window as unknown as Win).__ctxMsgs = [];
  try {
    const channel = new BroadcastChannel("lineup:active-context:v1");
    channel.onmessage = (event) =>
      (window as unknown as Win).__ctxMsgs.push(event.data);
  } catch {
    /* unsupported */
  }
};
/**
 * A tab that CANNOT learn about the change by itself: BroadcastChannel absent
 * AND the browser-generated focus / visibility / online / pageshow events
 * swallowed (a suspended background tab, a privacy extension). Playwright
 * itself raises those events when pages are opened or activated, which would
 * otherwise let the tab discover the change before the test attempts its
 * write. Scripted (untrusted) events still pass, so a test can resume the tab.
 */
const UNAWARE = () => {
  Object.defineProperty(window, "BroadcastChannel", {
    value: undefined,
    configurable: true,
  });
  const swallow = (event: Event) =>
    event.isTrusted && event.stopImmediatePropagation();
  window.addEventListener("focus", swallow, true);
  window.addEventListener("online", swallow, true);
  window.addEventListener("pageshow", swallow, true);
  document.addEventListener("visibilitychange", swallow, true);
};
/**
 * Rejects (network failure) this tab's Tasks READ actions -- snapshot /
 * history. The Tasks controller re-reads on its own (mount, focus, effect
 * churn) and each read carries the on-screen workspace, so the server's refusal
 * would let a stale tab discover the change before a test submits its write.
 * Failing the reads keeps the tab deliberately unaware while writes (which
 * carry a "command") and the guard's own verification still reach the server.
 * (They must be REJECTED, not held: Next.js runs Server Actions through a
 * serial queue, so a pending read would block every later action.) Returns a
 * release function.
 */
async function blockTasksReads(page: Page) {
  const handler = (route: Route) => {
    const request = route.request();
    const body = request.postData() ?? "";
    if (
      isActionPost(request) &&
      body.includes("restaurantSlug") &&
      !body.includes('"command"')
    ) {
      return route.abort();
    }
    return route.continue();
  };
  await page.route("**/r/**", handler);
  return () => page.unroute("**/r/**", handler);
}
const messages = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__ctxMsgs ?? []);

/** Real passcode sign-in through the login screen. */
async function uiLogin(page: Page, who: string, slug = slugP) {
  await page.goto(`/r/${slug}`);
  await hydrated(page);
  const responded = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/auth/passcode") && r.request().method() === "POST",
  );
  await page.locator("#passcode").fill(pins[who]);
  const response = await responded;
  expect(response.status()).toBe(200);
}

async function pickLocation(page: Page, locationId: string) {
  await unavailable(page).waitFor({ timeout: 60_000 });
  await page.locator(`[data-location-id="${locationId}"]`).click();
  await expect(trigger(page)).toBeVisible({ timeout: 60_000 });
}

/** Signs `who` in and lands on `locationId` of org P, on the Tasks module. */
async function openAt(page: Page, who: string, locationId: string) {
  await uiLogin(page, who);
  await pickLocation(page, locationId);
  await page.goto(`/r/${slugP}?tab=tasks`);
  await hydrated(page);
  await expect(trigger(page)).toHaveAttribute(
    "aria-label",
    labelOf(locationId === ids.locA ? nameA : nameB),
    { timeout: 60_000 },
  );
}

/** A second tab of the same browser context at the persisted location. */
async function secondTab(context: BrowserContext, name: string) {
  const page = await context.newPage();
  await page.goto(`/r/${slugP}?tab=tasks`);
  await hydrated(page);
  await expect(trigger(page)).toHaveAttribute("aria-label", labelOf(name), {
    timeout: 60_000,
  });
  return page;
}

async function switchTo(page: Page, locationId: string, name: string) {
  await trigger(page).click();
  await page
    .locator(`[role="menuitemradio"][data-location-id="${locationId}"]`)
    .click();
  await expect(trigger(page)).toHaveAttribute("aria-label", labelOf(name), {
    timeout: 60_000,
  });
}

async function tasksFor(title: string) {
  const r = await admin
    .from("tasks")
    .select("id, location_id, organization_id")
    .eq("title", title);
  return r.data ?? [];
}
async function expectNoRows(title: string) {
  expect(await tasksFor(title), `rows for ${title}`).toHaveLength(0);
}

async function createTaskViaUi(page: Page, title: string) {
  await page.getByRole("button", { name: /New task/ }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Assign to").selectOption("anyone");
  await dialog.getByRole("button", { name: "Create task" }).click();
}

async function expectWorkspaceBlocked(page: Page) {
  await expect(stale(page)).toBeVisible({ timeout: 20_000 });
  await expect(trigger(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /New task/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tasks" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /no location is set up/i,
  );
}

async function signOutViaUi(page: Page) {
  const signedOut = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/auth/signout") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Account and quick settings" })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByText("Sign out", { exact: true })
    .filter({ visible: true })
    .first()
    .click();
  expect((await signedOut).status()).toBe(200);
}

const isActionPost = (r: {
  method(): string;
  headers(): Record<string, string>;
}) => r.method() === "POST" && !!r.headers()["next-action"];

// - tests -

test("MT-01/02/03/21 a second tab switches: the first tab is blocked at once, refreshes onto the verified location, keeps ?tab=, and never rewrites the cookie", async ({
  context,
}) => {
  const a = await context.newPage();
  await a.addInitScript(CAPTURE);
  await openAt(a, "emp1", ids.locA);
  const b = await secondTab(context, nameA);

  await switchTo(b, ids.locB, nameB);
  expect(await cookieLoc(context)).toBe(ids.locB);

  // A learns via the channel (it is not focused), is blocked and says why.
  await expectWorkspaceBlocked(a);
  await expect(a.getByRole("heading")).toHaveText(
    "Your active location changed in another tab",
  );
  await expect(stale(a).getByRole("alert")).toContainText(
    /refresh your workspace before continuing/i,
  );
  expect((await messages(a)).some((m) => m.type === "context_changed")).toBe(
    true,
  );

  // MT-03: refresh reconciles to the CURRENTLY verified context.
  await a.getByRole("button", { name: "Refresh workspace" }).click();
  await expect(trigger(a)).toHaveAttribute("aria-label", labelOf(nameB), {
    timeout: 60_000,
  });
  await expect(stale(a)).toHaveCount(0);
  // MT-21: the module survives; the address names the verified location.
  expect(new URL(a.url()).searchParams.get("tab")).toBe("tasks");
  expect(new URL(a.url()).searchParams.get("location")).toBe(ids.locB);

  // No oscillation: nothing wrote the cookie back to A, and B stays calm.
  await a.waitForTimeout(3_000);
  expect(await cookieLoc(context)).toBe(ids.locB);
  await expect(stale(b)).toHaveCount(0);
  await expect(trigger(b)).toHaveAttribute("aria-label", labelOf(nameB));
  await expect(stale(a)).toHaveCount(0);
});

test("MT-04 a deliberate choice of A again wins coherently, and 'Choose a location' uses the verified selection", async ({
  context,
}) => {
  const a = await context.newPage();
  await openAt(a, "emp1", ids.locA);
  const b = await secondTab(context, nameA);
  await switchTo(b, ids.locB, nameB);
  await expectWorkspaceBlocked(a);

  // A picks A through the recovery picker (the existing server-verified action).
  await a.getByRole("button", { name: "Choose a location" }).click();
  await a.locator(`[data-location-id="${ids.locA}"]`).click();
  await expect(trigger(a)).toHaveAttribute("aria-label", labelOf(nameA), {
    timeout: 60_000,
  });
  expect(await cookieLoc(context)).toBe(ids.locA);

  // ... which now makes B the stale one.
  await expectWorkspaceBlocked(b);
  await b.getByRole("button", { name: "Refresh workspace" }).click();
  await expect(trigger(b)).toHaveAttribute("aria-label", labelOf(nameA), {
    timeout: 60_000,
  });
  expect(await cookieLoc(context)).toBe(ids.locA);
});

test("MT-05 a failed switch announces nothing and leaves every tab consistent; a later real switch does announce", async ({
  context,
}) => {
  const a = await context.newPage();
  await a.addInitScript(CAPTURE);
  await openAt(a, "emp1", ids.locA);
  const b = await secondTab(context, nameA);

  await b.route("**/r/**", (route) =>
    isActionPost(route.request()) &&
    route.request().postData()?.includes(ids.locB)
      ? route.abort()
      : route.continue(),
  );
  await trigger(b).click();
  await b
    .locator(`[role="menuitemradio"][data-location-id="${ids.locB}"]`)
    .click();
  await expect(b.getByText(/couldn.t switch to that location/i)).toBeVisible({
    timeout: 30_000,
  });
  await expect(trigger(b)).toHaveAttribute("aria-label", labelOf(nameA));
  expect(await cookieLoc(context)).toBe(ids.locA);
  await a.waitForTimeout(2_500);
  await expect(stale(a)).toHaveCount(0);
  expect(
    (await messages(a)).filter((m) => m.type === "context_changed"),
  ).toHaveLength(0);

  await b.unroute("**/r/**");
  await switchTo(b, ids.locB, nameB);
  await expectWorkspaceBlocked(a);
  expect(
    (await messages(a)).filter((m) => m.type === "context_changed").length,
  ).toBeGreaterThan(0);
});

test("MT-06 rapid selections are coalesced: one request, a coherent final label and cookie", async ({
  context,
}) => {
  const b = await context.newPage();
  await openAt(b, "emp1", ids.locA);
  let selections = 0;
  b.on("request", (request) => {
    const body = request.postData() ?? "";
    if (
      isActionPost(request) &&
      body.includes(ids.locB) &&
      !body.includes("restaurantSlug") // the Tasks reads also carry the location
    )
      selections += 1;
  });
  await trigger(b).click();
  const item = b.locator(
    `[role="menuitemradio"][data-location-id="${ids.locB}"]`,
  );
  await item.dblclick().catch(() => {});
  await expect(trigger(b)).toHaveAttribute("aria-label", labelOf(nameB), {
    timeout: 60_000,
  });
  expect(selections).toBe(1);
  expect(await cookieLoc(context)).toBe(ids.locB);
});

test("MT-07/08 with BroadcastChannel unavailable the tab still reconciles on visibility and bfcache restore, and never polls", async ({
  context,
}) => {
  const a = await context.newPage();
  await a.addInitScript(UNAWARE);
  await openAt(a, "emp1", ids.locA);
  expect(await a.evaluate(() => typeof BroadcastChannel === "undefined")).toBe(
    true,
  );
  const b = await secondTab(context, nameA);
  await blockTasksReads(a);

  // Only the guard's own verification calls (they carry no restaurantSlug).
  let checks = 0;
  a.on("request", (request) => {
    if (
      isActionPost(request) &&
      !(request.postData() ?? "").includes("restaurantSlug")
    )
      checks += 1;
  });
  await switchTo(b, ids.locB, nameB);

  // No message can arrive and nothing polls: A is (still) unaware.
  await a.waitForTimeout(3_000);
  await expect(stale(a)).toHaveCount(0);
  expect(checks).toBe(0);

  // The tab becomes visible again (background tab resumes).
  await a.bringToFront();
  await a.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expectWorkspaceBlocked(a);
  expect(checks).toBe(1);

  await a.getByRole("button", { name: "Refresh workspace" }).click();
  await expect(trigger(a)).toHaveAttribute("aria-label", labelOf(nameB), {
    timeout: 60_000,
  });

  // Back to A elsewhere; A (showing B) is restored from the bfcache.
  await switchTo(b, ids.locA, nameA);
  await a.waitForTimeout(500);
  await expect(stale(a)).toHaveCount(0);
  await a.bringToFront();
  await a.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expectWorkspaceBlocked(a);
});

test("MT-09 back / reload to an old ?location= never silently reinstates it; only an explicit, verified choice does", async ({
  context,
}) => {
  const a = await context.newPage();
  await openAt(a, "emp1", ids.locA);
  expect(new URL(a.url()).searchParams.get("location")).toBe(ids.locA);
  await switchTo(a, ids.locB, nameB);
  expect(await cookieLoc(context)).toBe(ids.locB);

  let selectionPosts = 0;
  a.on("request", (request) => {
    if (isActionPost(request) && request.postData()?.includes(ids.locA))
      selectionPosts += 1;
  });
  await a.goBack();
  // Either the server-flagged confirmation or the stale-workspace panel; in
  // both cases the workspace is closed and the cookie is untouched.
  await expect(confirmGate(a).or(stale(a))).toBeVisible({ timeout: 30_000 });
  await a.waitForTimeout(2_000);
  expect(await cookieLoc(context)).toBe(ids.locB);
  expect(selectionPosts).toBe(0);
  await expect(trigger(a)).toHaveCount(0);

  // A RELOAD of the old URL asks as well (the URL is not a deliberate choice).
  await a.reload();
  await hydrated(a);
  await expect(confirmGate(a)).toBeVisible({ timeout: 30_000 });
  await expect(a.getByRole("heading")).toContainText(nameA);
  expect(await cookieLoc(context)).toBe(ids.locB);
  expect(selectionPosts).toBe(0);

  // "Stay" lands on the persisted location.
  await a.getByRole("button", { name: /stay on my current location/i }).click();
  await expect(trigger(a)).toHaveAttribute("aria-label", labelOf(nameB), {
    timeout: 60_000,
  });
  expect(await cookieLoc(context)).toBe(ids.locB);

  // A fresh deliberate navigation (typed/bookmarked link) still reconciles.
  await a.goto(`/r/${slugP}?location=${ids.locA}`);
  await expect(trigger(a)).toHaveAttribute("aria-label", labelOf(nameA), {
    timeout: 60_000,
  });
  expect(await cookieLoc(context)).toBe(ids.locA);
});

test("MT-10 a tab closed mid-switch leaves a valid persisted pair and no dangling state in the other tab", async ({
  context,
}) => {
  const a = await context.newPage();
  await openAt(a, "emp1", ids.locA);
  const b = await secondTab(context, nameA);
  // Only the scenario is observed: setup navigations cancel in-flight
  // requests, which WebKit reports as "Load failed" page errors.
  const errors: string[] = [];
  a.on("pageerror", (error) => errors.push(error.message));

  await trigger(b).click();
  await b
    .locator(`[role="menuitemradio"][data-location-id="${ids.locB}"]`)
    .click();
  await b.close();
  await a.waitForTimeout(3_000);
  await a.bringToFront();
  await a.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  const persisted = await cookieLoc(context);
  expect([ids.locA, ids.locB]).toContain(persisted);
  if (persisted === ids.locB) {
    await expectWorkspaceBlocked(a);
  } else {
    await expect(trigger(a)).toHaveAttribute("aria-label", labelOf(nameA));
    await expect(stale(a)).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("MT-11/12 a stale tab's task creation is refused with a normal AND a stripped Referer, and writes at neither location", async ({
  context,
}) => {
  const a = await context.newPage();
  await a.addInitScript(UNAWARE); // A cannot know: only the server guard remains
  await openAt(a, "emp1", ids.locA);
  const b = await secondTab(context, nameA);
  const release = await blockTasksReads(a);
  await switchTo(b, ids.locB, nameB);
  await a.waitForTimeout(1_500);
  await expect(stale(a)).toHaveCount(0); // still believes it is at A

  const withReferer = `MT11-referer-${runId}`;
  let sentReferer: string | undefined;
  a.on("request", (request) => {
    if (isActionPost(request) && request.postData()?.includes(withReferer))
      sentReferer = request.headers()["referer"];
  });
  await createTaskViaUi(a, withReferer);
  await expectWorkspaceBlocked(a);
  expect(sentReferer).toContain(`/r/${slugP}`); // a normal Referer was sent
  await expectNoRows(withReferer);

  // Recover onto B, then make B stale and repeat with the Referer stripped.
  await release();
  await a.getByRole("button", { name: "Refresh workspace" }).click();
  await expect(trigger(a)).toHaveAttribute("aria-label", labelOf(nameB), {
    timeout: 60_000,
  });
  await expect(a.getByRole("button", { name: /New task/ })).toBeVisible({
    timeout: 30_000,
  });
  await blockTasksReads(a);
  await switchTo(b, ids.locA, nameA);
  await a.waitForTimeout(1_500);
  await a.evaluate(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.append(meta);
  });
  const stripped = `MT12-stripped-${runId}`;
  let strippedReferer: string | undefined = "unset";
  a.on("request", (request) => {
    if (isActionPost(request) && request.postData()?.includes(stripped))
      strippedReferer = request.headers()["referer"];
  });
  await createTaskViaUi(a, stripped);
  await expectWorkspaceBlocked(a);
  expect(strippedReferer).toBeUndefined(); // the V2-003.004 residual's trigger
  await expectNoRows(stripped);

  // Zero rows anywhere for this run's stale attempts.
  const leaked = await admin
    .from("tasks")
    .select("id")
    .in("title", [withReferer, stripped]);
  expect(leaked.data ?? []).toHaveLength(0);
});

test("MT-13 a forged Server Action (asserting another location) is refused, while the identical genuine replay is accepted", async ({
  context,
}) => {
  const a = await context.newPage();
  await openAt(a, "emp1", ids.locA);
  const captured: {
    url: string;
    headers: Record<string, string>;
    body: string;
  }[] = [];
  const genuine = `MT13-genuine-${runId}`;
  a.on("request", (request) => {
    if (isActionPost(request) && request.postData()?.includes(genuine)) {
      captured.push({
        url: request.url(),
        headers: request.headers(),
        body: request.postData()!,
      });
    }
  });
  await createTaskViaUi(a, genuine);
  await expect(a.getByRole("dialog", { name: "New task" })).toBeHidden({
    timeout: 30_000,
  });
  expect(await tasksFor(genuine)).toHaveLength(1);
  const base = captured[0];
  expect(base.body).toContain(ids.locA); // the on-screen workspace is in the call

  const replay = (title: string, body: string) => {
    const headers = { ...base.headers };
    delete headers["referer"];
    delete headers["content-length"];
    return context.request.post(base.url, {
      headers,
      data: body.replace(genuine, title),
    });
  };
  // Cookie says A; the genuine call (expects A) replays fine without a Referer.
  const ok1 = `MT13-replay-${runId}`;
  await replay(ok1, base.body);
  expect(await tasksFor(ok1)).toHaveLength(1);
  // The forged one asserts B, which is NOT the persisted location.
  const forged = `MT13-forged-${runId}`;
  await replay(forged, base.body.replaceAll(ids.locA, ids.locB));
  await expectNoRows(forged);
  // ... and so does one that names a location the account does not have.
  const foreign = `MT13-foreign-${runId}`;
  await replay(foreign, base.body.replaceAll(ids.locA, ids.locQ));
  await expectNoRows(foreign);
});

test("MT-14 a revoked assignment blocks the tab on its next check; the stale picker cannot reopen the revoked location", async ({
  context,
}) => {
  const a = await context.newPage();
  await openAt(a, "revoke", ids.locA);
  const revoked = await admin
    .from("location_memberships")
    .update({ active: false })
    .eq("profile_id", profileOf.revoke)
    .eq("location_id", ids.locA)
    .select("id");
  expect(revoked.error).toBeNull();
  expect(revoked.data).toHaveLength(1);

  await a.bringToFront();
  await a.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expectWorkspaceBlocked(a);
  await expect(a.getByRole("heading")).toHaveText(
    "Your access to this location changed",
  );
  const title = `MT14-revoked-${runId}`;
  expect(await tasksFor(title)).toHaveLength(0);

  // The (stale) picker still lists A, but the server refuses it.
  await a.getByRole("button", { name: "Choose a location" }).click();
  await a.locator(`[data-location-id="${ids.locA}"]`).click();
  await expect(a.getByText(/couldn.t switch to that location/i)).toBeVisible({
    timeout: 30_000,
  });
  await expect(stale(a)).toBeVisible();
  // B is still allowed.
  await a.locator(`[data-location-id="${ids.locB}"]`).click();
  // Only B is eligible now, so the header shows the plain indicator.
  await expect(a.getByTestId("context-indicator").first()).toContainText(
    nameB,
    { timeout: 60_000 },
  );
  await expect(stale(a)).toHaveCount(0);
  expect(await cookieLoc(context)).toBe(ids.locB);
});

test("MT-15 another tab moves to a different organization: this tab is blocked and Refresh goes to the verified organization", async ({
  context,
}) => {
  const a = await context.newPage();
  await openAt(a, "xorg", ids.locA);
  const b = await secondTab(context, nameA);
  await trigger(b).click();
  await b
    .locator(`[role="menuitemradio"][data-location-id="${ids.locQ}"]`)
    .click();
  await expect(trigger(b)).toHaveAttribute("aria-label", labelOf(nameQ), {
    timeout: 60_000,
  });

  await expectWorkspaceBlocked(a);
  const title = `MT15-xorg-${runId}`;
  await expectNoRows(title);
  await a.getByRole("button", { name: "Refresh workspace" }).click();
  await expect(trigger(a)).toHaveAttribute("aria-label", labelOf(nameQ), {
    timeout: 60_000,
  });
  await expect(unavailable(a)).toHaveCount(0);
  expect(new URL(a.url()).pathname).toBe(`/r/${slugQ}`);
});

test("MT-17 signing out in one tab invalidates the other; refreshing shows the login screen and restores nothing", async ({
  context,
}) => {
  const a = await context.newPage();
  await openAt(a, "emp1", ids.locA);
  const b = await secondTab(context, nameA);
  await signOutViaUi(b);
  await expect(b.locator("#passcode")).toBeVisible({ timeout: 30_000 });

  await expect(stale(a).or(a.locator("#passcode"))).toBeVisible({
    timeout: 20_000,
  });
  await expect(trigger(a)).toHaveCount(0);
  await expect(a.getByRole("button", { name: /New task/ })).toHaveCount(0);
  if (await stale(a).count()) {
    await expect(a.getByRole("heading")).toContainText(/signed out/i);
    await a.getByRole("button", { name: "Refresh workspace" }).click();
  }
  await expect(a.locator("#passcode")).toBeVisible({ timeout: 60_000 });
  await expect(trigger(a)).toHaveCount(0);
  await expect(stale(a)).toHaveCount(0);
  expect(await ctxCookie(context)).toBeUndefined();
});

test("MT-18 another employee signs in on the same browser: the old tab is closed without retaining the previous workspace, even with no broadcast", async ({
  context,
}) => {
  const a = await context.newPage();
  await a.addInitScript(UNAWARE);
  await openAt(a, "emp1", ids.locA);
  const b = await context.newPage();
  await b.goto(`/r/${slugP}?tab=tasks`);
  await hydrated(b);
  await signOutViaUi(b);
  await expect(b.locator("#passcode")).toBeVisible({ timeout: 30_000 });
  await b.locator("#passcode").fill(pins.solo);
  await expect(
    trigger(b).or(b.getByTestId("context-indicator").first()),
  ).toBeVisible({ timeout: 60_000 });

  // A was never told (no BroadcastChannel); its next check closes it.
  await a.bringToFront();
  await a.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  // Whichever path observes it first closes the old workspace: the guard's
  // "different account" panel, or the existing forced sign-out (the previous
  // session was revoked by the sign-out) which ends on the login screen.
  await expect(stale(a).or(a.locator("#passcode"))).toBeVisible({
    timeout: 20_000,
  });
  await expect(trigger(a)).toHaveCount(0);
  await expect(a.getByRole("button", { name: /New task/ })).toHaveCount(0);
  await expect(a.locator("body")).not.toContainText(nameA);
  const title = `MT18-other-user-${runId}`;
  await expectNoRows(title);

  if (await stale(a).count()) {
    await expect(a.getByRole("heading")).toHaveText(
      "A different account is signed in",
    );
    await a.getByRole("button", { name: "Refresh workspace" }).click();
    await expect(
      trigger(a).or(a.getByTestId("context-indicator").first()),
    ).toBeVisible({ timeout: 60_000 });
    await expect(a.locator("body")).toContainText(nameB); // solo's only location
    await expect(a.locator("body")).not.toContainText(nameA);
  }
});

test("MT-19/20 compatibility: a single-location employee enters automatically with no false stale warning; a multi-location employee keeps a working switcher", async ({
  context,
}) => {
  const a = await context.newPage();
  await uiLogin(a, "solo");
  await expect(
    trigger(a).or(a.getByTestId("context-indicator").first()),
  ).toBeVisible({ timeout: 60_000 });
  await expect(unavailable(a)).toHaveCount(0);
  const b = await context.newPage();
  await b.goto(`/r/${slugP}?tab=tasks`);
  await hydrated(b);
  for (const page of [a, b]) {
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }
  await a.waitForTimeout(2_500);
  await expect(stale(a)).toHaveCount(0);
  await expect(stale(b)).toHaveCount(0);
  const title = `MT19-solo-${runId}`;
  await createTaskViaUi(a, title);
  await expect(a.getByRole("dialog", { name: "New task" })).toBeHidden({
    timeout: 30_000,
  });
  const rows = await tasksFor(title);
  expect(rows).toHaveLength(1);
  expect(rows[0].location_id).toBe(ids.locB);
});

test("MT-20 a multi-location employee's switcher and tasks keep working end to end", async ({
  context,
}) => {
  const a = await context.newPage();
  await openAt(a, "emp2", ids.locA);
  await switchTo(a, ids.locB, nameB);
  const title = `MT20-multi-${runId}`;
  await createTaskViaUi(a, title);
  await expect(a.getByRole("dialog", { name: "New task" })).toBeHidden({
    timeout: 30_000,
  });
  const rows = await tasksFor(title);
  expect(rows).toHaveLength(1);
  expect(rows[0].location_id).toBe(ids.locB);
  await expect(stale(a)).toHaveCount(0);
});

test("MT-22 an authenticated account with no eligible location still sees the no-access recovery screen", async ({
  page,
}) => {
  await uiLogin(page, "noloc");
  await expect(unavailable(page)).toBeVisible({ timeout: 60_000 });
  await expect(unavailable(page)).toHaveAttribute(
    "data-context-status",
    "no_access",
  );
  await expect(
    page.getByText(/no restaurant location assigned/i),
  ).toBeVisible();
  await expect(stale(page)).toHaveCount(0);
});

test("MT-23 two devices (separate browser contexts) keep independent preferences and never disturb each other", async ({
  browser,
}, info) => {
  const options = info.project.use as Parameters<typeof browser.newContext>[0];
  const phone = await browser.newContext(options);
  const tablet = await browser.newContext(options);
  try {
    const p = await phone.newPage();
    const t = await tablet.newPage();
    await openAt(p, "emp1", ids.locA);
    await openAt(t, "emp1", ids.locB);
    await switchTo(p, ids.locB, nameB);
    for (const page of [p, t]) {
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }
    await t.waitForTimeout(2_500);
    await expect(stale(t)).toHaveCount(0);
    await expect(trigger(t)).toHaveAttribute("aria-label", labelOf(nameB));
    await switchTo(t, ids.locA, nameA);
    await p.waitForTimeout(2_500);
    await expect(stale(p)).toHaveCount(0);
    await expect(trigger(p)).toHaveAttribute("aria-label", labelOf(nameB));
    expect(await cookieLoc(phone)).toBe(ids.locB);
    expect(await cookieLoc(tablet)).toBe(ids.locA);
  } finally {
    await phone.close();
    await tablet.close();
  }
});

const luminance = (rgb: string) => {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? ["0", "0", "0"])
    .slice(0, 3)
    .map(Number)
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

for (const scheme of ["light", "dark"] as const) {
  test(`UX stale panel (${scheme}, narrow viewport): keyboard reachable, 44px targets, no overflow, readable, recovers`, async ({
    context,
  }, info) => {
    const a = await context.newPage();
    await a.emulateMedia({ colorScheme: scheme });
    await a.setViewportSize({ width: 375, height: 667 });
    await openAt(a, "emp1", ids.locA);
    const b = await secondTab(context, nameA);
    await b.setViewportSize({ width: 375, height: 667 });
    await switchTo(b, ids.locB, nameB);
    await expect(stale(a)).toBeVisible({ timeout: 20_000 });

    // Primary action has focus; Tab reaches the second action; targets >= 44px.
    const refresh = a.getByRole("button", { name: "Refresh workspace" });
    const choose = a.getByRole("button", { name: "Choose a location" });
    await expect(refresh).toBeFocused();
    await a.keyboard.press("Tab");
    await expect(choose).toBeFocused();
    for (const button of [refresh, choose]) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    // No horizontal overflow.
    const overflow = await a.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    // Readable in this theme: body text against the card background.
    const colors = await a.evaluate(() => {
      const card = document.querySelector(
        '[data-testid="context-stale"] > div',
      ) as HTMLElement;
      const text = document.querySelector(
        '[data-testid="context-stale"] [role="alert"]',
      ) as HTMLElement;
      return {
        bg: getComputedStyle(card).backgroundColor,
        fg: getComputedStyle(text).color,
      };
    });
    expect(contrast(colors.fg, colors.bg)).toBeGreaterThanOrEqual(4.5);
    await a.screenshot({
      path: info.outputPath(`stale-panel-${scheme}.png`),
    });

    // Keyboard activation recovers (Enter on the focused primary action).
    await refresh.focus();
    await a.keyboard.press("Enter");
    await expect(stale(a)).toHaveCount(0, { timeout: 60_000 });
    await expect(
      a.getByRole("button", { name: /Switch workspace\. Current:/ }),
    ).toHaveAttribute("aria-label", labelOf(nameB));
  });
}

test("CLEANUP every fixture this run created is gone and DEV table counts equal the pre-run baseline", async () => {
  const errors = await cleanupFixtures(admin, {
    orgIds: [ids.orgP, ids.orgQ],
    userIds: ids.users,
  });
  expect(errors).toEqual([]);
  const after = await countDev(admin);
  console.info("DEV post-teardown counts", JSON.stringify(after));
  expect(diffCounts(baseline, after)).toEqual({});
});
