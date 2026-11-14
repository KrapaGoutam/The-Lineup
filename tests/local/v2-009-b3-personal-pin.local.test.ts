import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.generated";
import {
  createPasscodeLocator,
  createPersonAuthPassword,
  createAuthPassword,
} from "@/lib/passcode-security";
import { rotatePasscodeCredential } from "@/features/auth/data/passcode-rotation";
import {
  verifyPasscode,
  migrateLegacyAuthPassword,
} from "@/features/auth/data/passcode-verify";

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(),
}));

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
      for (const c of list) {
        mockCookies[c.name] = c.value;
      }
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

describe("V2-009 B3: Personal PIN & Multi-Organization Authentication", () => {
  const run = crypto.randomUUID().slice(0, 8);
  const users: string[] = [];
  const organizations: string[] = [];
  let admin: SupabaseClient<Database>;
  let orgA = "";
  let orgB = "";

  beforeAll(async () => {
    process.env.APP_PIN_PEPPER =
      "test-pepper-at-least-32-characters-long-12345";
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anon;
    process.env.SUPABASE_SECRET_KEY = secret;
    admin = createClient<Database>(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Create initial user for created_by
    const ownerEmail = `b3-creator-${run}@harness.invalid`;
    const createdOwner = must(
      await admin.auth.admin.createUser({
        email: ownerEmail,
        password: "test-creator-password-1234",
        email_confirm: true,
      }),
    );
    const creatorId = createdOwner.user!.id;
    users.push(creatorId);
    must(
      await admin
        .from("profiles")
        .insert({ id: creatorId, display_name: "Test Creator" }),
    );

    // Create 2 test organizations
    const orgACreated = must(
      await admin
        .from("organizations")
        .insert({
          name: `B3 Org A ${run}`,
          slug: `b3-org-a-${run}`,
          created_by: creatorId,
        })
        .select("id")
        .single(),
    );
    orgA = orgACreated.id;
    organizations.push(orgA);

    const orgBCreated = must(
      await admin
        .from("organizations")
        .insert({
          name: `B3 Org B ${run}`,
          slug: `b3-org-b-${run}`,
          created_by: creatorId,
        })
        .select("id")
        .single(),
    );
    orgB = orgBCreated.id;
    organizations.push(orgB);
  });

  afterAll(async () => {
    if (organizations.length > 0) {
      await admin.from("organizations").delete().in("id", organizations);
    }
    for (const id of users) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  async function createPasscodeUser(input: {
    displayName: string;
    pin: string;
    orgMemberships: Array<{
      orgId: string;
      role: Database["public"]["Enums"]["app_role"];
    }>;
    useLegacyPassword?: boolean;
  }) {
    const syntheticEmail = `${crypto.randomUUID()}@passcode.internal`;
    const authPassword = input.useLegacyPassword
      ? createAuthPassword(input.orgMemberships[0].orgId, input.pin)
      : createPersonAuthPassword(input.pin);

    const created = must(
      await admin.auth.admin.createUser({
        email: syntheticEmail,
        password: authPassword,
        email_confirm: true,
      }),
    );
    const userId = created.user!.id;
    users.push(userId);

    must(
      await admin
        .from("profiles")
        .insert({ id: userId, display_name: input.displayName }),
    );

    for (const m of input.orgMemberships) {
      must(
        await admin.from("memberships").insert({
          organization_id: m.orgId,
          profile_id: userId,
          roles: [m.role],
          active: true,
        }),
      );
      const locator = createPasscodeLocator(m.orgId, input.pin);
      must(
        await admin.from("passcode_credentials").insert({
          organization_id: m.orgId,
          profile_id: userId,
          synthetic_email: syntheticEmail,
          locator,
          active: true,
        }),
      );
    }

    return { id: userId, syntheticEmail, pin: input.pin };
  }

  it("authenticates a multi-org user in Org A and Org B with their single personal PIN", async () => {
    const user = await createPasscodeUser({
      displayName: "Multi Org Worker",
      pin: "4826",
      orgMemberships: [
        { orgId: orgA, role: "server" },
        { orgId: orgB, role: "server" },
      ],
    });

    // 1. Verify against Org A with personal PIN
    const authClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const verifyA = await verifyPasscode(authClient, {
      syntheticEmail: user.syntheticEmail,
      organizationId: orgA,
      passcode: "4826",
    });
    expect(verifyA.ok).toBe(true);
    expect(verifyA.verifiedVia).toBe("person");
    expect(verifyA.session).toBeDefined();

    // 2. Verify against Org B with the exact same personal PIN
    const verifyB = await verifyPasscode(authClient, {
      syntheticEmail: user.syntheticEmail,
      organizationId: orgB,
      passcode: "4826",
    });
    expect(verifyB.ok).toBe(true);
    expect(verifyB.verifiedVia).toBe("person");
    expect(verifyB.session).toBeDefined();
  });

  it("migrates a legacy org-derived account to person-level password on login", async () => {
    const legacyUser = await createPasscodeUser({
      displayName: "Legacy Worker",
      pin: "7193",
      orgMemberships: [{ orgId: orgA, role: "server" }],
      useLegacyPassword: true,
    });

    const authClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // First login verifies via "derived"
    const verify1 = await verifyPasscode(authClient, {
      syntheticEmail: legacyUser.syntheticEmail,
      organizationId: orgA,
      passcode: "7193",
    });
    expect(verify1.ok).toBe(true);
    expect(verify1.verifiedVia).toBe("derived");

    // Migrate to person password
    await migrateLegacyAuthPassword(admin, {
      profileId: legacyUser.id,
      organizationId: orgA,
      passcode: "7193",
    });

    // Second login verifies directly via "person"
    const verify2 = await verifyPasscode(authClient, {
      syntheticEmail: legacyUser.syntheticEmail,
      organizationId: orgA,
      passcode: "7193",
    });
    expect(verify2.ok).toBe(true);
    expect(verify2.verifiedVia).toBe("person");
  });

  it("rotates PIN across all organizations for a multi-org user", async () => {
    const user = await createPasscodeUser({
      displayName: "Rotating Worker",
      pin: "3344",
      orgMemberships: [
        { orgId: orgA, role: "server" },
        { orgId: orgB, role: "server" },
      ],
    });

    // Rotate PIN to 8899
    const rotateResult = await rotatePasscodeCredential(admin, {
      profileId: user.id,
      newPasscode: "8899",
    });
    expect(rotateResult.ok).toBe(true);

    const authClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Old PIN fails in Org A
    const oldVerifyA = await verifyPasscode(authClient, {
      syntheticEmail: user.syntheticEmail,
      organizationId: orgA,
      passcode: "3344",
    });
    expect(oldVerifyA.ok).toBe(false);

    // New PIN succeeds in Org A
    const newVerifyA = await verifyPasscode(authClient, {
      syntheticEmail: user.syntheticEmail,
      organizationId: orgA,
      passcode: "8899",
    });
    expect(newVerifyA.ok).toBe(true);
    expect(newVerifyA.verifiedVia).toBe("person");

    // New PIN succeeds in Org B
    const newVerifyB = await verifyPasscode(authClient, {
      syntheticEmail: user.syntheticEmail,
      organizationId: orgB,
      passcode: "8899",
    });
    expect(newVerifyB.ok).toBe(true);
    expect(newVerifyB.verifiedVia).toBe("person");
  });

  it("prevents PIN rotation when new PIN collides in any member organization", async () => {
    // Existing user in Org B has PIN 5555
    await createPasscodeUser({
      displayName: "Existing Org B User",
      pin: "5555",
      orgMemberships: [{ orgId: orgB, role: "server" }],
    });

    // Multi-org user in Org A and Org B with PIN 6666
    const user = await createPasscodeUser({
      displayName: "Collision Test User",
      pin: "6666",
      orgMemberships: [
        { orgId: orgA, role: "server" },
        { orgId: orgB, role: "server" },
      ],
    });

    // Attempt to rotate to 5555 (which is taken in Org B)
    const result = await rotatePasscodeCredential(admin, {
      profileId: user.id,
      newPasscode: "5555",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/already in use/i);
      expect(result.severity).toBe("recoverable");
    }

    // Existing PIN 6666 remains intact in both orgs
    const authClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const verifyA = await verifyPasscode(authClient, {
      syntheticEmail: user.syntheticEmail,
      organizationId: orgA,
      passcode: "6666",
    });
    expect(verifyA.ok).toBe(true);

    const verifyB = await verifyPasscode(authClient, {
      syntheticEmail: user.syntheticEmail,
      organizationId: orgB,
      passcode: "6666",
    });
    expect(verifyB.ok).toBe(true);
  });

  it("synchronizes missing organization credential when signing in with personal PIN", async () => {
    // User has membership in Org A with credential
    const user = await createPasscodeUser({
      displayName: "Sync Test User",
      pin: "7788",
      orgMemberships: [{ orgId: orgA, role: "server" }],
    });

    // Add active membership in Org B without credential
    must(
      await admin.from("memberships").insert({
        organization_id: orgB,
        profile_id: user.id,
        roles: ["server"],
        active: true,
      }),
    );

    // Verify Org B initially has NO credential
    const initialBCred = await admin
      .from("passcode_credentials")
      .select("id")
      .eq("organization_id", orgB)
      .eq("profile_id", user.id)
      .maybeSingle();
    expect(initialBCred.data).toBeNull();

    // Call login route for Org A
    const { POST: loginRoute } = await import("@/app/api/auth/passcode/route");
    const loginReq = new Request("http://localhost/api/auth/passcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: `b3-org-a-${run}`,
        passcode: "7788",
      }),
    });
    const loginRes = await loginRoute(loginReq);
    expect(loginRes.status).toBe(200);

    // Verify Org B now HAS a credential row with the correct locator!
    const syncedBCred = must(
      await admin
        .from("passcode_credentials")
        .select("locator, active, synthetic_email")
        .eq("organization_id", orgB)
        .eq("profile_id", user.id)
        .maybeSingle(),
    );
    expect(syncedBCred.locator).toBe(createPasscodeLocator(orgB, "7788"));
    expect(syncedBCred.synthetic_email).toBe(user.syntheticEmail);
    expect(syncedBCred.active).toBe(true);
  });

  it("enforces reset authority boundary: Org Manager cannot reset multi-org user, Overall Owner can", async () => {
    // Multi-org target
    const target = await createPasscodeUser({
      displayName: "Multi Org Reset Target",
      pin: "1212",
      orgMemberships: [
        { orgId: orgA, role: "server" },
        { orgId: orgB, role: "server" },
      ],
    });

    // Org A Manager
    const manager = await createPasscodeUser({
      displayName: "Org A Manager",
      pin: "9090",
      orgMemberships: [{ orgId: orgA, role: "shift_manager" }],
    });

    // Overall Owner
    const overallOwner = await createPasscodeUser({
      displayName: "Overall Boss",
      pin: "0001",
      orgMemberships: [{ orgId: orgA, role: "owner" }],
    });
    must(
      await admin
        .from("overall_roles")
        .insert({ profile_id: overallOwner.id, role: "owner" }),
    );

    const { POST: resetRoute } = await import(
      "@/app/api/auth/passcode/reset/route"
    );
    const { getCurrentUser } = await import("@/lib/current-user");

    // 1. Org Manager attempts reset on multi-org target -> REJECTED (403)
    vi.mocked(getCurrentUser).mockResolvedValue({
      profileId: manager.id,
      name: "Org A Manager",
      role: "manager",
      designation: "manager",
      organizationId: orgA,
    });

    const deniedReq = new Request("http://localhost/api/auth/passcode/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: `b3-org-a-${run}`,
        targetProfileId: target.id,
        reason: "Manager attempting reset",
        newPasscode: "5555",
      }),
    });
    const deniedRes = await resetRoute(deniedReq);
    expect(deniedRes.status).toBe(403);
    const deniedData = await deniedRes.json();
    expect(deniedData.error).toBe(
      "This team member belongs to multiple organizations. Only an Overall administrator can reset their passcode.",
    );

    // 2. Overall Owner attempts reset on multi-org target -> ALLOWED (200)
    vi.mocked(getCurrentUser).mockResolvedValue({
      profileId: overallOwner.id,
      name: "Overall Boss",
      role: "owner",
      designation: "owner",
      organizationId: orgA,
    });

    const allowedReq = new Request("http://localhost/api/auth/passcode/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: `b3-org-a-${run}`,
        targetProfileId: target.id,
        reason: "Overall Owner authorized reset",
        newPasscode: "7654",
      }),
    });
    const allowedRes = await resetRoute(allowedReq);
    expect(allowedRes.status).toBe(200);
    const allowedData = await allowedRes.json();
    expect(allowedData.ok).toBe(true);
    expect(allowedData.passcode).toBe("7654");

    // Verify new PIN 7654 works in both Org A and Org B
    const authClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const verifyA = await verifyPasscode(authClient, {
      syntheticEmail: target.syntheticEmail,
      organizationId: orgA,
      passcode: "7654",
    });
    expect(verifyA.ok).toBe(true);

    const verifyB = await verifyPasscode(authClient, {
      syntheticEmail: target.syntheticEmail,
      organizationId: orgB,
      passcode: "7654",
    });
    expect(verifyB.ok).toBe(true);
  });
});
