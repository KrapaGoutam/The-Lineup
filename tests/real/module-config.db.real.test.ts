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
import {
  loadModuleEditor,
  saveModuleConfig,
} from "@/features/modules/data/module-config-mutation";

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
let baseline: Record<string, number | null> = {};
async function counts() {
  const result: Record<string, number | null> = {};
  for (const table of [
    "organizations",
    "locations",
    "memberships",
    "profiles",
    "overall_roles",
    "location_module_configs",
  ] as const) {
    const response = await admin
      .from(table)
      .select("*", { count: "exact", head: true });
    if (response.error) throw new Error(`Count unavailable: ${table}`);
    result[table] = response.count;
  }
  return result;
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
  baseline = await counts();
  const keys = [
    "ownerX",
    "gmX",
    "staffA",
    "locMgrA",
    "shiftX",
    "revoked",
    "ownerY",
    "ovOwner",
    "ovManager",
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
        { profile_id: users.ovManager.id, role: "manager" },
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
  const errors: string[] = [];
  const step = async (
    label: string,
    run: () => PromiseLike<{ error: { message: string } | null }>,
  ) => {
    const { error } = await run();
    if (error) errors.push(`${label}: ${error.message}`);
  };

  // Children before parents; only rows scoped to THIS run's tracked ids.
  // Configuration rows block hard-deleting their location (ON DELETE RESTRICT),
  // so the service role removes them first (privileged maintenance path).
  if (locationIds.length) {
    await step("location_module_configs", () =>
      admin
        .from("location_module_configs")
        .delete()
        .in("location_id", locationIds),
    );
  }
  if (ids.length) {
    await step("location_memberships", () =>
      admin.from("location_memberships").delete().in("profile_id", ids),
    );
    await step("overall_roles", () =>
      admin.from("overall_roles").delete().in("profile_id", ids),
    );
  }
  if (orgIds.length) {
    await step("memberships", () =>
      admin.from("memberships").delete().in("organization_id", orgIds),
    );
    await step("locations", () =>
      admin.from("locations").delete().in("organization_id", orgIds),
    );
    await step("organizations", () =>
      admin.from("organizations").delete().in("id", orgIds),
    );
  }
  if (ids.length) {
    await step("profiles", () => admin.from("profiles").delete().in("id", ids));
  }
  for (const u of Object.values(users)) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) errors.push(`auth user ${u.id}: ${error.message}`);
  }

  // Prove the teardown instead of assuming it: no tracked id may survive.
  const left = async (
    table: "organizations" | "locations",
    col: string,
    v: string[],
  ) => {
    if (!v.length) return 0;
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(col, v);
    if (error) errors.push(`verify ${table}: ${error.message}`);
    return count ?? 0;
  };
  const leftOrgs = await left("organizations", "id", orgIds);
  const leftLocs = await left("locations", "id", locationIds);
  let leftUsers = 0;
  for (const id of ids) {
    const r = await admin.auth.admin.getUserById(id);
    if (r.data?.user) leftUsers += 1;
  }
  if (leftOrgs || leftLocs || leftUsers) {
    errors.push(
      `survivors: organizations=${leftOrgs} locations=${leftLocs} authUsers=${leftUsers}`,
    );
  }
  const finalCounts = await counts();
  if (JSON.stringify(finalCounts) !== JSON.stringify(baseline))
    errors.push("Pre/post counts differ");
  console.info(
    "DEV fixture baseline/readback",
    JSON.stringify({
      before: baseline,
      after: finalCounts,
      trackedResiduals: {
        organizations: leftOrgs,
        locations: leftLocs,
        users: leftUsers,
      },
    }),
  );
  if (errors.length) {
    throw new Error(
      `V2MC teardown incomplete for run ${runId} (orgs ${orgIds.join(",")} locations ${locationIds.join(",")} users ${ids.join(",")}): ${errors.join(" | ")}`,
    );
  }
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

/**
 * Stored state as the service role sees it (bypasses RLS): module_key ->
 * is_enabled for one location. A response (error or no error) is NOT proof of
 * what was written: a denied UPDATE under RLS is silent (no error, zero rows),
 * so every rejection path below is also checked against the stored rows.
 */
async function stored(loc: string): Promise<Record<string, boolean>> {
  const rows = ok(
    await admin
      .from("location_module_configs")
      .select("module_key, is_enabled")
      .eq("location_id", loc),
    "stored",
  ) as Array<{ module_key: string; is_enabled: boolean }>;
  return Object.fromEntries(rows.map((r) => [r.module_key, r.is_enabled]));
}

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
    // Stored state, not just the absence of an error.
    expect(await stored(L.A)).toEqual({ bar_inventory: true, tasks: true });
    expect(await stored(L.B)).toEqual({ bar_inventory: false, tasks: true });
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
      // A denied UPDATE of an EXISTING row is silent under RLS (no error, zero
      // rows affected). It must never be mistaken for a successful write.
      const u = await users[key].client
        .from("location_module_configs")
        .update({ is_enabled: false })
        .eq("location_id", L.A)
        .eq("module_key", "bar_inventory")
        .select("module_key");
      expect(u.data ?? [], `${key} update affected rows`).toHaveLength(0);
    }
    // Stored state is untouched: no payroll row, bar_inventory still enabled.
    expect(await stored(L.A)).toEqual({ bar_inventory: true, tasks: true });
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
    // Nothing was written to either location.
    expect(await stored(L.A)).toEqual({ bar_inventory: true, tasks: true });
    expect(await stored(L.Y)).toEqual({});
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
    expect(await stored(L.A)).toEqual({ bar_inventory: true, tasks: true });
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
    // None of the rejected payloads was stored.
    expect(await stored(L.A)).toEqual({ bar_inventory: true, tasks: true });
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
    // The row is still where it was, with its original value; nothing moved.
    expect(await stored(L.A)).toEqual({ bar_inventory: true, tasks: true });
    expect(await stored(L.B)).toEqual({ bar_inventory: false, tasks: true });
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
    // Archive through the PRIVILEGED path, not public.transition_location_lifecycle:
    // that RPC writes a row to the append-only public.location_lifecycle_events
    // (UPDATE/DELETE/TRUNCATE rejected for every role; non-cascading FK to
    // locations), which would make this synthetic location -- and its
    // organization and creator -- permanently undeletable on hosted DEV. The
    // guard on archived locations reads locations.archived_at, which is exactly
    // what is set here. The real RPC transition is covered (and rolled back) by
    // pgTAP 0062 MC-012i..m.
    const archive = await admin
      .from("locations")
      .update({ active: false, archived_at: new Date().toISOString() })
      .eq("id", L.B)
      .select("id");
    expect(archive.error).toBeNull();
    expect(archive.data).toHaveLength(1);
    expect((await upsert("ownerX", L.B, "recipes", true)).error?.code).toBe(
      "55000",
    );
    // An UPDATE of an existing row at the archived location is frozen too.
    const frozen = await users.ownerX.client
      .from("location_module_configs")
      .update({ is_enabled: true })
      .eq("location_id", L.B)
      .eq("module_key", "bar_inventory")
      .select("module_key");
    expect(frozen.error?.code).toBe("55000");
    expect(await stored(L.B)).toEqual({ bar_inventory: false, tasks: true });
    const read = await readLocationModuleConfigs(L.B, users.ownerX.client);
    expect(read).toMatchObject({ status: "ok", lifecycle: "archived" });
    expect(resolveModuleState(read, "bar_inventory").status).toBe(
      "location_unavailable",
    );
  });
});

describe("V2-004.002 server writer with real JWTs", () => {
  it("writes one explicit key, reads back server attribution, denies stale and foreign targets", async () => {
    const target = { locationId: L.A, organizationId: orgX };
    const initial = await loadModuleEditor(target, users.gmX.client);
    expect(initial.ok).toBe(true);
    if (!initial.ok) throw new Error(initial.code);
    const old = initial.data.configs.find((c) => c.moduleKey === "attendance");
    const input = {
      ...target,
      actorId: users.gmX.id,
      moduleKey: "attendance" as const,
      isEnabled: false,
      expectedUpdatedAt: old?.updatedAt ?? null,
    };
    const saved = await saveModuleConfig(input, users.gmX.client);
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error(saved.code);
    expect(saved.data.updatedBy).toBe(users.gmX.id);
    expect(saved.data.isEnabled).toBe(false);
    expect(await saveModuleConfig(input, users.gmX.client)).toEqual({
      ok: false,
      code: "conflict",
    });
    for (const key of [
      "staffA",
      "locMgrA",
      "shiftX",
      "revoked",
      "ovAsst",
      "ownerY",
    ]) {
      expect(
        (
          await saveModuleConfig(
            {
              ...input,
              actorId: users[key].id,
              expectedUpdatedAt: saved.data.updatedAt,
              isEnabled: true,
            },
            users[key].client,
          )
        ).ok,
      ).toBe(false);
      const stored = await admin
        .from("location_module_configs")
        .select("is_enabled,updated_at")
        .eq("location_id", L.A)
        .eq("module_key", "attendance")
        .single();
      expect(stored.data).toEqual({
        is_enabled: false,
        updated_at: saved.data.updatedAt,
      });
    }
    expect(
      (await saveModuleConfig({ ...input, locationId: L.Y }, users.gmX.client))
        .ok,
    ).toBe(false);
    expect((await saveModuleConfig(input, anon)).ok).toBe(false);
  });
});

// Each canonical authorized tier exercises the actual server writer independently.
it.each(["ownerX", "gmX", "ovOwner", "ovManager"])(
  "writer authority %s",
  async (key) => {
    const result = await saveModuleConfig(
      {
        locationId: L.Y,
        organizationId: orgY,
        actorId: users[key].id,
        moduleKey: "payroll",
        isEnabled: true,
        expectedUpdatedAt: null,
      },
      users[key].client,
    );
    if (key === "ownerX" || key === "gmX") expect(result.ok).toBe(false);
    const current = await loadModuleEditor(
      { locationId: L.A, organizationId: orgX },
      users[key].client,
    );
    if (!current.ok) throw new Error(current.code);
    const old = current.data.configs.find((c) => c.moduleKey === "payroll");
    const own = await saveModuleConfig(
      {
        locationId: L.A,
        organizationId: orgX,
        actorId: users[key].id,
        moduleKey: "payroll",
        isEnabled: true,
        expectedUpdatedAt: old?.updatedAt ?? null,
      },
      users[key].client,
    );
    expect(own.ok).toBe(true);
  },
);
