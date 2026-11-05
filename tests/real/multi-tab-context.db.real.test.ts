/**
 * V2-003.005 hosted-DEV verification: multi-tab / stale-context safety with
 * REAL Supabase Auth JWTs against REAL RLS.
 *
 * Drives the real `runTaskCommandAction` (write), `getTasksSnapshotAction` /
 * `getTaskHistoryAction` (reads), `verifyWorkspaceContextAction`,
 * `setActiveContextAction` and the real `getPrimaryLocation`. Only Next's
 * request scope (a faithful cookie jar + headers) and the per-user Supabase
 * client injection are doubled. A "tab" is a request that carries the cookie
 * jar as it was WHEN THE REQUEST WAS SENT, exactly like a browser.
 *
 * A pass requires the exact database effect: zero rows at BOTH candidate
 * locations for a refused write, one row at the verified location otherwise --
 * not merely an error in the result.
 *
 * Synthetic organizations/users only. Teardown removes the task family first
 * and is verified against a pre-run table-count baseline. Hard-aborts unless
 * the URL is the-lineup-dev (see harness). NOT run in Cloud.
 */
import crypto from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  clearActiveContextAction,
  setActiveContextAction,
  verifyWorkspaceContextAction,
} from "@/features/context/actions/context-actions";
import {
  getTaskHistoryAction,
  getTasksSnapshotAction,
  runTaskCommandAction,
} from "@/features/tasks/actions/tasks-actions";
import type { TaskCommand } from "@/features/tasks/domain/task-commands";
import type { Database } from "@/types/database.generated";

import { adminClient, env } from "./support/harness";
import {
  cleanupFixtures,
  countDev,
  diffCounts,
  type DevCounts,
} from "./support/dev-counts";

type U = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient<Database>;
};

const req = vi.hoisted(() => ({
  client: null as unknown,
  referer: null as string | null,
  jar: new Map<string, string>(),
  sets: [] as Array<{ name: string; value: string }>,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => req.client,
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "app.test",
      ...(req.referer ? { referer: req.referer } : {}),
    }),
  cookies: async () => ({
    get: (name: string) =>
      req.jar.has(name) ? { name, value: req.jar.get(name) } : undefined,
    set: (name: string, value: string, options: Record<string, unknown>) => {
      req.sets.push({ name, value });
      if (options?.maxAge === 0 || value === "") req.jar.delete(name);
      else req.jar.set(name, value);
    },
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = env.anonKey;
delete process.env.NEXT_PUBLIC_DEMO_MODE;

const COOKIE = "lineup_active_context";
const admin = adminClient();
const runId = crypto.randomBytes(4).toString("hex");
const users: Record<string, U> = {};
const orgIds: string[] = [];
const L: Record<string, string> = {};
let orgP = "";
let orgQ = "";
const slugP = `v2m-p-${runId}`;
const slugQ = `v2m-q-${runId}`;
const marker = (k: string) => `v2m-${runId}-${k}`;
let baseline: DevCounts;

async function mk(key: string): Promise<U> {
  const email = `v2m-${runId}-${key}@harness.invalid`;
  const password = crypto.randomBytes(18).toString("base64url");
  const c = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (c.error || !c.data.user)
    throw new Error(`createUser ${key}: ${c.error?.message}`);
  const id = c.data.user.id;
  const p = await admin
    .from("profiles")
    .insert({ id, display_name: `V2M ${key} ${runId}` });
  if (p.error) throw new Error(`profile ${key}: ${p.error.message}`);
  const client = createClient<Database>(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  users[key] = { id, email, password, client };
  return users[key];
}
async function signIn(u: U) {
  const r = await u.client.auth.signInWithPassword({
    email: u.email,
    password: u.password,
  });
  if (r.error) throw new Error(`signin: ${r.error.message}`);
}
/* eslint-disable @typescript-eslint/no-explicit-any */
function ok(
  r: { data: any; error: { message: string } | null },
  w: string,
): any {
  if (r.error || r.data === null)
    throw new Error(`${w}: ${r.error?.message ?? "no data"}`);
  return r.data;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** A browser. `jar` is the cookie store of ONE browser profile. */
type Browser = { jar: Map<string, string> };
const newBrowser = (): Browser => ({ jar: new Map() });

/** One request from `browser` as `key`; the jar is read when the request is sent. */
function send(
  browser: Browser,
  key: string | "anonymous",
  referer: string | null = null,
) {
  req.client = key === "anonymous" ? anonymous : users[key].client;
  req.referer = referer;
  req.jar = browser.jar;
  req.sets = [];
}
const anonymous = createClient<Database>(env.url, env.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const shown = (key: string, org: string, loc: string) => ({
  profileId: users[key].id,
  organizationId: org,
  locationId: loc,
});

const createCommand = (title: string): TaskCommand =>
  ({
    type: "create",
    input: {
      title,
      instructions: null,
      category: "other",
      priority: "normal",
      startDate: null,
      dueDate: null,
      dueTime: null,
      dueWindow: null,
      assignmentMode: "anyone",
      assigneeIds: [],
      eachPerson: false,
    },
  }) satisfies TaskCommand;

async function createTask(
  browser: Browser,
  key: string,
  slug: string,
  title: string,
  expectedContext: unknown,
  referer: string | null,
) {
  send(browser, key, referer);
  return runTaskCommandAction({
    restaurantSlug: slug,
    command: createCommand(title),
    expectedContext,
  });
}
async function taskRows(title: string) {
  const r = await admin
    .from("tasks")
    .select("id, location_id, organization_id")
    .eq("title", title);
  return r.data ?? [];
}
/** Exact DB effect at BOTH candidate locations. */
async function expectRows(title: string, at: Record<string, number>) {
  const rows = await taskRows(title);
  for (const [loc, count] of Object.entries(at)) {
    expect(
      rows.filter((r) => r.location_id === loc),
      `rows at ${loc}`,
    ).toHaveLength(count);
  }
  expect(rows).toHaveLength(Object.values(at).reduce((a, b) => a + b, 0));
}
const select = (browser: Browser, key: string, org: string, loc: string) => {
  send(browser, key);
  return setActiveContextAction({ organizationId: org, locationId: loc });
};

beforeAll(async () => {
  baseline = await countDev(admin);
  console.info("DEV baseline counts", JSON.stringify(baseline));
  await Promise.all(
    ["multi", "solo", "coworker", "revoked", "inactive"].map(mk),
  );
  orgP = ok(
    await admin
      .from("organizations")
      .insert({
        name: `V2M P ${runId}`,
        slug: slugP,
        created_by: users.multi.id,
      })
      .select("id")
      .single(),
    "orgP",
  ).id;
  orgQ = ok(
    await admin
      .from("organizations")
      .insert({
        name: `V2M Q ${runId}`,
        slug: slugQ,
        created_by: users.multi.id,
      })
      .select("id")
      .single(),
    "orgQ",
  ).id;
  orgIds.push(orgP, orgQ);
  for (const [k, org, name, tz] of [
    ["P1", orgP, "Aaa", "America/New_York"],
    ["P2", orgP, "Bbb", "America/Los_Angeles"],
    ["P3", orgP, "Ccc", "America/Chicago"],
    ["Q1", orgQ, "Qqq", "America/Denver"],
  ] as const) {
    L[k] = ok(
      await admin
        .from("locations")
        .insert({
          organization_id: org,
          name: `${name} ${runId}`,
          time_zone: tz,
        })
        .select("id")
        .single(),
      `loc ${k}`,
    ).id;
  }
  const mem = (p: string, org: string) => ({
    organization_id: org,
    profile_id: p,
    roles: ["general_manager"],
    active: true,
  });
  ok(
    await admin
      .from("memberships")
      .insert([
        mem(users.multi.id, orgP),
        mem(users.multi.id, orgQ),
        mem(users.solo.id, orgP),
        mem(users.coworker.id, orgP),
        mem(users.revoked.id, orgP),
        mem(users.inactive.id, orgP),
      ])
      .select("id"),
    "memberships",
  );
  const asg = (p: string, loc: string) => ({
    profile_id: p,
    location_id: loc,
    role: "manager",
    active: true,
  });
  ok(
    await admin
      .from("location_memberships")
      .insert([
        asg(users.multi.id, L.P1),
        asg(users.multi.id, L.P2),
        asg(users.multi.id, L.Q1),
        asg(users.solo.id, L.P1),
        asg(users.coworker.id, L.P1),
        asg(users.coworker.id, L.P2),
        asg(users.revoked.id, L.P1),
        asg(users.revoked.id, L.P2),
        asg(users.inactive.id, L.P3),
        asg(users.inactive.id, L.P1),
      ])
      .select("id"),
    "assignments",
  );
  await Promise.all(Object.values(users).map(signIn));
}, 180_000);

const scope = () => ({
  orgIds,
  userIds: Object.values(users).map((u) => u.id),
});
afterAll(async () => {
  const errors = await cleanupFixtures(admin, scope());
  if (errors.length) throw new Error(`cleanup: ${errors.join("; ")}`);
}, 180_000);

describe("LIVE-MT-A stripped-Referer wrong-location write (the V2-003.004 residual)", () => {
  it("Tab A shows P1, Tab B switched the shared cookie to P2: Tab A's write is REFUSED with and without a Referer and writes at NEITHER location", async () => {
    const browser = newBrowser();
    expect((await select(browser, "multi", orgP, L.P1)).ok).toBe(true);
    // Tab B switches the shared browser cookie to P2.
    expect((await select(browser, "multi", orgP, L.P2)).ok).toBe(true);
    expect(JSON.parse(browser.jar.get(COOKIE)!)).toMatchObject({ l: L.P2 });

    const tabA = shown("multi", orgP, L.P1); // what Tab A is still displaying

    const normal = marker("A-referer");
    const r1 = await createTask(
      browser,
      "multi",
      slugP,
      normal,
      tabA,
      `https://app.test/r/${slugP}?location=${L.P1}`,
    );
    expect(r1).toMatchObject({ ok: false, contextStale: true });
    await expectRows(normal, { [L.P1]: 0, [L.P2]: 0 });

    const stripped = marker("A-stripped");
    const r2 = await createTask(browser, "multi", slugP, stripped, tabA, null);
    expect(r2).toMatchObject({ ok: false, contextStale: true });
    await expectRows(stripped, { [L.P1]: 0, [L.P2]: 0 });

    // Tab B (displaying P2) is unaffected and writes ONLY at P2.
    const tabB = marker("B-write");
    const r3 = await createTask(
      browser,
      "multi",
      slugP,
      tabB,
      shown("multi", orgP, L.P2),
      null,
    );
    expect(r3.ok).toBe(true);
    await expectRows(tabB, { [L.P1]: 0, [L.P2]: 1 });
  });

  it("the Tasks reads refuse too: a stale tab never receives the other location's tasks", async () => {
    const browser = newBrowser();
    await select(browser, "multi", orgP, L.P2);
    const stale = shown("multi", orgP, L.P1);
    send(browser, "multi");
    expect(
      await getTasksSnapshotAction({
        restaurantSlug: slugP,
        expectedContext: stale,
      }),
    ).toMatchObject({ ok: false, contextStale: true });
    send(browser, "multi");
    expect(
      await getTaskHistoryAction({
        restaurantSlug: slugP,
        expectedContext: stale,
      }),
    ).toMatchObject({ ok: false, contextStale: true });
    send(browser, "multi");
    expect(
      await getTasksSnapshotAction({
        restaurantSlug: slugP,
        expectedContext: shown("multi", orgP, L.P2),
      }),
    ).toMatchObject({ ok: true });
  });
});

describe("LIVE-MT-B in-flight mutation across a switch (MT-16)", () => {
  it("a request SENT before the switch executes at the location it displayed; one sent after is refused; each effect is exact", async () => {
    const browser = newBrowser();
    await select(browser, "multi", orgP, L.P1);
    const tabA = shown("multi", orgP, L.P1);

    // R1 leaves Tab A carrying the cookie as of NOW (P1).
    const before = marker("race-before");
    const r1 = await createTask(browser, "multi", slugP, before, tabA, null);
    // ... while Tab B switches the shared cookie to P2.
    await select(browser, "multi", orgP, L.P2);
    // R2 leaves Tab A after the switch landed.
    const after = marker("race-after");
    const r2 = await createTask(browser, "multi", slugP, after, tabA, null);

    expect(r1.ok).toBe(true);
    await expectRows(before, { [L.P1]: 1, [L.P2]: 0 });
    expect(r2).toMatchObject({ ok: false, contextStale: true });
    await expectRows(after, { [L.P1]: 0, [L.P2]: 0 });
  });
});

describe("LIVE-MT-C forged / missing expectations (MT-13)", () => {
  it("an expectation naming a location the user may not operate grants nothing, even with a matching forged cookie", async () => {
    const browser = newBrowser();
    // 'solo' is assigned only to P1. Forge BOTH the cookie and the assertion.
    browser.jar.set(COOKIE, JSON.stringify({ v: 1, o: orgP, l: L.P2 }));
    const title = marker("forged");
    const r = await createTask(
      browser,
      "solo",
      slugP,
      title,
      shown("solo", orgP, L.P2),
      null,
    );
    expect(r).toMatchObject({ ok: false });
    await expectRows(title, { [L.P1]: 0, [L.P2]: 0 });
  });

  it.each([
    ["missing", undefined],
    ["malformed", { profileId: "x", organizationId: "y", locationId: "z" }],
    ["with extra fields", { extra: true }],
  ])("a %s expectation fails safely with zero rows", async (name, raw) => {
    const browser = newBrowser();
    await select(browser, "multi", orgP, L.P1);
    const title = marker(`bad-${name}`);
    const r = await createTask(browser, "multi", slugP, title, raw, null);
    expect(r).toEqual({ ok: false, error: "That request is invalid." });
    await expectRows(title, { [L.P1]: 0, [L.P2]: 0 });
  });
});

describe("LIVE-MT-D revoked assignment (MT-14)", () => {
  it("the next protected request after revocation is refused; verify reports access_changed; a stale broadcast cannot restore it", async () => {
    const browser = newBrowser();
    await select(browser, "revoked", orgP, L.P1);
    const tab = shown("revoked", orgP, L.P1);

    const t1 = marker("revoked-before");
    expect(
      (await createTask(browser, "revoked", slugP, t1, tab, null)).ok,
    ).toBe(true);
    await expectRows(t1, { [L.P1]: 1, [L.P2]: 0 });

    ok(
      await admin
        .from("location_memberships")
        .update({ active: false })
        .eq("profile_id", users.revoked.id)
        .eq("location_id", L.P1)
        .select("id"),
      "revoke",
    );

    const t2 = marker("revoked-after");
    const r = await createTask(browser, "revoked", slugP, t2, tab, null);
    expect(r).toMatchObject({ ok: false, contextStale: true });
    await expectRows(t2, { [L.P1]: 0, [L.P2]: 0 });

    send(browser, "revoked");
    expect(await verifyWorkspaceContextAction(tab)).toEqual({
      status: "stale",
      reason: "access_changed",
    });
    // The still-assigned location remains usable only after a deliberate,
    // server-verified selection.
    expect((await select(browser, "revoked", orgP, L.P2)).ok).toBe(true);
    const t3 = marker("revoked-p2");
    expect(
      (
        await createTask(
          browser,
          "revoked",
          slugP,
          t3,
          shown("revoked", orgP, L.P2),
          null,
        )
      ).ok,
    ).toBe(true);
    await expectRows(t3, { [L.P1]: 0, [L.P2]: 1 });
  });

  it("an inactive location denies the same way", async () => {
    const browser = newBrowser();
    await select(browser, "inactive", orgP, L.P3);
    const tab = shown("inactive", orgP, L.P3);
    ok(
      await admin
        .from("locations")
        .update({ active: false })
        .eq("id", L.P3)
        .select("id"),
      "deactivate",
    );
    const title = marker("inactive");
    expect(
      await createTask(browser, "inactive", slugP, title, tab, null),
    ).toMatchObject({ ok: false, contextStale: true });
    await expectRows(title, { [L.P1]: 0, [L.P2]: 0, [L.P3]: 0 });
  });
});

describe("LIVE-MT-E cross-organization (MT-15)", () => {
  it("a tab built for org P is refused while the persisted context is org Q, and a slug/assertion organization mismatch is refused", async () => {
    const browser = newBrowser();
    await select(browser, "multi", orgP, L.P1);
    const tabP = shown("multi", orgP, L.P1);
    await select(browser, "multi", orgQ, L.Q1); // another tab moved to org Q

    const a = marker("xorg-P");
    expect(
      await createTask(browser, "multi", slugP, a, tabP, null),
    ).toMatchObject({ ok: false, contextStale: true });
    await expectRows(a, { [L.P1]: 0, [L.P2]: 0, [L.Q1]: 0 });

    // Asserting org P while addressing org Q's slug.
    const b = marker("xorg-slug");
    expect(
      await createTask(browser, "multi", slugQ, b, tabP, null),
    ).toMatchObject({ ok: false, contextStale: true });
    await expectRows(b, { [L.P1]: 0, [L.P2]: 0, [L.Q1]: 0 });

    // The deliberately selected org Q works at Q only.
    const c = marker("xorg-Q");
    expect(
      (
        await createTask(
          browser,
          "multi",
          slugQ,
          c,
          shown("multi", orgQ, L.Q1),
          null,
        )
      ).ok,
    ).toBe(true);
    await expectRows(c, { [L.P1]: 0, [L.P2]: 0, [L.Q1]: 1 });
  });
});

describe("LIVE-MT-F different employee and signed-out tabs (MT-17/18)", () => {
  it("another employee's session using the same cookie jar is refused for a tab built for someone else; zero rows", async () => {
    const browser = newBrowser();
    await select(browser, "multi", orgP, L.P1);
    const multiTab = shown("multi", orgP, L.P1);
    // 'coworker' signs in on the same browser (same jar) and is allowed at P1.
    const title = marker("different-user");
    expect(
      await createTask(browser, "coworker", slugP, title, multiTab, null),
    ).toMatchObject({ ok: false, contextStale: true });
    await expectRows(title, { [L.P1]: 0, [L.P2]: 0 });
    send(browser, "coworker");
    expect(await verifyWorkspaceContextAction(multiTab)).toEqual({
      status: "stale",
      reason: "different_user",
    });
  });

  it("with no session the check reports signed_out and a write is refused", async () => {
    const browser = newBrowser();
    await select(browser, "multi", orgP, L.P1);
    const tab = shown("multi", orgP, L.P1);
    send(browser, "anonymous");
    expect(await verifyWorkspaceContextAction(tab)).toEqual({
      status: "signed_out",
    });
    const title = marker("signed-out");
    expect(
      await createTask(browser, "anonymous", slugP, title, tab, null),
    ).toMatchObject({ ok: false });
    await expectRows(title, { [L.P1]: 0, [L.P2]: 0 });
  });
});

describe("LIVE-MT-G verification is read-only and compatible (MT-19/20/23)", () => {
  it("verify reports consistent / stale and never writes the cookie", async () => {
    const browser = newBrowser();
    await select(browser, "multi", orgP, L.P1);
    const tabA = shown("multi", orgP, L.P1);
    send(browser, "multi");
    expect(await verifyWorkspaceContextAction(tabA)).toEqual({
      status: "consistent",
    });
    expect(req.sets).toHaveLength(0);
    await select(browser, "multi", orgP, L.P2);
    const cookieBefore = browser.jar.get(COOKIE);
    send(browser, "multi");
    // The verdict points recovery at the organization the SERVER verified.
    expect(await verifyWorkspaceContextAction(tabA)).toEqual({
      status: "stale",
      reason: "location_changed",
      organizationSlug: slugP,
    });
    expect(req.sets).toHaveLength(0);
    expect(browser.jar.get(COOKIE)).toBe(cookieBefore);
    // A cleared preference with several eligible locations is stale too.
    send(browser, "multi");
    await clearActiveContextAction();
    send(browser, "multi");
    expect(await verifyWorkspaceContextAction(tabA)).toMatchObject({
      status: "stale",
    });
    expect(req.sets).toHaveLength(0);
  });

  it("MT-19: a single-location user (no cookie at all) keeps working", async () => {
    const browser = newBrowser();
    const tab = shown("solo", orgP, L.P1);
    send(browser, "solo");
    expect(await verifyWorkspaceContextAction(tab)).toEqual({
      status: "consistent",
    });
    const title = marker("solo");
    expect(
      (await createTask(browser, "solo", slugP, title, tab, null)).ok,
    ).toBe(true);
    await expectRows(title, { [L.P1]: 1, [L.P2]: 0 });
  });

  it("MT-20: a deliberately selected B operates only at B", async () => {
    const browser = newBrowser();
    await select(browser, "coworker", orgP, L.P1);
    await select(browser, "coworker", orgP, L.P2);
    const title = marker("deliberate-B");
    expect(
      (
        await createTask(
          browser,
          "coworker",
          slugP,
          title,
          shown("coworker", orgP, L.P2),
          null,
        )
      ).ok,
    ).toBe(true);
    await expectRows(title, { [L.P1]: 0, [L.P2]: 1 });
  });

  it("MT-23: independent browsers keep independent preferences (a switch on one never moves the other)", async () => {
    const phone = newBrowser();
    const tablet = newBrowser();
    await select(phone, "multi", orgP, L.P1);
    await select(tablet, "multi", orgP, L.P2);
    send(phone, "multi");
    expect(
      await verifyWorkspaceContextAction(shown("multi", orgP, L.P1)),
    ).toEqual({ status: "consistent" });
    send(tablet, "multi");
    expect(
      await verifyWorkspaceContextAction(shown("multi", orgP, L.P2)),
    ).toEqual({ status: "consistent" });
    await select(phone, "multi", orgP, L.P2); // phone switches
    send(tablet, "multi");
    expect(
      await verifyWorkspaceContextAction(shown("multi", orgP, L.P2)),
    ).toEqual({ status: "consistent" });
  });
});

describe("LIVE-MT-H fixture cleanup", () => {
  it("removes every row this run created and DEV counts return to the pre-run baseline", async () => {
    // Make sure the app-written notification rows exist, then prove teardown.
    const notes = await admin
      .from("task_notifications")
      .select("id", { count: "exact", head: true })
      .in("organization_id", orgIds);
    expect(notes.error).toBeNull();

    const errors = await cleanupFixtures(admin, scope());
    expect(errors).toEqual([]);
    const after = await countDev(admin);
    console.info("DEV post-teardown counts", JSON.stringify(after));
    expect(diffCounts(baseline, after)).toEqual({});
  }, 180_000);
});
