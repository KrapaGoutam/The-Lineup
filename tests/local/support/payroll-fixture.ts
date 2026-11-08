import { execSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

function resolveLocalEnv() {
  let url =
    process.env.LOCAL_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "";
  let anon =
    process.env.LOCAL_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "";
  let secret =
    process.env.LOCAL_SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";

  if (!anon || !secret) {
    try {
      const out = execSync("npx supabase status -o env", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (!anon) {
        const m =
          out.match(/PUBLISHABLE_KEY=["']?([^"'\r\n]+)/) ||
          out.match(/ANON_KEY=["']?([^"'\r\n]+)/);
        if (m) anon = m[1].trim();
      }
      if (!secret) {
        const m =
          out.match(/SECRET_KEY=["']?([^"'\r\n]+)/) ||
          out.match(/SERVICE_ROLE_KEY=["']?([^"'\r\n]+)/);
        if (m) secret = m[1].trim();
      }
      if (!url) {
        const m = out.match(/API_URL=["']?([^"'\r\n]+)/);
        if (m) url = m[1].trim();
      }
    } catch {
      // ignore
    }
  }

  return {
    url: url || "http://127.0.0.1:54321",
    anon,
    secret,
  };
}

export const payrollEnv = resolveLocalEnv();

export type PayrollTestUser = {
  id: string;
  name: string;
  email: string;
  client: SupabaseClient<Database>;
};

export function must<
  R extends { data: unknown; error: { message: string } | null },
>(r: R): NonNullable<R["data"]> {
  if (r.error) throw Error(r.error.message);
  if (r.data === null || r.data === undefined) {
    throw Error("Expected non-null data");
  }
  return r.data as NonNullable<R["data"]>;
}

export type PayrollFixture = {
  admin: SupabaseClient<Database>;
  anonClient: SupabaseClient<Database>;
  orgA: { id: string; name: string; slug: string };
  orgB: { id: string; name: string; slug: string };
  locA: string;
  locB: string;
  locC: string;
  overall: PayrollTestUser;
  orgAGM: PayrollTestUser;
  mgrA: PayrollTestUser;
  asstA: PayrollTestUser;
  mgrB: PayrollTestUser;
  staffA: PayrollTestUser;
  staffB: PayrollTestUser;
  unlinkedStaff: PayrollTestUser;
  multiStaff: PayrollTestUser;
  revokedStaff: PayrollTestUser;
  attackerB: PayrollTestUser;
  neonIds: {
    staffA: number;
    staffB: number;
    multiStaff: number;
    revokedStaff: number;
  };
  teardown: () => Promise<void>;
};

export async function createPayrollFixture(): Promise<PayrollFixture> {
  if (
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(payrollEnv.url) ||
    !payrollEnv.secret ||
    !payrollEnv.anon
  ) {
    throw Error("Disposable loopback Supabase credentials required");
  }

  const admin = createClient<Database>(payrollEnv.url, payrollEnv.secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const anonClient = createClient<Database>(payrollEnv.url, payrollEnv.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const run = crypto.randomUUID().slice(0, 8);
  const users: PayrollTestUser[] = [];

  async function makeUser(
    key: string,
    name?: string,
  ): Promise<PayrollTestUser> {
    const email = `payroll-${run}-${key}@harness.invalid`;
    const password = crypto.randomBytes(24).toString("base64url");
    const result = must(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    );
    const id = result.user!.id;
    const displayName = name ?? `Payroll ${key} ${run}`;
    must(
      await admin.from("profiles").insert({ id, display_name: displayName }),
    );
    const client = createClient<Database>(payrollEnv.url, payrollEnv.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    must(await client.auth.signInWithPassword({ email, password }));
    const user = { id, name: displayName, email, client };
    users.push(user);
    return user;
  }

  const overall = await makeUser("overall", "Olive Overall");
  const orgAGM = await makeUser("org-gm", "Gail GeneralManager");
  const mgrA = await makeUser("mgr-a", "Maya Manager A");
  const asstA = await makeUser("asst-a", "Andy AsstManager A");
  const mgrB = await makeUser("mgr-b", "Ben Manager B");
  const staffA = await makeUser("staff-a", "Sam Staff A");
  const staffB = await makeUser("staff-b", "Sally Staff B");
  const unlinkedStaff = await makeUser("unlinked", "Uma Unlinked");
  const multiStaff = await makeUser("multi", "Morgan Multi");
  const revokedStaff = await makeUser("revoked", "Rita Revoked");
  const attackerB = await makeUser("attacker-b", "Attacker Org B");

  // Overall Manager
  must(
    await admin.from("overall_roles").insert({
      profile_id: overall.id,
      role: "manager",
    }),
  );

  // Organizations
  const orgA = must(
    await admin
      .from("organizations")
      .insert({
        name: `Payroll Org A ${run}`,
        slug: `payroll-org-a-${run}`,
        created_by: orgAGM.id,
      })
      .select()
      .single(),
  )!;

  const orgB = must(
    await admin
      .from("organizations")
      .insert({
        name: `Payroll Org B ${run}`,
        slug: `payroll-org-b-${run}`,
        created_by: attackerB.id,
      })
      .select()
      .single(),
  )!;

  // Locations
  const locations = must(
    await admin
      .from("locations")
      .insert([
        {
          organization_id: orgA.id,
          name: "Payroll Loc A",
          time_zone: "America/Chicago",
          opening_local: "00:00",
        },
        {
          organization_id: orgA.id,
          name: "Payroll Loc B",
          time_zone: "America/Chicago",
          opening_local: "00:00",
        },
        {
          organization_id: orgB.id,
          name: "Payroll Loc C",
          time_zone: "America/Chicago",
          opening_local: "00:00",
        },
      ])
      .select(),
  )!;

  const locA = locations.find((l) => l.name === "Payroll Loc A")!.id;
  const locB = locations.find((l) => l.name === "Payroll Loc B")!.id;
  const locC = locations.find((l) => l.organization_id === orgB.id)!.id;

  // Org Memberships
  must(
    await admin.from("memberships").insert([
      {
        organization_id: orgA.id,
        profile_id: orgAGM.id,
        roles: ["general_manager" as const],
        active: true,
      },
      ...[mgrA, asstA, mgrB, staffA, staffB, unlinkedStaff, multiStaff].map(
        (u) => ({
          organization_id: orgA.id,
          profile_id: u.id,
          roles: ["server" as const],
          active: true,
        }),
      ),
      {
        organization_id: orgA.id,
        profile_id: revokedStaff.id,
        roles: ["server" as const],
        active: false, // Inactive/revoked membership
      },
      {
        organization_id: orgB.id,
        profile_id: attackerB.id,
        roles: ["owner" as const],
        active: true,
      },
    ]),
  );

  // Location Memberships
  must(
    await admin.from("location_memberships").insert([
      {
        location_id: locA,
        profile_id: orgAGM.id,
        role: "manager",
        active: true,
      },
      {
        location_id: locB,
        profile_id: orgAGM.id,
        role: "manager",
        active: true,
      },
      { location_id: locA, profile_id: mgrA.id, role: "manager", active: true },
      {
        location_id: locA,
        profile_id: asstA.id,
        role: "assistant_manager",
        active: true,
      },
      { location_id: locB, profile_id: mgrB.id, role: "manager", active: true },
      { location_id: locA, profile_id: staffA.id, role: "staff", active: true },
      { location_id: locB, profile_id: staffB.id, role: "staff", active: true },
      {
        location_id: locA,
        profile_id: multiStaff.id,
        role: "staff",
        active: true,
      },
      {
        location_id: locB,
        profile_id: multiStaff.id,
        role: "staff",
        active: true,
      },
      {
        location_id: locC,
        profile_id: attackerB.id,
        role: "manager",
        active: true,
      },
    ]),
  );

  // Attendance Identity Links
  const neonBase = Math.floor(Math.random() * 800000) + 100000;
  const neonIds = {
    staffA: neonBase + 1,
    staffB: neonBase + 2,
    multiStaff: neonBase + 3,
    revokedStaff: neonBase + 4,
  };

  must(
    await admin.from("attendance_identity_links").insert([
      {
        organization_id: orgA.id,
        profile_id: staffA.id,
        neon_user_id: neonIds.staffA,
        linked_by: orgAGM.id,
      },
      {
        organization_id: orgA.id,
        profile_id: staffB.id,
        neon_user_id: neonIds.staffB,
        linked_by: orgAGM.id,
      },
      {
        organization_id: orgA.id,
        profile_id: multiStaff.id,
        neon_user_id: neonIds.multiStaff,
        linked_by: orgAGM.id,
      },
      {
        organization_id: orgA.id,
        profile_id: revokedStaff.id,
        neon_user_id: neonIds.revokedStaff,
        linked_by: orgAGM.id,
      },
    ]),
  );

  // Module configuration for each location
  must(
    await admin.from("location_module_configs").insert([
      ...[locA, locB, locC].map((location_id) => ({
        location_id,
        module_key: "payroll" as const,
        is_enabled: true,
      })),
    ]),
  );

  return {
    admin,
    anonClient,
    orgA,
    orgB,
    locA,
    locB,
    locC,
    overall,
    orgAGM,
    mgrA,
    asstA,
    mgrB,
    staffA,
    staffB,
    unlinkedStaff,
    multiStaff,
    revokedStaff,
    attackerB,
    neonIds,
    async teardown() {
      // Clean up all test rows
      must(
        await admin
          .from("module_enforcement_settings")
          .update({ mode: "staged", activation_reference: null })
          .eq("singleton", true),
      );
      must(
        await admin
          .from("overall_roles")
          .delete()
          .in(
            "profile_id",
            users.map((u) => u.id),
          ),
      );
      must(
        await admin
          .from("location_module_configs")
          .delete()
          .in("location_id", [locA, locB, locC]),
      );
      must(
        await admin
          .from("payroll_adjustments")
          .delete()
          .in("organization_id", [orgA.id, orgB.id]),
      );
      // Unconfirm any confirmed payments so they can be deleted
      const confirmedPayments = await admin
        .from("payroll_payments")
        .select("id")
        .in("organization_id", [orgA.id, orgB.id])
        .eq("status", "confirmed");
      for (const p of confirmedPayments.data || []) {
        await orgAGM.client.rpc("unconfirm_payroll_payment", {
          p_payment_id: p.id,
          p_reason: "Teardown cleanup",
        });
      }

      must(
        await admin
          .from("payroll_payments")
          .delete()
          .in("organization_id", [orgA.id, orgB.id]),
      );
      must(
        await admin
          .from("payroll_periods")
          .delete()
          .in("organization_id", [orgA.id, orgB.id]),
      );
      must(
        await admin
          .from("payroll_rates")
          .delete()
          .in("organization_id", [orgA.id, orgB.id]),
      );
      must(
        await admin
          .from("payroll_settings")
          .delete()
          .in("organization_id", [orgA.id, orgB.id]),
      );
      must(
        await admin
          .from("audit_events")
          .delete()
          .in("organization_id", [orgA.id, orgB.id]),
      );
      must(
        await admin
          .from("attendance_identity_links")
          .delete()
          .in("organization_id", [orgA.id, orgB.id]),
      );
      must(
        await admin
          .from("location_memberships")
          .delete()
          .in("location_id", [locA, locB, locC]),
      );
      must(
        await admin
          .from("memberships")
          .delete()
          .in("organization_id", [orgA.id, orgB.id]),
      );
      must(await admin.from("locations").delete().in("id", [locA, locB, locC]));
      must(
        await admin.from("organizations").delete().in("id", [orgA.id, orgB.id]),
      );
      for (const u of users) {
        must(await admin.from("profiles").delete().eq("id", u.id));
        must(await admin.auth.admin.deleteUser(u.id));
      }
    },
  };
}
