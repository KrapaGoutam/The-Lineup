import { expect, test } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import {
  createTasksFixture,
  must,
  tasksEnv,
  type TasksFixture,
} from "../support/tasks-fixture";

// Run against the disposable stack replayed only through the 76-migration
// hosted-DEV baseline. This proves safe refusal before old operational RPCs.
let fx: TasksFixture;
test.beforeAll(async () => {
  if (process.env.TASKS_SCHEMA_COMPAT !== "1")
    throw Error("Explicit old-schema compatibility mode required");
  fx = await createTasksFixture();
  must(
    await fx.admin
      .from("location_module_configs")
      .insert({ location_id: fx.a, module_key: "tasks", is_enabled: true }),
  );
  const absent = await fx.manager.client.rpc("tasks_location_authorized", {
    p_organization_id: fx.org.id,
    p_location_id: fx.a,
  });
  expect(absent.error?.code).toBe("PGRST202");
});
test.afterAll(async () => {
  if (fx) await fx.teardown();
});
test("unmigrated Preview refuses Tasks reads before checklist, recurrence or notification writes", async ({
  page,
  context,
}) => {
  const session = must(await fx.manager.client.auth.getSession()).session!;
  const client = createServerClient(tasksEnv.url, tasksEnv.anon, {
    cookies: {
      getAll: () => [],
      setAll: async (values) =>
        context.addCookies(
          values.map(({ name, value }) => ({
            name,
            value,
            domain: "localhost",
            path: "/",
            httpOnly: true,
            sameSite: "Lax" as const,
          })),
        ),
    },
  });
  must(await client.auth.setSession(session));
  await context.addCookies([
    {
      name: "lineup_active_context",
      value: JSON.stringify({ v: 1, o: fx.org.id, l: fx.a }),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  async function counts() {
    return Promise.all(
      (
        [
          "tasks",
          "checklist_instances",
          "task_events",
          "task_notifications",
        ] as const
      ).map(async (table) => {
        const result = await fx.admin
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("organization_id", fx.org.id);
        expect(result.error).toBeNull();
        return result.count;
      }),
    );
  }
  const before = await counts();
  await page.goto(`/r/${fx.org.slug}`);
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(
    page.getByText("You need to sign in to see tasks.", { exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: /New task/ }).click();
  // No snapshot means the existing workspace cannot mount a creation form.
  await expect(page.getByRole("dialog", { name: "New task" })).toHaveCount(0);
  expect(await counts()).toEqual(before);
});
