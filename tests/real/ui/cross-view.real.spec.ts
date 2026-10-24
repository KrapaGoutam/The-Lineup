/**
 * Table Rotation V2 Part 1 — real-mode browser scenarios (hosted DEV).
 * Several isolated browser contexts, each signed in as a different DEV user
 * through the real passcode flow. Scenario ids (Sxx) match
 * PART1_TEST_MATRIX.md.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  assertServerIsDev,
  devLocation,
  expectAvailable,
  expectOwner,
  floorAssign,
  openAs,
  PINS,
  resetTodayBoard,
  goToAllocation,
  accountButton,
  switchView,
  tile,
} from "./support/dev-app";

test.describe.configure({ mode: "serial" });

const DEMO_NAMES = [
  "Mia Chen",
  "Leo Park",
  "Ava Brooks",
  "Zara Reed",
  "Sam Ellis",
  "Maya Singh",
];

let owner: Page;
let manager: Page;
let server1: Page;
let contexts: BrowserContext[] = [];
const pageErrors: string[] = [];

function track(page: Page, label: string) {
  page.on("pageerror", (error) =>
    pageErrors.push(`${label}: ${error.message}`),
  );
}

async function dashboardActiveTables(page: Page): Promise<number> {
  const text = await page
    .getByText("Active tables", { exact: true })
    .locator("xpath=following-sibling::p[1]")
    .innerText();
  return Number(text.trim());
}

test.beforeAll(async ({ browser }) => {
  await assertServerIsDev();
  const { admin, locationId } = await devLocation();
  await resetTodayBoard(admin, locationId);

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
});

test("setup: the owner opens the floor with two servers", async () => {
  for (const name of ["TestServer1", "TestServer2"]) {
    await owner
      .getByRole("button", { name: new RegExp(name) })
      .first()
      .click();
  }
  await expect(
    owner
      .getByRole("columnheader", { name: /TestServer1/ })
      .or(owner.getByText("TestServer1").first()),
  ).toBeVisible();
  await expect(owner.getByText("TestServer2").first()).toBeVisible();
  // Every other context learns about the new floor live (no reload)...
  await switchView(manager, "Grid");
  await expect(manager.getByText("TestServer2").first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(server1.getByText("TestServer2").first()).toBeVisible({
    timeout: 20_000,
  });
  // ...and the owner's own page has the authoritative (server) round ids.
  await owner.reload();
  await owner.waitForSelector('body[data-hydrated="true"]');
  await goToAllocation(owner);
});

test("S01/S12/S30 assign in Floor, every other view agrees immediately", async () => {
  await switchView(owner, "Floor");
  await floorAssign(owner, "T1", "TestServer1");
  await expectOwner(owner, "T1", "TestServer1");

  // Immediately: Picker, Servers, Dashboard, Grid.
  await switchView(owner, "Picker");
  await switchView(owner, "Servers");
  await expect(
    owner.getByRole("group", { name: "TestServer1 server card" }),
  ).toContainText("1 table");
  await switchView(owner, "Dashboard");
  expect(await dashboardActiveTables(owner)).toBe(1);
  await switchView(owner, "Grid");
  await expect(owner.getByText("T1").first()).toBeVisible();

  // Rapid switching never diverges.
  for (let i = 0; i < 4; i += 1) {
    for (const view of [
      "Floor",
      "Picker",
      "Servers",
      "Dashboard",
      "Grid",
    ] as const) {
      await switchView(owner, view);
    }
  }
  await switchView(owner, "Floor");
  await expectOwner(owner, "T1", "TestServer1");
  await switchView(owner, "Dashboard");
  expect(await dashboardActiveTables(owner)).toBe(1);
});

test("S07 (UI) the manager Ends a table the owner assigned; the owner sees it live (S11)", async () => {
  await switchView(manager, "Floor");
  // The manager's page was loaded before any of this: it learns via Realtime.
  await expectOwner(manager, "T1", "TestServer1");
  await tile(manager, "T1").click();
  await manager.getByRole("button", { name: "End table" }).click();
  await expectAvailable(manager, "T1");
  // No reload on the owner side.
  await switchView(owner, "Floor");
  await expectAvailable(owner, "T1");
});

test("S11 (D-03) a freshly reloaded page still receives live updates", async () => {
  await server1.reload();
  await server1.waitForSelector('body[data-hydrated="true"]');
  await goToAllocation(server1);
  await switchView(server1, "Floor");
  await floorAssign(manager, "T3", "TestServer2");
  await expectOwner(server1, "T3", "TestServer2"); // no reload, no click
});

test("S08/D-07 Transfer from Floor does not crash and moves the table", async () => {
  await floorAssign(manager, "T8", "TestServer1");
  await expectOwner(manager, "T8", "TestServer1");
  await tile(manager, "T8").click();
  await manager.getByRole("button", { name: "Transfer" }).click();
  await manager
    .getByRole("button", { name: "TestServer2", exact: true })
    .click();
  await expectOwner(manager, "T8", "TestServer2");
  await switchView(manager, "Servers");
  await expect(
    manager.getByRole("group", { name: "TestServer2 server card" }),
  ).toContainText("2 tables");
  await switchView(manager, "Grid");
  expect(pageErrors.filter((e) => e.startsWith("manager"))).toEqual([]);
  // The other contexts converge without reloading.
  await switchView(owner, "Floor");
  await expectOwner(owner, "T8", "TestServer2");
});

test("S20 refresh keeps the authoritative state", async () => {
  await owner.reload();
  await owner.waitForSelector('body[data-hydrated="true"]');
  await goToAllocation(owner);
  await switchView(owner, "Floor");
  await expectOwner(owner, "T8", "TestServer2");
  await expectOwner(owner, "T3", "TestServer2");
  await expectAvailable(owner, "T1");
});

test("S28 offline → online rehydrates the missed changes", async () => {
  await contexts[2].setOffline(true);
  await switchView(manager, "Floor");
  await floorAssign(manager, "T5", "TestServer1");
  await expectOwner(manager, "T5", "TestServer1");
  await switchView(server1, "Floor");
  await expect(tile(server1, "T5")).toHaveAccessibleName(/available/);
  await contexts[2].setOffline(false);
  await expectOwner(server1, "T5", "TestServer1");
});

test("S29 Back/Forward cannot restore stale board state", async () => {
  await owner.goto("/r/the-monks");
  await owner.waitForSelector('body[data-hydrated="true"]');
  await switchView(manager, "Floor");
  await floorAssign(manager, "T6", "TestServer2");
  await expectOwner(manager, "T6", "TestServer2");
  await owner.goBack();
  await owner.goForward();
  await owner.waitForSelector('body[data-hydrated="true"]');
  await goToAllocation(owner);
  await switchView(owner, "Floor");
  await expectOwner(owner, "T6", "TestServer2");
});

async function undo(page: Page) {
  const button = page.getByRole("button", { name: "Undo", exact: true });
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await button.click();
}
async function redo(page: Page) {
  const button = page.getByRole("button", { name: "Redo", exact: true });
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await button.click();
}

test("S02/S14/S15 (D-06) a server holds several tables; Clear Cell affects only that cell and Undo/Redo restore it", async () => {
  await switchView(manager, "Floor");
  await floorAssign(manager, "T10", "TestServer1");
  await expectOwner(manager, "T10", "TestServer1");
  await floorAssign(manager, "T11", "TestServer1");
  await expectOwner(manager, "T11", "TestServer1");
  await switchView(manager, "Servers");
  await expect(
    manager.getByRole("group", { name: "TestServer1 server card" }),
  ).toContainText("3 tables"); // T5, T10, T11

  await switchView(manager, "Grid");
  await manager.getByRole("button", { name: "Unassign table T10" }).click();
  await switchView(manager, "Floor");
  await expectAvailable(manager, "T10");
  await expectOwner(manager, "T11", "TestServer1"); // only the intended cell
  await expectOwner(manager, "T5", "TestServer1");

  await undo(manager);
  await expectOwner(manager, "T10", "TestServer1");
  await redo(manager);
  await expectAvailable(manager, "T10");
  await undo(manager);
  await expectOwner(manager, "T10", "TestServer1");
  // Another context converges live.
  await switchView(server1, "Floor");
  await expectOwner(server1, "T10", "TestServer1");
});

test("S16/S17/S18 (D-05) Clear Board, Undo restores everything, Redo clears again", async () => {
  await switchView(manager, "Floor");
  const held = [
    ["T3", "TestServer2"],
    ["T8", "TestServer2"],
    ["T5", "TestServer1"],
    ["T10", "TestServer1"],
  ] as const;
  await manager.getByRole("button", { name: "Clear board" }).click();
  for (const [label] of held) await expectAvailable(manager, label);

  await undo(manager); // previously failed on a duplicate round sequence
  for (const [label, name] of held) await expectOwner(manager, label, name);

  await redo(manager);
  for (const [label] of held) await expectAvailable(manager, label);

  await undo(manager);
  for (const [label, name] of held) await expectOwner(manager, label, name);
  // And a second browser agrees without a reload.
  await switchView(server1, "Floor");
  for (const [label, name] of held) await expectOwner(server1, label, name);
});

test("S25 a server with active tables cannot be removed", async () => {
  await switchView(manager, "Grid");
  await manager.getByRole("button", { name: "Remove TestServer1" }).click();
  await expect(manager.getByText(/still has active tables/i)).toBeVisible({
    timeout: 30_000,
  });
  await switchView(manager, "Floor");
  await expectOwner(manager, "T5", "TestServer1");
});

test("S27 Reorder changes rotation order but not ownership", async () => {
  await switchView(manager, "Servers");
  const order = async () =>
    manager
      .getByRole("group", { name: /server card/ })
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label")));
  const before = await order();
  await switchView(manager, "Grid");
  await manager.getByRole("button", { name: "Move TestServer2 up" }).click();
  await switchView(manager, "Servers");
  await expect.poll(order, { timeout: 30_000 }).not.toEqual(before);
  await switchView(manager, "Floor");
  await expectOwner(manager, "T3", "TestServer2");
  await expectOwner(manager, "T5", "TestServer1");
  await undo(manager);
  await switchView(manager, "Servers");
  await expect.poll(order, { timeout: 30_000 }).toEqual(before);
});

test("S13 (D-04) logging in as another user never shows demo or the previous user's state", async () => {
  // Observe every DOM mutation from the moment the login screen is up.
  await owner.evaluate((names) => {
    const w = window as unknown as { __demoSeen?: string[] };
    w.__demoSeen = [];
    new MutationObserver(() => {
      const text = document.body.innerText;
      for (const name of names) {
        if (text.includes(name) && !w.__demoSeen!.includes(name))
          w.__demoSeen!.push(name);
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }, DEMO_NAMES);

  await accountButton(owner).click();
  await owner
    .getByRole("button", { name: /Sign out/i })
    .first()
    .click();
  await expect(owner.getByLabel("Restaurant passcode")).toBeVisible();
  await owner.getByLabel("Restaurant passcode").fill(PINS.TestServer2);
  await expect(accountButton(owner)).toBeVisible({ timeout: 60_000 });
  await goToAllocation(owner);
  await switchView(owner, "Floor");

  const seen = await owner.evaluate(
    () => (window as unknown as { __demoSeen?: string[] }).__demoSeen ?? [],
  );
  expect(seen).toEqual([]);
  // Real state, immediately: TestServer2 holds T3/T6/T8.
  await expectOwner(owner, "T3", "TestServer2");
  await expectOwner(owner, "T8", "TestServer2");
  // The signed-in identity is the new person, not the previous one.
  await expect(accountButton(owner)).toContainText("TestServer2");
  await expect(accountButton(owner)).not.toContainText("TestOwner");
});

test("no unexpected client errors were thrown in any context", async () => {
  expect(pageErrors).toEqual([]);
});
