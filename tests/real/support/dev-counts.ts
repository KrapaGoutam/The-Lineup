import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Baseline / teardown proof for hosted-DEV suites (V2-003.005).
 *
 * The V2 login hotfix could not delete a synthetic user because the app had
 * written `task_notifications` rows for it. Cleanup therefore (1) removes the
 * task family for the run's organizations top-down BEFORE memberships, (2) is
 * idempotent, and (3) is verified by comparing exact table counts with a
 * snapshot taken before any fixture was created -- never assumed from a
 * clean process exit.
 */

export const COUNTED_TABLES = [
  "organizations",
  "locations",
  "memberships",
  "location_memberships",
  "overall_roles",
  "profiles",
  "tasks",
  "task_events",
  "task_assignments",
  "task_notifications",
  "task_recurrence_rules",
  "checklist_templates",
  "checklist_instances",
  "passcode_credentials",
  "passcode_login_attempts",
  "audit_events",
] as const;

export type DevCounts = Record<
  (typeof COUNTED_TABLES)[number] | "auth_users",
  number
>;

export async function countDev(admin: SupabaseClient): Promise<DevCounts> {
  const counts = {} as DevCounts;
  for (const table of COUNTED_TABLES) {
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`count ${table}: ${error.message}`);
    counts[table] = count ?? 0;
  }
  let users = 0;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`count auth users: ${error.message}`);
    users += data.users.length;
    if (data.users.length < 200) break;
  }
  counts.auth_users = users;
  return counts;
}

export function diffCounts(before: DevCounts, after: DevCounts) {
  const drift: Record<string, { before: number; after: number }> = {};
  for (const key of Object.keys(before) as Array<keyof DevCounts>) {
    if (before[key] !== after[key]) {
      drift[key] = { before: before[key], after: after[key] };
    }
  }
  return drift;
}

/**
 * Removes everything a run created, children before parents. Only rows scoped
 * to the given organizations / profile ids are touched.
 */
export async function cleanupFixtures(
  admin: SupabaseClient,
  scope: {
    orgIds: readonly string[];
    userIds: readonly string[];
  },
) {
  const orgs = [...scope.orgIds];
  const users = [...scope.userIds];
  const errors: string[] = [];
  const step = async (
    label: string,
    run: () => PromiseLike<{ error: { message: string } | null }>,
  ) => {
    const { error } = await run();
    if (error) errors.push(`${label}: ${error.message}`);
  };

  if (orgs.length) {
    // The notification rows the app writes for synthetic users (no task_id
    // for reminders) are what blocked deleting memberships before.
    await step("task_notifications", () =>
      admin.from("task_notifications").delete().in("organization_id", orgs),
    );
    await step("tasks", () =>
      admin.from("tasks").delete().in("organization_id", orgs),
    );
    await step("task_recurrence_rules", () =>
      admin.from("task_recurrence_rules").delete().in("organization_id", orgs),
    );
    await step("checklist_instances", () =>
      admin.from("checklist_instances").delete().in("organization_id", orgs),
    );
    await step("checklist_templates", () =>
      admin.from("checklist_templates").delete().in("organization_id", orgs),
    );
    await step("passcode_login_attempts", () =>
      admin
        .from("passcode_login_attempts")
        .delete()
        .in("organization_id", orgs),
    );
    await step("passcode_credentials", () =>
      admin.from("passcode_credentials").delete().in("organization_id", orgs),
    );
  }
  if (users.length) {
    await step("location_memberships", () =>
      admin.from("location_memberships").delete().in("profile_id", users),
    );
    await step("overall_roles", () =>
      admin.from("overall_roles").delete().in("profile_id", users),
    );
  }
  if (orgs.length) {
    await step("memberships", () =>
      admin.from("memberships").delete().in("organization_id", orgs),
    );
    await step("locations", () =>
      admin.from("locations").delete().in("organization_id", orgs),
    );
    await step("organizations", () =>
      admin.from("organizations").delete().in("id", orgs),
    );
  }
  if (users.length) {
    await step("profiles", () =>
      admin.from("profiles").delete().in("id", users),
    );
    for (const id of users) {
      const { error } = await admin.auth.admin.deleteUser(id);
      // A user that is already gone is fine (idempotent).
      if (error && !/not found/i.test(error.message)) {
        errors.push(`auth user: ${error.message}`);
      }
    }
  }
  return errors;
}
