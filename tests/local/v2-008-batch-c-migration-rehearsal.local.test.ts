import { execFileSync, execSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.generated";
import {
  consumeKioskPairingCode,
  createKioskPairingCode,
  getKioskDeviceByToken,
} from "@/features/kiosk/data/kiosk-device-data";

/**
 * V2-008 Batch C: populated-data migration rehearsal, ledger 88 -> 91.
 *
 * Preconditions (the suite refuses to run otherwise): a DISPOSABLE loopback Supabase stack
 * whose migration ledger ends at 20261111120000 (the Hosted DEV ledger). It
 *   1. seeds a representative organization/location/role/kiosk/inventory/recipe/payroll/
 *      attendance/tips/tasks dataset through the OLD (ledger 88) schema, with real GoTrue sessions;
 *   2. records the three behaviours the migrations exist to change, as they are BEFORE;
 *   3. snapshots every public/private/auth table (row count + md5 of every row);
 *   4. applies the real pending migrations with the Supabase CLI (the Hosted DEV route);
 *   5. proves no row anywhere changed (only supabase_migrations gains exactly three rows);
 *   6. replays the SAME pre-migration access tokens (session continuity) against the new schema;
 *   7. asserts the intended behaviours AFTER, and that module enforcement / finance /
 *      attendance modes are untouched;
 *   8. re-applies each migration file to prove idempotency.
 *
 * It never reads or writes a hosted project. Evidence JSON goes to REHEARSAL_OUT when set.
 */

const DB_CONTAINER =
  process.env.REHEARSAL_DB_CONTAINER ?? "supabase_db_restaurant-roster";
const BASELINE_VERSION = "20261111120000";
const FINAL_VERSION = "20261113100000";
const MIGRATIONS = [
  "20261112200000_kiosk_manager_authority_hardening.sql",
  "20261112220000_kiosk_reassign_revoked_device_guard.sql",
  "20261113100000_e1_shared_catalog_authority.sql",
];

function localEnv() {
  let url = process.env.LOCAL_SUPABASE_URL ?? "";
  let anon = process.env.LOCAL_SUPABASE_ANON_KEY ?? "";
  let secret = process.env.LOCAL_SUPABASE_SERVICE_KEY ?? "";
  if (!url || !anon || !secret) {
    const out = execSync("npx supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pick = (re: RegExp) => out.match(re)?.[1]?.trim() ?? "";
    url ||= pick(/API_URL=["']?([^"'\r\n]+)/);
    anon ||=
      pick(/PUBLISHABLE_KEY=["']?([^"'\r\n]+)/) ||
      pick(/ANON_KEY=["']?([^"'\r\n]+)/);
    secret ||=
      pick(/SECRET_KEY=["']?([^"'\r\n]+)/) ||
      pick(/SERVICE_ROLE_KEY=["']?([^"'\r\n]+)/);
  }
  return { url, anon, secret };
}

const env = localEnv();

function psql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-X",
      "-q",
      "-At",
      "-F",
      "|",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ).trim();
}

type Snap = Record<string, { n: number; h: string }>;

/** Row count + md5 over every row's text, for every table the migrations could conceivably touch. */
function snapshot(): Snap {
  const tables = psql(
    `select table_schema||'.'||table_name from information_schema.tables
     where table_type='BASE TABLE'
       and (table_schema in ('public','private')
            or (table_schema='auth' and table_name in ('users','sessions','identities','refresh_tokens')))
     order by 1`,
  )
    .split("\n")
    .filter(Boolean);
  const sql =
    tables
      .map(
        (t) =>
          `select '${t}' k, count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from ${t} x`,
      )
      .join("\nunion all\n") + "\norder by 1";
  const snap: Snap = {};
  for (const line of psql(sql).split("\n").filter(Boolean)) {
    const [k, n, h] = line.split("|");
    snap[k] = { n: Number(n), h };
  }
  return snap;
}

function fingerprint(): string {
  return psql(
    fs
      .readFileSync(
        path.resolve(
          import.meta.dirname,
          "../../docs/v2.0/features/008-migration-compatibility/batch-c/function_fingerprint.sql",
        ),
        "utf8",
      )
      .replace(/^--.*$/gm, ""),
  );
}

function ledger() {
  const [n, max] = psql(
    "select count(*), max(version) from supabase_migrations.schema_migrations",
  ).split("|");
  return { n: Number(n), max };
}

function must<R extends { data: unknown; error: { message: string } | null }>(
  r: R,
): NonNullable<R["data"]> {
  if (r.error) throw Error(r.error.message);
  return r.data as NonNullable<R["data"]>;
}

type Actor = {
  id: string;
  token: string;
  client: SupabaseClient<Database>;
};

type Result = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

describe("V2-008 Batch C populated-data migration rehearsal (ledger 88 -> 91)", () => {
  let admin: SupabaseClient<Database>;
  const run = crypto.randomUUID().slice(0, 8);
  const actors: Record<string, Actor> = {};
  const evidence: Record<string, unknown> = { run };
  let orgA = "";
  let orgB = "";
  let locA1 = "";
  let locA2 = "";
  let locB1 = "";
  let vendorId = "";
  let productId = "";
  let t1 = { id: "", token: "" }; // revoked, protected: must stay revoked
  let t2 = { id: "", token: "" }; // active: legitimate lifecycle
  let before: Snap;
  let after: Snap;
  let fpBefore = "";
  let fpAfter = "";

  function replay(token: string) {
    return createClient<Database>(env.url, env.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }

  function call(a: Actor, fn: string, args: object = {}): PromiseLike<Result> {
    return (
      a.client as unknown as {
        rpc: (n: string, p: object) => PromiseLike<Result>;
      }
    ).rpc(fn, args);
  }

  async function makeActor(key: string): Promise<Actor> {
    const email = `rehearsal-${run}-${key}@harness.invalid`;
    const password = crypto.randomBytes(24).toString("base64url");
    const created = must(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    );
    const id = created.user!.id;
    must(await admin.from("profiles").insert({ id, display_name: `R ${key}` }));
    const anonClient = createClient<Database>(env.url, env.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = must(
      await anonClient.auth.signInWithPassword({ email, password }),
    );
    const token = signedIn.session!.access_token;
    const actor = { id, token, client: replay(token) };
    actors[key] = actor;
    return actor;
  }

  const vendorCreate = (a: Actor, org: string, loc: string, name: string) =>
    call(a, "inventory_vendor_create", {
      p_organization_id: org,
      p_location_id: loc,
      p_name: name,
      p_notes: null,
    });

  async function pairTablet(manager: Actor, location: string, name: string) {
    const code = await createKioskPairingCode(manager.client, {
      locationId: location,
      deviceName: name,
    });
    if (!code.ok) throw Error(`pairing code refused: ${code.error}`);
    const paired = await consumeKioskPairingCode(admin, {
      pairingCode: code.data.pairingCode,
      clientIdentifier: `rehearsal-${run}-${name}`,
    });
    if (!paired.ok) throw Error(`pairing failed: ${paired.error}`);
    return { id: paired.data.context.deviceId, token: paired.data.token };
  }

  async function deviceRow(id: string) {
    return must(
      await admin.from("kiosk_devices").select("*").eq("id", id).single(),
    );
  }

  beforeAll(async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    if (
      !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(env.url) ||
      !env.anon ||
      !env.secret
    ) {
      throw Error("Disposable loopback Supabase credentials required");
    }
    const l = ledger();
    if (l.max !== BASELINE_VERSION || l.n !== 88) {
      throw Error(
        `Rehearsal needs a ledger-88 database (max ${BASELINE_VERSION}); found ${l.n} / ${l.max}. ` +
          `Run: npx supabase db reset --local --version ${BASELINE_VERSION}`,
      );
    }
    admin = createClient<Database>(env.url, env.secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    for (const key of [
      "ownerA", // organization owner, org A (two active locations)
      "gmA", // organization general manager, org A
      "mgrA1", // location manager, A1 (org role: server)
      "asstA2", // location assistant manager, A2
      "staffA1", // location staff, A1
      "mgrInactive", // active location manager row, INACTIVE org membership (the F-1 shape)
      "ownerB", // organization owner, org B (ONE active location)
      "mgrB1", // location manager, B1 (the genuine single-location shape)
      "ovManager", // Overall manager (no org membership by design)
      "ovAsst", // Overall assistant manager (D-10b: keeps authority)
      "foreign", // a manager in org B only
      "revoked", // a valid location manager whose Auth session is revoked AFTER the migration
    ]) {
      await makeActor(key);
    }

    const orgs = must(
      await admin
        .from("organizations")
        .insert([
          {
            name: `Rehearsal A ${run}`,
            slug: `rh-a-${run}`,
            created_by: actors.ownerA.id,
          },
          {
            name: `Rehearsal B ${run}`,
            slug: `rh-b-${run}`,
            created_by: actors.ownerB.id,
          },
        ])
        .select("id, slug"),
    );
    orgA = orgs.find((o) => o.slug === `rh-a-${run}`)!.id;
    orgB = orgs.find((o) => o.slug === `rh-b-${run}`)!.id;

    const locs = must(
      await admin
        .from("locations")
        .insert([
          {
            organization_id: orgA,
            name: "RH A1",
            time_zone: "America/Chicago",
            attendance_mode: "external",
          },
          {
            organization_id: orgA,
            name: "RH A2",
            time_zone: "America/Chicago",
            attendance_mode: "internal_the_lineup",
          },
          {
            organization_id: orgB,
            name: "RH B1",
            time_zone: "America/Chicago",
            attendance_mode: "disabled",
          },
        ])
        .select("id, name"),
    );
    locA1 = locs.find((x) => x.name === "RH A1")!.id;
    locA2 = locs.find((x) => x.name === "RH A2")!.id;
    locB1 = locs.find((x) => x.name === "RH B1")!.id;

    const member = (
      key: string,
      org: string,
      roles: Database["public"]["Enums"]["app_role"][],
      active = true,
    ) => ({
      organization_id: org,
      profile_id: actors[key].id,
      roles,
      active,
    });
    must(
      await admin
        .from("memberships")
        .insert([
          member("ownerA", orgA, ["owner"]),
          member("gmA", orgA, ["general_manager"]),
          member("mgrA1", orgA, ["server"]),
          member("asstA2", orgA, ["server"]),
          member("staffA1", orgA, ["server"]),
          member("mgrInactive", orgA, ["server"], false),
          member("ownerB", orgB, ["owner"]),
          member("mgrB1", orgB, ["server"]),
          member("foreign", orgB, ["server"]),
          member("revoked", orgA, ["server"]),
        ]),
    );
    const lm = (
      key: string,
      location: string,
      role: Database["public"]["Enums"]["location_role"],
    ) => ({
      location_id: location,
      profile_id: actors[key].id,
      role,
      active: true,
    });
    must(
      await admin
        .from("location_memberships")
        .insert([
          lm("mgrA1", locA1, "manager"),
          lm("asstA2", locA2, "assistant_manager"),
          lm("staffA1", locA1, "staff"),
          lm("mgrInactive", locA1, "manager"),
          lm("mgrB1", locB1, "manager"),
          lm("revoked", locA1, "manager"),
        ]),
    );
    must(
      await admin.from("overall_roles").insert([
        { profile_id: actors.ovManager.id, role: "manager" },
        { profile_id: actors.ovAsst.id, role: "assistant_manager" },
      ]),
    );

    // Explicit module configuration that must survive untouched (Monks-DEV-like disabled rows).
    must(
      await admin.from("location_module_configs").insert([
        { location_id: locA2, module_key: "tasks", is_enabled: false },
        { location_id: locB1, module_key: "tips", is_enabled: false },
        { location_id: locA1, module_key: "recipes", is_enabled: true },
      ]),
    );

    // Catalog + recipes + stock, written through the OLD (ledger 88) RPCs by an owner.
    const v = await vendorCreate(
      actors.ownerA,
      orgA,
      locA1,
      `Seed vendor ${run}`,
    );
    expect(v.error).toBeNull();
    vendorId = v.data as string;
    const p = await call(actors.ownerA, "inventory_product_create", {
      p_organization_id: orgA,
      p_location_id: locA1,
      p_vendor_id: vendorId,
      p_name: `Seed gin ${run}`,
      p_category_id: null,
      p_subcategory_id: null,
      p_size: "750ml",
      p_unit_type: "bottle",
      p_unit_label: null,
      p_sku: null,
      p_notes: null,
    });
    expect(p.error).toBeNull();
    productId = p.data as string;
    const stock = await call(actors.mgrA1, "inventory_stock_adjust", {
      p_organization_id: orgA,
      p_location_id: locA1,
      p_product_id: productId,
      p_mode: "set",
      p_on_hand: 12,
      p_backup: 2,
      p_reason: "delivery_restock",
      p_note: "rehearsal seed",
      p_expected_version: 1,
    });
    expect(stock.error).toBeNull();
    const cat = await call(actors.ownerA, "bar_recipe_category_save", {
      p_organization_id: orgA,
      p_category_id: null,
      p_expected_version: null,
      p_name: `Seed category ${run}`,
    });
    expect(cat.error).toBeNull();

    // History that must be preserved to the cent / row.
    const period = must(
      await admin
        .from("payroll_periods")
        .insert({
          organization_id: orgA,
          location_id: locA1,
          neon_user_id: 90001,
          period_month: "2026-01-01",
          hours_snapshot: 25,
          rate_cents_snapshot: 2000,
          gross_cents: 50000,
          generated_by: actors.gmA.id,
          status: "draft",
        })
        .select("id")
        .single(),
    );
    must(
      await admin.from("payroll_payments").insert({
        organization_id: orgA,
        payroll_period_id: period.id,
        amount_cents: 25000,
        payment_date: "2026-01-15",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        confirmed_by: actors.gmA.id,
        created_by: actors.gmA.id,
        comment: "partial",
      }),
    );
    const session = must(
      await admin
        .from("attendance_sessions")
        .insert({
          organization_id: orgA,
          location_id: locA2,
          profile_id: actors.staffA1.id,
          service_date: "2026-01-10",
          status: "completed",
          clock_in_at: "2026-01-10T17:00:00Z",
          clock_out_at: "2026-01-10T23:00:00Z",
          gross_elapsed_seconds: 21600,
          total_break_seconds: 0,
          created_by: actors.gmA.id,
        })
        .select("id")
        .single(),
    );
    must(
      await admin.from("attendance_events").insert({
        session_id: session.id,
        organization_id: orgA,
        location_id: locA2,
        profile_id: actors.staffA1.id,
        event_type: "clock_in",
        event_time: "2026-01-10T17:00:00Z",
        service_date: "2026-01-10",
        source: "web",
        actor_profile_id: actors.gmA.id,
      }),
    );
    must(
      await admin.from("tip_pools").insert({
        organization_id: orgA,
        location_id: locA1,
        service_date: "2026-01-10",
      }),
    );
    must(
      await admin.from("tasks").insert({
        organization_id: orgA,
        location_id: locA1,
        title: `Seed task ${run}`,
        created_by: actors.gmA.id,
      }),
    );

    // Kiosk fleet: one active tablet, one revoked (must stay revoked), one sacrificial revoked.
    t1 = await pairTablet(actors.mgrA1, locA1, "protected revoked");
    t2 = await pairTablet(actors.mgrA1, locA1, "active tablet");
    const t3 = await pairTablet(actors.mgrA1, locA1, "sacrificial revoked");
    for (const [d, why] of [
      [t1, "lost tablet"],
      [t3, "sacrificial"],
    ] as const) {
      expect(
        (
          await call(actors.ownerA, "kiosk_revoke_device", {
            p_device_id: d.id,
            p_reason: why,
          })
        ).error,
      ).toBeNull();
    }

    // --- BEFORE behaviour: the three defects the migrations close (ledger 88). ---
    const pre: Record<string, unknown> = {};
    // E-1: a location manager in a TWO-location organization writes the shared catalog.
    pre.e1_locationManagerWritesSharedCatalog_2loc =
      (await vendorCreate(actors.mgrA1, orgA, locA1, `pre-E1 ${run}`)).error ===
      null;
    // F-1: a location manager whose organization membership is INACTIVE can still issue a code.
    pre.f1_inactiveOrgMemberIssuesPairingCode =
      (
        await call(actors.mgrInactive, "kiosk_generate_pairing_code", {
          p_location_id: locA1,
          p_device_name: "pre-F1",
          p_code_hash: crypto.randomBytes(32).toString("hex"),
        })
      ).error === null;
    // U-1: a revoked device is silently returned to ACTIVE by reassignment.
    const u1 = await call(actors.ownerA, "kiosk_reassign_device", {
      p_device_id: t3.id,
      p_new_location_id: locA2,
    });
    pre.u1_revokedDeviceReassignedBackToActive =
      u1.error === null && (await deviceRow(t3.id)).status === "active";
    evidence.preMigrationDefects = pre;
    fpBefore = fingerprint();
  }, 180_000);

  afterAll(() => {
    const out = process.env.REHEARSAL_OUT;
    if (out) fs.writeFileSync(out, JSON.stringify(evidence, null, 2));
  });

  it("the three defects are real BEFORE the migrations (negative control)", () => {
    expect(evidence.preMigrationDefects).toEqual({
      e1_locationManagerWritesSharedCatalog_2loc: true,
      f1_inactiveOrgMemberIssuesPairingCode: true,
      u1_revokedDeviceReassignedBackToActive: true,
    });
  });

  it("applies the three pending migrations with the CLI; ledger 88 -> 91; zero rows change", () => {
    before = snapshot();
    expect(Object.keys(before).length).toBeGreaterThan(85);
    // the seeded history is actually present
    for (const t of [
      "public.payroll_periods",
      "public.payroll_payments",
      "public.attendance_sessions",
      "public.attendance_events",
      "public.tip_pools",
      "public.tasks",
      "public.inventory_stock",
      "public.kiosk_devices",
      "public.audit_events",
      "public.location_module_configs",
      "auth.sessions",
    ]) {
      expect(before[t].n, t).toBeGreaterThan(0);
    }
    const ledgerBefore = psql(
      "select version from supabase_migrations.schema_migrations order by 1",
    );

    const cli = spawnSync("npx", ["supabase", "migration", "up", "--local"], {
      encoding: "utf8",
      shell: true,
    });
    expect(cli.status).toBe(0);
    const applied = `${cli.stdout}\n${cli.stderr}`
      .split(/\r?\n/)
      .filter((l) => /Applying migration/.test(l));
    evidence.cliApplied = applied;
    expect(applied).toHaveLength(3);

    expect(ledger()).toEqual({ n: 91, max: FINAL_VERSION });
    const added = psql(
      "select version from supabase_migrations.schema_migrations order by 1",
    )
      .split("\n")
      .filter((v) => !ledgerBefore.split("\n").includes(v));
    expect(added).toEqual(MIGRATIONS.map((m) => m.split("_")[0]));

    after = snapshot();
    const changed = Object.keys({ ...before, ...after }).filter(
      (k) => before[k]?.h !== after[k]?.h || before[k]?.n !== after[k]?.n,
    );
    evidence.tablesSnapshotted = Object.keys(before).length;
    evidence.rowCountSnapshotted = Object.values(before).reduce(
      (s, v) => s + v.n,
      0,
    );
    evidence.tablesChangedByMigrations = changed;
    expect(changed).toEqual([]);
    fpAfter = fingerprint();
    expect(fpAfter).not.toEqual(fpBefore);
  }, 300_000);

  it("pre-migration sessions survive: the SAME access tokens still work and Auth is untouched", async () => {
    // auth.sessions / refresh_tokens / users hashes are inside the zero-change assertion above.
    // An empty list with no error is also what a dead session returns, so demand NON-EMPTY results.
    for (const key of ["ownerA", "mgrA1", "ovManager"]) {
      const r = await call(actors[key], "kiosk_list_manageable_locations");
      expect(r.error, key).toBeNull();
      expect((r.data as unknown[]).length, key).toBeGreaterThan(0);
    }
  });

  it("migration 89 (F-1 + D7): kiosk management is location-scoped, session- and membership-checked", async () => {
    const ids = async (key: string) =>
      (
        ((await call(actors[key], "kiosk_list_manageable_locations")).data as {
          location_id: string;
        }[]) ?? []
      )
        .map((r) => r.location_id)
        .sort();
    expect(await ids("ownerA")).toEqual([locA1, locA2].sort());
    expect(await ids("gmA")).toEqual([locA1, locA2].sort());
    expect(await ids("mgrA1")).toEqual([locA1]);
    expect(await ids("asstA2")).toEqual([]); // assistant managers never manage kiosks (by design)
    expect(await ids("ovAsst")).toEqual([]); // nor does the Overall assistant manager
    expect(await ids("staffA1")).toEqual([]);
    expect(await ids("mgrInactive")).toEqual([]); // F-1 closed
    expect(await ids("ownerB")).toEqual([locB1]);
    expect(await ids("mgrB1")).toEqual([locB1]);
    expect(await ids("foreign")).toEqual([]);

    // F-1, live-session half: the same token stops working the moment its Auth session is revoked.
    expect(await ids("revoked")).toEqual([locA1]);
    psql(`delete from auth.sessions where user_id = '${actors.revoked.id}'`);
    expect(await ids("revoked")).toEqual([]);
    const revokedIssue = await call(
      actors.revoked,
      "kiosk_generate_pairing_code",
      {
        p_location_id: locA1,
        p_device_name: "post-revoked-session",
        p_code_hash: crypto.randomBytes(32).toString("hex"),
      },
    );
    expect(revokedIssue.error?.code).toBe("42501");

    // Direct RPC denial (no Server Action in the path).
    for (const key of ["mgrInactive", "staffA1", "foreign", "ownerB"]) {
      const r = await call(actors[key], "kiosk_generate_pairing_code", {
        p_location_id: locA1,
        p_device_name: `post-${key}`,
        p_code_hash: crypto.randomBytes(32).toString("hex"),
      });
      expect(r.error?.code, key).toBe("42501");
    }
    // Authorized managers keep working.
    for (const key of ["ownerA", "gmA", "mgrA1"]) {
      const r = await call(actors[key], "kiosk_generate_pairing_code", {
        p_location_id: locA1,
        p_device_name: `post-${key}`,
        p_code_hash: crypto.randomBytes(32).toString("hex"),
      });
      expect(r.error, key).toBeNull();
    }
    // Location-scoped: a location manager cannot manage the sibling location.
    const sibling = await call(actors.mgrA1, "kiosk_generate_pairing_code", {
      p_location_id: locA2,
      p_device_name: "post-sibling",
      p_code_hash: crypto.randomBytes(32).toString("hex"),
    });
    expect(sibling.error?.code).toBe("42501");
  });

  it("migration 90 (U-1): a revoked device stays revoked; active-device lifecycle is intact", async () => {
    const beforeRow = await deviceRow(t1.id);
    const auditCount = () =>
      Number(
        psql(
          `select count(*) from public.audit_events where entity_id = '${t1.id}'`,
        ),
      );
    const auditBefore = auditCount();
    for (const [key, loc] of [
      ["ownerA", locA2],
      ["mgrA1", locA1],
    ] as const) {
      const r = await call(actors[key], "kiosk_reassign_device", {
        p_device_id: t1.id,
        p_new_location_id: loc,
      });
      expect(r.error?.code, key).toBe("55000");
    }
    const afterRow = await deviceRow(t1.id);
    expect(auditCount()).toBe(auditBefore); // a refused call writes no audit row
    expect(afterRow).toEqual(beforeRow);
    expect(afterRow.status).toBe("revoked");
    expect(afterRow.device_token_hash).toBeNull();
    const stale = await getKioskDeviceByToken(admin, t1.token);
    expect(stale.ok && stale.data).toBeNull();

    // Legitimate reassignment of the ACTIVE tablet still works and rotates its credential.
    const v0 = (await deviceRow(t2.id)).credential_version;
    const ok = await call(actors.ownerA, "kiosk_reassign_device", {
      p_device_id: t2.id,
      p_new_location_id: locA2,
    });
    expect(ok.error).toBeNull();
    const t2row = await deviceRow(t2.id);
    expect(t2row.status).toBe("active");
    expect(t2row.location_id).toBe(locA2);
    expect(t2row.credential_version).toBe(v0 + 1);
    const gate = await getKioskDeviceByToken(admin, t2.token);
    expect(gate.ok && gate.data).toBeNull(); // old bearer must re-pair
  });

  it("migration 91 (E-1, D-10 Option A): shared catalog authority matrix", async () => {
    const vendor = async (key: string, org: string, loc: string) =>
      (await vendorCreate(actors[key], org, loc, `post-${key}-${run}`)).error;
    // Organization-level authority and the Overall tier (D-10b) keep working.
    for (const key of ["ownerA", "gmA", "ovManager", "ovAsst"]) {
      expect(await vendor(key, orgA, locA1), key).toBeNull();
    }
    // Location roles in a TWO-location organization can no longer write the shared catalog.
    for (const [key, loc] of [
      ["mgrA1", locA1],
      ["asstA2", locA2],
    ] as const) {
      expect((await vendor(key, orgA, loc))?.code, key).toBe("42501");
    }
    expect((await vendor("staffA1", orgA, locA1))?.code).toBe("42501");
    // A genuine one-active-location organization: the location manager keeps today's behaviour.
    expect(await vendor("mgrB1", orgB, locB1)).toBeNull();
    expect((await vendor("foreign", orgB, locB1))?.code).toBe("42501");
    // Cross-tenant attempts stay denied.
    expect((await vendor("ownerB", orgA, locA1))?.code).toBe("42501");

    // Import commit creates catalog rows, so it needs catalog authority too (all-or-nothing).
    const importCommit = async (
      key: string,
      org: string,
      loc: string,
      name: string,
    ) => {
      const plan = {
        summary: { rows: 1, created: 1, updated: 0, skipped: 0, errors: 0 },
        vendors: [{ ref: "v1", name: `${name} vendor` }],
        rows: [
          {
            row: 2,
            action: "create",
            vendor: { ref: "v1" },
            name,
            size: "750 mL",
            unit_type: "bottle",
            unit_label: null,
            sku: null,
            notes: null,
            on_hand: 1,
            backup: null,
            cutoff: null,
            warning: null,
            par: null,
          },
        ],
      };
      const staged = await call(actors[key], "inventory_import_stage", {
        p_organization_id: org,
        p_location_id: loc,
        p_request_id: crypto.randomUUID(),
        p_filename: "rehearsal.csv",
        p_format: "csv",
        p_sheet: null,
        p_reason: "stock_count",
        p_plan: plan,
      });
      expect(staged.error, `stage ${key}`).toBeNull();
      return call(actors[key], "inventory_import_commit", {
        p_organization_id: org,
        p_location_id: loc,
        p_batch_id: staged.data as string,
      });
    };
    const vendorCount = (org: string, like: string) =>
      Number(
        psql(
          `select count(*) from public.inventory_vendors where organization_id='${org}' and name like '${like}%'`,
        ),
      );
    const denied = await importCommit(
      "mgrA1",
      orgA,
      locA1,
      `imp-denied-${run}`,
    );
    expect(denied.error?.code).toBe("42501");
    expect(vendorCount(orgA, `imp-denied-${run}`)).toBe(0); // nothing written
    expect(
      (await importCommit("ownerA", orgA, locA1, `imp-owner-${run}`)).error,
    ).toBeNull();
    expect(vendorCount(orgA, `imp-owner-${run}`)).toBe(1);
    expect(
      (await importCommit("mgrB1", orgB, locB1, `imp-b-${run}`)).error,
    ).toBeNull();
    expect(vendorCount(orgB, `imp-b-${run}`)).toBe(1);

    // Recipes (shared book): same rule.
    const recipeCat = async (key: string, org: string) =>
      (
        await call(actors[key], "bar_recipe_category_save", {
          p_organization_id: org,
          p_category_id: null,
          p_expected_version: null,
          p_name: `post-${key}-${run}`,
        })
      ).error;
    expect(await recipeCat("ownerA", orgA)).toBeNull();
    expect((await recipeCat("mgrA1", orgA))?.code).toBe("42501");
    expect(await recipeCat("mgrB1", orgB)).toBeNull();

    // Location-scoped stock operations remain intact, and stay location-scoped.
    const adjust = (key: string, loc: string, version: number) =>
      call(actors[key], "inventory_stock_adjust", {
        p_organization_id: orgA,
        p_location_id: loc,
        p_product_id: productId,
        p_mode: "set",
        p_on_hand: 9,
        p_backup: 1,
        p_reason: "delivery_restock",
        p_note: "post-migration",
        p_expected_version: version,
      });
    const stockVersion = must(
      await admin
        .from("inventory_stock")
        .select("version")
        .eq("product_id", productId)
        .eq("location_id", locA1)
        .single(),
    ).version;
    expect((await adjust("mgrA1", locA1, stockVersion)).error).toBeNull();
    expect((await adjust("mgrA1", locA2, 1)).error?.code).toBe("42501");

    // Reads are unchanged: a location manager still reads the shared catalog.
    const read = await actors.mgrA1.client
      .from("inventory_products")
      .select("id")
      .eq("id", productId);
    expect(read.error).toBeNull();
    expect(read.data?.length).toBe(1);
    const catalog = await call(actors.mgrA1, "catalog_authorized", {
      p_organization_id: orgA,
    });
    expect(catalog.data).toBe(false);
    expect(
      (
        await call(actors.ownerA, "catalog_authorized", {
          p_organization_id: orgA,
        })
      ).data,
    ).toBe(true);
    expect(
      (
        await call(actors.mgrB1, "catalog_authorized", {
          p_organization_id: orgB,
        })
      ).data,
    ).toBe(true);
  });

  it("untouched by design: enforcement STAGED, Finance OFF, attendance modes, module configs, history", async () => {
    expect(psql("select mode from public.module_enforcement_settings")).toBe(
      "staged",
    );
    expect(
      psql("select enabled from public.attendance_financial_activation"),
    ).toBe("f");
    expect(
      psql(
        `select string_agg(attendance_mode::text, ',' order by name) from public.locations where id in ('${locA1}','${locA2}','${locB1}')`,
      ),
    ).toBe("external,internal_the_lineup,disabled");
    expect(
      psql(
        `select string_agg(module_key::text||'='||is_enabled::text, ',' order by module_key::text) from public.location_module_configs where location_id in ('${locA1}','${locA2}','${locB1}')`,
      ),
    ).toBe("recipes=true,tasks=false,tips=false");
    expect(
      psql(
        `select gross_cents::text||'/'||(select sum(amount_cents) from public.payroll_payments where payroll_period_id=p.id)::text from public.payroll_periods p where neon_user_id=90001 and organization_id='${orgA}'`,
      ),
    ).toBe("50000/25000");
    evidence.postProbes = "passed";
  });

  it("idempotent: re-applying each migration file changes neither the schema nor any row", () => {
    const snapNow = snapshot();
    const fpNow = fingerprint();
    for (const m of MIGRATIONS) {
      const sql = fs.readFileSync(
        path.resolve(import.meta.dirname, "../../supabase/migrations", m),
        "utf8",
      );
      psql(sql);
    }
    expect(fingerprint()).toEqual(fpNow);
    const snapAgain = snapshot();
    expect(
      Object.keys(snapNow).filter((k) => snapNow[k].h !== snapAgain[k]?.h),
    ).toEqual([]);
    evidence.idempotent = true;
  });

  it("positive control: the row-hash snapshot DOES detect a single-row change", () => {
    const a = snapshot();
    psql(
      `update public.tasks set title = title || ' (changed)' where title = 'Seed task ${run}'`,
    );
    const b = snapshot();
    const changed = Object.keys(b).filter((k) => a[k]?.h !== b[k]?.h);
    expect(changed).toEqual(["public.tasks"]);
  });
});
