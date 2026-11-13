import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.generated";
import {
  consumeKioskPairingCode,
  createKioskPairingCode,
  getKioskDeviceByToken,
} from "@/features/kiosk/data/kiosk-device-data";

/**
 * V2-008 Security Gate S1 / U-1: a revoked kiosk device stays revoked, against
 * REAL Supabase Auth sessions and the app's OWN pairing/lookup code.
 *
 * pgTAP 0079 proves the state machine with modelled claims. This suite proves
 * it end to end: managers pair tablets through createKioskPairingCode, the
 * server consumes the code (consumeKioskPairingCode), the tablet's bearer token
 * resolves through getKioskDeviceByToken - the single gate every kiosk clock /
 * PIN request passes - and genuine GoTrue sessions (including a real global
 * sign-out) drive revoke / reassign over PostgREST with replayed access tokens.
 * Disposable loopback stack only.
 */

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

describe("revoked kiosk devices stay revoked (U-1) with real Auth sessions", () => {
  let admin: SupabaseClient<Database>;
  const run = crypto.randomUUID().slice(0, 8);
  const actors: Record<string, Actor> = {};
  const userIds: string[] = [];
  const orgIds: string[] = [];
  let orgAId = "";
  let locA1 = "";
  let locA2 = "";
  let locB1 = "";

  // Shared lifecycle state across the ordered tests below.
  let t1 = { id: "", token: "" }; // revoked, then hammered
  let t2 = { id: "", token: "" }; // legitimately reassigned
  const versionsSeen = new Map<string, number>();

  function replay(token: string) {
    return createClient<Database>(env.url, env.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }

  async function makeActor(key: string): Promise<Actor> {
    const email = `kiosk-s1-${run}-${key}@harness.invalid`;
    const password = crypto.randomBytes(24).toString("base64url");
    const created = must(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    );
    const id = created.user!.id;
    userIds.push(id);
    must(
      await admin.from("profiles").insert({ id, display_name: `S1 ${key}` }),
    );
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

  /** The app's real pairing path: manager issues a code, server consumes it. */
  async function pairTablet(manager: Actor, location: string, name: string) {
    const code = await createKioskPairingCode(manager.client, {
      locationId: location,
      deviceName: name,
    });
    if (!code.ok) throw Error(`pairing code refused: ${code.error}`);
    const paired = await consumeKioskPairingCode(admin, {
      pairingCode: code.data.pairingCode,
      clientIdentifier: `s1-${run}-${name}`,
    });
    if (!paired.ok) throw Error(`pairing failed: ${paired.error}`);
    return {
      id: paired.data.context.deviceId,
      token: paired.data.token,
    };
  }

  async function deviceRow(id: string) {
    return must(
      await admin.from("kiosk_devices").select("*").eq("id", id).single(),
    );
  }

  async function auditCount(deviceId: string, action: string) {
    const { count, error } = await admin
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", deviceId)
      .eq("action", action);
    if (error) throw Error(error.message);
    return count ?? 0;
  }

  async function noteVersion(id: string) {
    const row = await deviceRow(id);
    const prior = versionsSeen.get(id) ?? 0;
    expect(row.credential_version).toBeGreaterThanOrEqual(prior);
    versionsSeen.set(id, row.credential_version);
    return row;
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
    admin = createClient<Database>(env.url, env.secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    for (const key of ["owner", "mgr", "mgr-out", "staff", "foreign"]) {
      await makeActor(key);
    }

    const orgA = must(
      await admin
        .from("organizations")
        .insert({
          name: `Kiosk S1 A ${run}`,
          slug: `kiosk-s1-a-${run}`,
          created_by: actors.owner.id,
        })
        .select()
        .single(),
    );
    const orgB = must(
      await admin
        .from("organizations")
        .insert({
          name: `Kiosk S1 B ${run}`,
          slug: `kiosk-s1-b-${run}`,
          created_by: actors.foreign.id,
        })
        .select()
        .single(),
    );
    orgAId = orgA.id;
    orgIds.push(orgA.id, orgB.id);

    const locs = must(
      await admin
        .from("locations")
        .insert([
          {
            organization_id: orgA.id,
            name: "S1 A1",
            time_zone: "America/Chicago",
          },
          {
            organization_id: orgA.id,
            name: "S1 A2",
            time_zone: "America/Chicago",
          },
          {
            organization_id: orgB.id,
            name: "S1 B1",
            time_zone: "America/Chicago",
          },
        ])
        .select("id, name"),
    );
    locA1 = locs.find((l) => l.name === "S1 A1")!.id;
    locA2 = locs.find((l) => l.name === "S1 A2")!.id;
    locB1 = locs.find((l) => l.name === "S1 B1")!.id;

    const member = (key: string, roles: string[], org = orgA.id) => ({
      organization_id: org,
      profile_id: actors[key].id,
      roles: roles as Database["public"]["Enums"]["app_role"][],
      active: true,
    });
    must(
      await admin
        .from("memberships")
        .insert([
          member("owner", ["owner"]),
          member("mgr", ["server"]),
          member("mgr-out", ["server"]),
          member("staff", ["server"]),
          member("foreign", ["owner"], orgB.id),
        ]),
    );
    const row = (
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
          row("mgr", locA1, "manager"),
          row("mgr-out", locA1, "manager"),
          row("staff", locA1, "staff"),
        ]),
    );

    t1 = await pairTablet(actors.mgr, locA1, "S1 tablet one");
    t2 = await pairTablet(actors.mgr, locA1, "S1 tablet two");
  }, 120_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (!admin) return;
    // Organization delete cascades locations, memberships and kiosk tables.
    for (const id of orgIds)
      await admin.from("organizations").delete().eq("id", id);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
    const left = await admin
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .in("id", orgIds);
    if ((left.count ?? 0) > 0) throw Error("kiosk-s1 fixture leftovers");
  }, 120_000);

  it("pairing through the real flow yields devices that resolve through the clock gate", async () => {
    for (const t of [t1, t2]) {
      const res = await getKioskDeviceByToken(admin, t.token);
      expect(res.ok && res.data?.deviceId).toBe(t.id);
      expect(res.ok && res.data?.locationId).toBe(locA1);
      expect(res.ok && res.data?.organizationId).toBe(orgAId);
      await noteVersion(t.id);
    }
  });

  it("revoking a device removes its authority; the stale tablet token matches nothing", async () => {
    const revoke = await actors.owner.client.rpc("kiosk_revoke_device", {
      p_device_id: t1.id,
      p_reason: "S1 lost tablet",
    });
    expect(revoke.error).toBeNull();

    const gate = await getKioskDeviceByToken(admin, t1.token);
    expect(gate.ok && gate.data).toBeNull();

    const row = await noteVersion(t1.id);
    expect(row.status).toBe("revoked");
    expect(row.device_token_hash).toBeNull();
    expect(row.credential_version).toBe(2);
    expect(await auditCount(t1.id, "kiosk_device_revoked")).toBe(1);
  });

  it("U-1: no authorized actor can reassign a revoked device back to active", async () => {
    const before = await deviceRow(t1.id);

    for (const key of ["owner", "mgr"] as const) {
      const res = await actors[key].client.rpc("kiosk_reassign_device", {
        p_device_id: t1.id,
        p_new_location_id: key === "owner" ? locA2 : locA1,
      });
      expect(res.error?.code).toBe("55000");
      expect(res.error?.message).toMatch(
        /revoked devices cannot be reassigned/i,
      );
    }

    const after = await deviceRow(t1.id);
    // updated_at/created_at included: a refused call must change nothing at all.
    expect(after).toEqual(before);
    expect(after.status).toBe("revoked");
    expect(after.location_id).toBe(locA1);
    expect(after.credential_version).toBe(2);
    expect(after.device_token_hash).toBeNull();
    expect(await auditCount(t1.id, "kiosk_device_reassigned")).toBe(0);
    expect(await auditCount(t1.id, "kiosk_device_revoked")).toBe(1);

    const stale = await getKioskDeviceByToken(admin, t1.token);
    expect(stale.ok && stale.data).toBeNull();
    await noteVersion(t1.id);
  });

  it("unauthorized, cross-tenant and signed-out callers get a plain denial with no status oracle", async () => {
    const before = await deviceRow(t1.id);

    // Real global sign-out: the old access token is still cryptographically valid.
    const out = await admin.auth.admin.signOut(
      actors["mgr-out"].token,
      "global",
    );
    expect(out.error).toBeNull();

    for (const key of ["staff", "foreign", "mgr-out"] as const) {
      const revokedDevice = await actors[key].client.rpc(
        "kiosk_reassign_device",
        { p_device_id: t1.id, p_new_location_id: locA2 },
      );
      expect(revokedDevice.error?.code).toBe("42501");
      expect(revokedDevice.error?.message).toBe("Unauthorized");
      expect(revokedDevice.error?.message).not.toMatch(/revoked/i);

      const activeDevice = await actors[key].client.rpc(
        "kiosk_reassign_device",
        { p_device_id: t2.id, p_new_location_id: locA2 },
      );
      expect(activeDevice.error?.code).toBe("42501");
    }
    // Cross-tenant destination for a legitimately authorized actor is still refused.
    const crossTenant = await actors.owner.client.rpc("kiosk_reassign_device", {
      p_device_id: t2.id,
      p_new_location_id: locB1,
    });
    expect(crossTenant.error?.code).toBe("22023");

    expect(await deviceRow(t1.id)).toEqual(before);
    const t2row = await deviceRow(t2.id);
    expect(t2row.status).toBe("active");
    expect(t2row.location_id).toBe(locA1);
    expect(t2row.credential_version).toBe(1);
    const t2gate = await getKioskDeviceByToken(admin, t2.token);
    expect(t2gate.ok && t2gate.data?.deviceId).toBe(t2.id);
  });

  it("a client cannot write device status or credentials directly over PostgREST", async () => {
    const before = await deviceRow(t1.id);
    for (const key of ["owner", "mgr"] as const) {
      const res = await actors[key].client
        .from("kiosk_devices")
        .update({
          status: "active",
          credential_version: 1,
          device_token_hash: "x".repeat(64),
        })
        .eq("id", t1.id);
      expect(res.error?.code).toBe("42501");
    }
    expect(await deviceRow(t1.id)).toEqual(before);
    const gate = await getKioskDeviceByToken(admin, t1.token);
    expect(gate.ok && gate.data).toBeNull();
  });

  it("legitimate reassignment of an ACTIVE device still works and rotates its credential", async () => {
    const res = await actors.owner.client.rpc("kiosk_reassign_device", {
      p_device_id: t2.id,
      p_new_location_id: locA2,
    });
    expect(res.error).toBeNull();

    const row = await noteVersion(t2.id);
    expect(row.status).toBe("active");
    expect(row.location_id).toBe(locA2);
    expect(row.organization_id).toBe(orgAId);
    expect(row.device_token_hash).toBeNull();
    expect(row.credential_version).toBe(2);

    // The tablet's old bearer token no longer resolves: it must re-pair.
    const stale = await getKioskDeviceByToken(admin, t2.token);
    expect(stale.ok && stale.data).toBeNull();

    const audit = must(
      await admin
        .from("audit_events")
        .select("actor_profile_id, before_state, after_state")
        .eq("entity_id", t2.id)
        .eq("action", "kiosk_device_reassigned")
        .single(),
    );
    expect(audit.actor_profile_id).toBe(actors.owner.id);
    expect(audit.before_state).toMatchObject({
      location_id: locA1,
      status: "active",
      credential_version: 1,
    });
    expect(audit.after_state).toMatchObject({
      location_id: locA2,
      status: "active",
      credential_version: 2,
    });
  });

  it("recovery of the revoked tablet is a NEW pairing: new row, new token, old row untouched", async () => {
    const before = await deviceRow(t1.id);
    const t3 = await pairTablet(actors.mgr, locA1, "S1 replacement tablet");

    expect(t3.id).not.toBe(t1.id);
    const gate = await getKioskDeviceByToken(admin, t3.token);
    expect(gate.ok && gate.data?.deviceId).toBe(t3.id);
    expect(gate.ok && gate.data?.locationId).toBe(locA1);
    expect(gate.ok && gate.data?.organizationId).toBe(orgAId);

    const fresh = await noteVersion(t3.id);
    expect(fresh.status).toBe("active");
    expect(fresh.credential_version).toBe(1);

    // The old revoked row and its old credential did not come back.
    expect(await deviceRow(t1.id)).toEqual(before);
    const stale = await getKioskDeviceByToken(admin, t1.token);
    expect(stale.ok && stale.data).toBeNull();

    // The new tablet can be legitimately moved; the revoked one still cannot.
    const move = await actors.owner.client.rpc("kiosk_reassign_device", {
      p_device_id: t3.id,
      p_new_location_id: locA2,
    });
    expect(move.error).toBeNull();
    const again = await actors.owner.client.rpc("kiosk_reassign_device", {
      p_device_id: t1.id,
      p_new_location_id: locA2,
    });
    expect(again.error?.code).toBe("55000");
    await noteVersion(t3.id);
  });

  it("no operation in this suite ever decreased a credential_version", async () => {
    for (const id of versionsSeen.keys()) await noteVersion(id);
    expect(versionsSeen.size).toBeGreaterThanOrEqual(3);
  });
});
