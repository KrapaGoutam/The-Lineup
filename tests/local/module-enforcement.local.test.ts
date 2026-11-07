/**
 * V2-004.004 — real-JWT enforcement tests on the DISPOSABLE LOCAL stack.
 *
 * Why local: ACTIVE enforcement can only be switched on where every active
 * location has explicit module rows, which hosted DEV deliberately does not
 * (the activation gate refuses it). Here the database is empty apart from this
 * file's own fixtures, so the whole path can be exercised honestly:
 * Auth session -> PostgREST/RPC -> RLS / SECURITY DEFINER seams -> persisted
 * state read back with the service role.
 *
 * Safety: the URL must be loopback; hosted DEV/Production refs are refused.
 * Fixtures are tracked by id and removed (the activation switch is returned to
 * `staged`), and the suite fails if anything survives.
 */
import crypto from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    throw new Error("explicit clients only in this suite");
  },
}));
vi.mock("@/features/locations/data/primary-location", () => ({
  getPrimaryLocation: vi.fn(),
}));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));

import {
  checkModuleAccess,
  readModuleEnforcementMode,
} from "@/features/modules/data/module-enforcement";
import { readLocationModuleConfigs } from "@/features/modules/data/module-config-reader";
import { CONFIGURABLE_MODULE_KEYS } from "@/features/modules/domain/module-registry";
import type { Database } from "@/types/database.generated";

const URL_ = process.env.LOCAL_SUPABASE_URL ?? "";
const ANON = process.env.LOCAL_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.LOCAL_SUPABASE_SERVICE_KEY ?? "";

function assertLoopback() {
  const host = (() => {
    try {
      return new URL(URL_).hostname;
    } catch {
      return "";
    }
  })();
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new Error(
      "Refusing to run: LOCAL_SUPABASE_URL must be a loopback address.",
    );
  }
  if (/opmujepkemwcdxxorhfd|ftadewtkjlaotfdvtjcv|supabase\.co/.test(URL_)) {
    throw new Error("Refusing to run against a hosted project.");
  }
  if (!ANON || !SERVICE) throw new Error("Local Supabase keys are missing.");
}

const run = crypto.randomBytes(4).toString("hex");
type Client = SupabaseClient<Database>;
let admin: Client;
const authUsers: string[] = [];
let orgA = "";
let orgB = "";
const loc: Record<"A1" | "A2" | "B1", string> = { A1: "", A2: "", B1: "" };

interface Actor {
  id: string;
  client: Client;
}
const actors: Record<"ownerA" | "serverA" | "ownerB", Actor> = {} as never;

function fresh(key?: string): Client {
  return createClient<Database>(URL_, key ?? ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function makeActor(
  key: keyof typeof actors,
  org: string,
  role: "owner" | "server",
) {
  const email = `v2be-${run}-${key}@harness.invalid`;
  const password = crypto.randomBytes(18).toString("base64url");
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) throw new Error("createUser");
  const id = created.data.user.id;
  authUsers.push(id);
  const profile = await admin
    .from("profiles")
    .insert({ id, display_name: `V2BE ${key} ${run}` });
  if (profile.error) throw new Error(`profile: ${profile.error.message}`);
  const membership = await admin.from("memberships").insert({
    organization_id: org,
    profile_id: id,
    roles: [role],
    active: true,
  });
  if (membership.error)
    throw new Error(`membership: ${membership.error.message}`);
  const client = fresh();
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error("signIn");
  actors[key] = { id, client };
}

async function configure(
  location: string,
  enabled: ReadonlySet<string>,
): Promise<void> {
  const insert = await admin.from("location_module_configs").insert(
    CONFIGURABLE_MODULE_KEYS.map((moduleKey) => ({
      location_id: location,
      module_key: moduleKey,
      is_enabled: enabled.has(moduleKey),
    })),
  );
  if (insert.error) throw new Error(`configure: ${insert.error.message}`);
}

async function setMode(mode: "staged" | "active", reference?: string) {
  return admin
    .from("module_enforcement_settings")
    .update({ mode, activation_reference: reference ?? null })
    .eq("singleton", true);
}

const TASK = (org: string, location: string, title: string) => ({
  p_organization_id: org,
  p_location_id: location,
  p_title: title,
  p_instructions: null as unknown as string,
  p_category: "other",
  p_priority: "normal" as const,
  p_assignment_mode: "all_team" as const,
  p_assignee_ids: [] as string[],
  p_each_person: false,
  p_start_date: null as unknown as string,
  p_due_date: null as unknown as string,
  p_due_time: null as unknown as string,
  p_due_window: null as unknown as "closing",
});

async function taskCount(location: string, title?: string) {
  let q = admin
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("location_id", location);
  if (title) q = q.eq("title", title);
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return r.count ?? 0;
}

beforeAll(async () => {
  assertLoopback();
  admin = fresh(SERVICE);

  // The local database must be otherwise empty of ACTIVE locations, otherwise
  // the readiness gate (correctly) refuses activation and we would be testing
  // someone else's data.
  const others = await admin
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  if (others.error) throw new Error(others.error.message);
  if ((others.count ?? 0) !== 0) {
    throw new Error("Local DB has pre-existing active locations; reset it.");
  }

  const mkOrg = async (slug: string, ownerPlaceholder: string) => {
    const r = await admin
      .from("organizations")
      .insert({
        name: `V2BE ${slug} ${run}`,
        slug: `v2be-${slug}-${run}`,
        created_by: ownerPlaceholder,
        settings: {},
      })
      .select("id")
      .single();
    if (r.error) throw new Error(`org: ${r.error.message}`);
    return r.data.id;
  };
  // created_by has no FK to a live row we own yet; use a throwaway auth user.
  const seed = await admin.auth.admin.createUser({
    email: `v2be-${run}-seed@harness.invalid`,
    password: crypto.randomBytes(18).toString("base64url"),
    email_confirm: true,
  });
  if (seed.error || !seed.data.user) throw new Error("seed user");
  authUsers.push(seed.data.user.id);
  const seedProfile = await admin
    .from("profiles")
    .insert({ id: seed.data.user.id, display_name: `V2BE seed ${run}` });
  if (seedProfile.error) throw new Error(seedProfile.error.message);

  orgA = await mkOrg("a", seed.data.user.id);
  orgB = await mkOrg("b", seed.data.user.id);

  const mkLoc = async (org: string, name: string) => {
    const r = await admin
      .from("locations")
      .insert({
        organization_id: org,
        name: `${name} ${run}`,
        time_zone: "America/Chicago",
        address: {},
      })
      .select("id")
      .single();
    if (r.error) throw new Error(`location: ${r.error.message}`);
    return r.data.id;
  };
  loc.A1 = await mkLoc(orgA, "A1");
  loc.A2 = await mkLoc(orgA, "A2");
  loc.B1 = await mkLoc(orgB, "B1");

  await makeActor("ownerA", orgA, "owner");
  await makeActor("serverA", orgA, "server");
  await makeActor("ownerB", orgB, "owner");
  // #306 requires explicit operational assignments even for org administrators.
  const assigned = await admin.from("location_memberships").insert([
    { location_id: loc.A1, profile_id: actors.ownerA.id, role: "manager" },
    { location_id: loc.A2, profile_id: actors.ownerA.id, role: "manager" },
    { location_id: loc.A1, profile_id: actors.serverA.id, role: "staff" },
    { location_id: loc.B1, profile_id: actors.ownerB.id, role: "manager" },
  ]);
  if (assigned.error) throw new Error(assigned.error.message);
});

afterAll(async () => {
  // Return to the migration default first, then remove fixtures by id.
  await setMode("staged");
  await admin.from("tasks").delete().in("location_id", Object.values(loc));
  await admin
    .from("task_events")
    .delete()
    .in("organization_id", [orgA, orgB].filter(Boolean));
  await admin
    .from("dining_areas")
    .delete()
    .in("location_id", Object.values(loc));
  await admin.from("tip_pools").delete().in("location_id", Object.values(loc));
  await admin
    .from("inventory_vendors")
    .delete()
    .in("organization_id", [orgA, orgB].filter(Boolean));
  await admin
    .from("location_module_configs")
    .delete()
    .in("location_id", Object.values(loc).filter(Boolean));
  await admin
    .from("location_memberships")
    .delete()
    .in("location_id", Object.values(loc).filter(Boolean));
  await admin
    .from("locations")
    .delete()
    .in("id", Object.values(loc).filter(Boolean));
  await admin
    .from("memberships")
    .delete()
    .in("organization_id", [orgA, orgB].filter(Boolean));
  await admin
    .from("organizations")
    .delete()
    .in("id", [orgA, orgB].filter(Boolean));
  for (const id of authUsers) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }

  // Residue check: the suite fails loudly if anything survived.
  const leftovers = await Promise.all([
    admin
      .from("locations")
      .select("id", { count: "exact", head: true })
      .in("id", Object.values(loc).filter(Boolean)),
    admin
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .in("id", [orgA, orgB].filter(Boolean)),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("id", authUsers),
    admin
      .from("location_module_configs")
      .select("location_id", { count: "exact", head: true })
      .in("location_id", Object.values(loc).filter(Boolean)),
  ]);
  const residue = leftovers.map((r) => r.count ?? 0);
  const mode = await admin
    .from("module_enforcement_settings")
    .select("mode")
    .single();
  if (residue.some((n) => n > 0) || mode.data?.mode !== "staged") {
    throw new Error(
      `Residue after cleanup: ${JSON.stringify(residue)} mode=${mode.data?.mode}`,
    );
  }
});

describe("staged (the migration default)", () => {
  it("BE-47: staged behaves exactly like before — a tasks-Disabled/Missing location still works", async () => {
    expect((await readModuleEnforcementMode(actors.ownerA.client)).status).toBe(
      "ok",
    );
    const r = await actors.ownerA.client.rpc(
      "task_create",
      TASK(orgA, loc.A2, "staged-A2"),
    );
    expect(r.error).toBeNull();
    expect(await taskCount(loc.A2, "staged-A2")).toBe(1);
  });

  it("BE-43: the database REFUSES activation while an active location is unconfigured", async () => {
    const r = await setMode("active", "owner-approval-local-test");
    expect(r.error).not.toBeNull();
    expect(r.error?.message).toMatch(/cannot be activated/i);
    const mode = await admin
      .from("module_enforcement_settings")
      .select("mode")
      .single();
    expect(mode.data?.mode).toBe("staged");
    const rows = await admin
      .from("location_module_configs")
      .select("module_key", { count: "exact", head: true })
      .in("location_id", Object.values(loc));
    expect(rows.count).toBe(0); // the refusal wrote nothing and backfilled nothing
  });

  it("BE-46: no client session can change the switch", async () => {
    for (const actor of [actors.ownerA, actors.serverA]) {
      const r = await actor.client
        .from("module_enforcement_settings")
        .update({ mode: "active" })
        .eq("singleton", true);
      expect(r.error?.code).toBe("42501");
    }
    const anon = await fresh()
      .from("module_enforcement_settings")
      .select("mode");
    expect(anon.data ?? []).toHaveLength(0);
    const still = await admin
      .from("module_enforcement_settings")
      .select("mode")
      .single();
    expect(still.data?.mode).toBe("staged");
  });
});

describe("active enforcement with real sessions", () => {
  beforeAll(async () => {
    await configure(
      loc.A1,
      new Set([
        "tasks",
        "table_allocation",
        "bar_inventory",
        "team",
        "payroll",
        "recipes",
      ]),
    );
    await configure(
      loc.A2,
      new Set(["schedule", "tips", "team", "payroll", "recipes"]),
    );
    await configure(loc.B1, new Set(["tasks"]));
    const r = await setMode("active", "owner-approval-local-test");
    if (r.error) throw new Error(`activation failed: ${r.error.message}`);
  });

  it("BE-44/48: with a fully reconciled estate activation succeeds and is recorded", async () => {
    const row = await admin
      .from("module_enforcement_settings")
      .select("mode, activated_at, activation_reference")
      .single();
    expect(row.data?.mode).toBe("active");
    expect(row.data?.activated_at).not.toBeNull();
    expect(row.data?.activation_reference).toBe("owner-approval-local-test");
  });

  it("BE-32: a direct exposed RPC call is denied at a Disabled location and changes nothing", async () => {
    const before = await taskCount(loc.A2);
    const r = await actors.ownerA.client.rpc(
      "task_create",
      TASK(orgA, loc.A2, "active-A2"),
    );
    expect(r.error?.code).toBe("42501");
    expect(r.error?.message).toBe(
      "This module is turned off for this location.",
    );
    expect(await taskCount(loc.A2)).toBe(before);
    expect(await taskCount(loc.A2, "active-A2")).toBe(0);
  });

  it("BE-22: the same RPC works where tasks is Enabled", async () => {
    const r = await actors.ownerA.client.rpc(
      "task_create",
      TASK(orgA, loc.A1, "active-A1"),
    );
    expect(r.error).toBeNull();
    expect(await taskCount(loc.A1, "active-A1")).toBe(1);
  });

  it("BE-27: an inventory RPC is denied where bar_inventory is Disabled", async () => {
    const denied = await actors.ownerA.client.rpc("inventory_vendor_create", {
      p_organization_id: orgA,
      p_location_id: loc.A2,
      p_name: `vendor-A2-${run}`,
      p_notes: null as unknown as string,
    });
    expect(denied.error?.code).toBe("42501");
    const allowed = await actors.ownerA.client.rpc("inventory_vendor_create", {
      p_organization_id: orgA,
      p_location_id: loc.A1,
      p_name: `vendor-A1-${run}`,
      p_notes: null as unknown as string,
    });
    expect(allowed.error).toBeNull();
    const vendors = await admin
      .from("inventory_vendors")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA)
      .eq("name", `vendor-A2-${run}`);
    expect(vendors.count).toBe(0);
  });

  it("BE-31: direct authenticated PostgREST writes obey the same module state", async () => {
    const ok = await actors.ownerA.client
      .from("dining_areas")
      .insert({ organization_id: orgA, location_id: loc.A1, name: "Patio" });
    expect(ok.error).toBeNull();
    const denied = await actors.ownerA.client
      .from("dining_areas")
      .insert({ organization_id: orgA, location_id: loc.A2, name: "Patio" });
    expect(denied.error?.code).toBe("42501");
    const tipsDenied = await actors.ownerA.client.from("tip_pools").insert({
      organization_id: orgA,
      location_id: loc.A1,
      service_date: "2026-11-06",
    });
    expect(tipsDenied.error?.code).toBe("42501");
    const tipsOk = await actors.ownerA.client.from("tip_pools").insert({
      organization_id: orgA,
      location_id: loc.A2,
      service_date: "2026-11-06",
    });
    expect(tipsOk.error).toBeNull();
  });

  it("protected reads: a Disabled location's staged-era task is no longer returned", async () => {
    const seen = await actors.ownerA.client
      .from("tasks")
      .select("location_id, title")
      .in("location_id", [loc.A1, loc.A2]);
    expect(seen.error).toBeNull();
    const titles = (seen.data ?? []).map((t) => t.title);
    expect(titles).toContain("active-A1");
    expect(titles).not.toContain("staged-A2");
    expect(await taskCount(loc.A2, "staged-A2")).toBe(1); // data preserved, only hidden
  });

  it("BE-12: Enabled does not make a server a manager", async () => {
    const r = await actors.serverA.client.rpc(
      "task_create",
      TASK(orgA, loc.A1, "server-try"),
    );
    expect(r.error?.code).toBe("42501");
    expect(r.error?.message).toMatch(/owner, manager or assistant manager/i);
  });

  it("BE-14: a foreign organization gets the access error, never module state", async () => {
    const r = await actors.ownerB.client.rpc(
      "task_create",
      TASK(orgA, loc.A2, "foreign"),
    );
    expect(r.error?.code).toBe("42501");
    expect(r.error?.message).toMatch(/do not have access/i);
    expect(r.error?.message).not.toMatch(/turned off/i);
  });

  it("BE-49: independent sessions get the same answer from the app guard (real reads, explicit clients)", async () => {
    const guard = (actor: Actor, location: string, module: string) =>
      checkModuleAccess(
        { module, organizationId: orgA, location: { id: location } },
        {
          client: actor.client,
          readConfigs: (id) => readLocationModuleConfigs(id, actor.client),
        },
      );
    expect(await guard(actors.ownerA, loc.A1, "tasks")).toMatchObject({
      allowed: true,
      enforcement: "active",
    });
    expect(await guard(actors.ownerA, loc.A2, "tasks")).toEqual({
      allowed: false,
      code: "module_disabled",
    });
    // Settings stays available regardless.
    expect(await guard(actors.ownerA, loc.A2, "settings")).toMatchObject({
      allowed: true,
    });
    // A foreign session cannot even see the location: never "enabled".
    const foreign = await guard(actors.ownerB, loc.A1, "tasks");
    expect(foreign.allowed).toBe(false);
  });

  it("BE-28/40: module configuration stays manageable and shared data survives a Disabled module", async () => {
    // The owner can still edit A2's module rows (Settings is not gated)...
    const update = await actors.ownerA.client
      .from("location_module_configs")
      .update({ is_enabled: false })
      .eq("location_id", loc.A2)
      .eq("module_key", "recipes");
    expect(update.error).toBeNull();
    // ...and the organization-level vendor created earlier is untouched.
    const vendors = await admin
      .from("inventory_vendors")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA)
      .eq("name", `vendor-A1-${run}`);
    expect(vendors.count).toBe(1);
  });

  it("BE-45: reading readiness mutated no configuration (9 rows per location, no extras)", async () => {
    for (const l of Object.values(loc)) {
      const rows = await admin
        .from("location_module_configs")
        .select("module_key", { count: "exact", head: true })
        .eq("location_id", l);
      expect(rows.count).toBe(9);
    }
  });

  it("reversible: back to staged restores legacy behaviour at the Disabled location", async () => {
    const r = await setMode("staged");
    expect(r.error).toBeNull();
    const again = await actors.ownerA.client.rpc(
      "task_create",
      TASK(orgA, loc.A2, "after-rollback"),
    );
    expect(again.error).toBeNull();
  });
});
