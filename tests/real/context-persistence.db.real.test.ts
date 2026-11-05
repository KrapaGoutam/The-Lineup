/**
 * V2-003.004 hosted-DEV verification (checklist A–G of the feature prompt):
 * secure context persistence through the REAL Server Actions
 * (`setActiveContextAction`, `clearActiveContextAction`, the sign-out route),
 * the REAL `getPrimaryLocation`, `loadPageData` and the real
 * `runTaskCommandAction` write path, with real Supabase Auth JWTs against real
 * RLS. Only Next's request scope (cookie jar + headers) and the per-user
 * client injection are doubled; the cookie jar is a faithful set/get/expire
 * store so the persistence round trip is exercised end to end.
 *
 * Synthetic organizations/users only; removed afterwards. Hard-aborts unless
 * the URL is the-lineup-dev (see harness). NOT run in Cloud (no credentials).
 */
import crypto from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { POST as signOutRoute } from "@/app/api/auth/signout/route";
import {
  clearActiveContextAction,
  setActiveContextAction,
} from "@/features/context/actions/context-actions";
import { parseExplicitLocationSelection } from "@/features/context/domain/active-context";
import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { runTaskCommandAction } from "@/features/tasks/actions/tasks-actions";
import { loadPageData } from "@/lib/page-data";
import type { Database } from "@/types/database.generated";

import { adminClient, env } from "./support/harness";

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
  sets: [] as Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }>,
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
      req.sets.push({ name, value, options });
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
const slugP = `v2p-p-${runId}`;
const slugQ = `v2p-q-${runId}`;
const marker = (k: string) => `v2p-${runId}-${k}`;

async function mk(key: string): Promise<U> {
  const email = `v2p-${runId}-${key}@harness.invalid`;
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
    .insert({ id, display_name: `V2P ${key} ${runId}` });
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

/** A new browser request as `key` (cookie jar persists across calls). */
function as(key: string, referer: string | null = null) {
  req.client = users[key].client;
  req.referer = referer;
}
const cookieOf = () => req.jar.get(COOKIE) ?? null;
const resetBrowser = () => {
  req.jar = new Map();
  req.sets = [];
  req.referer = null;
};

const NIL_UUID = "00000000-0000-4000-8000-000000000000";
/**
 * What a browser tab would be SHOWING for this user right now: the workspace a
 * fresh server render resolves (V2-003.005 sends it with every Tasks action).
 * Where nothing resolves the tab asserts an impossible location, so the action
 * must still be refused.
 */
async function shownWorkspace(
  key: string,
  slug: string,
  referer: string | null,
) {
  as(key, referer);
  const page = await loadPageData(slug);
  return page.contextStatus === "resolved" && page.activeContext
    ? {
        profileId: users[key].id,
        organizationId: page.activeContext.organizationId,
        locationId: page.activeContext.locationId,
      }
    : {
        profileId: users[key].id,
        organizationId: NIL_UUID,
        locationId: NIL_UUID,
      };
}

async function createTask(
  key: string,
  slug: string,
  title: string,
  referer: string | null,
) {
  const expectedContext = await shownWorkspace(key, slug, referer);
  as(key, referer);
  return runTaskCommandAction({
    expectedContext,
    restaurantSlug: slug,
    command: {
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
    },
  });
}
async function taskRows(title: string) {
  const r = await admin
    .from("tasks")
    .select("id, location_id, organization_id")
    .eq("title", title);
  return r.data ?? [];
}

beforeAll(async () => {
  await Promise.all(["multi", "coworker", "revoked", "outsider"].map(mk));
  orgP = ok(
    await admin
      .from("organizations")
      .insert({
        name: `V2P P ${runId}`,
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
        name: `V2P Q ${runId}`,
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
  const GM = ["general_manager"];
  const mem = (p: string, org: string) => ({
    organization_id: org,
    profile_id: p,
    roles: GM,
    active: true,
  });
  ok(
    await admin
      .from("memberships")
      .insert([
        mem(users.multi.id, orgP),
        mem(users.multi.id, orgQ),
        mem(users.coworker.id, orgP),
        mem(users.revoked.id, orgP),
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
        asg(users.coworker.id, L.P1),
        asg(users.coworker.id, L.P2),
        asg(users.revoked.id, L.P2),
      ])
      .select("id"),
    "assignments",
  );
  await Promise.all(Object.values(users).map(signIn));
}, 180_000);

afterAll(async () => {
  const ids = Object.values(users).map((u) => u.id);
  // Tasks hold FKs to memberships and append-only events: remove top-down first.
  await admin.from("tasks").delete().in("organization_id", orgIds);
  await admin.from("location_memberships").delete().in("profile_id", ids);
  await admin.from("overall_roles").delete().in("profile_id", ids);
  await admin.from("memberships").delete().in("organization_id", orgIds);
  await admin.from("locations").delete().in("organization_id", orgIds);
  await admin.from("organizations").delete().in("id", orgIds);
  await admin.from("profiles").delete().in("id", ids);
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id);
}, 180_000);

describe("LIVE-PERSIST-A persistence", () => {
  it("a valid selection of Location B is persisted by the server and survives reloads", async () => {
    resetBrowser();
    as("multi");
    const result = await setActiveContextAction({
      organizationId: orgP,
      locationId: L.P2,
    });
    expect(result).toMatchObject({
      ok: true,
      destination: `/r/${slugP}?location=${L.P2}`,
    });
    expect(JSON.parse(cookieOf()!)).toEqual({ v: 1, o: orgP, l: L.P2 });
    expect(req.sets[0].options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 604800,
    });
    // "reload" / "new navigation": the page resolves from the cookie alone.
    for (let i = 0; i < 2; i += 1) {
      as("multi");
      const page = await loadPageData(slugP);
      expect(page.contextStatus).toBe("resolved");
      expect(page.activeContext).toMatchObject({
        locationId: L.P2,
        selectedBy: "cookie_preference",
      });
      expect(page.contextReconcile).toBeNull();
    }
  });
});

describe("LIVE-PERSIST-B no-Referer write", () => {
  it("the Server Action with NO Referer writes only the persisted location in the database", async () => {
    resetBrowser();
    as("multi");
    await setActiveContextAction({ organizationId: orgP, locationId: L.P2 });
    const title = marker("B");
    const r = await createTask("multi", slugP, title, null);
    expect(r.ok).toBe(true);
    const rows = await taskRows(title);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ location_id: L.P2, organization_id: orgP });
    // with no persisted context a multi-location user is ambiguous → denied
    req.jar.delete(COOKIE);
    const t2 = marker("B-none");
    expect((await createTask("multi", slugP, t2, null)).ok).toBe(false);
    expect(await taskRows(t2)).toHaveLength(0);
  });
});

describe("LIVE-PERSIST-C invalid / unauthorized selection", () => {
  it("never persists an unauthorized pair, and a stale cookie performs no operation and no write", async () => {
    resetBrowser();
    as("revoked"); // assigned only to P2
    expect(
      await setActiveContextAction({ organizationId: orgP, locationId: L.P1 }),
    ).toMatchObject({ ok: false });
    expect(req.sets).toHaveLength(0);
    as("outsider");
    expect(
      await setActiveContextAction({ organizationId: orgP, locationId: L.P2 }),
    ).toMatchObject({ ok: false });
    expect(
      await setActiveContextAction({ organizationId: orgP, locationId: L.Q1 }),
    ).toMatchObject({ ok: false }); // location of another organization
    expect(req.sets).toHaveLength(0);
    // forged/stale cookie
    req.jar.set(COOKIE, JSON.stringify({ v: 1, o: orgP, l: L.P1 }));
    const title = marker("C");
    expect((await createTask("revoked", slugP, title, null)).ok).toBe(false);
    expect(await taskRows(title)).toHaveLength(0);
    as("revoked");
    const page = await loadPageData(slugP);
    expect(page.contextStatus).toBe("invalid_context");
    expect(page.scheduleContext).toBeNull();
  });
});

describe("LIVE-PERSIST-D cross-organization", () => {
  it("the cookie changes only after a verified switch and actions follow the new organization", async () => {
    resetBrowser();
    as("multi");
    await setActiveContextAction({ organizationId: orgP, locationId: L.P1 });
    const before = cookieOf();
    // an unauthorized switch does not touch the cookie
    as("revoked");
    await setActiveContextAction({ organizationId: orgQ, locationId: L.Q1 });
    expect(cookieOf()).toBe(before);
    // Organization A cookie cannot drive an Organization B action
    const t1 = marker("D-cross");
    expect((await createTask("multi", slugQ, t1, null)).ok).toBe(false);
    expect(await taskRows(t1)).toHaveLength(0);
    // verified switch to organization B
    as("multi");
    expect(
      await setActiveContextAction({ organizationId: orgQ, locationId: L.Q1 }),
    ).toMatchObject({ ok: true });
    const t2 = marker("D-ok");
    expect((await createTask("multi", slugQ, t2, null)).ok).toBe(true);
    expect((await taskRows(t2))[0]).toMatchObject({
      location_id: L.Q1,
      organization_id: orgQ,
    });
    // and organization A is no longer operable without a new selection
    const t3 = marker("D-back");
    expect((await createTask("multi", slugP, t3, null)).ok).toBe(false);
    expect(await taskRows(t3)).toHaveLength(0);
  });
});

describe("LIVE-PERSIST-E revocation", () => {
  it("revoking the assignment fails the very next request (no cached access)", async () => {
    resetBrowser();
    as("coworker");
    await setActiveContextAction({ organizationId: orgP, locationId: L.P2 });
    const t1 = marker("E-before");
    expect((await createTask("coworker", slugP, t1, null)).ok).toBe(true);
    ok(
      await admin
        .from("location_memberships")
        .update({ active: false })
        .eq("profile_id", users.coworker.id)
        .eq("location_id", L.P2)
        .select("id"),
      "revoke",
    );
    const t2 = marker("E-after");
    expect((await createTask("coworker", slugP, t2, null)).ok).toBe(false);
    expect(await taskRows(t2)).toHaveLength(0);
    as("coworker");
    expect(await getPrimaryLocation(orgP)).toBeNull();
    expect((await loadPageData(slugP)).contextStatus).toBe("invalid_context");
    // an explicit new authorized selection replaces the invalid preference
    expect(
      await setActiveContextAction({ organizationId: orgP, locationId: L.P1 }),
    ).toMatchObject({ ok: true });
    as("coworker");
    expect(await getPrimaryLocation(orgP)).toMatchObject({ id: L.P1 });
    // Restore the assignment so later tests keep the documented fixture
    // (coworker is eligible for both P1 and P2).
    ok(
      await admin
        .from("location_memberships")
        .update({ active: true })
        .eq("profile_id", users.coworker.id)
        .eq("location_id", L.P2)
        .select("id"),
      "restore",
    );
  });
});

describe("LIVE-PERSIST-F sign-out / shared device", () => {
  it("sign-out clears the cookie; the next employee does not inherit it", async () => {
    resetBrowser();
    as("multi");
    await setActiveContextAction({ organizationId: orgP, locationId: L.P1 });
    expect(cookieOf()).not.toBeNull();
    as("multi");
    const res = await signOutRoute();
    expect(res.status).toBe(200);
    expect(cookieOf()).toBeNull();
    // The real sign-out ended the real Auth session (global scope), so the
    // saved workspace cannot be used by anyone holding the old token either.
    expect((await users.multi.client.auth.getUser()).data.user).toBeNull();
    // coworker is also authorized for P1 + P2: fresh sign-in → selection required
    as("coworker");
    const page = await loadPageData(slugP);
    expect(page.contextStatus).toBe("selection_required");
    expect(page.scheduleContext).toBeNull();
    expect(await getPrimaryLocation(orgP)).toBeNull();
    // clearing never selects an arbitrary location
    expect(await clearActiveContextAction()).toEqual({ ok: true });
    // The sign-out above genuinely revoked `multi`'s Auth session; sign in
    // again so the following tests start from a valid session.
    await signIn(users.multi);
  });
});

describe("LIVE-PERSIST-G deep-link mismatch", () => {
  it("a B-looking workspace cannot execute A operations; reconciliation persists B first", async () => {
    resetBrowser();
    as("multi");
    await setActiveContextAction({ organizationId: orgP, locationId: L.P1 }); // cookie = A
    // direct link to B: page renders B but flags reconciliation
    as("multi");
    const page = await loadPageData(
      slugP,
      parseExplicitLocationSelection(L.P2),
    );
    expect(page.activeContext).toMatchObject({
      locationId: L.P2,
      selectedBy: "explicit_selection",
    });
    expect(page.contextReconcile).toEqual({
      organizationId: orgP,
      organizationSlug: slugP,
      locationId: L.P2,
    });
    // un-reconciled B URL → the action is refused, nothing is written (A or B)
    const t1 = marker("G-mismatch");
    expect(
      (
        await createTask(
          "multi",
          slugP,
          t1,
          `https://app.test/r/${slugP}?location=${L.P2}`,
        )
      ).ok,
    ).toBe(false);
    expect(await taskRows(t1)).toHaveLength(0);
    // the gate's verified reconciliation → B persisted → action runs in B only
    as("multi");
    expect(
      await setActiveContextAction({ organizationId: orgP, locationId: L.P2 }),
    ).toMatchObject({ ok: true });
    const t2 = marker("G-ok");
    expect(
      (
        await createTask(
          "multi",
          slugP,
          t2,
          `https://app.test/r/${slugP}?location=${L.P2}`,
        )
      ).ok,
    ).toBe(true);
    expect((await taskRows(t2))[0]).toMatchObject({ location_id: L.P2 });
    // and a stale back-button entry for A is now refused
    const t3 = marker("G-stale-A");
    expect(
      (
        await createTask(
          "multi",
          slugP,
          t3,
          `https://app.test/r/${slugP}?location=${L.P1}`,
        )
      ).ok,
    ).toBe(false);
    expect(await taskRows(t3)).toHaveLength(0);
  });
});
