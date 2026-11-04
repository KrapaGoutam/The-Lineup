/**
 * V2-003.001 hosted-DEV verification: the REAL `resolveCurrentActiveContext`
 * loader driven by real Supabase Auth JWTs against real RLS/PostgREST.
 *
 * Every run creates its own synthetic organizations/users and removes them
 * afterwards (hard-aborts unless the URL is the-lineup-dev; see harness).
 */
import crypto from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrimaryLocation } from "@/features/locations/data/primary-location";
import { resolveCurrentActiveContext } from "@/features/context/data/active-context";
import { serializeActiveContextCookie } from "@/features/context/domain/context-cookie";
import type { Database } from "@/types/database.generated";

import { adminClient, env } from "./support/harness";

type U = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient<Database>;
};

const asUser = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => asUser.client,
}));

const admin = adminClient();
const runId = crypto.randomBytes(4).toString("hex");
const users: Record<string, U> = {};
const orgIds: string[] = [];
const L: Record<string, string> = {};
let orgX = "";
let orgY = "";
const slugX = `v2c-${runId}`;
const slugY = `v2cy-${runId}`;

async function mk(key: string): Promise<U> {
  const email = `v2c-${runId}-${key}@harness.invalid`;
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
    .insert({ id, display_name: `V2C ${key} ${runId}` });
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
// Untyped on purpose (as in the shared harness): fixture helpers only read ids.
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
const resolve = (
  key: string,
  o: { slug?: string | null; cookie?: string | null } = {},
) =>
  resolveCurrentActiveContext({
    client: users[key].client,
    routeSlug: o.slug === undefined ? slugX : o.slug,
    cookieValue: o.cookie === undefined ? null : o.cookie,
  });
const cookie = (org: string, loc: string) =>
  serializeActiveContextCookie({ organizationId: org, locationId: loc });

beforeAll(async () => {
  const keys = [
    "ovOwner",
    "ovMgr",
    "ovAsst",
    "single",
    "multi",
    "orgInactive",
    "assignInactive",
    "locInactive",
    "locArchived",
    "orgOwnerNoAssign",
    "cross",
    "creator",
    "lowStaffMgr",
    "orgMgrB",
  ];
  await Promise.all(keys.map(mk));
  const creator = users.creator;

  orgX = ok(
    await admin
      .from("organizations")
      .insert({ name: `V2C X ${runId}`, slug: slugX, created_by: creator.id })
      .select("id")
      .single(),
    "orgX",
  ).id;
  orgY = ok(
    await admin
      .from("organizations")
      .insert({
        name: `V2C Y ${runId}`,
        slug: slugY,
        created_by: users.cross.id,
      })
      .select("id")
      .single(),
    "orgY",
  ).id;
  orgIds.push(orgX, orgY);

  // Sequential inserts so created_at is strictly ordered: A is the OLDEST.
  for (const [k, name] of [
    ["A", "Aaa"],
    ["B", "Bbb"],
    ["C", "Ccc-inactive"],
    ["D", "Ddd-archived"],
  ] as const) {
    L[k] = ok(
      await admin
        .from("locations")
        .insert({
          organization_id: orgX,
          name: `${name} ${runId}`,
          time_zone: "America/Chicago",
        })
        .select("id")
        .single(),
      `loc ${k}`,
    ).id;
  }
  L.Y = ok(
    await admin
      .from("locations")
      .insert({
        organization_id: orgY,
        name: `Yyy ${runId}`,
        time_zone: "America/Chicago",
      })
      .select("id")
      .single(),
    "loc Y",
  ).id;
  const orgZ = ok(
    await admin
      .from("organizations")
      .insert({
        name: `V2C Z ${runId}`,
        slug: `v2cz-${runId}`,
        created_by: users.creator.id,
      })
      .select("id")
      .single(),
    "orgZ",
  ).id;
  orgIds.push(orgZ);
  for (const [k, name] of [
    ["Z1", "Z-oldest"],
    ["Z2", "Z-second"],
  ] as const) {
    L[k] = ok(
      await admin
        .from("locations")
        .insert({
          organization_id: orgZ,
          name: `${name} ${runId}`,
          time_zone: "America/Chicago",
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
  ok(
    await admin
      .from("memberships")
      .insert([
        mem(users.single.id, orgX, ["server"]),
        mem(users.multi.id, orgX, ["server"]),
        mem(users.orgInactive.id, orgX, ["server"], false),
        mem(users.assignInactive.id, orgX, ["server"]),
        mem(users.locInactive.id, orgX, ["server"]),
        mem(users.locArchived.id, orgX, ["server"]),
        mem(users.orgOwnerNoAssign.id, orgX, ["owner"]),
        mem(users.cross.id, orgX, ["server"]),
        mem(users.cross.id, orgY, ["server"]),
        mem(users.creator.id, orgX, ["owner"], false), // revoked creator
        mem(users.lowStaffMgr.id, orgX, ["server"]),
        mem(users.orgMgrB.id, orgX, ["general_manager"]),
        mem(users.orgMgrB.id, orgZ, ["general_manager"]),
      ])
      .select("id"),
    "memberships",
  );

  const asg = (p: string, loc: string, role = "staff", active = true) => ({
    profile_id: p,
    location_id: loc,
    role,
    active,
  });
  ok(
    await admin
      .from("location_memberships")
      .insert([
        asg(users.single.id, L.B),
        asg(users.multi.id, L.A),
        asg(users.multi.id, L.B),
        asg(users.orgInactive.id, L.A),
        asg(users.assignInactive.id, L.A, "staff", false),
        asg(users.locInactive.id, L.C),
        asg(users.locArchived.id, L.D),
        asg(users.cross.id, L.A),
        asg(users.cross.id, L.Y),
        asg(users.lowStaffMgr.id, L.B, "manager"),
        asg(users.orgMgrB.id, L.B, "manager"),
        asg(users.orgMgrB.id, L.Z2, "manager"),
      ])
      .select("id"),
    "assignments",
  );

  ok(
    await admin
      .from("locations")
      .update({ active: false })
      .eq("id", L.Z1)
      .select("id"),
    "deactivate Z1",
  );
  // Deactivate AFTER assigning (a trigger forbids assigning to inactive
  // locations). Lifecycle triggers may also deactivate the assignment rows;
  // the resolver must deny either way.
  ok(
    await admin
      .from("locations")
      .update({ active: false })
      .eq("id", L.C)
      .select("id"),
    "deactivate C",
  );
  ok(
    await admin
      .from("locations")
      .update({ active: false, archived_at: new Date().toISOString() })
      .eq("id", L.D)
      .select("id"),
    "archive D",
  );

  ok(
    await admin
      .from("overall_roles")
      .insert([
        { profile_id: users.ovOwner.id, role: "owner" },
        { profile_id: users.ovMgr.id, role: "manager" },
        { profile_id: users.ovAsst.id, role: "assistant_manager" },
      ])
      .select("id"),
    "overall roles",
  );

  await Promise.all(Object.values(users).map(signIn));
}, 180_000);

afterAll(async () => {
  await admin
    .from("location_memberships")
    .delete()
    .in(
      "profile_id",
      Object.values(users).map((u) => u.id),
    );
  await admin
    .from("overall_roles")
    .delete()
    .in(
      "profile_id",
      Object.values(users).map((u) => u.id),
    );
  await admin.from("organizations").delete().in("id", orgIds);
  await admin.from("memberships").delete().in("organization_id", orgIds);
  await admin.from("locations").delete().in("organization_id", orgIds);
  await admin.from("organizations").delete().in("id", orgIds);
  await admin
    .from("profiles")
    .delete()
    .in(
      "id",
      Object.values(users).map((u) => u.id),
    );
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id);
}, 180_000);

describe("V2-003.001 hosted DEV — real JWT + RLS", () => {
  it("1 Overall Owner without membership resolves (needs selection among A,B)", async () => {
    const r = await resolve("ovOwner");
    // Org X has two eligible locations (A,B): selection_required, authorized scope.
    expect(r.status).toBe("selection_required");
    const withCookie = await resolve("ovOwner", { cookie: cookie(orgX, L.B) });
    expect(withCookie.status).toBe("resolved");
    if (withCookie.status === "resolved") {
      expect(withCookie.context.locationId).toBe(L.B);
      expect(withCookie.context.access.allowed).toBe(true);
    }
  });

  it("2/3 Overall Manager and Assistant resolve with tiered capabilities", async () => {
    const m = await resolve("ovMgr", { cookie: cookie(orgX, L.A) });
    const a = await resolve("ovAsst", { cookie: cookie(orgX, L.A) });
    expect(m.status).toBe("resolved");
    expect(a.status).toBe("resolved");
    if (m.status === "resolved" && a.status === "resolved") {
      const mc = JSON.stringify(m.context.access);
      const ac = JSON.stringify(a.context.access);
      console.log("overall manager access:", mc);
      console.log("overall assistant access:", ac);
      expect(mc).not.toBe(ac);
    }
  });

  it("4 single-location staff resolves (B, though A is oldest)", async () => {
    const r = await resolve("single");
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.context.locationId).toBe(L.B);
  });

  it("5/6 multi-location staff: selection_required, valid cookie resolves", async () => {
    expect((await resolve("multi")).status).toBe("selection_required");
    const r = await resolve("multi", { cookie: cookie(orgX, L.B) });
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.context.locationId).toBe(L.B);
  });

  it("7 cross-organization cookie vs route is rejected even if authorized in both", async () => {
    const r = await resolve("cross", { cookie: cookie(orgY, L.Y) });
    expect(r.status).toBe("invalid_context");
    const ok2 = await resolve("cross", {
      slug: slugY,
      cookie: cookie(orgY, L.Y),
    });
    expect(ok2.status).toBe("resolved");
    // cookie naming another org's location under this org's route
    const r3 = await resolve("single", { cookie: cookie(orgX, L.Y) });
    expect(r3.status).toBe("invalid_context");
  });

  it("8-11 inactive membership / assignment / location / archived / revoked creator denied", async () => {
    for (const k of [
      "orgInactive",
      "assignInactive",
      "locInactive",
      "locArchived",
      "creator",
    ]) {
      const r = await resolve(k);
      console.log(k, "->", r.status);
      expect(["no_access", "invalid_context"]).toContain(r.status);
    }
    expect(["no_access", "invalid_context"]).toContain(
      (await resolve("locInactive", { cookie: cookie(orgX, L.C) })).status,
    );
    expect(["no_access", "invalid_context"]).toContain(
      (await resolve("locArchived", { cookie: cookie(orgX, L.D) })).status,
    );
    // User with only a healthy A+B must not be offered C/D via cookie
    expect((await resolve("multi", { cookie: cookie(orgX, L.C) })).status).toBe(
      "invalid_context",
    );
    expect((await resolve("multi", { cookie: cookie(orgX, L.D) })).status).toBe(
      "invalid_context",
    );
  });

  it("12 malformed / stale cookies fail closed", async () => {
    for (const bad of [
      "not-json",
      "{}",
      '{"v":2,"o":"x","l":"y"}',
      "x".repeat(400),
      cookie(orgX, crypto.randomUUID()),
      cookie(crypto.randomUUID(), L.A),
    ]) {
      const r = await resolve("multi", { cookie: bad });
      expect(r.status).toBe("invalid_context");
    }
  });

  it("13 revoked / signed-out sessions cannot resolve", async () => {
    const t = users.single;
    const fresh = createClient<Database>(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const s = await fresh.auth.signInWithPassword({
      email: t.email,
      password: t.password,
    });
    expect(s.error).toBeNull();
    const before = await resolveCurrentActiveContext({
      client: fresh,
      routeSlug: slugX,
      cookieValue: null,
    });
    expect(before.status).toBe("resolved");
    const jwt = s.data.session!.access_token;
    await admin.auth.admin.signOut(jwt, "global");
    const after = await resolveCurrentActiveContext({
      client: fresh,
      routeSlug: slugX,
      cookieValue: null,
    });
    expect(after.status).toBe("unauthenticated");
    await signIn(users.single); // global sign-out also killed the shared session
    // never signed in
    const anon = createClient<Database>(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(
      (
        await resolveCurrentActiveContext({
          client: anon,
          routeSlug: slugX,
          cookieValue: null,
        })
      ).status,
    ).toBe("unauthenticated");
  });

  it("14 Org Owner/GM without location assignment follows canonical resolver (no_access)", async () => {
    const r = await resolve("orgOwnerNoAssign");
    console.log("orgOwnerNoAssign ->", r.status, JSON.stringify(r));
    expect(r.status).toBe("no_access");
  });

  it("unknown route slug yields no_access (no enumeration)", async () => {
    expect((await resolve("single", { slug: `nope-${runId}` })).status).toBe(
      "no_access",
    );
    expect((await resolve("single", { slug: slugY })).status).toBe("no_access");
  });
});

describe("V2-003.001 legacy getPrimaryLocation (real RLS, narrowed)", () => {
  const primary = async (key: string, org: string) => {
    asUser.client = users[key].client;
    return getPrimaryLocation(org);
  };
  it("B-only user: legacy fallback is B, never the oldest unassigned A", async () => {
    expect((await primary("single", orgX))?.id).toBe(L.B);
    expect((await primary("orgMgrB", orgX))?.id).toBe(L.B);
  });
  it("oldest location inactive: fallback is the assigned active one", async () => {
    expect((await primary("orgMgrB", orgIds[2]))?.id).toBe(L.Z2);
  });
  it("assignment only to inactive/archived location never falls back to it", async () => {
    for (const k of ["locInactive", "locArchived"]) {
      const r = await primary(k, orgX);
      console.log(
        "legacy primary for",
        k,
        "->",
        r?.id === L.A
          ? "A (no-active-assignment legacy fallback)"
          : (r?.id ?? "null"),
      );
      expect([L.C, L.D]).not.toContain(r?.id);
    }
  });
  it("users without assignments keep the oldest ACTIVE location (legacy org-level)", async () => {
    expect((await primary("orgOwnerNoAssign", orgX))?.id).toBe(L.A);
    expect((await primary("ovOwner", orgIds[2]))?.id).toBe(L.Z2);
  });
  it("multi-location user gets only an assigned location", async () => {
    expect([L.A, L.B]).toContain((await primary("multi", orgX))?.id);
  });
});
