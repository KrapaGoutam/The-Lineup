/**
 * Extended live-service scenario from the Part 1 brief, driven through the
 * Grid exactly as a host would type it, then verified in all five views from
 * a second, independently signed-in browser.
 *
 *         A (TestServer1)  B (TestServer2)  C (TestHost)
 *   Row 1      T1              T15              T16
 *   Row 2      T15             T11              T2       <- A taking T15 ENDS B's T15
 *   Row 3      T7
 *
 * Final current state: A -> T1,T15,T7 · B -> T11 · C -> T16,T2.
 * The Grid keeps B's T15 as ENDED history.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  assertServerIsDev,
  devLocation,
  expectAvailable,
  expectOwner,
  openAs,
  resetTodayBoard,
  switchView,
} from "./support/dev-app";

test.describe.configure({ mode: "serial" });

let contexts: BrowserContext[] = [];
let owner: Page;
let manager: Page;
const pageErrors: string[] = [];

async function gridAssign(
  page: Page,
  server: string,
  turn: number,
  label: string,
) {
  const input = page.locator(`input[data-cell="${server}|${turn}"]`);
  await input.fill(label);
  await input.press("Enter");
}

test.beforeAll(async ({ browser }) => {
  await assertServerIsDev();
  const { admin, locationId } = await devLocation();
  await resetTodayBoard(admin, locationId);
  contexts = [await browser.newContext(), await browser.newContext()];
  owner = await openAs(contexts[0], "TestOwner");
  manager = await openAs(contexts[1], "TestManager");
  for (const page of [owner, manager]) {
    page.on("pageerror", (error) => pageErrors.push(error.message));
  }
});

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  const { admin, locationId } = await devLocation();
  await resetTodayBoard(admin, locationId);
});

test("A/B/C live service through the Grid; all five views agree", async () => {
  for (const name of ["TestServer1", "TestServer2", "TestHost"]) {
    await owner
      .getByRole("button", { name: new RegExp(`^${name}`) })
      .first()
      .click();
  }
  // Authoritative round ids before typing (the board was just created).
  await owner.reload();
  await owner.waitForSelector('body[data-hydrated="true"]');
  await owner
    .getByRole("button", { name: /^Table Allocation$|^Allocation$/ })
    .first()
    .click()
    .catch(() => {});

  await gridAssign(owner, "TestServer1", 1, "T1");
  await gridAssign(owner, "TestServer2", 1, "T15");
  await gridAssign(owner, "TestHost", 1, "T16");
  await expect(owner.locator('input[data-cell="TestServer1|2"]')).toBeVisible();

  // Row 2: A takes T15 from B (End + Assign, chosen in the dialog), B -> T11, C -> T2.
  await gridAssign(owner, "TestServer1", 2, "T15");
  // Cross-view integrity (X2): a table another server still holds is no longer
  // taken silently -- the shared dialog asks, and End + Assign ends B's entry.
  await owner
    .locator("dialog[open]")
    .getByRole("button", { name: /^End .*assign/ })
    .click();
  await gridAssign(owner, "TestServer2", 2, "T11");
  await gridAssign(owner, "TestHost", 2, "T2");
  // Row 3
  await gridAssign(owner, "TestServer1", 3, "T7");

  // The owner's own Grid keeps B's T15 as ENDED history.
  await expect(
    owner.getByRole("button", { name: "Unassign ended table T15" }),
  ).toBeVisible({ timeout: 30_000 });

  // Everything below is observed from the OTHER browser, live.
  const expectState = async () => {
    for (const [label, name] of [
      ["T1", "TestServer1"],
      ["T15", "TestServer1"],
      ["T7", "TestServer1"],
      ["T11", "TestServer2"],
      ["T16", "TestHost"],
      ["T2", "TestHost"],
    ] as const) {
      await expectOwner(manager, label, name);
    }
    await expectAvailable(manager, "T3");
  };

  await switchView(manager, "Floor");
  await expectState();
  // Picker shows the map once a cell is targeted: the same owners, same data.
  await switchView(manager, "Picker");
  await manager
    .locator('input[data-cell="TestServer2|3"]')
    .locator("xpath=..")
    .click();
  await expect(manager.locator("dialog[open]")).toBeVisible();
  await expectState();
  await manager.keyboard.press("Escape");

  await switchView(manager, "Servers");
  await expect(
    manager.getByRole("group", { name: "TestServer1 server card" }),
  ).toContainText("3 tables");
  await expect(
    manager.getByRole("group", { name: "TestServer2 server card" }),
  ).toContainText("1 table");
  await expect(
    manager.getByRole("group", { name: "TestHost server card" }),
  ).toContainText("2 tables");

  await switchView(manager, "Dashboard");
  await expect(
    manager
      .getByText("Active tables", { exact: true })
      .locator("xpath=following-sibling::p[1]"),
  ).toHaveText("6");
  // #109 U2: Recent activity is rendered from the real board_events rows,
  // newest first, in plain words -- never raw payload or enum names.
  const activity = manager.getByRole("list", { name: "Recent board activity" });
  await expect(activity).toContainText("assigned Table T7 to TestServer1", {
    timeout: 30_000,
  });
  await expect(activity).not.toContainText(/undefined|null|\{|_/);
  expect(
    (await activity.getByRole("listitem").first().textContent()) ?? "",
  ).toContain("T7");

  await switchView(manager, "Grid");
  // Historical chronology preserved: B's old T15 is ENDED, A's T15 is ACTIVE.
  await expect(
    manager.getByRole("button", { name: "Unassign ended table T15" }),
  ).toBeVisible();
  await expect(
    manager.getByRole("button", { name: "Edit table T15" }),
  ).toBeVisible();

  // And a refresh changes nothing.
  await manager.reload();
  await manager.waitForSelector('body[data-hydrated="true"]');
  await manager
    .getByRole("button", { name: /^Table Allocation$|^Allocation$/ })
    .first()
    .click()
    .catch(() => {});
  await switchView(manager, "Floor");
  await expectState();

  expect(pageErrors).toEqual([]);
});
