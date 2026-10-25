/**
 * Tasks V1 -- real-mode browser scenarios (hosted DEV). Two isolated browser
 * contexts signed in through the real passcode flow: TestManager (manager+)
 * and TestServer1 (staff). Everything this spec creates carries a unique
 * "RealUI-<stamp>" tag and is deleted afterwards (service role, DEV only).
 * Scenario ids (TASK-xxx) match docs/features/tasks-v1/TEST_MATRIX.md.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  accountButton,
  assertServerIsDev,
  devLocation,
  PINS,
  signIn,
} from "./support/dev-app";

test.describe.configure({ mode: "serial" });

const TAG = `RealUI-${Date.now()}`;
const OPENING = `${TAG} Opening`;
let manager: Page;
let staff: Page;
let contexts: BrowserContext[] = [];
const pageErrors: string[] = [];

async function open(context: BrowserContext, pin: string, label: string) {
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${label}: ${e.message}`));
  await signIn(page, pin);
  return page;
}

async function tasksTab(page: Page, section?: string) {
  await expect(accountButton(page)).toBeVisible();
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  if (section) {
    await page.getByRole("button", { name: section, exact: true }).click();
  }
}

async function cleanup() {
  const { admin, orgId } = await devLocation();
  const templates = await admin
    .from("checklist_templates")
    .select("id")
    .eq("organization_id", orgId)
    .like("name", `${TAG}%`);
  const templateIds = (templates.data ?? []).map((t) => t.id as string);
  if (templateIds.length > 0) {
    const instances = await admin
      .from("checklist_instances")
      .select("id")
      .in("template_id", templateIds);
    const instanceIds = (instances.data ?? []).map((i) => i.id as string);
    if (instanceIds.length > 0) {
      await admin
        .from("tasks")
        .delete()
        .in("checklist_instance_id", instanceIds);
      await admin.from("checklist_instances").delete().in("id", instanceIds);
    }
    await admin.from("checklist_templates").delete().in("id", templateIds);
  }
  await admin
    .from("tasks")
    .delete()
    .eq("organization_id", orgId)
    .like("title", `${TAG}%`);
}

test.beforeAll(async ({ browser }) => {
  await assertServerIsDev();
  contexts = [await browser.newContext(), await browser.newContext()];
  manager = await open(contexts[0], PINS.TestManager, "manager");
  staff = await open(contexts[1], PINS.TestServer1, "staff");
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  await cleanup();
  expect(pageErrors).toEqual([]);
});

test("TASK-001/005: manager creates a task; staff sees and completes it; manager sees the completion", async () => {
  await tasksTab(manager);
  await manager.getByRole("button", { name: /New task/ }).click();
  const dialog = manager.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill(`${TAG} wipe menus`);
  const person = dialog.getByLabel("Person");
  const label = (
    await person.locator("option", { hasText: "TestServer1" }).innerText()
  ).trim();
  await person.selectOption({ label });
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();

  // Staff: authoritative refetch on entering Tasks shows the new task.
  await tasksTab(staff, "My Tasks");
  const checkbox = staff.getByRole("checkbox", {
    name: new RegExp(`Mark complete: ${TAG} wipe menus`),
  });
  await expect(checkbox).toBeVisible({ timeout: 30_000 });
  await checkbox.click();
  await expect(
    staff.getByRole("checkbox", {
      name: new RegExp(`Reopen: ${TAG} wipe menus`),
    }),
  ).toHaveAttribute("aria-checked", "true");

  // Manager: a fresh load (no Realtime) shows who completed it.
  await manager.reload();
  await tasksTab(manager, "Assigned");
  await expect(
    manager.getByRole("checkbox", {
      name: new RegExp(`Reopen: ${TAG} wipe menus`),
    }),
  ).toBeVisible({ timeout: 30_000 });
});

test("TASK-006/060/061: manager completes on behalf; history is manager-only", async () => {
  await tasksTab(manager);
  await manager.getByRole("button", { name: /New task/ }).click();
  const dialog = manager.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill(`${TAG} behalf`);
  const person = dialog.getByLabel("Person");
  const label = (
    await person.locator("option", { hasText: "TestServer1" }).innerText()
  ).trim();
  await person.selectOption({ label });
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();

  await manager.getByRole("button", { name: "Assigned", exact: true }).click();
  await manager
    .getByRole("checkbox", { name: new RegExp(`Mark complete: ${TAG} behalf`) })
    .click();
  await manager
    .getByRole("button", { name: new RegExp(`${TAG} behalf`) })
    .last()
    .click();
  const detail = manager.getByRole("dialog");
  await expect(
    detail.getByRole("region", { name: "Task history" }),
  ).toContainText("Completed on behalf of the assignee");
  await detail.getByRole("button", { name: "Close" }).click();

  await staff.reload();
  await tasksTab(staff, "My Tasks");
  await staff.getByRole("button", { name: /^Completed/ }).click();
  await staff.getByText(`${TAG} behalf`).click();
  const staffDetail = staff.getByRole("dialog");
  await expect(staffDetail).toContainText("Completed by");
  await expect(
    staffDetail.getByRole("region", { name: "Task history" }),
  ).toHaveCount(0);
});

test("TASK-020/021/025: Opening checklist is generated per day and completes by anyone eligible", async () => {
  await tasksTab(manager, "Manage");
  await manager.getByRole("button", { name: "New opening template" }).click();
  const dialog = manager.getByRole("dialog");
  await dialog.getByLabel("Template name").fill(OPENING);
  await dialog
    .getByRole("textbox", { name: "Item 1", exact: true })
    .fill(`${TAG} unlock`);
  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(dialog).toBeHidden();

  // A staff load generates today's instance from the new template.
  await staff.reload();
  await tasksTab(staff, "Opening");
  const day = staff.getByRole("article", { name: OPENING });
  await expect(day).toBeVisible({ timeout: 30_000 });
  await expect(day.getByText("0 / 1 complete")).toBeVisible();
  await day
    .getByRole("checkbox", { name: new RegExp(`Mark complete: ${TAG} unlock`) })
    .click();
  await expect(day.getByText("1 / 1 complete")).toBeVisible();

  // The manager sees the same state after a reload (database is authoritative).
  await manager.reload();
  await tasksTab(manager, "Opening");
  await expect(
    manager.getByRole("article", { name: OPENING }).getByText("1 / 1 complete"),
  ).toBeVisible({ timeout: 30_000 });
});
