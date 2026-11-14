/**
 * V2-009 B4 — integration seam between B1 (F-5 transactional Team lifecycle,
 * `team_set_member_active` / `team_add_member`) and B3 (person-level PIN,
 * multi-organization credentials, login-time credential sync).
 *
 * B1 and B3 each have real-GoTrue tests, but none chains the two: the F-5
 * tests use password users with no PIN credentials and the B3 tests never
 * call the lifecycle RPCs. This file covers exactly that seam, against the
 * DISPOSABLE loopback Supabase stack only. All identities are `b4-<run>`
 * synthetic rows removed in afterAll.
 */
import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.generated";
import {
  createPasscodeLocator,
  createPersonAuthPassword,
} from "@/lib/passcode-security";
import { rotatePasscodeCredential } from "@/features/auth/data/passcode-rotation";

vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));

const mockCookies: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockImplementation(() => ({
    get: (name: string) =>
      mockCookies[name] ? { name, value: mockCookies[name] } : undefined,
    getAll: () =>
      Object.entries(mockCookies).map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => {
      mockCookies[name] = value;
    },
    setAll: (list: Array<{ name: string; value: string }>) => {
      for (const c of list) mockCookies[c.name] = c.value;
    },
    delete: (name: string) => {
      delete mockCookies[name];
    },
  })),
}));

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

describe("V2-009 B4: F-5 lifecycle x B3 personal-PIN seam (real GoTrue + PostgREST)", () => {
  const run = crypto.randomUUID().slice(0, 8);
  const users: string[] = [];
  const organizations: string[] = [];
  let admin: SupabaseClient<Database>;
  let owner: SupabaseClient<Database>;
  let orgA = "";
  let orgB = "";
  let ipCounter = 0;

  async function pinLogin(slugSuffix: "a" | "b", passcode: string) {
    for (const k of Object.keys(mockCookies)) delete mockCookies[k];
    const { POST } = await import("@/app/api/auth/passcode/route");
    ipCounter += 1;
    return POST(
      new Request("http://localhost/api/auth/passcode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": `198.51.100.${ipCounter}`,
        },
        body: JSON.stringify({
          restaurantSlug: `b4-${run}-${slugSuffix}`,
          passcode,
        }),
      }),
    );
  }

  async function credential(orgId: string, profileId: string) {
    return must(
      await admin
        .from("passcode_credentials")
        .select("active, locator")
        .eq("organization_id", orgId)
        .eq("profile_id", profileId)
        .maybeSingle(),
    );
  }

  async function makePinUser(label: string, pin: string, orgIds: string[]) {
    const syntheticEmail = `${crypto.randomUUID()}@passcode.internal`;
    const created = must(
      await admin.auth.admin.createUser({
        email: syntheticEmail,
        password: crypto.randomUUID(),
        email_confirm: true,
      }),
    );
    const id = created.user!.id;
    users.push(id);
    must(
      await admin.auth.admin.updateUserById(id, {
        password: createPersonAuthPassword(id, pin),
      }),
    );
    must(await admin.from("profiles").insert({ id, display_name: label }));
    for (const orgId of orgIds) {
      must(
        await admin.from("memberships").insert({
          organization_id: orgId,
          profile_id: id,
          roles: ["server"],
          active: true,
        }),
      );
      must(
        await admin.from("passcode_credentials").insert({
          organization_id: orgId,
          profile_id: id,
          synthetic_email: syntheticEmail,
          locator: createPasscodeLocator(orgId, pin),
          active: true,
        }),
      );
    }
    return { id, syntheticEmail };
  }

  const setActive = (orgId: string, profileId: string, active: boolean) =>
    owner.rpc("team_set_member_active", {
      p_organization_id: orgId,
      p_target_profile_id: profileId,
      p_active: active,
      p_reason: "B4 seam test",
    });

  beforeAll(async () => {
    if (
      !/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url) ||
      !anon ||
      !secret
    ) {
      throw Error("Disposable loopback Supabase stack required");
    }
    process.env.APP_PIN_PEPPER =
      "test-pepper-at-least-32-characters-long-12345";
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anon;
    process.env.SUPABASE_SECRET_KEY = secret;
    admin = createClient<Database>(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Organization owner of A with a real password session (live auth.sessions row).
    const ownerEmail = `b4-${run}-owner@harness.invalid`;
    const ownerPassword = crypto.randomBytes(24).toString("base64url");
    const created = must(
      await admin.auth.admin.createUser({
        email: ownerEmail,
        password: ownerPassword,
        email_confirm: true,
      }),
    );
    const ownerId = created.user!.id;
    users.push(ownerId);
    must(
      await admin
        .from("profiles")
        .insert({ id: ownerId, display_name: "b4 owner" }),
    );
    const signIn = must(
      await createClient<Database>(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      }).auth.signInWithPassword({
        email: ownerEmail,
        password: ownerPassword,
      }),
    );
    owner = createClient<Database>(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: `Bearer ${signIn.session!.access_token}` },
      },
    });

    for (const sfx of ["a", "b"] as const) {
      const org = must(
        await admin
          .from("organizations")
          .insert({
            name: `B4 Org ${sfx} ${run}`,
            slug: `b4-${run}-${sfx}`,
            created_by: ownerId,
          })
          .select("id")
          .single(),
      );
      organizations.push(org.id);
      if (sfx === "a") orgA = org.id;
      else orgB = org.id;
    }
    must(
      await admin.from("memberships").insert({
        organization_id: orgA,
        profile_id: ownerId,
        roles: ["owner"],
        active: true,
      }),
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
    if ((left.count ?? 0) !== 0) throw Error("B4 fixture cleanup failed");
  }, 120_000);

  it("deactivation in A denies PIN login to A only; B keeps working with the same PIN; reactivation restores A", async () => {
    const t = await makePinUser("b4 target", "4321", [orgA, orgB]);
    expect((await pinLogin("a", "4321")).status).toBe(200);
    expect((await pinLogin("b", "4321")).status).toBe(200);

    must(await setActive(orgA, t.id, false));
    expect((await credential(orgA, t.id)).active).toBe(false);
    expect((await credential(orgB, t.id)).active).toBe(true);

    expect((await pinLogin("a", "4321")).status).toBe(401);
    expect((await pinLogin("b", "4321")).status).toBe(200);
    const { user } = must(await admin.auth.admin.getUserById(t.id));
    expect(user!.banned_until ?? null).toBeNull();

    must(await setActive(orgA, t.id, true));
    expect((await credential(orgA, t.id)).active).toBe(true);
    expect((await pinLogin("a", "4321")).status).toBe(200);
  });

  it("a PIN rotated while A is deactivated applies to A on reactivation; the old PIN dies everywhere", async () => {
    const t = await makePinUser("b4 rotated", "2468", [orgA, orgB]);
    must(await setActive(orgA, t.id, false));

    const rotated = await rotatePasscodeCredential(admin, {
      organizationId: orgB,
      profileId: t.id,
      newPasscode: "8642",
    });
    expect(rotated).toEqual({ ok: true });
    expect((await credential(orgA, t.id)).locator).toBe(
      createPasscodeLocator(orgA, "8642"),
    );

    expect((await pinLogin("b", "8642")).status).toBe(200);
    expect((await pinLogin("b", "2468")).status).toBe(401);
    expect((await pinLogin("a", "8642")).status).toBe(401); // still inactive

    must(await setActive(orgA, t.id, true));
    expect((await pinLogin("a", "8642")).status).toBe(200);
    expect((await pinLogin("a", "2468")).status).toBe(401);
  });

  it("fails closed when a credential is active but the membership is inactive (lost sync/deactivation race outcome)", async () => {
    const t = await makePinUser("b4 stale", "1122", [orgA, orgB]);
    must(await setActive(orgA, t.id, false));
    // Simulate the race outcome the login-time sync could leave behind.
    must(
      await admin
        .from("passcode_credentials")
        .update({ active: true })
        .eq("organization_id", orgA)
        .eq("profile_id", t.id)
        .select("id"),
    );
    const res = await pinLogin("a", "1122");
    expect(res.status).not.toBe(200);
    expect([401, 403]).toContain(res.status);
    expect(await res.json()).not.toHaveProperty("user");
    // Org B remains reachable by the same person.
    expect((await pinLogin("b", "1122")).status).toBe(200);
  });

  it("team_add_member + login-time sync gives an existing PIN holder access to the new organization, and sync never materialises a credential for an inactive membership", async () => {
    const t = await makePinUser("b4 added", "1357", [orgB]);
    must(
      await owner.rpc("team_add_member", {
        p_organization_id: orgA,
        p_target_profile_id: t.id,
        p_roles: ["server"],
        p_reason: "B4 seam test",
      }),
    );
    // No credential is created or copied by the RPC itself.
    expect(
      (
        await admin
          .from("passcode_credentials")
          .select("id")
          .eq("organization_id", orgA)
          .eq("profile_id", t.id)
      ).data,
    ).toEqual([]);
    expect((await pinLogin("a", "1357")).status).toBe(401);

    // A login in B syncs the credential for the active membership in A.
    expect((await pinLogin("b", "1357")).status).toBe(200);
    expect((await credential(orgA, t.id)).active).toBe(true);
    expect((await pinLogin("a", "1357")).status).toBe(200);

    // Inactive membership without a credential row: sync must not create one.
    const u = await makePinUser("b4 inactive-added", "9753", [orgB]);
    must(
      await owner.rpc("team_add_member", {
        p_organization_id: orgA,
        p_target_profile_id: u.id,
        p_roles: ["server"],
        p_reason: "B4 seam test",
      }),
    );
    must(await setActive(orgA, u.id, false));
    expect((await pinLogin("b", "9753")).status).toBe(200);
    expect(
      (
        await admin
          .from("passcode_credentials")
          .select("id")
          .eq("organization_id", orgA)
          .eq("profile_id", u.id)
      ).data,
    ).toEqual([]);
  });
});
