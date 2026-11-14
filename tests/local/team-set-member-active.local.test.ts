import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database.generated";

const status = execSync("npx.cmd supabase status -o env", {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});
const pick = (re: RegExp) => status.match(re)?.[1]?.trim() ?? "";
const url = process.env.LOCAL_SUPABASE_URL ?? pick(/API_URL=["']?([^"'\r\n]+)/);
const anon =
  process.env.LOCAL_SUPABASE_ANON_KEY ??
  pick(/PUBLISHABLE_KEY=["']?([^"'\r\n]+)/) ??
  pick(/ANON_KEY=["']?([^"'\r\n]+)/);
const secret =
  process.env.LOCAL_SUPABASE_SERVICE_KEY ??
  pick(/SECRET_KEY=["']?([^"'\r\n]+)/) ??
  pick(/SERVICE_ROLE_KEY=["']?([^"'\r\n]+)/);

function must<R extends { data: unknown; error: { message: string } | null }>(
  result: R,
): NonNullable<R["data"]> {
  if (result.error) throw Error(result.error.message);
  return result.data as NonNullable<R["data"]>;
}

describe("F-5 Team transition with real local GoTrue sessions", () => {
  const run = crypto.randomUUID().slice(0, 8);
  const users: string[] = [];
  const organizations: string[] = [];
  let admin: SupabaseClient<Database>;
  let owner: SupabaseClient<Database>;
  let member: SupabaseClient<Database>;
  let targetId = "";
  let orgA = "";
  let orgB = "";

  async function makeUser(label: string) {
    const email = `f5-${run}-${label}@harness.invalid`;
    const password = crypto.randomBytes(24).toString("base64url");
    const created = must(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    );
    const id = created.user!.id;
    users.push(id);
    must(await admin.from("profiles").insert({ id, display_name: label }));
    const signed = createClient<Database>(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = must(
      await signed.auth.signInWithPassword({ email, password }),
    );
    const token = signIn.session!.access_token;
    return {
      id,
      client: createClient<Database>(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }),
    };
  }

  async function transition(active: boolean) {
    return owner.rpc("team_set_member_active", {
      p_organization_id: orgA,
      p_target_profile_id: targetId,
      p_active: active,
      p_reason: "Local F-5 security test",
    });
  }

  async function visibleOrganizations() {
    const rows = must(
      await member
        .from("memberships")
        .select("organization_id")
        .eq("profile_id", targetId),
    );
    return rows.map((row) => row.organization_id).sort();
  }

  async function banUntil() {
    const { user } = must(await admin.auth.admin.getUserById(targetId));
    if (!user) throw Error("Synthetic target Auth user is missing");
    return user.banned_until;
  }

  beforeAll(async () => {
    if (
      !/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url) ||
      !anon ||
      !secret
    ) {
      throw Error("Disposable loopback Supabase stack required");
    }
    admin = createClient<Database>(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const ownerUser = await makeUser("owner");
    const targetUser = await makeUser("target");
    owner = ownerUser.client;
    member = targetUser.client;
    targetId = targetUser.id;
    const a = must(
      await admin
        .from("organizations")
        .insert({
          name: "F5 local A",
          slug: `f5-${run}-a`,
          created_by: ownerUser.id,
        })
        .select()
        .single(),
    );
    const b = must(
      await admin
        .from("organizations")
        .insert({
          name: "F5 local B",
          slug: `f5-${run}-b`,
          created_by: ownerUser.id,
        })
        .select()
        .single(),
    );
    orgA = a.id;
    orgB = b.id;
    organizations.push(orgA, orgB);
    must(
      await admin.from("memberships").insert([
        { organization_id: orgA, profile_id: ownerUser.id, roles: ["owner"] },
        { organization_id: orgA, profile_id: targetId, roles: ["server"] },
        { organization_id: orgB, profile_id: targetId, roles: ["server"] },
      ]),
    );
  }, 120_000);

  afterAll(async () => {
    if (!admin) return;
    for (const id of organizations) {
      await admin.from("organizations").delete().eq("id", id);
    }
    for (const id of users) await admin.auth.admin.deleteUser(id);
    const left = await admin
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .in("id", organizations);
    if ((left.count ?? 0) !== 0)
      throw Error("F-5 local fixture cleanup failed");
  }, 120_000);

  it("denies A on the existing token while retaining B and no new global ban", async () => {
    expect(await visibleOrganizations()).toEqual([orgA, orgB].sort());
    const before = await banUntil();
    const deactivated = must(await transition(false));
    expect(deactivated).toMatchObject({
      outcome: "changed",
      membership_active: false,
    });
    expect(await visibleOrganizations()).toEqual([orgB]);
    const after = await banUntil();
    expect(after).toBe(before);
  });

  it("converges on repeat and reactivates only A", async () => {
    expect(must(await transition(false))).toMatchObject({
      outcome: "already_in_state",
    });
    expect(must(await transition(true))).toMatchObject({
      outcome: "changed",
      membership_active: true,
    });
    expect(await visibleOrganizations()).toEqual([orgA, orgB].sort());
  });

  it("preserves an independent global ban in both directions", async () => {
    must(
      await admin.auth.admin.updateUserById(targetId, { ban_duration: "24h" }),
    );
    const before = await banUntil();
    expect(before).toBeTruthy();
    expect(must(await transition(false))).toMatchObject({ outcome: "changed" });
    expect(await banUntil()).toBe(before);
    expect(must(await transition(true))).toMatchObject({ outcome: "changed" });
    expect(await banUntil()).toBe(before);
  });

  it("rejects anonymous Team RPC access", async () => {
    const anonymous = createClient<Database>(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await anonymous.rpc("team_set_member_active", {
      p_organization_id: orgA,
      p_target_profile_id: targetId,
      p_active: false,
      p_reason: "Local F-5 security test",
    });
    expect(result.error?.code).toBe("42501");
  });

  it("assigns an existing employee without exposing direct creation or removal", async () => {
    const added = await makeUser("assigned");
    must(
      await admin.from("memberships").insert({
        organization_id: orgB,
        profile_id: added.id,
        roles: ["server"],
      }),
    );
    const before = await admin.auth.admin.getUserById(added.id);
    const assignment = must(
      await owner.rpc("team_add_member", {
        p_organization_id: orgA,
        p_target_profile_id: added.id,
        p_roles: ["server"],
        p_reason: "Local existing employee assignment",
      }),
    );
    expect(assignment).toMatchObject({
      outcome: "added",
      credential_present: false,
    });
    const directInsert = await owner.from("memberships").insert({
      organization_id: orgA,
      profile_id: added.id,
      roles: ["server"],
    });
    expect(directInsert.error?.code).toBe("42501");
    const removed = must(
      await owner.rpc("team_set_member_active", {
        p_organization_id: orgA,
        p_target_profile_id: added.id,
        p_active: false,
        p_reason: "Local employee removal",
      }),
    );
    expect(removed).toMatchObject({ outcome: "changed" });
    const directDelete = await owner
      .from("memberships")
      .delete()
      .eq("organization_id", orgA)
      .eq("profile_id", added.id);
    expect(directDelete.error?.code).toBe("42501");
    const visible = must(
      await added.client
        .from("memberships")
        .select("organization_id")
        .eq("profile_id", added.id),
    );
    expect(visible.map((row) => row.organization_id)).toEqual([orgB]);
    const audit = must(
      await admin
        .from("audit_events")
        .select("action")
        .eq("organization_id", orgA)
        .eq("entity_id", added.id)
        .in("action", ["member_added", "member_deactivated"]),
    );
    expect(audit.map((row) => row.action).sort()).toEqual([
      "member_added",
      "member_deactivated",
    ]);
    expect(
      (await admin.auth.admin.getUserById(added.id)).data.user?.banned_until,
    ).toBe(before.data.user?.banned_until);
  });
});
