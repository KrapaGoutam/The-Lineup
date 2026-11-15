import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

// Generated PostgreSQL function Args omit nullable argument information.
// Preserve table/return typing while allowing the SQL API's actual null inputs.
type Functions = Database["public"]["Functions"];
type TestDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: {
      [F in keyof Functions]: Omit<Functions[F], "Args"> & {
        Args: {
          [A in keyof Functions[F]["Args"]]: Functions[F]["Args"][A] | null;
        };
      };
    };
  };
};

export const tasksEnv = {
  url: process.env.LOCAL_SUPABASE_URL ?? "",
  anon: process.env.LOCAL_SUPABASE_ANON_KEY ?? "",
  secret: process.env.LOCAL_SUPABASE_SERVICE_KEY ?? "",
};
export type TasksTestUser = {
  id: string;
  name: string;
  client: SupabaseClient<TestDatabase>;
};
export function must<
  R extends { data: unknown; error: { message: string } | null },
>(r: R): R["data"] {
  if (r.error) throw Error(r.error.message);
  return r.data;
}
export async function createTasksFixture() {
  if (
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(tasksEnv.url) ||
    !tasksEnv.secret ||
    !tasksEnv.anon
  )
    throw Error("Disposable loopback Supabase credentials required");
  const admin = createClient<Database>(tasksEnv.url, tasksEnv.secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const run = crypto.randomUUID().slice(0, 8);
  const users: TasksTestUser[] = [];
  async function makeUser(key: string) {
    const email = `tasks-${run}-${key}@harness.invalid`;
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
        .insert({ id, display_name: `Tasks ${key} ${run}` }),
    );
    const client = createClient<TestDatabase>(tasksEnv.url, tasksEnv.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    must(await client.auth.signInWithPassword({ email, password }));
    const user = { id, name: `Tasks ${key} ${run}`, client };
    users.push(user);
    return user;
  }
  const manager = await makeUser("manager");
  const staff = await makeUser("staff-a");
  const dual = await makeUser("staff-ab");
  const unassigned = await makeUser("unassigned");
  const foreign = await makeUser("foreign");
  const overall = await makeUser("overall");
  const org = must(
    await admin
      .from("organizations")
      .insert({
        name: `Tasks ${run}`,
        slug: `tasks-${run}`,
        created_by: manager.id,
      })
      .select()
      .single(),
  )!;
  const other = must(
    await admin
      .from("organizations")
      .insert({
        name: `Tasks other ${run}`,
        slug: `tasks-other-${run}`,
        created_by: foreign.id,
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
          name: "Tasks A",
          time_zone: "America/Chicago",
          opening_local: "00:00",
        },
        {
          organization_id: org.id,
          name: "Tasks B",
          time_zone: "America/New_York",
          opening_local: "00:00",
        },
        {
          organization_id: other.id,
          name: "Tasks other",
          time_zone: "America/Chicago",
          opening_local: "00:00",
        },
      ])
      .select(),
  )!;
  const a = locations.find((l) => l.name === "Tasks A")!.id;
  const b = locations.find((l) => l.name === "Tasks B")!.id;
  const c = locations.find((l) => l.organization_id === other.id)!.id;
  must(
    await admin.from("memberships").insert([
      ...[manager, staff, dual, unassigned].map((u) => ({
        organization_id: org.id,
        profile_id: u.id,
        roles: [
          u === manager ? ("general_manager" as const) : ("server" as const),
        ],
        active: true,
      })),
      {
        organization_id: other.id,
        profile_id: foreign.id,
        roles: ["owner"],
        active: true,
      },
    ]),
  );
  must(
    await admin.from("location_memberships").insert([
      { location_id: a, profile_id: manager.id, role: "manager" },
      { location_id: b, profile_id: manager.id, role: "manager" },
      { location_id: a, profile_id: staff.id, role: "staff" },
      { location_id: a, profile_id: dual.id, role: "staff" },
      { location_id: b, profile_id: dual.id, role: "staff" },
      { location_id: c, profile_id: foreign.id, role: "manager" },
    ]),
  );
  return {
    admin,
    org,
    other,
    a,
    b,
    c,
    manager,
    staff,
    dual,
    unassigned,
    foreign,
    overall,
    users,
    makeUser,
    async teardown() {
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
          .in("location_id", [a, b, c]),
      );
      must(
        await admin
          .from("task_assignments")
          .delete()
          .in("organization_id", [org.id, other.id]),
      );
      must(
        await admin
          .from("checklist_template_item_assignees")
          .delete()
          .in("organization_id", [org.id, other.id]),
      );
      must(
        await admin
          .from("task_recurrence_assignees")
          .delete()
          .in("organization_id", [org.id, other.id]),
      );
      must(
        await admin
          .from("tasks")
          .delete()
          .in("organization_id", [org.id, other.id]),
      );
      must(
        await admin
          .from("checklist_instances")
          .delete()
          .in("organization_id", [org.id, other.id]),
      );
      must(
        await admin
          .from("checklist_templates")
          .delete()
          .in("organization_id", [org.id, other.id]),
      );
      must(
        await admin
          .from("task_recurrence_rules")
          .delete()
          .in("organization_id", [org.id, other.id]),
      );
      must(
        await admin.from("organizations").delete().in("id", [org.id, other.id]),
      );
      for (const user of users) {
        must(await admin.from("profiles").delete().eq("id", user.id));
        must(await admin.auth.admin.deleteUser(user.id));
      }
      const residue = must(
        await admin
          .from("organizations")
          .select("id")
          .in("id", [org.id, other.id]),
      );
      if (residue?.length) throw Error("Tasks fixture residue");
    },
  };
}
export type TasksFixture = Awaited<ReturnType<typeof createTasksFixture>>;
export function taskArgs(org: string, location: string, title: string) {
  return {
    p_organization_id: org,
    p_location_id: location,
    p_title: title,
    p_instructions: null,
    p_category: "other",
    p_priority: "normal" as const,
    p_assignment_mode: "anyone" as const,
    p_assignee_ids: [] as string[],
    p_each_person: false,
    p_start_date: null,
    p_due_date: null,
    p_due_time: null,
    p_due_window: null,
  };
}
