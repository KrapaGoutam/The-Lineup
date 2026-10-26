/**
 * Table Allocation cross-view integrity (X5) -- hosted DEV, production build.
 * Separate authenticated browser contexts (owner, manager, a server, and a
 * deliberately STALE manager whose Realtime socket is blocked) drive the real
 * UI. No manual refresh anywhere unless the scenario is about refresh.
 * Scenario ids match docs/features/table-allocation-cross-view-integrity/
 * TEST_MATRIX.md.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  accountButton,
  assertServerIsDev,
  devLocation,
  expectAvailable,
  expectOwner,
  floorAssign,
  goToAllocation,
  openAs,
  PINS,
  resetTodayBoard,
  signIn,
  switchView,
  tile,
} from "./support/dev-app";

test.describe.configure({ mode: "serial" });

let owner: Page;
let manager: Page;
let server1: Page;
let contexts: BrowserContext[] = [];
const pageErrors: string[] = [];

const S1 = "TestServer1";
const S2 = "TestServer2";

function track(page: Page, label: string) {
  page.on("pageerror", (error) =>
    pageErrors.push(`${label}: ${error.message}`),
  );
}

async function dashboardActiveTables(page: Page): Promise<number> {
  await switchView(page, "Dashboard");
  const text = await page
    .getByText("Active tables", { exact: true })
    .locator("xpath=following-sibling::p[1]")
    .innerText();
  return Number(text.trim());
}

function dialog(page: Page) {
  return page.locator("dialog[open]");
}

/** Floor: select an OCCUPIED table and ask to assign it to another server. */
async function floorAssignOccupied(page: Page, label: string, server: string) {
  await switchView(page, "Floor");
  await tile(page, label).click();
  await page.getByRole("button", { name: "Assign to another server…" }).click();
  await page.getByRole("button", { name: server, exact: true }).click();
}

async function chooseConflict(
  page: Page,
  choose: "transfer" | "end-assign" | "cancel",
) {
  const d = dialog(page);
  await expect(d.getByText("What do you want to do?")).toBeVisible({
    timeout: 30_000,
  });
  if (choose === "transfer") {
    await d
      .getByRole("button", { name: /^Transfer (entire .* assignment )?to / })
      .click();
  } else if (choose === "end-assign") {
    await d.getByRole("button", { name: /^End .*assign/ }).click();
  } else {
    await d.getByRole("button", { name: "Cancel" }).click();
  }
  await expect(dialog(page)).toHaveCount(0);
}

async function serversCard(page: Page, name: string) {
  await switchView(page, "Servers");
  return page.getByRole("group", { name: `${name} server card` });
}

async function expectEndedHistory(page: Page, name: string, label: string) {
  await switchView(page, "Servers");
  await expect(
    page
      .getByRole("group", { name: `${name} session history` })
      .locator("li", { hasText: "Ended" })
      .getByText(label, { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
}

function yesterday() {
  const d = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(
      new Date(),
    ) + "T12:00:00Z",
  );
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function wipeSessions(date: string) {
  const { admin, locationId } = await devLocation();
  const sessions = await admin
    .from("service_sessions")
    .select("id")
    .eq("location_id", locationId)
    .eq("service_date", date);
  const ids = (sessions.data ?? []).map((s) => s.id as number);
  if (ids.length === 0) return;
  for (const table of [
    "board_events",
    "section_assignments",
    "table_rotation_entries",
    "rotation_rounds",
    "rotation_members",
  ]) {
    await admin.from(table).delete().in("service_session_id", ids);
  }
  await admin.from("service_sessions").delete().in("id", ids);
}

test.beforeAll(async ({ browser }) => {
  await assertServerIsDev();
  const { admin, locationId } = await devLocation();
  await resetTodayBoard(admin, locationId);
  await wipeSessions(yesterday());
  contexts = [
    await browser.newContext(),
    await browser.newContext(),
    await browser.newContext(),
  ];
  owner = await openAs(contexts[0], "TestOwner");
  manager = await openAs(contexts[1], "TestManager");
  server1 = await openAs(contexts[2], "TestServer1");
  track(owner, "owner");
  track(manager, "manager");
  track(server1, "server1");
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  const { admin, locationId } = await devLocation();
  await resetTodayBoard(admin, locationId);
  await wipeSessions(yesterday());
});

test("setup: the owner opens the floor with two servers; others learn live", async () => {
  for (const name of [S1, S2]) {
    await owner
      .getByRole("button", { name: new RegExp(name) })
      .first()
      .click();
  }
  await expect(owner.getByText(S2).first()).toBeVisible();
  await switchView(manager, "Grid");
  await expect(manager.getByText(S2).first()).toBeVisible({ timeout: 30_000 });
  await owner.reload();
  await owner.waitForSelector('body[data-hydrated="true"]');
  await goToAllocation(owner);
});

test("XM-070 an assignment made by the owner reaches the manager's open Floor with no refresh", async () => {
  await switchView(manager, "Floor");
  await switchView(owner, "Floor");
  await floorAssign(owner, "T6", S1);
  await expectOwner(owner, "T6", S1);
  await expectOwner(manager, "T6", S1);
});

test("XM-021 occupied table -> Transfer (from Floor): one owner, history kept, every view agrees live", async () => {
  await floorAssignOccupied(manager, "T6", S2);
  await expect(
    dialog(manager).getByText(`T6 is currently assigned to ${S1}.`, {
      exact: false,
    }),
  ).toBeVisible();
  await chooseConflict(manager, "transfer");
  await expectOwner(manager, "T6", S2);

  // The owner never touched anything: Floor, Servers and Dashboard converge.
  await switchView(owner, "Floor");
  await expectOwner(owner, "T6", S2);
  await expectEndedHistory(owner, S1, "T6");
  const s1 = await serversCard(owner, S1);
  await expect(s1.getByRole("button", { name: /^Table T6, / })).toHaveCount(0);
  const s2 = await serversCard(owner, S2);
  await expect(s2.getByRole("button", { name: /^Table T6, / })).toHaveCount(1);
  expect(await dashboardActiveTables(owner)).toBe(1);
});

test("XM-022 occupied table -> End + Assign (typed in the Grid): old assignment ENDED, new ACTIVE, atomic", async () => {
  await switchView(owner, "Grid");
  const input = owner.locator(`input[data-cell^="${S1}|"]`).first();
  await input.fill("T6");
  await input.press("Enter");
  await expect(
    dialog(owner).getByText(`T6 is currently assigned to ${S2}.`, {
      exact: false,
    }),
  ).toBeVisible();
  await chooseConflict(owner, "end-assign");

  await switchView(owner, "Floor");
  await expectOwner(owner, "T6", S1);
  await expectOwner(manager, "T6", S1); // live, no refresh
  await expectEndedHistory(owner, S2, "T6"); // S2's assignment ended
  expect(await dashboardActiveTables(owner)).toBe(1);
  // S1 has an ended T6 (from the earlier transfer) AND a new active T6.
  const s1 = await serversCard(owner, S1);
  await expect(s1.getByRole("button", { name: /^Table T6, / })).toHaveCount(1);
  await expect(
    owner
      .getByRole("group", { name: `${S1} session history` })
      .locator("li", { hasText: "Ended" }),
  ).toHaveCount(1);
});

test("same-server duplicate: a message, no mutation", async () => {
  await switchView(owner, "Grid");
  const input = owner.locator(`input[data-cell^="${S1}|"]`).first();
  await input.fill("T6");
  await input.press("Enter");
  await expect(
    owner.getByText(`T6 is already assigned to ${S1}.`),
  ).toBeVisible();
  await expect(dialog(owner)).toHaveCount(0);
  expect(await dashboardActiveTables(owner)).toBe(1);
});

test("XM-024 stale client double-claim: the server answers with the conflict, never a second active T7", async ({
  browser,
}) => {
  // A manager page whose Realtime socket never connects: it cannot learn of
  // anything the owner does until it asks the server.
  const staleContext = await browser.newContext();
  contexts.push(staleContext);
  const stale = await staleContext.newPage();
  track(stale, "stale");
  await stale.routeWebSocket(/realtime\/v1\/websocket/, () => {
    /* never connect: the page stays stale */
  });
  await signIn(stale, PINS.TestManager);
  await goToAllocation(stale);
  await switchView(stale, "Floor");
  await expectAvailable(stale, "T7");

  await switchView(owner, "Floor");
  await floorAssign(owner, "T7", S1);
  await expectOwner(owner, "T7", S1);

  // Still stale: it believes T7 is free.
  await expect(tile(stale, "T7")).toHaveAccessibleName(/available/);

  // The stale manager assigns T7 to TestServer2 anyway.
  await tile(stale, "T7").click();
  await dialog(stale).getByRole("button", { name: S2, exact: true }).click();
  await expect(
    dialog(stale).getByText(`T7 is currently assigned to ${S1}.`, {
      exact: false,
    }),
  ).toBeVisible({ timeout: 30_000 });
  await chooseConflict(stale, "cancel");

  // Nothing changed; the stale page was refreshed to the truth.
  await expectOwner(stale, "T7", S1);
  await expectOwner(owner, "T7", S1);
  const owners = await owner
    .getByRole("button", { name: /^Table T7, / })
    .count();
  expect(owners).toBe(1);

  // Same race, resolved with End + Assign (still server-authoritative).
  await floorAssignOccupied(stale, "T7", S2);
  await chooseConflict(stale, "end-assign");
  await expectOwner(stale, "T7", S2);
  await expectOwner(owner, "T7", S2); // live on the other context
  await expectEndedHistory(owner, S1, "T7");
  await staleContext.close();
});

test('XM-011 typing "1" assigns the registered T1 in every view (no off-map "1"); "99" with no T99 stays off-map; both survive a refresh', async () => {
  // ---- numeric shorthand -> canonical T1 ---------------------------------
  const before = await dashboardActiveTables(owner);
  await switchView(owner, "Grid");
  const input = owner.locator(`input[data-cell^="${S2}|"]`).first();
  await input.fill("1");
  await input.press("Enter");
  await expect(
    owner.getByRole("button", { name: "Edit table T1" }),
  ).toBeVisible();
  await expect(owner.getByRole("button", { name: "Edit table 1" })).toHaveCount(
    0,
  );

  await switchView(owner, "Floor");
  await expectOwner(owner, "T1", S2);
  await expect(
    owner.getByRole("region", { name: "Off-map tables" }),
  ).toHaveCount(0);
  await switchView(manager, "Floor");
  await expectOwner(manager, "T1", S2); // live, no refresh

  await switchView(owner, "Picker");
  await owner.locator(`input[data-cell^="${S1}|"]`).first().click();
  await expect(
    dialog(owner).getByRole("button", {
      name: `Table T1, assigned to ${S2}`,
    }),
  ).toBeVisible();
  await expect(
    dialog(owner).getByRole("region", {
      name: "Off-map / unpositioned tables",
    }),
  ).toHaveCount(0);
  await dialog(owner).getByRole("button", { name: "Cancel" }).click();

  const s2 = await serversCard(owner, S2);
  await expect(s2.getByRole("button", { name: /^Table T1, / })).toBeVisible();
  await expect(s2.getByRole("button", { name: /^Table 1, / })).toHaveCount(0);
  expect(await dashboardActiveTables(owner)).toBe(before + 1);
  await expect(
    owner.getByText(/Includes \d+ not on the floor map/),
  ).toHaveCount(0);

  // ---- free-text fallback: no T99 exists ---------------------------------
  await switchView(owner, "Grid");
  const input99 = owner.locator(`input[data-cell^="${S1}|"]`).first();
  await input99.fill("99");
  await input99.press("Enter");
  await expect(
    owner.getByRole("button", { name: "Edit table 99" }),
  ).toBeVisible();
  await expect(owner.getByText("Off-map").first()).toBeVisible();

  await switchView(owner, "Floor");
  const rail = owner.getByRole("region", { name: "Off-map tables" });
  await expect(
    rail.getByRole("button", { name: `Table 99, assigned to ${S1}, off-map` }),
  ).toBeVisible();
  await expectOwner(owner, "T1", S2); // "99" never marks a mapped table
  await switchView(manager, "Floor");
  await expect(
    manager
      .getByRole("region", { name: "Off-map tables" })
      .getByRole("button", { name: `Table 99, assigned to ${S1}, off-map` }),
  ).toBeVisible({ timeout: 30_000 });

  await switchView(owner, "Picker");
  await owner.locator(`input[data-cell^="${S2}|"]`).first().click();
  await expect(
    dialog(owner)
      .getByRole("region", { name: "Off-map / unpositioned tables" })
      .getByRole("button", { name: /^Table 99, assigned to/ }),
  ).toBeVisible();
  await dialog(owner).getByRole("button", { name: "Cancel" }).click();

  const s1 = await serversCard(owner, S1);
  await expect(
    s1.getByRole("button", {
      name: /^Table 99, assigned to .*not on the floor map/,
    }),
  ).toBeVisible();
  await switchView(owner, "Dashboard");
  await expect(
    owner.getByText(/Includes \d+ not on the floor map/),
  ).toBeVisible();
  expect(await dashboardActiveTables(owner)).toBe(before + 2);

  // XM-072 refresh: active, ended, off-map and ownership all survive a reload.
  await owner.reload();
  await owner.waitForSelector('body[data-hydrated="true"]');
  await goToAllocation(owner);
  await switchView(owner, "Floor");
  await expectOwner(owner, "T6", S1);
  await expectOwner(owner, "T7", S2);
  await expectOwner(owner, "T1", S2);
  await expect(
    owner
      .getByRole("region", { name: "Off-map tables" })
      .getByRole("button", { name: `Table 99, assigned to ${S1}, off-map` }),
  ).toBeVisible();
  await expectEndedHistory(owner, S1, "T7");
  await expectEndedHistory(owner, S2, "T6");
});

test('CR-UI stale browser typing "2": the database resolves it to T2, answers with the conflict dialog, and End + Assign converges both contexts', async ({
  browser,
}) => {
  // A manager page whose Realtime socket never connects: it learns nothing the
  // owner does until it asks the server.
  const staleContext = await browser.newContext();
  contexts.push(staleContext);
  const stale = await staleContext.newPage();
  track(stale, "stale-shorthand");
  await stale.routeWebSocket(/realtime\/v1\/websocket/, () => {
    /* never connect: the page stays stale */
  });
  await signIn(stale, PINS.TestManager);
  await goToAllocation(stale);
  await switchView(stale, "Floor");
  await expectAvailable(stale, "T2");

  // The owner (live) takes T2 for S1.
  await switchView(owner, "Floor");
  await floorAssign(owner, "T2", S1);
  await expectOwner(owner, "T2", S1);
  await expect(tile(stale, "T2")).toHaveAccessibleName(/available/);

  // The stale manager types the SHORTHAND "2" for S2 in the Grid.
  await switchView(stale, "Grid");
  const typed = stale.locator(`input[data-cell^="${S2}|"]`).first();
  await typed.fill("2");
  await typed.press("Enter");
  await expect(
    dialog(stale).getByText(`T2 is currently assigned to ${S1}.`, {
      exact: false,
    }),
  ).toBeVisible({ timeout: 30_000 });

  // No free-text "2" exists anywhere: nothing was written by the refused call.
  const { admin, locationId } = await devLocation();
  const sessions = await admin
    .from("service_sessions")
    .select("id")
    .eq("location_id", locationId)
    .order("service_date", { ascending: false })
    .limit(1);
  const entries = await admin
    .from("table_rotation_entries")
    .select("table_label, status")
    .eq("service_session_id", sessions.data![0].id as number)
    .eq("table_label", "2");
  expect(entries.data ?? []).toHaveLength(0);

  await chooseConflict(stale, "end-assign");
  await expectOwner(stale, "T2", S2);
  await expectOwner(owner, "T2", S2); // live on the other context
  await expectEndedHistory(owner, S1, "T2");
  const after = await admin
    .from("table_rotation_entries")
    .select("table_label")
    .eq("service_session_id", sessions.data![0].id as number)
    .eq("table_label", "2");
  expect(after.data ?? []).toHaveLength(0);
  await staleContext.close();
});

test("permission parity: a server-role user resolves a conflict from Servers exactly like a manager", async () => {
  await switchView(server1, "Servers");
  const card = server1.getByRole("group", { name: `${S1} server card` });
  await card.getByRole("button", { name: "Table", exact: true }).click();
  await dialog(server1)
    .getByRole("button", { name: /^Table T7, / })
    .click();
  await expect(
    dialog(server1).getByText(`T7 is currently assigned to ${S2}.`, {
      exact: false,
    }),
  ).toBeVisible();
  await chooseConflict(server1, "end-assign");
  await switchView(owner, "Floor");
  await expectOwner(owner, "T7", S1);
});

test("XM-071 offline -> online: the missed End + Assign converges without a reload", async () => {
  await contexts[2].setOffline(true);
  await floorAssignOccupied(manager, "T7", S2);
  await chooseConflict(manager, "end-assign");
  await expectOwner(manager, "T7", S2);
  await switchView(server1, "Floor");
  await expect(tile(server1, "T7")).toHaveAccessibleName(
    /assigned to TestServer1/,
  );
  await contexts[2].setOffline(false);
  await expectOwner(server1, "T7", S2);
});

test("XM-080 a previous service day shows its history (ended + active) read-only", async () => {
  const { admin, orgId, locationId } = await devLocation();
  const date = yesterday();
  const profiles = await admin
    .from("profiles")
    .select("id, display_name")
    .in("display_name", [S1, S2]);
  const id = (name: string) =>
    profiles.data!.find((p) => p.display_name === name)!.id as string;

  const session = await admin
    .from("service_sessions")
    .insert({
      organization_id: orgId,
      location_id: locationId,
      service_date: date,
      meal_period: "service",
      status: "active",
    })
    .select("id")
    .single();
  const sid = session.data!.id as number;
  const rounds = await admin
    .from("rotation_rounds")
    .insert([
      { organization_id: orgId, service_session_id: sid, sequence: 1 },
      { organization_id: orgId, service_session_id: sid, sequence: 2 },
    ])
    .select("id, sequence");
  const members = await admin
    .from("rotation_members")
    .insert([
      {
        organization_id: orgId,
        service_session_id: sid,
        server_profile_id: id(S1),
        position: 1,
      },
      {
        organization_id: orgId,
        service_session_id: sid,
        server_profile_id: id(S2),
        position: 2,
      },
    ])
    .select("id, server_profile_id");
  const round = (n: number) => rounds.data!.find((r) => r.sequence === n)!.id;
  const member = (pid: string) =>
    members.data!.find((m) => m.server_profile_id === pid)!.id;

  // S1 held T11 and ENDED it; S2 then took T11 (still active).
  const now = new Date().toISOString();
  const ended = await admin.from("table_rotation_entries").insert({
    organization_id: orgId,
    rotation_round_id: round(1),
    rotation_member_id: member(id(S1)),
    table_label: "T11",
    status: "ended",
    assigned_by: id(S1),
    ended_at: now,
    ended_by: id(S1),
  });
  expect(ended.error).toBeNull();
  const active = await admin.from("table_rotation_entries").insert({
    organization_id: orgId,
    rotation_round_id: round(2),
    rotation_member_id: member(id(S2)),
    table_label: "T11",
    status: "active",
    assigned_by: id(S2),
  });
  expect(active.error).toBeNull();

  await owner.getByRole("button", { name: "Previous day" }).click();
  await expect(
    owner.getByText(/a previous day\. This board is read-only/),
  ).toBeVisible({
    timeout: 30_000,
  });
  // Read-only: every entry input is disabled.
  await switchView(owner, "Grid");
  await expect(owner.locator("input[data-cell]:not([disabled])")).toHaveCount(
    0,
  );
  await expectEndedHistory(owner, S1, "T11");
  const s2 = await serversCard(owner, S2);
  await expect(s2.getByRole("button", { name: /^Table T11, / })).toHaveCount(1);
  expect(await dashboardActiveTables(owner)).toBe(1);

  await owner.getByRole("button", { name: "Next day" }).click();
  await expect(owner.getByText(/a previous day/)).toHaveCount(0);
  await switchView(owner, "Floor");
  await expectOwner(owner, "T7", S2); // today's board is intact
});

test("no unexpected client errors were thrown in any context", async () => {
  expect(pageErrors).toEqual([]);
  await expect(accountButton(owner)).toBeVisible();
});
