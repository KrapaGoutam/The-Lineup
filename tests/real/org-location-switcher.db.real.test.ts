/**
 * V2-003.002 hosted-DEV verification: `?location=` selection through the REAL
 * `resolveCurrentActiveContext` / `listCurrentEligibleContexts` /
 * `getPrimaryLocation` with real Supabase Auth JWTs against real RLS.
 *
 * Every run creates its own synthetic organizations/users and removes them
 * afterwards (hard-aborts unless the URL is the-lineup-dev; see harness).
 */
import crypto from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  listCurrentEligibleContexts,
  resolveCurrentActiveContext,
} from "@/features/context/data/active-context";
import { parseExplicitLocationSelection } from "@/features/context/domain/active-context";
import { serializeActiveContextCookie } from "@/features/context/domain/context-cookie";
import { getPrimaryLocation } from "@/features/locations/data/primary-location";
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

const admin = adminClient();
const runId = crypto.randomBytes(4).toString("hex");
const users: Record<string, U> = {};
const orgIds: string[] = [];
const L: Record<string, string> = {};
let orgX = "";
let orgY = "";
const slugX = `v2s-${runId}`;
const slugY = `v2sy-${runId}`;

async function mk(key: string): Promise<U> {
  const email = `v2s-${runId}-${key}@harness.invalid`;
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
    .insert({ id, display_name: `V2S ${key} ${runId}` });
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

const select = (
  key: string,
  raw: string | string[] | undefined,
  o: { slug?: string; cookie?: string | null } = {},
) =>
  resolveCurrentActiveContext({
    client: users[key].client,
    routeSlug: o.slug ?? slugX,
    cookieValue: o.cookie === undefined ? null : o.cookie,
    explicitSelection: parseExplicitLocationSelection(raw),
  });
const cookie = (org: string, loc: string) =>
  serializeActiveContextCookie({ organizationId: org, locationId: loc });
const resolvedLocation = (r: Awaited<ReturnType<typeof select>>) =>
  r.status === "resolved" ? r.context.locationId : r.status;
const denied = (r: Awaited<ReturnType<typeof select>>) =>
  expect(["invalid_context", "no_access", "selection_required"]).toContain(
    r.status,
  );

/**
 * V2-003.004 follow-up read: the operational context is the PERSISTED cookie;
 * the Referer (what the user is looking at) can only make it fail closed.
 */
async function followUp(
  key: string,
  org: string,
  o: { cookie?: string | null; referer?: string | null } = {},
) {
  req.client = users[key].client;
  req.cookie = o.cookie ?? null;
  req.referer = o.referer ?? null;
  try {
    return await getPrimaryLocation(org);
  } finally {
    req.cookie = null;
    req.referer = null;
  }
}

beforeAll(async () => {
  const keys = [
    "creator",
    "scopedB",
    "multi",
    "mgrAstaffB",
    "revoked",
    "locInactive",
    "locArchived",
    "cross",
    "ovOwner",
    "orgOnly",
  ];
  await Promise.all(keys.map(mk));

  orgX = ok(
    await admin
      .from("organizations")
      .insert({
        name: `V2S X ${runId}`,
        slug: slugX,
        created_by: users.creator.id,
      })
      .select("id")
      .single(),
    "orgX",
  ).id;
  orgY = ok(
    await admin
      .from("organizations")
      .insert({
        name: `V2S Y ${runId}`,
        slug: slugY,
        created_by: users.cross.id,
      })
      .select("id")
      .single(),
    "orgY",
  ).id;
  orgIds.push(orgX, orgY);

  // A is the OLDEST and in a different time zone from B, so a wrong-location
  // follow-up is observable (id AND tz).
  for (const [k, org, name, tz] of [
    ["A", orgX, "Aaa", "America/New_York"],
    ["B", orgX, "Bbb", "America/Los_Angeles"],
    ["C", orgX, "Ccc-inactive", "America/Chicago"],
    ["D", orgX, "Ddd-archived", "America/Chicago"],
    ["Y", orgY, "Yyy", "America/Denver"],
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

  const mem = (p: string, org: string, roles: string[]) => ({
    organization_id: org,
    profile_id: p,
    roles,
    active: true,
  });
  ok(
    await admin
      .from("memberships")
      .insert([
        mem(users.scopedB.id, orgX, ["server"]),
        mem(users.multi.id, orgX, ["server"]),
        mem(users.mgrAstaffB.id, orgX, ["server"]),
        mem(users.revoked.id, orgX, ["server"]),
        mem(users.locInactive.id, orgX, ["server"]),
        mem(users.locArchived.id, orgX, ["server"]),
        mem(users.cross.id, orgX, ["server"]),
        mem(users.cross.id, orgY, ["server"]),
        mem(users.orgOnly.id, orgX, ["general_manager"]),
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
        asg(users.scopedB.id, L.B),
        asg(users.multi.id, L.A),
        asg(users.multi.id, L.B),
        asg(users.mgrAstaffB.id, L.A, "manager"),
        asg(users.mgrAstaffB.id, L.B, "staff"),
        asg(users.revoked.id, L.A),
        asg(users.revoked.id, L.B),
        asg(users.locInactive.id, L.C),
        asg(users.locArchived.id, L.D),
        asg(users.cross.id, L.A),
        asg(users.cross.id, L.Y),
      ])
      .select("id"),
    "assignments",
  );

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
      .insert([{ profile_id: users.ovOwner.id, role: "owner" }])
      .select("id"),
    "overall",
  );

  // SW-LIVE-05: revoke AFTER creation (assignment row stays, inactive).
  ok(
    await admin
      .from("location_memberships")
      .update({ active: false })
      .eq("profile_id", users.revoked.id)
      .eq("location_id", L.A)
      .select("id"),
    "revoke",
  );

  await Promise.all(Object.values(users).map(signIn));
}, 180_000);

afterAll(async () => {
  const ids = Object.values(users).map((u) => u.id);
  await admin.from("location_memberships").delete().in("profile_id", ids);
  await admin.from("overall_roles").delete().in("profile_id", ids);
  await admin.from("memberships").delete().in("organization_id", orgIds);
  await admin.from("locations").delete().in("organization_id", orgIds);
  await admin.from("organizations").delete().in("id", orgIds);
  await admin.from("profiles").delete().in("id", ids);
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id);
}, 180_000);

describe("V2-003.002 hosted DEV — explicit selection with real JWT + RLS", () => {
  it("SW-LIVE-01 scoped employee selects authorized Location B", async () => {
    expect(resolvedLocation(await select("scopedB", L.B))).toBe(L.B);
    expect(resolvedLocation(await select("multi", L.B))).toBe(L.B);
    expect(resolvedLocation(await select("multi", L.A))).toBe(L.A);
  });

  it("SW-LIVE-02 unassigned Location A is rejected", async () => {
    denied(await select("scopedB", L.A));
  });

  it("SW-LIVE-03 another organization's location is rejected", async () => {
    denied(await select("scopedB", L.Y));
    denied(await select("multi", L.Y));
    // cross user is authorized in both orgs but a Y location under the X route is still rejected
    denied(await select("cross", L.Y, { slug: slugX }));
  });

  it("SW-LIVE-04 inactive and archived locations are rejected", async () => {
    denied(await select("locInactive", L.C));
    denied(await select("locArchived", L.D));
    denied(await select("multi", L.C));
    denied(await select("multi", L.D));
  });

  it("SW-LIVE-05 revoked assignment cannot select the location", async () => {
    denied(await select("revoked", L.A));
    expect(resolvedLocation(await select("revoked", L.B))).toBe(L.B);
  });

  it("SW-LIVE-06 malformed and repeated parameters fail closed", async () => {
    for (const raw of ["not-a-uuid", "", [L.A, L.B]]) {
      expect((await select("multi", raw)).status).toBe("invalid_context");
    }
  });

  it("SW-LIVE-07 Overall Owner selects eligible locations across organizations", async () => {
    expect(resolvedLocation(await select("ovOwner", L.B))).toBe(L.B);
    expect(
      resolvedLocation(await select("ovOwner", L.Y, { slug: slugY })),
    ).toBe(L.Y);
    denied(await select("ovOwner", L.C));
    denied(await select("ovOwner", L.D));
  });

  it("SW-LIVE-08/09 multi-org user: explicit selection beats a stale org cookie; the stale cookie alone fails closed", async () => {
    const stale = cookie(orgX, L.A);
    expect(
      resolvedLocation(
        await select("cross", L.Y, { slug: slugY, cookie: stale }),
      ),
    ).toBe(L.Y);
    expect(
      (await select("cross", undefined, { slug: slugY, cookie: stale })).status,
    ).toBe("invalid_context");
  });

  it("SW-LIVE-10 the switcher lists only eligible locations", async () => {
    const list = async (key: string) => {
      const r = await listCurrentEligibleContexts({
        client: users[key].client,
      });
      expect(r.status).toBe("ok");
      return r.status === "ok"
        ? r.contexts.map((c) => c.locationId).sort()
        : [];
    };
    expect(await list("scopedB")).toEqual([L.B]);
    expect(await list("multi")).toEqual([L.A, L.B].sort());
    expect(await list("revoked")).toEqual([L.B]);
    expect(await list("locInactive")).toEqual([]);
    expect(await list("locArchived")).toEqual([]);
    expect(await list("cross")).toEqual([L.A, L.Y].sort());
    const ov = await list("ovOwner");
    expect(ov).toEqual(expect.arrayContaining([L.A, L.B, L.Y]));
    expect(ov).not.toContain(L.C);
    expect(ov).not.toContain(L.D);
  });

  it("SW-LIVE-11 revoking access is reflected on the next refresh", async () => {
    expect(resolvedLocation(await select("multi", L.A))).toBe(L.A);
    ok(
      await admin
        .from("location_memberships")
        .update({ active: false })
        .eq("profile_id", users.multi.id)
        .eq("location_id", L.A)
        .select("id"),
      "revoke multi A",
    );
    denied(await select("multi", L.A));
    const r = await listCurrentEligibleContexts({ client: users.multi.client });
    expect(r.status === "ok" && r.contexts.map((c) => c.locationId)).toEqual([
      L.B,
    ]);
    ok(
      await admin
        .from("location_memberships")
        .update({ active: true })
        .eq("profile_id", users.multi.id)
        .eq("location_id", L.A)
        .select("id"),
      "restore multi A",
    );
  });

  it("SW-LIVE-12 every denied context carries no resolved scope for hydration", async () => {
    for (const r of [
      await select("scopedB", L.A),
      await select("multi", "bad"),
      await select("locArchived", L.D),
    ]) {
      expect(r.status).not.toBe("resolved");
      expect(JSON.stringify(r)).not.toContain("timeZone");
    }
  });

  it("SW-ROLE-01 Manager at A / Staff at B: effective access follows the selected location only", async () => {
    const a = await select("mgrAstaffB", L.A);
    const b = await select("mgrAstaffB", L.B);
    expect(a.status).toBe("resolved");
    expect(b.status).toBe("resolved");
    if (a.status === "resolved" && b.status === "resolved") {
      expect(a.context.access.effectiveLevel).toBe("manager");
      expect(b.context.access.effectiveLevel).toBe("staff");
      expect(a.context.access.capabilities.length).toBeGreaterThan(
        b.context.access.capabilities.length,
      );
    }
    // switching back restores A
    const a2 = await select("mgrAstaffB", L.A);
    expect(a2.status === "resolved" && a2.context.access.effectiveLevel).toBe(
      "manager",
    );
  });
});

describe("V2-003.004 hosted DEV — follow-ups use the PERSISTED location (Referer never selects)", () => {
  it("SW-OPS-01 persisted Location B: legacy helper returns B (not the oldest assigned A), with no Referer", async () => {
    const r = await followUp("multi", orgX, { cookie: cookie(orgX, L.B) });
    expect(r).toEqual({ id: L.B, time_zone: "America/Los_Angeles" });
    const a = await followUp("multi", orgX, { cookie: cookie(orgX, L.A) });
    expect(a).toEqual({ id: L.A, time_zone: "America/New_York" });
  });

  it("SW-OPS-02 unverifiable persisted contexts are a safe denial, never a substitute", async () => {
    expect(
      await followUp("scopedB", orgX, { cookie: cookie(orgX, L.A) }),
    ).toBeNull();
    expect(
      await followUp("scopedB", orgX, { cookie: cookie(orgX, L.Y) }),
    ).toBeNull();
    expect(
      await followUp("revoked", orgX, { cookie: cookie(orgX, L.A) }),
    ).toBeNull();
    expect(
      await followUp("multi", orgX, { cookie: cookie(orgX, L.C) }),
    ).toBeNull();
    expect(await followUp("multi", orgX, { cookie: "bad" })).toBeNull();
  });

  it("SW-OPS-03 a persisted context for another organization cannot satisfy this organization's follow-up", async () => {
    expect(
      await followUp("cross", orgX, { cookie: cookie(orgY, L.Y) }),
    ).toBeNull();
    expect(
      (await followUp("cross", orgY, { cookie: cookie(orgY, L.Y) }))?.id,
    ).toBe(L.Y);
  });

  it("SW-OPS-04 no persisted context and several locations is ambiguous (never the oldest)", async () => {
    expect(await followUp("multi", orgX)).toBeNull();
  });

  it("SW-OPS-05 a Referer for a different location than the persisted one fails closed; a Referer alone never selects", async () => {
    expect(
      await followUp("multi", orgX, {
        cookie: cookie(orgX, L.A),
        referer: `https://app.test/r/${slugX}?location=${L.B}`,
      }),
    ).toBeNull();
    expect(
      await followUp("multi", orgX, {
        referer: `https://app.test/r/${slugX}?location=${L.B}`,
      }),
    ).toBeNull();
  });
});
