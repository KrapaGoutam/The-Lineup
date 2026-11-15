import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database.generated";

/**
 * V2-008 B1 (F-1 + D7): kiosk manager authority against REAL Supabase Auth.
 *
 * pgTAP (0078) proves the predicate against modelled `session_id` claims. This
 * suite proves the actual propagation: genuine GoTrue sessions, a real
 * sign-out (session revoked), a real ban, a real membership deactivation, and
 * the OLD access token replayed straight at PostgREST (the F-1 attack path -
 * no Server Action, no requireLiveSession). Disposable loopback stack only.
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
  email: string;
  token: string;
  client: SupabaseClient<Database>;
};

describe("kiosk manager authority with real Auth sessions", () => {
  let admin: SupabaseClient<Database>;
  const run = crypto.randomUUID().slice(0, 8);
  const actors: Record<string, Actor> = {};
  const userIds: string[] = [];
  const orgIds: string[] = [];
  let locA1 = "";
  let locA2 = "";
  let locB1 = "";
  let deviceA1 = "";
  let deviceA2 = "";

  /** A client that replays exactly one captured access token (no refresh). */
  function replay(token: string) {
    return createClient<Database>(env.url, env.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }

  async function makeActor(key: string): Promise<Actor> {
    const email = `kiosk-${run}-${key}@harness.invalid`;
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
    must(await admin.from("profiles").insert({ id, display_name: `K ${key}` }));
    const anonClient = createClient<Database>(env.url, env.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = must(
      await anonClient.auth.signInWithPassword({ email, password }),
    );
    const token = signedIn.session!.access_token;
    const actor = { id, email, token, client: replay(token) };
    actors[key] = actor;
    return actor;
  }

  async function listIds(a: Actor) {
    const { data, error } = await a.client.rpc(
      "kiosk_list_manageable_locations",
    );
    if (error) throw Error(error.message);
    return (data ?? []).map((r) => r.location_id).sort();
  }

  async function pair(a: Actor, location: string, label: string) {
    return a.client.rpc("kiosk_generate_pairing_code", {
      p_location_id: location,
      p_device_name: label,
      p_code_hash: crypto.randomBytes(32).toString("hex"),
    });
  }

  beforeAll(async () => {
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

    for (const key of [
      "overall",
      "owner",
      "mgr",
      "mgr-signout",
      "mgr-ban",
      "mgr-inactive",
      "mgr-nomember",
      "asst",
      "staff",
      "foreign",
    ]) {
      await makeActor(key);
    }

    const orgA = must(
      await admin
        .from("organizations")
        .insert({
          name: `Kiosk Auth A ${run}`,
          slug: `kiosk-auth-a-${run}`,
          created_by: actors.owner.id,
        })
        .select()
        .single(),
    );
    const orgB = must(
      await admin
        .from("organizations")
        .insert({
          name: `Kiosk Auth B ${run}`,
          slug: `kiosk-auth-b-${run}`,
          created_by: actors.foreign.id,
        })
        .select()
        .single(),
    );
    orgIds.push(orgA.id, orgB.id);

    const locs = must(
      await admin
        .from("locations")
        .insert([
          {
            organization_id: orgA.id,
            name: "KA A1",
            time_zone: "America/Chicago",
          },
          {
            organization_id: orgA.id,
            name: "KA A2",
            time_zone: "America/Chicago",
          },
          {
            organization_id: orgB.id,
            name: "KA B1",
            time_zone: "America/Chicago",
          },
        ])
        .select("id, name"),
    );
    locA1 = locs.find((l) => l.name === "KA A1")!.id;
    locA2 = locs.find((l) => l.name === "KA A2")!.id;
    locB1 = locs.find((l) => l.name === "KA B1")!.id;

    must(
      await admin
        .from("overall_roles")
        .insert({ profile_id: actors.overall.id, role: "owner" }),
    );

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
          member("mgr-signout", ["server"]),
          member("mgr-ban", ["server"]),
          member("mgr-inactive", ["server"]),
          member("asst", ["server"]),
          member("staff", ["server"]),
          member("foreign", ["owner"], orgB.id),
        ]),
    );
    // mgr-nomember deliberately has NO membership row (stale/synthetic location row).
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
          row("mgr-signout", locA1, "manager"),
          row("mgr-ban", locA1, "manager"),
          row("mgr-inactive", locA1, "manager"),
          row("mgr-nomember", locA1, "manager"),
          row("asst", locA1, "assistant_manager"),
          row("staff", locA1, "staff"),
        ]),
    );

    const devices = must(
      await admin
        .from("kiosk_devices")
        .insert([
          {
            organization_id: orgA.id,
            location_id: locA1,
            name: "KA A1 tablet",
            device_token_hash: crypto.randomBytes(32).toString("hex"),
          },
          {
            organization_id: orgA.id,
            location_id: locA2,
            name: "KA A2 tablet",
            device_token_hash: crypto.randomBytes(32).toString("hex"),
          },
        ])
        .select("id, name"),
    );
    deviceA1 = devices.find((d) => d.name === "KA A1 tablet")!.id;
    deviceA2 = devices.find((d) => d.name === "KA A2 tablet")!.id;
  }, 120_000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from("overall_roles").delete().in("profile_id", userIds);
    // Organization delete cascades locations, memberships and kiosk tables.
    for (const id of orgIds)
      await admin.from("organizations").delete().eq("id", id);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
    const left = await admin
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .in("id", orgIds);
    if ((left.count ?? 0) > 0) throw Error("kiosk-authority fixture leftovers");
  }, 120_000);

  it("a live location manager sees and manages exactly their own location", async () => {
    const mgr = actors.mgr;
    expect(await listIds(mgr)).toEqual([locA1]);

    const ok = await pair(mgr, locA1, "Real JWT tablet");
    expect(ok.error).toBeNull();

    const cross = await pair(mgr, locA2, "cross-location");
    expect(cross.error?.code).toBe("42501");

    const rename = await mgr.client.rpc("kiosk_rename_device", {
      p_device_id: deviceA2,
      p_name: "hijack",
    });
    expect(rename.error?.code).toBe("42501");

    const reassign = await mgr.client.rpc("kiosk_reassign_device", {
      p_device_id: deviceA1,
      p_new_location_id: locA2,
    });
    expect(reassign.error?.code).toBe("42501");

    const devices = must(await mgr.client.from("kiosk_devices").select("id"));
    expect(devices.map((d) => d.id)).toEqual([deviceA1]);
  });

  it("preserves organization-owner and membership-free Overall authority", async () => {
    expect(await listIds(actors.owner)).toEqual([locA1, locA2].sort());
    const overall = await listIds(actors.overall);
    expect(overall).toEqual(expect.arrayContaining([locA1, locA2, locB1]));
    const renamed = await actors.overall.client.rpc("kiosk_rename_device", {
      p_device_id: deviceA2,
      p_name: "KA A2 tablet",
    });
    expect(renamed.error).toBeNull();
  });

  it("denies assistant managers, staff, foreign owners and rows without an org membership", async () => {
    expect(await listIds(actors.asst)).toEqual([]);
    expect(await listIds(actors.staff)).toEqual([]);
    expect(await listIds(actors["mgr-nomember"])).toEqual([]);
    expect(await listIds(actors.foreign)).toEqual([locB1]);
    expect((await pair(actors["mgr-nomember"], locA1, "x")).error?.code).toBe(
      "42501",
    );
    expect((await pair(actors.foreign, locA1, "x")).error?.code).toBe("42501");
  });

  it("F-1: revoking the real Auth session kills kiosk authority immediately", async () => {
    const m = actors["mgr-signout"];
    expect(await listIds(m)).toEqual([locA1]);
    expect((await pair(m, locA1, "before sign-out")).error).toBeNull();

    // Genuine GoTrue global sign-out: removes the auth.sessions row.
    const out = await admin.auth.admin.signOut(m.token, "global");
    expect(out.error).toBeNull();

    // The OLD access token is still cryptographically valid until it expires.
    expect(await listIds(m)).toEqual([]);
    expect((await pair(m, locA1, "after sign-out")).error?.code).toBe("42501");
    const rows = must(await m.client.from("kiosk_devices").select("id"));
    expect(rows).toEqual([]);
  });

  it("F-1: a banned (deactivated) manager loses kiosk authority on an unexpired token", async () => {
    const m = actors["mgr-ban"];
    expect(await listIds(m)).toEqual([locA1]);

    must(
      await admin.auth.admin.updateUserById(m.id, { ban_duration: "876000h" }),
    );

    expect(await listIds(m)).toEqual([]);
    expect((await pair(m, locA1, "after ban")).error?.code).toBe("42501");
    const revoke = await m.client.rpc("kiosk_revoke_device", {
      p_device_id: deviceA1,
      p_reason: "should be denied",
    });
    expect(revoke.error?.code).toBe("42501");
    const rows = must(await m.client.from("kiosk_devices").select("id"));
    expect(rows).toEqual([]);
  });

  it("F-1: deactivating the organization membership removes a location manager's authority", async () => {
    const m = actors["mgr-inactive"];
    expect(await listIds(m)).toEqual([locA1]);

    must(
      await admin
        .from("memberships")
        .update({ active: false })
        .eq("profile_id", m.id),
    );

    // Session is still live; the location_memberships row is still active.
    expect(await listIds(m)).toEqual([]);
    expect((await pair(m, locA1, "after deactivation")).error?.code).toBe(
      "42501",
    );
  });

  it("direct anonymous PostgREST calls are rejected by privilege", async () => {
    const anon = createClient<Database>(env.url, env.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const list = await anon.rpc("kiosk_list_manageable_locations");
    expect(list.error?.code).toBe("42501");
    const gen = await anon.rpc("kiosk_generate_pairing_code", {
      p_location_id: locA1,
      p_device_name: "anon",
      p_code_hash: crypto.randomBytes(32).toString("hex"),
    });
    expect(gen.error?.code).toBe("42501");
  });
});
