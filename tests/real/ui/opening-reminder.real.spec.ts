/**
 * Tasks V1.1 T-6 -- Opening reminder popup in REAL mode (hosted DEV).
 *
 * T-5 proved the popup in demo mode (an in-memory twin of the sweep). This
 * proves the same path end to end against the real server actions and the real
 * database: getOpeningReminderPromptAction -> task_opening_reminders_sweep ->
 * the caller's own rows -> task_notifications_mark_read.
 *
 * To make every stage due regardless of the wall clock the DEV test location's
 * `opening_local` is set to 00:00 for the run and RESTORED in afterAll (also on
 * failure). Reminder rows created by this run (created_at >= start) are deleted.
 * Nothing else is touched; task state is compared before and after to prove
 * that Dismiss and the CTA never mutate tasks. DEV only (assertServerIsDev).
 */
import { expect, test, type BrowserContext } from "@playwright/test";

import {
  accountButton,
  assertServerIsDev,
  devLocation,
  PINS,
  signIn,
} from "./support/dev-app";

test.describe.configure({ mode: "serial" });

let admin: Awaited<ReturnType<typeof devLocation>>["admin"];
let orgId = "";
let locationId = "";
let originalOpening = "";
let startedAt = "";
let restored = false;
const contexts: BrowserContext[] = [];
const pageErrors: string[] = [];

type Row = {
  recipient_profile_id: string;
  dedupe_key: string;
  read_at: string | null;
  task_id: string | null;
  checklist_instance_id: string | null;
  payload: { stage: string; [key: string]: unknown };
};

async function profileId(displayName: string): Promise<string> {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("display_name", displayName)
    .single();
  if (error) throw new Error(`profile ${displayName}: ${error.message}`);
  return data.id as string;
}

async function remindersFor(profile: string): Promise<Row[]> {
  const { data, error } = await admin
    .from("task_notifications")
    .select(
      "recipient_profile_id, dedupe_key, read_at, task_id, checklist_instance_id, payload",
    )
    .eq("organization_id", orgId)
    .eq("recipient_profile_id", profile)
    .eq("type", "opening_reminder")
    .gte("created_at", startedAt);
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

const byStage = (rows: Row[]) =>
  Object.fromEntries(rows.map((r) => [r.payload.stage, r]));

/** Every task row and the audit-event count: Dismiss / CTA must change neither. */
async function taskState() {
  const tasks = await admin
    .from("tasks")
    .select(
      "id, status, assignment_mode, completed_by, cancelled_by, updated_at",
    )
    .eq("organization_id", orgId)
    .order("id");
  const events = await admin
    .from("task_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (tasks.error || events.error) {
    throw new Error(tasks.error?.message ?? events.error?.message);
  }
  return { tasks: tasks.data, events: events.count };
}

async function openAs(context: BrowserContext, pin: string, label: string) {
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(`${label}: ${e.message}`));
  await signIn(page, pin);
  return page;
}

async function restoreOpening() {
  if (restored || !admin) return;
  const back = await admin
    .from("locations")
    .update({ opening_local: originalOpening })
    .eq("id", locationId);
  if (back.error)
    throw new Error(`restore opening_local: ${back.error.message}`);
  restored = true;
}

test.beforeAll(async () => {
  await assertServerIsDev();
  const dev = await devLocation();
  admin = dev.admin;
  orgId = dev.orgId;
  locationId = dev.locationId;

  const current = await admin
    .from("locations")
    .select("opening_local")
    .eq("id", locationId)
    .single();
  if (current.error) throw new Error(current.error.message);
  originalOpening = current.data.opening_local as string;

  startedAt = new Date().toISOString();
  const opened = await admin
    .from("locations")
    .update({ opening_local: "00:00" })
    .eq("id", locationId);
  if (opened.error) throw new Error(opened.error.message);
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  try {
    await admin
      .from("task_notifications")
      .delete()
      .eq("organization_id", orgId)
      .eq("type", "opening_reminder")
      .gte("created_at", startedAt);
  } finally {
    await restoreOpening();
  }
  const check = await admin
    .from("locations")
    .select("opening_local")
    .eq("id", locationId)
    .single();
  expect(check.data?.opening_local).toBe(originalOpening);
  expect(pageErrors).toEqual([]);
});

test("management: all three stages are stored, ONE popup (+30); Dismiss acknowledges only it and changes no task", async ({
  browser,
}) => {
  const manager = await profileId("TestManager");

  const context = await browser.newContext();
  contexts.push(context);
  const page = await openAs(context, PINS.TestManager, "manager");

  const dialog = page.getByRole("dialog", {
    name: "Opening Tasks Need Attention",
  });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  // Captured once the popup is up: that load has generated today's checklist.
  const before = await taskState();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog).toContainText(/needs? attention\./);

  // Database history: every legitimately stored stage, once each, own rows only.
  await expect
    .poll(async () => Object.keys(byStage(await remindersFor(manager))).sort())
    .toEqual(["open", "plus_15", "plus_30"]);
  const stored = await remindersFor(manager);
  expect(stored).toHaveLength(3);
  expect(new Set(stored.map((r) => r.dedupe_key)).size).toBe(3);
  for (const row of stored) expect(row.read_at).toBeNull();

  await dialog.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Only the shown stage was acknowledged; older rows stay unread history.
  await expect
    .poll(
      async () => (byStage(await remindersFor(manager)).plus_30 ?? {}).read_at,
    )
    .not.toBeNull();
  const after = byStage(await remindersFor(manager));
  expect(after.open.read_at).toBeNull();
  expect(after.plus_15.read_at).toBeNull();

  // Dismiss is a notification acknowledgement, never a task mutation.
  expect(await taskState()).toEqual(before);

  // A reload (new mount, new sweep) neither repeats the popup nor stores more.
  await page.reload();
  await expect(accountButton(page)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3_000);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await remindersFor(manager)).toHaveLength(3);
});

test("staff: generic popup (no counts, names or titles); the CTA acknowledges and opens Tasks without changing any task", async ({
  browser,
}) => {
  const staff = await profileId("TestServer1");

  const context = await browser.newContext();
  contexts.push(context);
  const page = await openAs(context, PINS.TestServer1, "staff");

  const dialog = page.getByRole("dialog", { name: "Opening Task Reminder" });
  await expect(dialog).toBeVisible({ timeout: 60_000 });
  // Captured once the popup is up: that load has generated today's checklist.
  const before = await taskState();
  await expect(page.getByRole("dialog")).toHaveCount(1);

  // Privacy in the browser: nothing a coworker owns, no management count.
  const text = (await dialog.innerText()).trim();
  expect(text).not.toMatch(/\d/);
  for (const other of ["TestOwner", "TestManager", "TestServer2"]) {
    expect(text).not.toContain(other);
  }

  // Privacy in the stored data: counts only, no task or checklist ids.
  const stored = await remindersFor(staff);
  expect(Object.keys(byStage(stored)).sort()).toEqual([
    "open",
    "plus_15",
    "plus_30",
  ]);
  for (const row of stored) {
    expect(row.task_id).toBeNull();
    expect(row.checklist_instance_id).toBeNull();
    expect(Object.keys(row.payload).sort()).toEqual(
      [
        "incomplete_count",
        "incomplete_now",
        "location_id",
        "service_date",
        "stage",
        "stage_at",
      ].sort(),
    );
  }

  await dialog.getByRole("button", { name: "View My Opening Tasks" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();

  await expect
    .poll(
      async () => (byStage(await remindersFor(staff)).plus_30 ?? {}).read_at,
    )
    .not.toBeNull();
  const after = byStage(await remindersFor(staff));
  expect(after.open.read_at).toBeNull();
  expect(after.plus_15.read_at).toBeNull();

  expect(await taskState()).toEqual(before);
});

test("repeated and concurrent loads store nothing more (one row per stage per recipient)", async ({
  browser,
}) => {
  const owner = await profileId("TestOwner");
  const counts = async () => {
    const { data } = await admin
      .from("task_notifications")
      .select("recipient_profile_id")
      .eq("organization_id", orgId)
      .eq("type", "opening_reminder")
      .gte("created_at", startedAt);
    return (data ?? []).length;
  };
  const baseline = await counts();
  expect(baseline).toBeGreaterThan(0);

  // Two more tabs for the same person load at the same moment.
  const context = await browser.newContext();
  contexts.push(context);
  const [a, b] = await Promise.all([
    openAs(context, PINS.TestOwner, "owner-a"),
    openAs(context, PINS.TestOwner, "owner-b"),
  ]);
  await expect.poll(async () => (await remindersFor(owner)).length).toBe(3);
  await a.reload();
  await b.reload();
  await expect(accountButton(a)).toBeVisible({ timeout: 60_000 });
  await expect(accountButton(b)).toBeVisible({ timeout: 60_000 });
  await a.waitForTimeout(3_000);

  const owners = await remindersFor(owner);
  expect(owners).toHaveLength(3);
  expect(new Set(owners.map((r) => r.dedupe_key)).size).toBe(3);
  // Everyone's rows together: no recipient exceeds three stages.
  const perRecipient = new Map<string, number>();
  const { data } = await admin
    .from("task_notifications")
    .select("recipient_profile_id")
    .eq("organization_id", orgId)
    .eq("type", "opening_reminder")
    .gte("created_at", startedAt);
  for (const r of data ?? []) {
    const id = r.recipient_profile_id as string;
    perRecipient.set(id, (perRecipient.get(id) ?? 0) + 1);
  }
  for (const n of perRecipient.values()) expect(n).toBeLessThanOrEqual(3);
});
