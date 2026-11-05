/**
 * V2-003.003 hosted-DEV verification: single-context auto resolution and the
 * no-Referer follow-up safety rule, through the REAL `loadPageData` entry path,
 * `getPrimaryLocation` and the real `runTaskCommandAction` Server Action, with
 * real Supabase Auth JWTs against real RLS.
 *
 * Synthetic organizations/users only; each run removes them afterwards.
 * Hard-aborts unless the URL is the-lineup-dev (see harness).
 */
import crypto from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runTaskCommandAction } from "@/features/tasks/actions/tasks-actions";
import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { resolveCurrentActiveContext } from "@/features/context/data/active-context";
import { parseExplicitLocationSelection } from "@/features/context/domain/active-context";
import { serializeActiveContextCookie } from "@/features/context/domain/context-cookie";
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
  cookie: null as string | null,
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
      name === "lineup_active_context" && req.cookie !== null
        ? { name, value: req.cookie }
        : undefined,
  }),
}));

// loadPageData switches to demo mode without these; the harness already proved
// the URL is the-lineup-dev (and refuses PROD).
process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = env.anonKey;
delete process.env.NEXT_PUBLIC_DEMO_MODE;

const admin = adminClient();
const runId = crypto.randomBytes(4).toString("hex");
const users: Record<string, U> = {};
const orgIds: string[] = [];
const L: Record<string, string> = {};
let orgD = "";
let orgE = "";
const slugD = `v2a-d-${runId}`; // plays the configured default tenant
const slugE = `v2a-e-${runId}`; // a non-default organization
const slugNone = `v2a-none-${runId}`; // default tenant nobody belongs to
const marker = (k: string) => `v2a-${runId}-${k}`;

async function mk(key: string): Promise<U> {
  const email = `v2a-${runId}-${key}@harness.invalid`;
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
    .insert({ id, display_name: `V2A ${key} ${runId}` });
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

function as(
  key: string,
  o: { referer?: string | null; cookie?: string | null } = {},
) {
  req.client = users[key].client;
  req.referer = o.referer ?? null;
  req.cookie = o.cookie ?? null;
}
/** The `/` entry as the app runs it (default tenant = `slug`). */
async function entry(
  key: string,
  slug = slugD,
  o: { cookie?: string | null } = {},
) {
  as(key, o);
  return loadPageData(slug, undefined, { globalEntry: true });
}
/** A `/r/<slug>[?location=]` render. */
async function route(
  key: string,
  slug: string,
  loc?: string,
  o: { cookie?: string | null } = {},
) {
  as(key, o);
  return loadPageData(
    slug,
    loc ? parseExplicitLocationSelection(loc) : undefined,
  );
}
const noData = (d: Awaited<ReturnType<typeof entry>>) => {
  expect(d.scheduleContext).toBeNull();
  expect(d.tipsContext).toBeNull();
  expect(d.allocationContext).toBeNull();
  expect(d.initialUser ?? null).toBeNull();
};

const NIL_UUID = "00000000-0000-4000-8000-000000000000";
/** The workspace a tab would be showing: a fresh render of `/r/<slug>`. */
async function shownWorkspace(
  key: string,
  slug: string,
  cookie: string | null,
) {
  as(key, { cookie });
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
  cookie: string | null = null,
) {
  const expectedContext = await shownWorkspace(key, slug, cookie);
  as(key, { referer, cookie });
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
  const keys = [
    "jerry", // one eligible location in the default tenant
    "tom", // two eligible locations in the default tenant
    "jack", // default tenant + non-default org
    "nina", // only a non-default org, one location
    "lone", // two assignments, one revoked -> single eligible
    "revMem", // org membership revoked, assignment still active
    "revAsg", // assignment revoked
    "locInactive",
    "locArchived",
    "ovOwner", // Overall Owner, no local rows
    "outsider", // no memberships at all
    "sess", // session-revocation subject
  ];
  await Promise.all(keys.map(mk));

  orgD = ok(
    await admin
      .from("organizations")
      .insert({
        name: `V2A D ${runId}`,
        slug: slugD,
        created_by: users.jerry.id,
      })
      .select("id")
      .single(),
    "orgD",
  ).id;
  orgE = ok(
    await admin
      .from("organizations")
      .insert({
        name: `V2A E ${runId}`,
        slug: slugE,
        created_by: users.nina.id,
      })
      .select("id")
      .single(),
    "orgE",
  ).id;
  orgIds.push(orgD, orgE);

  for (const [k, org, name, tz] of [
    ["D1", orgD, "Aaa", "America/New_York"],
    ["D2", orgD, "Bbb", "America/Los_Angeles"],
    ["D3", orgD, "Ccc-inactive", "America/Chicago"],
    ["D4", orgD, "Ddd-archived", "America/Chicago"],
    ["E1", orgE, "Eee", "America/Denver"],
    ["E2", orgE, "Fff-2nd", "America/Denver"],
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

  const mem = (p: string, org: string, roles: string[], active = true) => ({
    organization_id: org,
    profile_id: p,
    roles,
    active,
  });
  const GM = ["general_manager"];
  ok(
    await admin
      .from("memberships")
      .insert([
        mem(users.jerry.id, orgD, GM),
        mem(users.tom.id, orgD, GM),
        mem(users.jack.id, orgD, GM),
        mem(users.jack.id, orgE, GM),
        mem(users.nina.id, orgE, GM),
        mem(users.lone.id, orgD, GM),
        mem(users.revMem.id, orgE, GM, false),
        mem(users.revAsg.id, orgE, GM),
        mem(users.locInactive.id, orgD, GM),
        mem(users.locArchived.id, orgD, GM),
        mem(users.sess.id, orgE, GM),
      ])
      .select("id"),
    "memberships",
  );

  const asg = (p: string, loc: string, active = true) => ({
    profile_id: p,
    location_id: loc,
    role: "manager",
    active,
  });
  ok(
    await admin
      .from("location_memberships")
      .insert([
        asg(users.jerry.id, L.D1),
        asg(users.tom.id, L.D1),
        asg(users.tom.id, L.D2),
        asg(users.jack.id, L.D1),
        asg(users.jack.id, L.E1),
        asg(users.nina.id, L.E1),
        asg(users.nina.id, L.E2, false), // pre-revoked second assignment
        asg(users.lone.id, L.D1),
        asg(users.lone.id, L.D2, false),
        asg(users.revMem.id, L.E1),
        asg(users.revAsg.id, L.E1, false),
        asg(users.locInactive.id, L.D3),
        asg(users.locArchived.id, L.D4),
        asg(users.sess.id, L.E1),
      ])
      .select("id"),
    "assignments",
  );
  ok(
    await admin
      .from("locations")
      .update({ active: false })
      .eq("id", L.D3)
      .select("id"),
    "deactivate D3",
  );
  ok(
    await admin
      .from("locations")
      .update({ active: false, archived_at: new Date().toISOString() })
      .eq("id", L.D4)
      .select("id"),
    "archive D4",
  );
  ok(
    await admin
      .from("overall_roles")
      .insert([{ profile_id: users.ovOwner.id, role: "owner" }])
      .select("id"),
    "overall",
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

describe("LIVE-AUTO-01 default-tenant user", () => {
  it("Jerry: `/` renders his unique workspace in place, no redirect, no picker", async () => {
    const d = await entry("jerry");
    expect(d.contextStatus).toBe("resolved");
    expect(d.redirectTo).toBeNull();
    expect(d.activeContext).toMatchObject({
      organizationId: orgD,
      organizationSlug: slugD,
      locationId: L.D1,
      selectedBy: "sole_eligible_location",
      timeZone: "America/New_York",
    });
    expect(d.scheduleContext).not.toBeNull();
    expect(d.tipsContext).not.toBeNull();
    expect(d.allocationContext).not.toBeNull();
    // Never a location he is not assigned to.
    expect(
      JSON.stringify([d.scheduleContext, d.tipsContext, d.allocationContext]),
    ).not.toContain(L.D2);
    expect(d.availableContexts).toHaveLength(1);
  });
});

describe("LIVE-AUTO-02 non-default organization", () => {
  it("Nina: `/` redirects once to the verified canonical route; destination renders; refresh is stable", async () => {
    const d = await entry("nina");
    expect(d.redirectTo).toBe(`/r/${slugE}?location=${L.E1}`);
    noData(d);
    // E2 was pre-revoked, so E1 is the unique eligible context.
    const dest = await route("nina", slugE, L.E1);
    expect(dest.contextStatus).toBe("resolved");
    expect(dest.redirectTo).toBeNull(); // the route never redirects -> no loop
    expect(dest.activeContext).toMatchObject({
      organizationId: orgE,
      locationId: L.E1,
    });
    // Refresh x3 on the destination: identical, never a redirect.
    for (let i = 0; i < 3; i++) {
      const again = await route("nina", slugE, L.E1);
      expect(again.redirectTo).toBeNull();
      expect(again.activeContext?.locationId).toBe(L.E1);
    }
    // Also the bare route (no ?location=) resolves directly, no redirect.
    const bare = await route("nina", slugE);
    expect(bare.contextStatus).toBe("resolved");
    expect(bare.redirectTo).toBeNull();
  });
});

describe("LIVE-AUTO-03 multiple locations", () => {
  it("Tom: no first-created fallback; explicit selection works", async () => {
    const d = await entry("tom");
    expect(d.contextStatus).toBe("selection_required");
    expect(d.redirectTo).toBeNull();
    noData(d);
    const bare = await route("tom", slugD);
    expect(bare.contextStatus).toBe("selection_required");
    noData(bare);
    for (const loc of [L.D1, L.D2]) {
      const sel = await route("tom", slugD, loc);
      expect(sel.contextStatus).toBe("resolved");
      expect(sel.activeContext?.locationId).toBe(loc);
      expect(sel.redirectTo).toBeNull();
    }
  });
});

describe("LIVE-AUTO-04 multiple organizations", () => {
  it("Jack: `/` never picks a tenant for him arbitrarily", async () => {
    // Default tenant he cannot use -> global resolution is ambiguous (D1 + E1).
    const none = await entry("jack", slugNone);
    expect(none.redirectTo).toBeNull();
    expect(none.contextStatus).not.toBe("resolved");
    noData(none);
    // Default tenant he can use renders in place (explicit route contract).
    const inD = await entry("jack", slugD);
    expect(inD.redirectTo).toBeNull();
    expect(inD.activeContext?.organizationId).toBe(orgD);
  });
  it("Jack: routes load only that organization's data", async () => {
    const e = await route("jack", slugE);
    expect(e.activeContext).toMatchObject({
      organizationId: orgE,
      locationId: L.E1,
    });
    const s = JSON.stringify([
      e.scheduleContext,
      e.tipsContext,
      e.allocationContext,
    ]);
    expect(s).not.toContain(orgD);
    expect(s).not.toContain(L.D1);
  });
  it("Jack: foreign explicit location for the route org is rejected, not substituted", async () => {
    const d = await route("jack", slugE, L.D1);
    expect(d.contextStatus).not.toBe("resolved");
    noData(d);
  });
});

describe("LIVE-AUTO-05 inactive and revoked access", () => {
  it("revoked org membership, revoked assignment, inactive and archived locations are denied", async () => {
    for (const k of ["revMem", "revAsg"]) {
      const d = await entry(k, slugNone);
      expect(d.redirectTo, k).toBeNull();
      expect(d.contextStatus, k).not.toBe("resolved");
      noData(d);
      const r = await route(k, slugE);
      expect(r.contextStatus, k).not.toBe("resolved");
      noData(r);
    }
    for (const k of ["locInactive", "locArchived"]) {
      const d = await entry(k);
      expect(d.contextStatus, k).not.toBe("resolved");
      expect(d.redirectTo, k).toBeNull();
      noData(d);
    }
  });
  it("revocation takes effect on the very next request (no cached authorization)", async () => {
    const before = await entry("nina");
    expect(before.redirectTo).toBe(`/r/${slugE}?location=${L.E1}`);
    ok(
      await admin
        .from("location_memberships")
        .update({ active: false })
        .eq("profile_id", users.nina.id)
        .eq("location_id", L.E1)
        .select("id"),
      "revoke nina E1",
    );
    const after = await entry("nina");
    expect(after.redirectTo).toBeNull();
    expect(after.contextStatus).not.toBe("resolved");
    noData(after);
    const r = await route("nina", slugE, L.E1);
    expect(r.contextStatus).not.toBe("resolved");
    noData(r);
    // restore for later assertions
    ok(
      await admin
        .from("location_memberships")
        .update({ active: true })
        .eq("profile_id", users.nina.id)
        .eq("location_id", L.E1)
        .select("id"),
      "restore",
    );
    const back = await entry("nina");
    expect(back.redirectTo).toBe(`/r/${slugE}?location=${L.E1}`);
  });
  it("revoked/expired session: next request is unauthenticated, no redirect, no data", async () => {
    const before = await entry("sess", slugNone);
    expect(before.redirectTo).toBe(`/r/${slugE}?location=${L.E1}`);
    const token = (await users.sess.client.auth.getSession()).data.session!
      .access_token;
    const out = await admin.auth.admin.signOut(token, "global");
    expect(out.error).toBeNull();
    const after = await entry("sess", slugNone);
    expect(after.contextStatus).not.toBe("resolved");
    expect(after.redirectTo).toBeNull();
    noData(after);
    const r = await route("sess", slugE, L.E1);
    expect(r.contextStatus).not.toBe("resolved");
    noData(r);
  });
  it("anonymous request has no workspace and no redirect", async () => {
    req.client = createClient<Database>(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    req.referer = null;
    req.cookie = null;
    const d = await loadPageData(slugD, undefined, { globalEntry: true });
    expect(d.contextStatus).toBe("unauthenticated");
    expect(d.redirectTo).toBeNull();
    noData(d);
  });
});

describe("LIVE-AUTO-06 invalid preferences", () => {
  it("malformed cookie is rejected, never replaced by auto-selection (also on `/`)", async () => {
    for (const slug of [slugD, slugNone]) {
      const d = await entry("jerry", slug, { cookie: "%%not-a-cookie%%" });
      expect(d.contextStatus).toBe("invalid_context");
      expect(d.redirectTo).toBeNull();
      noData(d);
    }
    const n = await entry("nina", slugNone, { cookie: "{broken" });
    expect(n.contextStatus).toBe("invalid_context");
    expect(n.redirectTo).toBeNull();
  });
  it("stale cookie (deleted org / unauthorized location) does not redirect or load data", async () => {
    const ghost = serializeActiveContextCookie({
      organizationId: crypto.randomUUID(),
      locationId: crypto.randomUUID(),
    });
    const unauthorized = serializeActiveContextCookie({
      organizationId: orgD,
      locationId: L.D2,
    }); // jerry not on D2
    for (const c of [ghost, unauthorized]) {
      const d = await entry("jerry", slugNone, { cookie: c });
      expect(d.redirectTo).toBeNull();
      expect(d.contextStatus).not.toBe("resolved");
      noData(d);
    }
    const n = await entry("nina", slugNone, { cookie: ghost });
    expect(n.redirectTo).toBeNull();
    expect(n.contextStatus).not.toBe("resolved");
  });
  it("unauthorized explicit location and unknown org slug fail closed", async () => {
    const a = await route("jerry", slugD, L.D2);
    expect(a.contextStatus).toBe("invalid_context");
    noData(a);
    const b = await route("jerry", slugD, "not-a-uuid");
    expect(b.contextStatus).toBe("invalid_context");
    const c = await route("jerry", `nope-${runId}`);
    expect(c.contextStatus).not.toBe("resolved");
    noData(c);
  });
  it("conflicting route vs cookie: route wins only where authorized, never a cross-tenant leak", async () => {
    const cookieE = serializeActiveContextCookie({
      organizationId: orgE,
      locationId: L.E1,
    });
    const d = await route("jack", slugD, undefined, { cookie: cookieE });
    // Jack is authorized for both; the route org must govern the result.
    if (d.contextStatus === "resolved") {
      expect(d.activeContext?.organizationId).toBe(orgD);
    }
    const j = await route("jerry", slugD, undefined, { cookie: cookieE }); // jerry NOT in E
    expect(j.activeContext?.organizationId ?? orgD).toBe(orgD);
    expect(JSON.stringify(j)).not.toContain(L.E1);
  });
});

describe("LIVE-AUTO-07 Overall roles", () => {
  it("Overall Owner without local rows: no arbitrary context pick", async () => {
    const d = await entry("ovOwner", slugNone);
    // Many organizations exist on DEV, so the global resolution is ambiguous.
    expect(d.redirectTo).toBeNull();
    expect(d.contextStatus).not.toBe("resolved");
    noData(d);
  });
  it("Outsider with no memberships gets nothing", async () => {
    const d = await entry("outsider");
    expect(d.redirectTo).toBeNull();
    noData(d);
  });
});

describe("NOREF no-Referer safety through the real Server Action", () => {
  it("A: one eligible location, no Referer -> resolves it and writes there", async () => {
    // lone: D1 active, D2 revoked -> exactly one eligible
    req.client = users.lone.client;
    expect(await getPrimaryLocation(orgD)).toMatchObject({ id: L.D1 });
    const t = marker("A");
    const r = await createTask("lone", slugD, t, null);
    expect(r.ok).toBe(true);
    const rows = await taskRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ location_id: L.D1, organization_id: orgD });
  });
  it("B: two eligible locations, no Referer -> refuses, no write", async () => {
    req.client = users.tom.client;
    expect(await getPrimaryLocation(orgD)).toBeNull();
    const t = marker("B");
    const r = await createTask("tom", slugD, t, null);
    expect(r.ok).toBe(false);
    expect(await taskRows(t)).toHaveLength(0);
  });
  it("C: revoking the remaining assignment is honoured on the next no-Referer call", async () => {
    const t = marker("C");
    ok(
      await admin
        .from("location_memberships")
        .update({ active: false })
        .eq("profile_id", users.lone.id)
        .eq("location_id", L.D1)
        .select("id"),
      "revoke lone D1",
    );
    req.client = users.lone.client;
    expect(await getPrimaryLocation(orgD)).toBeNull();
    const r = await createTask("lone", slugD, t, null);
    expect(r.ok).toBe(false);
    expect(await taskRows(t)).toHaveLength(0);
    // Re-grant D2 only (previously revoked) while D1 stays revoked: now D2 is the one.
    ok(
      await admin
        .from("location_memberships")
        .update({ active: true })
        .eq("profile_id", users.lone.id)
        .eq("location_id", L.D2)
        .select("id"),
      "grant lone D2",
    );
    req.client = users.lone.client;
    expect(await getPrimaryLocation(orgD)).toMatchObject({ id: L.D2 });
  });
  it("D: malformed / unauthorized explicit Referer selection fails closed, no substitute", async () => {
    // jerry has exactly one eligible location (D1); a bad explicit choice must NOT fall back to it.
    for (const [i, ref] of [
      [1, `https://app.test/r/${slugD}?location=not-a-uuid`],
      [2, `https://app.test/r/${slugD}?location=${L.D2}`], // unauthorized
      [3, `https://app.test/r/${slugD}?location=${L.E1}`], // other org's location
      [4, `https://app.test/r/${slugD}?location=${L.D1}&location=${L.D2}`], // repeated
    ] as const) {
      req.client = users.jerry.client;
      req.referer = ref;
      expect(await getPrimaryLocation(orgD), ref).toBeNull();
      req.referer = null;
      const t = marker(`D${i}`);
      const r = await createTask("jerry", slugD, t, ref);
      expect(r.ok, ref).toBe(false);
      expect(await taskRows(t), ref).toHaveLength(0);
    }
    // V2-003.004: the Referer never SELECTS a location. tom (two locations)
    // with a valid explicit Referer but no persisted context is ambiguous.
    const tNoCookie = marker("Dnc");
    const rNoCookie = await createTask(
      "tom",
      slugD,
      tNoCookie,
      `https://app.test/r/${slugD}?location=${L.D2}`,
    );
    expect(rNoCookie.ok).toBe(false);
    expect(await taskRows(tNoCookie)).toHaveLength(0);
    // With the persisted (verified) context the action runs in exactly D2,
    // with or without a matching Referer.
    const persisted = serializeActiveContextCookie({
      organizationId: orgD,
      locationId: L.D2,
    });
    const t = marker("Dok");
    const r = await createTask("tom", slugD, t, null, persisted);
    expect(r.ok).toBe(true);
    expect((await taskRows(t))[0]).toMatchObject({ location_id: L.D2 });
    // A Referer naming a DIFFERENT location than the persisted one fails closed.
    const tMismatch = marker("Dmm");
    const rMismatch = await createTask(
      "tom",
      slugD,
      tMismatch,
      `https://app.test/r/${slugD}?location=${L.D1}`,
      persisted,
    );
    expect(rMismatch.ok).toBe(false);
    expect(await taskRows(tMismatch)).toHaveLength(0);
    // Cross-origin Referer is ignored -> tom (ambiguous, no cookie) still denied.
    const t2 = marker("Dx");
    const r2 = await createTask(
      "tom",
      slugD,
      t2,
      `https://evil.test/r/${slugD}?location=${L.D2}`,
    );
    expect(r2.ok).toBe(false);
    expect(await taskRows(t2)).toHaveLength(0);
  });
  it("E: client-claimed foreign organization cannot redirect an action into another tenant", async () => {
    // jerry (orgD only) claims orgE's slug and a Referer pointing at orgE/E1.
    req.client = users.jerry.client;
    expect(await getPrimaryLocation(orgE)).toBeNull();
    const t = marker("E1");
    const r = await createTask(
      "jerry",
      slugE,
      t,
      `https://app.test/r/${slugE}?location=${L.E1}`,
    );
    expect(r.ok).toBe(false);
    expect(await taskRows(t)).toHaveLength(0);
    // jack (both orgs) with a Referer for orgE cannot write into orgD, nor vice versa.
    const t2 = marker("E2");
    const r2 = await createTask(
      "jack",
      slugD,
      t2,
      `https://app.test/r/${slugE}?location=${L.E1}`,
    );
    expect(r2.ok).toBe(false);
    expect(await taskRows(t2)).toHaveLength(0);
    // And no stray rows anywhere for this run beyond the intended A / Dok ones.
    const all = await admin
      .from("tasks")
      .select("title")
      .in("organization_id", orgIds);
    expect((all.data ?? []).map((x) => x.title).sort()).toEqual(
      [marker("A"), marker("Dok")].sort(),
    );
  });
});

describe("resolver sanity", () => {
  it("explicit valid selection returns the same pair the entry path would", async () => {
    req.client = users.tom.client;
    req.cookie = null;
    const r = await resolveCurrentActiveContext({
      routeSlug: slugD,
      cookieValue: null,
      explicitSelection: parseExplicitLocationSelection(L.D2),
    });
    expect(r.status).toBe("resolved");
  });
});
