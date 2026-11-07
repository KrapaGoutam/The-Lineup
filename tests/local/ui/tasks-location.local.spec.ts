import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import {
  createTasksFixture,
  must,
  taskArgs,
  tasksEnv,
  type TasksFixture,
  type TasksTestUser,
} from "../support/tasks-fixture";

let fx: TasksFixture;
async function authenticate(
  context: BrowserContext,
  user: TasksTestUser,
  location: string,
) {
  const session = must(await user.client.auth.getSession()).session!;
  const client = createServerClient(tasksEnv.url, tasksEnv.anon, {
    cookies: {
      getAll: () => [],
      setAll: async (cookies) =>
        context.addCookies(
          cookies.map(({ name, value }) => ({
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
      value: JSON.stringify({ v: 1, o: fx.org.id, l: location }),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
async function tasks(page: Page) {
  const tab = page.getByRole("button", { name: /^Tasks(?:\s|$)/ });
  if (!(await tab.isVisible())) {
    const more = page.getByRole("button", { name: /More/ });
    if (await more.isVisible()) await more.click();
  }
  if (await tab.isVisible()) await tab.click();
  await expect(
    page.getByRole("button", { name: "My Tasks", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "My Tasks", exact: true }).click();
}
async function switchTo(page: Page, location: string) {
  await page
    .getByRole("button", { name: /^Switch workspace\. Current:/ })
    .click();
  await page
    .locator(`[role="menuitemradio"][data-location-id="${location}"]`)
    .click();
  await expect(
    page.getByRole("button", { name: /^Switch workspace\. Current:/ }),
  ).toContainText(location === fx.a ? "Tasks A" : "Tasks B");
  await tasks(page);
}
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  fx = await createTasksFixture();
  must(
    await fx.manager.client.rpc(
      "task_create",
      taskArgs(fx.org.id, fx.a, "Browser A only"),
    ),
  );
  must(
    await fx.manager.client.rpc(
      "task_create",
      taskArgs(fx.org.id, fx.b, "Browser B only"),
    ),
  );
  must(
    await fx.admin.from("location_module_configs").insert(
      [fx.a, fx.b].map((location_id) => ({
        location_id,
        module_key: "tasks",
        is_enabled: true,
      })),
    ),
  );
});
test.afterAll(async () => {
  if (fx) await fx.teardown();
});

test("dual-location switching changes Tasks without leaking the previous dataset", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.dual, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await tasks(page);
  await expect(page.getByText("Browser A only", { exact: true })).toBeVisible();
  await expect(page.getByText("Browser B only", { exact: true })).toHaveCount(
    0,
  );
  await switchTo(page, fx.b);
  await expect(page.getByText("Browser B only", { exact: true })).toBeVisible();
  await expect(page.getByText("Browser A only", { exact: true })).toHaveCount(
    0,
  );
});
test("organization Staff promoted only at A gets management controls at A and Staff controls at B", async ({
  page,
  context,
}) => {
  must(
    await fx.admin
      .from("location_memberships")
      .update({ role: "manager" })
      .eq("profile_id", fx.dual.id)
      .eq("location_id", fx.a),
  );
  await authenticate(context, fx.dual, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await tasks(page);
  await expect(page.getByRole("button", { name: /New task/ })).toBeVisible();
  await page.getByRole("button", { name: /New task/ }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill("Branch Manager A created");
  await dialog.getByLabel("Assign to").selectOption("all_team");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Branch Manager A created", { exact: true }),
  ).toBeVisible();
  expect(
    must(
      await fx.admin
        .from("tasks")
        .select("location_id,created_by")
        .eq("organization_id", fx.org.id)
        .eq("title", "Branch Manager A created")
        .single(),
    ),
  ).toEqual({ location_id: fx.a, created_by: fx.dual.id });
  await switchTo(page, fx.b);
  await expect(page.getByRole("button", { name: /New task/ })).toHaveCount(0);
  await expect(
    page.getByText("Branch Manager A created", { exact: true }),
  ).toHaveCount(0);
  must(
    await fx.admin
      .from("location_memberships")
      .update({ role: "staff" })
      .eq("profile_id", fx.dual.id)
      .eq("location_id", fx.a),
  );
});
for (const role of ["owner", "manager", "assistant_manager"] as const) {
  test(`Overall ${role} creates with real attribution and no tenant membership`, async ({
    page,
    context,
  }) => {
    must(
      await fx.admin
        .from("overall_roles")
        .upsert(
          { profile_id: fx.overall.id, role },
          { onConflict: "profile_id" },
        ),
    );
    await authenticate(context, fx.overall, fx.a);
    await page.goto(`/r/${fx.org.slug}`);
    await tasks(page);
    await page.getByRole("button", { name: /New task/ }).click();
    const dialog = page.getByRole("dialog", { name: "New task" });
    const title = `Browser Overall ${role}`;
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Assign to").selectOption("all_team");
    await dialog.getByRole("button", { name: "Create task" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    const row = must(
      await fx.admin
        .from("tasks")
        .select("id,created_by,location_id")
        .eq("organization_id", fx.org.id)
        .eq("title", title)
        .single(),
    )!;
    expect(row.created_by).toBe(fx.overall.id);
    expect(row.location_id).toBe(fx.a);
    await page.getByText(title, { exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Task history" }),
    ).toContainText(fx.overall.name);
    expect(
      must(
        await fx.admin
          .from("memberships")
          .select("id")
          .eq("profile_id", fx.overall.id),
      ),
    ).toEqual([]);
  });
}

test("a stale browser cannot complete Location A work after its verified cookie switches to B", async ({
  page,
  context,
}) => {
  await authenticate(context, fx.dual, fx.a);
  await page.goto(`/r/${fx.org.slug}`);
  await tasks(page);
  await expect(page.getByText("Browser A only", { exact: true })).toBeVisible();
  const before = must(
    await fx.admin
      .from("tasks")
      .select("id,status,completed_by,completed_at")
      .eq("organization_id", fx.org.id)
      .eq("title", "Browser A only")
      .single(),
  );
  await context.addCookies([
    {
      name: "lineup_active_context",
      value: JSON.stringify({ v: 1, o: fx.org.id, l: fx.b }),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page
    .getByRole("checkbox", {
      name: "Mark complete: Browser A only",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("context-stale")).toBeVisible({
    timeout: 30000,
  });
  expect(
    must(
      await fx.admin
        .from("tasks")
        .select("id,status,completed_by,completed_at")
        .eq("organization_id", fx.org.id)
        .eq("title", "Browser A only")
        .single(),
    ),
  ).toEqual(before);
});
