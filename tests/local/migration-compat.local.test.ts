import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { main } from "../../scripts/migration-compat/cli.mjs";
import {
  canonicalJson,
  MODULE_KEYS,
} from "../../scripts/migration-compat/common.mjs";
import {
  computeAttendanceStateHash,
  ATTENDANCE_MANIFEST_SCHEMA,
  planAttendanceCompatibility,
} from "../../scripts/migration-compat/attendance.mjs";
import {
  computeModuleStateHash,
  MODULE_MANIFEST_SCHEMA,
  planModuleConfiguration,
} from "../../scripts/migration-compat/module-config.mjs";
import {
  applyChangesetToSnapshot,
  planOrganizationBackfill,
} from "../../scripts/migration-compat/role-backfill.mjs";
import {
  readAttendanceSnapshot,
  readModuleSnapshot,
  readOrganizationSnapshot,
} from "../../scripts/migration-compat/snapshot.mjs";
import { localEnv, must } from "./support/inventory-recipes-fixture";

// V2-008 Batch B2-B4 against the DISPOSABLE local stack. The tools themselves never write; this
// test proves it by digesting every table they could conceivably touch before and after, and by
// recording every HTTP request they make. Rows that "apply" a changeset are written by THIS TEST
// with the service key (standing in for a future, separately authorized executor) only to prove
// that a re-plan after the apply is a NOOP.
const admin = createClient(localEnv.url, localEnv.secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const run = crypto.randomUUID().slice(0, 8);
const userIds: string[] = [];
const orgIds: string[] = [];
const locationIds: string[] = [];

const WATCHED = [
  ["memberships", "id"],
  ["location_memberships", "id"],
  ["overall_roles", "id"],
  ["locations", "id"],
  ["location_module_configs", "location_id,module_key"],
  ["attendance_identity_links", "id"],
  ["attendance_financial_activation", "singleton"],
  ["attendance_sessions", "id"],
  ["attendance_events", "id"],
] as const;

async function digest(): Promise<string> {
  const out: Record<string, unknown[]> = {};
  for (const [table, order] of WATCHED) {
    const rows: unknown[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = must(
        await admin
          .from(table)
          .select("*")
          .order(order.split(",")[0])
          .range(offset, offset + 999),
      ) as unknown[];
      rows.push(...page);
      if (page.length < 1000) break;
    }
    out[table] = rows;
  }
  return crypto.createHash("sha256").update(canonicalJson(out)).digest("hex");
}

const requests: { method: string; url: string }[] = [];
const recordingFetch = (async (url: string, init: RequestInit = {}) => {
  requests.push({ method: String(init.method ?? "GET"), url: String(url) });
  return fetch(url, init);
}) as typeof fetch;
const common = {
  url: localEnv.url,
  key: localEnv.secret,
  fetchImpl: recordingFetch,
};

let orgS = "";
let orgT = "";
let locS1 = "";
let locT1 = "";
let locT2 = "";
const P: Record<string, string> = {};

async function makeUser(key: string) {
  const email = `mc-${run}-${key}@harness.invalid`;
  const created = must(
    await admin.auth.admin.createUser({
      email,
      password: crypto.randomBytes(24).toString("base64url"),
      email_confirm: true,
    }),
  );
  const id = created.user!.id;
  must(
    await admin
      .from("profiles")
      .insert({ id, display_name: `MC ${key} ${run}` }),
  );
  userIds.push(id);
  P[key] = id;
  return id;
}

beforeAll(async () => {
  if (
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(localEnv.url) ||
    !localEnv.secret
  ) {
    throw new Error("Disposable loopback Supabase credentials required.");
  }
  for (const key of ["owner", "gm", "shift", "host", "server", "multi"])
    await makeUser(key);
  const s = must(
    await admin
      .from("organizations")
      .insert({ name: `MC S ${run}`, slug: `mc-s-${run}`, created_by: P.owner })
      .select()
      .single(),
  )!;
  const t = must(
    await admin
      .from("organizations")
      .insert({ name: `MC T ${run}`, slug: `mc-t-${run}`, created_by: P.owner })
      .select()
      .single(),
  )!;
  orgS = s.id;
  orgT = t.id;
  orgIds.push(orgS, orgT);
  const locs = must(
    await admin
      .from("locations")
      .insert([
        { organization_id: orgS, name: "MC S1", time_zone: "America/Chicago" },
        { organization_id: orgT, name: "MC T1", time_zone: "America/Chicago" },
        { organization_id: orgT, name: "MC T2", time_zone: "America/Chicago" },
      ])
      .select(),
  )!;
  locS1 = locs.find((l) => l.name === "MC S1")!.id;
  locT1 = locs.find((l) => l.name === "MC T1")!.id;
  locT2 = locs.find((l) => l.name === "MC T2")!.id;
  locationIds.push(locS1, locT1, locT2);
  must(
    await admin.from("memberships").insert([
      {
        organization_id: orgS,
        profile_id: P.owner,
        roles: ["owner"],
        active: true,
      },
      {
        organization_id: orgS,
        profile_id: P.gm,
        roles: ["general_manager"],
        active: true,
      },
      {
        organization_id: orgS,
        profile_id: P.shift,
        roles: ["shift_manager"],
        active: true,
      },
      {
        organization_id: orgS,
        profile_id: P.host,
        roles: ["host"],
        active: true,
      },
      {
        organization_id: orgS,
        profile_id: P.server,
        roles: ["server"],
        active: true,
      },
      {
        organization_id: orgT,
        profile_id: P.owner,
        roles: ["owner"],
        active: true,
      },
      {
        organization_id: orgT,
        profile_id: P.multi,
        roles: ["server", "shift_manager"],
        active: true,
      },
    ]),
  );
});

afterAll(async () => {
  await admin
    .from("location_module_configs")
    .delete()
    .in("location_id", locationIds);
  await admin
    .from("location_memberships")
    .delete()
    .in("location_id", locationIds);
  await admin
    .from("attendance_identity_links")
    .delete()
    .in("organization_id", orgIds);
  await admin.from("locations").delete().in("id", locationIds);
  await admin.from("memberships").delete().in("organization_id", orgIds);
  await admin.from("organizations").delete().in("id", orgIds);
  for (const id of userIds) {
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
});

describe("B2-B4 tooling against the real local schema (read-only proof)", () => {
  it("control: the digest really is sensitive to a write in every watched table class", async () => {
    const base = await digest();
    must(
      await admin
        .from("location_module_configs")
        .insert({ location_id: locS1, module_key: "team", is_enabled: false }),
    );
    const changed = await digest();
    expect(changed).not.toBe(base);
    must(
      await admin
        .from("location_module_configs")
        .delete()
        .eq("location_id", locS1)
        .eq("module_key", "team"),
    );
    expect(await digest()).toBe(base);
    must(
      await admin.from("location_memberships").insert({
        location_id: locT1,
        profile_id: P.owner,
        role: "staff",
        active: true,
      }),
    );
    expect(await digest()).not.toBe(base);
    must(
      await admin
        .from("location_memberships")
        .delete()
        .eq("location_id", locT1)
        .eq("profile_id", P.owner),
    );
    expect(await digest()).toBe(base);
  });

  it("reads, plans and reports without changing a single watched row, using only GET/HEAD", async () => {
    const before = await digest();
    requests.length = 0;

    const roleSnapshot = await readOrganizationSnapshot({
      ...common,
      organizationId: orgS,
    });
    const rolePlan = planOrganizationBackfill(roleSnapshot);
    const multiSnapshot = await readOrganizationSnapshot({
      ...common,
      organizationId: orgT,
    });
    const multiPlan = planOrganizationBackfill(multiSnapshot);
    const moduleSnapshot = await readModuleSnapshot({
      ...common,
      locationIds: [locS1, locT1, locT2],
      scope: "selected",
    });
    const modulePlan = planModuleConfiguration(moduleSnapshot);
    const attendanceSnapshot = await readAttendanceSnapshot({
      ...common,
      organizationId: orgS,
    });
    const attendancePlan = planAttendanceCompatibility(attendanceSnapshot);

    expect(await digest()).toBe(before);
    expect(requests.length).toBeGreaterThan(10);
    expect(
      requests.every((r) => r.method === "GET" || r.method === "HEAD"),
    ).toBe(true);
    expect(
      requests.every((r) => r.url.startsWith(`${localEnv.url}/rest/v1/`)),
    ).toBe(true);

    // B2: the complete single-location organization is a clean APPLY from the REAL schema.
    expect(rolePlan.verdict).toBe("APPLY");
    expect(rolePlan.counts).toMatchObject({
      activeLocations: 1,
      activeMembers: 5,
      rowsToInsert: 5,
    });
    expect(rolePlan.fallbackCliff.fallbackActiveToday).toBe(true);
    expect(rolePlan.capability.verification).toBe("measured_n1");
    expect(rolePlan.capability.reductions).toEqual([]);
    expect(rolePlan.capability.expansions).toEqual([]);
    // ...and the multi-location / multi-role organization is refused as a whole, with nothing proposed.
    expect(multiPlan.verdict).toBe("SKIP");
    expect(multiPlan.reasons).toEqual(
      expect.arrayContaining([
        "multi_location_requires_complete_manifest",
        "multi_location_member_requires_explicit_assignment",
      ]),
    );
    expect(multiPlan.changeset).toBeNull();
    // B3 / B4: reports only, and the owner decisions still required are named.
    expect(modulePlan.verdict).toBe("REPORT_ONLY");
    expect(modulePlan.decisionsRequired).toHaveLength(3);
    expect(attendancePlan.verdict).toBe("REPORT_ONLY");
    expect(attendancePlan.ownerDecisionRequiredFor).toEqual([locS1]);
    expect(attendanceSnapshot.financialActivationEnabled).toBe(false);
  });

  it("the CLI plans the real organization end to end (snapshot -> plan) and refuses to execute", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-local-"));
    const file = path.join(dir, "role-snapshot.json");
    const sink = () => {
      const chunks: string[] = [];
      return {
        write: (s: string) => chunks.push(s),
        text: () => chunks.join(""),
      };
    };
    const env = { LOCAL_SUPABASE_SERVICE_KEY: localEnv.secret };
    const err = sink();
    expect(
      await main(
        [
          "snapshot",
          "role",
          "--url",
          localEnv.url,
          "--organization",
          orgS,
          "--out",
          file,
        ],
        { stdout: sink(), stderr: err, env },
      ),
    ).toBe(0);
    const out = sink();
    expect(
      await main(["plan", "role", "--snapshot", file], {
        stdout: out,
        stderr: err,
      }),
    ).toBe(0);
    expect(JSON.parse(out.text()).verdict).toBe("APPLY");
    expect(
      await main(["plan", "role", "--snapshot", file, "--execute"], {
        stdout: sink(),
        stderr: err,
      }),
    ).toBe(3);
    expect(err.text()).not.toContain(localEnv.secret);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("B2 round trip: apply (by the test) -> re-plan is a NOOP", () => {
  it("a partial organization is completed atomically; afterwards the plan is a NOOP", async () => {
    // Simulate a half-finished manual attempt: ONLY the owner has a row (the cliff).
    must(
      await admin.from("location_memberships").insert({
        location_id: locS1,
        profile_id: P.owner,
        role: "manager",
        active: true,
      }),
    );
    const partial = await readOrganizationSnapshot({
      ...common,
      organizationId: orgS,
    });
    const plan = planOrganizationBackfill(partial);
    expect(plan.fallbackCliff.fallbackActiveToday).toBe(false);
    expect(plan.warnings.map((w: { code: string }) => w.code)).toContain(
      "organization_currently_partial",
    );
    expect(plan.verdict).toBe("APPLY");
    expect(plan.counts).toMatchObject({ alreadyPresent: 1, rowsToInsert: 4 });

    // The test (not the tool) applies the changeset in one statement = one atomic transaction.
    must(
      await admin.from("location_memberships").insert(
        plan.changeset.insertRows.map(
          (r: { locationId: string; profileId: string; role: string }) => ({
            location_id: r.locationId,
            profile_id: r.profileId,
            role: r.role,
            active: true,
          }),
        ),
      ),
    );
    const after = await readOrganizationSnapshot({
      ...common,
      organizationId: orgS,
    });
    const second = planOrganizationBackfill(after);
    expect(second.verdict).toBe("NOOP");
    expect(second.counts.alreadyPresent).toBe(5);
    // The pure simulation agrees with what the database actually holds.
    const simulated = planOrganizationBackfill(
      applyChangesetToSnapshot(partial, plan.changeset),
    );
    expect(simulated.stateHash).toBe(second.stateHash);
    // Organization roles and Overall roles were never part of the changeset.
    expect(plan.changeset.touches).toMatchObject({
      memberships: false,
      overallRoles: false,
    });
  });
});

describe("B3 / B4 round trips with explicit owner manifests", () => {
  it("module manifest: READY -> (test applies) -> NOOP; existing explicit settings are preserved", async () => {
    const mix = Object.fromEntries(
      MODULE_KEYS.map((k) => [k, k === "bar_inventory" || k === "recipes"]),
    );
    const off = Object.fromEntries(MODULE_KEYS.map((k) => [k, false]));
    // One pre-existing explicit row on T1 (disabled) that the manifest must not flip.
    must(
      await admin
        .from("location_module_configs")
        .insert({ location_id: locT1, module_key: "tasks", is_enabled: false }),
    );
    const snapshot = await readModuleSnapshot({
      ...common,
      locationIds: [locS1, locT1, locT2],
      scope: "selected",
    });
    const manifest = (s: typeof snapshot, t1Tasks: boolean) => ({
      schema: MODULE_MANIFEST_SCHEMA,
      status: "approved",
      approvedBy: "local-test",
      stateHash: computeModuleStateHash(s),
      locations: [
        { locationId: locS1, class: "real", modules: mix },
        {
          locationId: locT1,
          class: "harness",
          modules: { ...off, tasks: t1Tasks },
        },
        { locationId: locT2, class: "harness", modules: off },
      ],
    });
    const refused = planModuleConfiguration(snapshot, manifest(snapshot, true));
    expect(refused.verdict).toBe("REFUSED");
    expect(refused.blockers).toContainEqual(
      expect.objectContaining({
        code: "existing_setting_would_change",
        locationId: locT1,
        moduleKey: "tasks",
      }),
    );

    const plan = planModuleConfiguration(snapshot, manifest(snapshot, false));
    expect(plan.verdict).toBe("READY_FOR_OWNER_APPROVAL");
    expect(plan.insertRows).toHaveLength(9 + 8 + 9);
    must(
      await admin.from("location_module_configs").insert(
        plan.insertRows.map(
          (r: {
            locationId: string;
            moduleKey: string;
            isEnabled: boolean;
          }) => ({
            location_id: r.locationId,
            module_key: r.moduleKey,
            is_enabled: r.isEnabled,
          }),
        ),
      ),
    );
    const after = await readModuleSnapshot({
      ...common,
      locationIds: [locS1, locT1, locT2],
      scope: "selected",
    });
    const second = planModuleConfiguration(after, manifest(after, false));
    expect(second.verdict).toBe("NOOP");
    expect(
      second.locations.every(
        (l: { completeAfter: boolean; active: boolean }) =>
          !l.active || l.completeAfter,
      ),
    ).toBe(true);
  });

  it("attendance manifest: refuses while a mode is absent, then READY with the audited-RPC proposal only", async () => {
    const snapshot = await readAttendanceSnapshot({
      ...common,
      organizationId: orgT,
    });
    expect(
      snapshot.locations.map(
        (l: { attendanceMode: unknown }) => l.attendanceMode,
      ),
    ).toEqual([null, null]);
    const manifest = (decisions: { locationId: string; mode: string }[]) => ({
      schema: ATTENDANCE_MANIFEST_SCHEMA,
      status: "approved",
      approvedBy: "local-test",
      stateHash: computeAttendanceStateHash(snapshot),
      locations: decisions,
    });
    const refused = planAttendanceCompatibility(
      snapshot,
      manifest([{ locationId: locT1, mode: "disabled" }]),
    );
    expect(refused.verdict).toBe("REFUSED");
    expect(refused.blockers).toContainEqual({
      code: "owner_approved_mode_absent",
      locationId: locT2,
    });
    const ready = planAttendanceCompatibility(
      snapshot,
      manifest([
        { locationId: locT1, mode: "disabled" },
        { locationId: locT2, mode: "internal_the_lineup" },
      ]),
    );
    expect(ready.verdict).toBe("READY_FOR_OWNER_APPROVAL");
    expect(ready.modeUpdates).toHaveLength(2);
    expect(ready.financialConsumption).toBe("OFF");
    // Nothing was written: modes are still unconfigured.
    const still = await readAttendanceSnapshot({
      ...common,
      organizationId: orgT,
    });
    expect(
      still.locations.every(
        (l: { attendanceMode: unknown }) => l.attendanceMode === null,
      ),
    ).toBe(true);
  });
});
