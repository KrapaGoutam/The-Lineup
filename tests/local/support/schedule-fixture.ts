import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

export const scheduleEnv = {
  url: process.env.LOCAL_SUPABASE_URL ?? "",
  anon: process.env.LOCAL_SUPABASE_ANON_KEY ?? "",
  secret: process.env.LOCAL_SUPABASE_SERVICE_KEY ?? "",
};

export type ScheduleTestUser = {
  id: string;
  name: string;
  email: string;
  client: SupabaseClient<Database>;
};

export function must<
  R extends { data: unknown; error: { message: string } | null },
>(r: R): R["data"] {
  if (r.error) throw Error(r.error.message);
  return r.data;
}

export type ScheduleFixture = {
  run: string;
  admin: SupabaseClient<Database>;
  org: { id: string; name: string; slug: string };
  a: string;
  b: string;
  owner: ScheduleTestUser;
  managerA: ScheduleTestUser;
  managerB: ScheduleTestUser;
  staffA: ScheduleTestUser;
  staffB: ScheduleTestUser;
  overallManager: ScheduleTestUser;
  teardown: () => Promise<void>;
};

export async function createScheduleFixture(): Promise<ScheduleFixture> {
  if (
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(scheduleEnv.url) ||
    !scheduleEnv.secret ||
    !scheduleEnv.anon
  ) {
    throw Error("Disposable loopback Supabase credentials required");
  }

  const admin = createClient<Database>(scheduleEnv.url, scheduleEnv.secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const run = crypto.randomUUID().slice(0, 8);
  const users: ScheduleTestUser[] = [];

  async function makeUser(key: string) {
    const email = `sch-${run}-${key}@harness.invalid`;
    const password = crypto.randomBytes(24).toString("base64url");
    const result = must(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    );
    const id = result.user!.id;
    must(
      await admin
        .from("profiles")
        .insert({ id, display_name: `Sch ${key} ${run}` }),
    );
    const client = createClient<Database>(scheduleEnv.url, scheduleEnv.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    must(await client.auth.signInWithPassword({ email, password }));
    const user = { id, name: `Sch ${key} ${run}`, email, client };
    users.push(user);
    return user;
  }

  const owner = await makeUser("owner");
  const managerA = await makeUser("mgr-a");
  const managerB = await makeUser("mgr-b");
  const staffA = await makeUser("staff-a");
  const staffB = await makeUser("staff-b");
  const overallManager = await makeUser("overall-mgr");

  const org = must(
    await admin
      .from("organizations")
      .insert({
        name: `Schedule ${run}`,
        slug: `schedule-${run}`,
        created_by: owner.id,
      })
      .select()
      .single(),
  )!;

  const locations = must(
    await admin
      .from("locations")
      .insert([
        {
          organization_id: org.id,
          name: "Loc A",
          time_zone: "America/Chicago",
        },
        {
          organization_id: org.id,
          name: "Loc B",
          time_zone: "America/Chicago",
        },
      ])
      .select(),
  )!;

  const a = locations.find((l) => l.name === "Loc A")!.id;
  const b = locations.find((l) => l.name === "Loc B")!.id;

  // Tenant memberships:
  // owner has 'owner'
  // managers and staff only have 'server' at org level
  must(
    await admin.from("memberships").insert([
      {
        organization_id: org.id,
        profile_id: owner.id,
        roles: ["owner"],
      },
      {
        organization_id: org.id,
        profile_id: managerA.id,
        roles: ["server"],
      },
      {
        organization_id: org.id,
        profile_id: managerB.id,
        roles: ["server"],
      },
      {
        organization_id: org.id,
        profile_id: staffA.id,
        roles: ["server"],
      },
      {
        organization_id: org.id,
        profile_id: staffB.id,
        roles: ["server"],
      },
    ]),
  );

  // Location memberships:
  // managerA is manager at A, staff at B
  // managerB is manager at B
  // staffA is staff at A
  // staffB is staff at B
  must(
    await admin.from("location_memberships").insert([
      {
        location_id: a,
        profile_id: managerA.id,
        role: "manager",
      },
      {
        location_id: b,
        profile_id: managerA.id,
        role: "staff",
      },
      {
        location_id: b,
        profile_id: managerB.id,
        role: "manager",
      },
      {
        location_id: a,
        profile_id: staffA.id,
        role: "staff",
      },
      {
        location_id: b,
        profile_id: staffB.id,
        role: "staff",
      },
    ]),
  );

  // Overall roles:
  // overallManager has no tenant membership, only overall role
  must(
    await admin.from("overall_roles").insert({
      profile_id: overallManager.id,
      role: "manager",
    }),
  );

  return {
    run,
    admin,
    org: { id: org.id, name: org.name, slug: org.slug },
    a,
    b,
    owner,
    managerA,
    managerB,
    staffA,
    staffB,
    overallManager,
    teardown: async () => {
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
          .in("location_id", [a, b]),
      );
      must(
        await admin
          .from("shift_assignments")
          .delete()
          .eq("organization_id", org.id),
      );
      must(await admin.from("shifts").delete().eq("organization_id", org.id));
      must(
        await admin
          .from("schedule_periods")
          .delete()
          .eq("organization_id", org.id),
      );
      must(
        await admin
          .from("shift_kind_defaults")
          .delete()
          .eq("organization_id", org.id),
      );
      must(
        await admin
          .from("shift_templates")
          .delete()
          .eq("organization_id", org.id),
      );
      must(
        await admin
          .from("operating_hours")
          .delete()
          .eq("organization_id", org.id),
      );
      must(
        await admin.from("audit_events").delete().eq("organization_id", org.id),
      );
      must(await admin.from("organizations").delete().eq("id", org.id));
      for (const user of users) {
        must(await admin.from("profiles").delete().eq("id", user.id));
        must(await admin.auth.admin.deleteUser(user.id));
      }
    },
  };
}
