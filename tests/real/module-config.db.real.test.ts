/**
 * V2-004.001 hosted-DEV verification: `public.location_module_configs` with
 * REAL Supabase Auth JWTs against real RLS, grants, triggers and the real
 * `readLocationModuleConfigs` reader.
 *
 * NOT executed in Cloud (Cloud must not use DEV credentials). It is the Local
 * step in docs/v2.0/features/004-location-module-configuration/
 * 001-module-configuration-contract/EVIDENCE.md §5.
 *
 * Every run creates its own synthetic organizations/users and removes them
 * (and any configuration rows) afterwards; the harness hard-aborts unless the
 * URL is the-lineup-dev. Existing DEV data is never read or modified.
 */
import crypto from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  isModuleUsable,
  resolveModuleState,
} from "@/features/modules/domain/module-config";
import { readLocationModuleConfigs } from "@/features/modules/data/module-config-reader";
import type { Database } from "@/types/database.generated";

import { adminClient, env } from "./support/harness";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    throw new Error("the reader must receive an explicit client in this suite");
  },
}));

type U = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient<Database>;
};

const admin = adminClient();
const runId = crypto.randomBytes(4).toString("hex");
const users: Record<string, U> = {};
const orgIds: string[] = [];
const L: Record<string, string> = {};
let orgX = "";
let orgY = "";

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

async function mk(key: string): Promise<U> {
  const email = `v2mc-${runId}-${key}@harness.invalid`;
  const password = crypto.randomBytes(18).toString("base64url");
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(`createUser ${key}: ${created.error?.message}`);
  const id = created.data.user.id;
  const profile = await admin
    .from("profiles")
    .insert({ id, display_name: `V2MC ${key} ${runId}` });
  if (profile.error)
    throw new Error(`profile ${key}: ${profile.error.message}`);
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

const anon = createClient<Database>(env.url, env.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

beforeAll(async () => {
  const keys = [
    "ownerX",
    "gmX",
    "staffA",
    "locMgrA",
    "shiftX",
    "revoked",
    "ownerY",
    "ovOwner",
    "ovAsst",
  ];
  await Promise.all(keys.map(mk));

  orgX = ok(
    await admin
      .from("organizations")
      .insert({
        name: `V2MC X ${runId}`,
        slug: `v2mc-${runId}`,
        created_by: users.ownerX.id,
      })
      .select("id")
      .single(),
    "orgX",
  ).id;
  orgY = ok(
    await admin
      .from("organizations")
      .insert({
        name: `V2MC Y ${runId}`,
        slug: `v2mcy-${runId}`,
        created_by: users.ownerY.id,
      })
      .select("id")
      .single(),
    "orgY",
  ).id;
  orgIds.push(orgX, orgY);

  for (const [k, org, name] of [
    ["A", orgX, "Aaa"],
    ["B", orgX, "Bbb"],
    ["Y", orgY, "Yyy"],
  ] as const) {
    L[k] = ok(
      await admin
        .from("locations")
        .insert({
          organization_id: org,
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
        mem(users.ownerX.id, orgX, ["owner"]),
        mem(users.gmX.id, orgX, ["general_manager"]),
        mem(users.staffA.id, orgX, ["server"]),
        mem(users.locMgrA.id, orgX, ["server"]),
        mem(users.shiftX.id, orgX, ["shift_manager"]),
        mem(users.revoked.id, orgX, ["general_manager"], false),
        mem(users.ownerY.id, orgY, ["owner"]),
      ])
      .select("id"),
    "memberships",
  );
  ok(
    await admin
      .from("location_memberships")
      .insert([
        {
          profile_id: users.staffA.id,
          location_id: L.A,
          role: "staff",
          active: true,
        },
        {
          profile_id: users.locMgrA.id,
          location_id: L.A,
          role: "manager",
          active: true,
        },
      ])
      .select("id"),
    "assignments",
  );
  ok(
    await admin
      .from("overall_roles")
      .insert([
        { profile_id: users.ovOwner.id, role: "owner" },
        { profile_id: users.ovAsst.id, role: "assistant_manager" },
      ])
      .select("profile_id"),
    "overall roles",
  );

  await Promise.all(Object.values(users).map(signIn));
}, 180_000);

afterAll(async () => {
  const ids = Object.values(users).map((u) => u.id);
  const locationIds = Object.values(L);
  // Configuration rows block hard-deleting their location (ON DELETE RESTRICT),
  // so the service role removes them first (privileged maintenance path).
  await admin
    .from("location_module_configs")
    .delete()
    .in("location_id", locationIds);
  await admin.from("location_memberships").delete().in("profile_id", ids);
  await admin.from("overall_roles").delete().in("profile_id", ids);
  await admin.from("memberships").delete().in("organization_id", orgIds);
  await admin.from("locations").delete().in("organization_id", orgIds);
  await admin.from("organizations").delete().in("id", orgIds);
  await admin.from("profiles").delete().in("id", ids);
  for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id);
}, 180_000);

const upsert = (
  key: string,
  loc: string,
  module_key: string,
  is_enabled: boolean,
  metadata: Record<string, unknown> = {},
) =>
  users[key].client.from("location_module_configs").insert({
    location_id: loc,
    module_key:
      module_key as Database["public"]["Enums"]["location_module_key"],
    is_enabled,
    metadata: metadata as never,
  });

describe("V2-004.001 hosted DEV — module configuration with real JWT + RLS", () => {
  it("MCR-01 an Org Owner configures two locations of one organization independently", async () => {
    expect(
      (await upsert("ownerX", L.A, "bar_inventory", true)).error,
    ).toBeNull();
    expect(
      (await upsert("ownerX", L.B, "bar_inventory", false)).error,
    ).toBeNull();
    const a = await readLocationModuleConfigs(L.A, users.ownerX.client);
    const b = await readLocationModuleConfigs(L.B, users.ownerX.client);
    expect(resolveModuleState(a, "bar_inventory").status).toBe("enabled");
    expect(resolveModuleState(b, "bar_inventory").status).toBe("disabled");
    expect(resolveModuleState(a, "recipes").status).toBe("missing");
  });

  it("MCR-02 the Org GM, Overall Owner may write; stamps are server-owned", async () => {
    expect((await upsert("gmX", L.A, "tasks", true)).error).toBeNull();
    expect((await upsert("ovOwner", L.B, "tasks", true)).error).toBeNull();
    const row = ok(
      await users.ownerX.client
        .from("location_module_configs")
        .select("updated_by, created_at")
        .eq("location_id", L.A)
        .eq("module_key", "tasks")
        .single(),
      "stamp",
    );
    expect(row.updated_by).toBe(users.gmX.id);
  });

  it("MCR-03 staff, location manager, shift manager, assistant manager, revoked GM cannot write", async () => {
    for (const key of ["staffA", "locMgrA", "shiftX", "ovAsst", "revoked"]) {
      const r = await upsert(key, L.A, "payroll", true);
      expect(r.error?.code, key).toBe("42501");
    }
  });

  it("MCR-04 cross-organization writes and forged location ids are rejected", async () => {
    expect((await upsert("ownerY", L.A, "payroll", true)).error?.code).toBe(
      "42501",
    );
    expect((await upsert("ownerX", L.Y, "payroll", true)).error?.code).toBe(
      "42501",
    );
    expect(
      (await upsert("ownerX", crypto.randomUUID(), "payroll", true)).error
        ?.code,
    ).toBe("42501");
  });

  it("MCR-05 anonymous callers have no access", async () => {
    const w = await anon.from("location_module_configs").insert({
      location_id: L.A,
      module_key: "payroll",
      is_enabled: true,
    });
    expect(w.error?.code).toBe("42501");
    const r = await anon.from("location_module_configs").select("*");
    expect(r.error?.code).toBe("42501");
  });

  it("MCR-06 unknown keys, system-required Settings and invalid metadata are rejected", async () => {
    expect(
      (await upsert("ownerX", L.A, "not_a_module", true)).error?.code,
    ).toBe("22P02");
    expect((await upsert("ownerX", L.A, "settings", false)).error?.code).toBe(
      "22P02",
    );
    for (const bad of [
      { roles: ["owner"] },
      { note: "x".repeat(281) },
      { settings: { a: 1 } },
    ]) {
      expect(
        (await upsert("ownerX", L.A, "attendance", true, bad)).error?.code,
      ).toBe("23514");
    }
  });

  it("MCR-07 ownership is immutable and rows cannot be deleted by a client", async () => {
    const move = await users.ownerX.client
      .from("location_module_configs")
      .update({ location_id: L.B })
      .eq("location_id", L.A)
      .eq("module_key", "bar_inventory");
    expect(move.error?.code).toBe("22023");
    const del = await users.ownerX.client
      .from("location_module_configs")
      .delete()
      .eq("location_id", L.A);
    expect(del.error?.code).toBe("42501");
  });

  it("MCR-08 read scope: assigned staff see their location only; others see nothing", async () => {
    const own = await readLocationModuleConfigs(L.A, users.staffA.client);
    expect(own.status).toBe("ok");
    const other = await readLocationModuleConfigs(L.B, users.staffA.client);
    // Visible location, unreadable configuration => fail-closed "missing".
    expect(isModuleUsable(resolveModuleState(other, "bar_inventory"))).toBe(
      false,
    );
    const rows = ok(
      await users.shiftX.client.from("location_module_configs").select("*"),
      "shift read",
    );
    expect(rows).toHaveLength(0);
    const asst = ok(
      await users.ovAsst.client
        .from("location_module_configs")
        .select("location_id")
        .eq("location_id", L.A),
      "asst read",
    );
    expect(asst.length).toBeGreaterThan(0);
  });

  it("MCR-09 reader: cross-organization and malformed ids are location_unavailable", async () => {
    const cross = await readLocationModuleConfigs(L.A, users.ownerY.client);
    expect(cross.status).toBe("location_unavailable");
    const bad = await readLocationModuleConfigs("nope", users.ownerX.client);
    expect(bad.status).toBe("location_unavailable");
    const signedOut = await readLocationModuleConfigs(L.A, anon);
    expect(signedOut.status).toBe("unauthorized");
  });

  it("MCR-10 an archived location freezes its configuration", async () => {
    const t = async (action: string, reason: string, expected: string) =>
      users.ownerX.client.rpc("transition_location_lifecycle", {
        p_location_id: L.B,
        p_action: action,
        p_reason: reason,
        p_expected_status: expected,
      });
    expect(
      (await t("deactivate", "mc test deactivate", "active")).error,
    ).toBeNull();
    expect(
      (await t("archive", "mc test archive", "inactive")).error,
    ).toBeNull();
    expect((await upsert("ownerX", L.B, "recipes", true)).error?.code).toBe(
      "55000",
    );
    const read = await readLocationModuleConfigs(L.B, users.ownerX.client);
    expect(read).toMatchObject({ status: "ok", lifecycle: "archived" });
    expect(resolveModuleState(read, "bar_inventory").status).toBe(
      "location_unavailable",
    );
  });
});
