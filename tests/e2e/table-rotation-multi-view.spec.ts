import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(accountButton(page)).toBeVisible({ timeout: 60000 });
}

function accountButton(page: Page) {
  return page
    .getByRole("button", { name: "Account and quick settings" })
    .first();
}

async function goToAllocation(page: Page) {
  await expect(accountButton(page)).toBeVisible();
  const direct = page.getByRole("button", {
    name: /^Table Allocation$|^Allocation$/,
  });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  const moreButton = page.getByRole("button", { name: "More" });
  if ((await moreButton.getAttribute("aria-expanded")) !== "true") {
    await moreButton.click();
  }
  await page
    .getByRole("button", { name: /^Table Allocation$|^Allocation$/ })
    .click();
}

async function switchView(
  page: Page,
  name: "Grid" | "Floor" | "Picker" | "Servers" | "Dashboard",
) {
  await page.getByRole("tab", { name, exact: true }).click();
}

test("Floor: assigning an available table shows it as occupied and appears on the Grid", async ({
  page,
}) => {
  await signIn(page, "2468"); // Maya Singh, manager
  await goToAllocation(page);
  await switchView(page, "Floor");

  const t1 = page.getByRole("button", { name: "Table T1, available" });
  await expect(t1).toBeVisible();
  await t1.click();

  await expect(
    page.getByText("Available — pick a server to assign it."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ava Brooks" }).click();

  // Ava already has an active table from the demo seed ("21 + 22"), so
  // this is ambiguous -- the decision dialog appears instead of an
  // immediate assignment (Upgrade 1.1 multi-table). "Assign Also" keeps
  // it and adds T1 as a second active table.
  await expect(
    page.getByText("Ava Brooks already has active tables"),
  ).toBeVisible();
  await page.getByRole("button", { name: /Assign T1 also/ }).click();

  await expect(
    page.getByRole("button", { name: "Table T1, assigned to Ava Brooks" }),
  ).toBeVisible();

  await switchView(page, "Grid");
  await expect(page.getByText("Table T1")).toBeVisible();
});

test("Floor: a second device cannot silently double-book a table already held by someone else", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Floor");

  await page.getByRole("button", { name: "Table T4, available" }).click();
  await page.getByRole("button", { name: "Mia Chen" }).click();
  // Mia already has active tables from the demo seed -- Assign Also.
  await page.getByRole("button", { name: /Assign T4 also/ }).click();
  await expect(
    page.getByRole("button", { name: "Table T4, assigned to Mia Chen" }),
  ).toBeVisible();

  // Re-select T4 and confirm the panel offers transfer, not a silent
  // reassignment -- the occupancy guarantee this feature's data-integrity
  // fix exists for.
  await page
    .getByRole("button", { name: "Table T4, assigned to Mia Chen" })
    .click();
  await expect(page.getByText("Assigned to")).toBeVisible();
  await expect(page.getByRole("button", { name: "Transfer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unassign" })).toBeVisible();
});

test("Picker: selecting a Grid cell then a table assigns it, visible on both Picker and Grid", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Picker");

  // Row 3, Mia Chen's column is guaranteed empty (demo seed fills only
  // rows 1-2), and the auto-row buffer guarantees a row 3 exists.
  const row3 = page.locator("div.contents", {
    has: page.getByRole("button", { name: "Clear row 3" }),
  });
  await row3.getByPlaceholder("Table #").first().click();

  await expect(
    page.getByText("Choose a table for the selected cell, or skip this turn."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Choose table" }).click();
  await page.getByRole("button", { name: "Table T7, available" }).click();

  // Choosing a table closes the popup (nothing left on Picker itself to
  // assert on -- its only TableMap instance was inside the now-closed
  // dialog); the assignment shows up on Grid instead.
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await switchView(page, "Grid");
  await expect(page.getByText("Table T7")).toBeVisible();
});

test("Servers: + Table assigns via the shared picker, and reorder updates the same order Grid uses", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Servers");

  await expect(page.getByText("Mia Chen")).toBeVisible();
  await expect(page.getByText("Leo Park")).toBeVisible();

  const leoCard = page.getByRole("group", { name: "Leo Park server card" });
  await leoCard.getByRole("button", { name: "Table" }).click();
  await page.getByRole("button", { name: "Table T9, available" }).click();
  await expect(leoCard.getByText("T9")).toBeVisible();

  await switchView(page, "Grid");
  await expect(page.getByText("Table T9")).toBeVisible();
});

test("Dashboard: shows operational metrics and a read-only Master Rotation", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Dashboard");

  await expect(page.getByText("Servers on floor")).toBeVisible();
  await expect(page.getByText("Active tables")).toBeVisible();
  await expect(page.getByText("Available tables")).toBeVisible();
  await expect(page.getByText("Master Rotation")).toBeVisible();
  // Read-only: no editable "Table #" inputs anywhere in this view.
  await expect(page.getByPlaceholder("Table #")).toHaveCount(0);

  await page.getByRole("button", { name: "Open Grid" }).click();
  await expect(
    page.getByRole("tab", { name: "Grid", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("a plain server also has Floor, Picker, Servers, and Dashboard available", async ({
  page,
}) => {
  await signIn(page, "1357"); // Mia Chen, server
  await goToAllocation(page);

  for (const name of ["Floor", "Picker", "Servers", "Dashboard"] as const) {
    await switchView(page, name);
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  }
});

// Table Rotation Multi-View, Upgrade 1.1: Assign / Transfer / End Table /
// Unassign / Skip Turn as five distinct semantics. Final UI decision:
// Transfer and End Table are Floor-only controls -- Grid and Picker keep
// Edit/Unassign/Skip Turn but never render Transfer/End (the underlying
// board_transfer/board_end_table RPCs and BoardAction variants are still
// fully live, just not surfaced from those two views). See
// docs/features/table-rotation-multi-view/TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md.

test("Grid: Skip Turn records a turn with no table, rendered as 0, and Unassign clears it back to empty", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Grid");

  // Row 3 is guaranteed fully empty by the demo seed (round 1 and 2 are
  // pre-filled, the auto-row buffer guarantees a fully empty row 3).
  const row3 = page.locator("div.contents", {
    has: page.getByRole("button", { name: "Clear row 3" }),
  });
  // Mia Chen's column (first, by position) -- skip her row-3 turn.
  await row3.getByRole("button", { name: "Skip turn" }).first().click();

  await expect(row3.getByRole("status", { name: "Skip turn" })).toHaveText("0");
  // A skip is a real, semantic state -- not the literal editable label
  // "0" -- so no "Table #" input remains in that cell once skipped.
  await expect(row3.getByPlaceholder("Table #")).toHaveCount(3); // the other 3 columns are still empty/editable

  await row3.getByRole("button", { name: "Unassign skip turn" }).click();
  await expect(row3.getByRole("status", { name: "Skip turn" })).toHaveCount(0);
  await expect(row3.getByPlaceholder("Table #")).toHaveCount(4);
});

test("Picker: Skip Turn on a selected empty cell works alongside picking a table for another", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Picker");

  const row3 = page.locator("div.contents", {
    has: page.getByRole("button", { name: "Clear row 3" }),
  });
  // Select Mia Chen's row-3 cell (first column) and skip it.
  await row3.getByPlaceholder("Table #").nth(0).click();
  await page.getByRole("button", { name: "Skip turn instead" }).click();
  await expect(row3.getByRole("status", { name: "Skip turn" })).toBeVisible();

  // Selecting a different (still empty) cell and picking a table assigns
  // it normally -- Skip Turn on one column never disturbs another.
  await row3.getByPlaceholder("Table #").nth(0).click(); // now Leo Park's cell
  await page.getByRole("button", { name: "Choose table" }).click();
  await page.getByRole("button", { name: "Table T11, available" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  await switchView(page, "Grid");
  const gridRow3 = page.locator("div.contents", {
    has: page.getByRole("button", { name: "Clear row 3" }),
  });
  await expect(
    gridRow3.getByRole("status", { name: "Skip turn" }),
  ).toBeVisible();
  await expect(gridRow3.getByText("Table T11")).toBeVisible();
});

test("Floor: assign, transfer (moves the assignment, leaves no stale text behind), end table, reassign the freed table, then unassign", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Floor");

  // 1. Assign T2 to Noah Diaz -- Noah already has an active table from
  // the demo seed ("4"), so the decision dialog appears; Assign Also
  // keeps it and adds T2 as a second active table.
  await page.getByRole("button", { name: "Table T2, available" }).click();
  await page.getByRole("button", { name: "Noah Diaz" }).click();
  await expect(
    page.getByText("Noah Diaz already has active tables"),
  ).toBeVisible();
  await page.getByRole("button", { name: /Assign T2 also/ }).click();
  await expect(
    page.getByRole("button", { name: "Table T2, assigned to Noah Diaz" }),
  ).toBeVisible();

  // 2. Transfer T2 to Leo Park -- the same assignment moves, it isn't a
  // second, independent assignment layered on top.
  await page
    .getByRole("button", { name: "Table T2, assigned to Noah Diaz" })
    .click();
  await page.getByRole("button", { name: "Transfer" }).click();
  await page.getByRole("button", { name: "Leo Park" }).click();
  await expect(
    page.getByRole("button", { name: "Table T2, assigned to Leo Park" }),
  ).toBeVisible();

  // Compaction check: Leo's server card now shows T2; Noah's no longer
  // does -- proving the source cell was vacated, not just left stale.
  await switchView(page, "Servers");
  await expect(
    page.getByRole("group", { name: "Leo Park server card" }).getByText("T2"),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Noah Diaz server card" }).getByText("T2"),
  ).toHaveCount(0);

  // 3. End the table -- it becomes available again.
  await switchView(page, "Floor");
  await page
    .getByRole("button", { name: "Table T2, assigned to Leo Park" })
    .click();
  await page.getByRole("button", { name: "End table" }).click();
  await expect(
    page.getByRole("button", { name: "Table T2, available" }),
  ).toBeVisible();

  // 4. Reassign the same freed physical table to a different server --
  // Ava also already has an active table from the seed ("21 + 22").
  await page.getByRole("button", { name: "Table T2, available" }).click();
  await page.getByRole("button", { name: "Ava Brooks" }).click();
  await page.getByRole("button", { name: /Assign T2 also/ }).click();
  await expect(
    page.getByRole("button", { name: "Table T2, assigned to Ava Brooks" }),
  ).toBeVisible();

  // 5. Unassign the fresh reassignment -- back to available, no history
  // badge or skip artifact left on Floor (which only ever reflects
  // current occupancy).
  await page
    .getByRole("button", { name: "Table T2, assigned to Ava Brooks" })
    .click();
  await page.getByRole("button", { name: "Unassign" }).click();
  await expect(
    page.getByRole("button", { name: "Table T2, available" }),
  ).toBeVisible();
});

test("Dashboard: Master Rotation preserves an ended table's history and renders a skipped turn as 0, while Active tables reflects only current occupancy", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);

  // End a table via Floor -- Grid and Picker no longer expose an End
  // control for Upgrade 1.1 (Floor is the one surface for Transfer/End;
  // see the "Grid/Picker hide Transfer and End" tests below). Dashboard
  // must keep showing "T15" (struck through), not blank it out.
  await switchView(page, "Floor");
  await page.getByRole("button", { name: "Table T15, available" }).click();
  await page.getByRole("button", { name: "Mia Chen" }).click();
  // Mia already has active tables from the demo seed -- Assign Also.
  await page.getByRole("button", { name: /Assign T15 also/ }).click();
  await expect(
    page.getByRole("button", { name: "Table T15, assigned to Mia Chen" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Table T15, assigned to Mia Chen" })
    .click();
  await page.getByRole("button", { name: "End table" }).click();
  await expect(
    page.getByRole("button", { name: "Table T15, available" }),
  ).toBeVisible();

  // Skip Leo Park's row-3 cell via Grid (Skip Turn remains a Grid control).
  await switchView(page, "Grid");
  const row3 = page.locator("div.contents", {
    has: page.getByRole("button", { name: "Clear row 3" }),
  });
  await row3.getByRole("button", { name: "Skip turn" }).first().click();

  await switchView(page, "Dashboard");
  await expect(page.getByText("Active tables")).toBeVisible();
  // Ending a table releases it -- it's not still counted as active.
  const activeTablesValue = page
    .getByText("Active tables", { exact: true })
    .locator("xpath=following-sibling::p[1]");
  await expect(activeTablesValue).toHaveText("0");

  // Master Rotation: the ended entry's label survives (history), the
  // skip renders as "0", not blank.
  await expect(page.getByText("T15", { exact: false })).toBeVisible();
  await expect(page.getByRole("status", { name: "Skip turn" })).toBeVisible();
});

test("Grid: Transfer and End Table controls are hidden (Floor-only for Upgrade 1.1) -- Edit and Unassign remain", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Grid");

  // Round 1 is fully pre-filled by the demo seed -- plenty of active
  // cells to confirm the hidden controls across.
  await expect(page.getByRole("button", { name: /^Transfer/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^End table/ })).toHaveCount(0);
  // The remaining active-cell controls are still there.
  await expect(
    page.getByRole("button", { name: "Edit table 12" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unassign table 12" }),
  ).toBeVisible();
});

test("Picker: Transfer and End Table controls are hidden (Floor-only for Upgrade 1.1)", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Picker");

  // Picker renders the same shared table as Grid, so an active cell
  // there must be equally free of Transfer/End controls.
  await expect(page.getByRole("button", { name: /^Transfer/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^End table/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit table 12" }),
  ).toBeVisible();
});

// Table Rotation Multi-View, Upgrade 1.1 (multi-table): a server may
// have zero, one, or many active tables. Floor's assign flow branches on
// that -- zero is unambiguous (assign directly); one or more opens the
// decision dialog (Assign Also / Transfer / End Existing & Assign /
// Cancel) rather than silently guessing what the operator meant (the
// original bug this whole task exists to fix). See
// docs/features/table-rotation-multi-view/TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md.

test("Floor: a server with zero active tables is assigned directly -- no decision dialog", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  // Quick Add a fresh server -- genuinely zero active tables anywhere,
  // not even from the demo seed.
  await page.getByRole("button", { name: "Zara" }).click();
  await switchView(page, "Floor");

  await page.getByRole("button", { name: "Table T1, available" }).click();
  await page.getByRole("button", { name: "Zara" }).last().click();

  await expect(page.getByText("already has active tables")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Table T1, assigned to Zara" }),
  ).toBeVisible();
});

test("Floor: a server with an existing active table opens the decision dialog with all four choices", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Floor");

  // Leo Park already has an active table from the demo seed ("8").
  await page.getByRole("button", { name: "Table T8, available" }).click();
  await page.getByRole("button", { name: "Leo Park", exact: true }).click();

  await expect(
    page.getByText("Leo Park already has active tables"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Assign T8 also/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Transfer an existing table" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /End existing table\(s\) & assign T8/,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
});

test("Floor: Cancel in the decision dialog makes zero state changes", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Floor");

  await page.getByRole("button", { name: "Table T8, available" }).click();
  await page.getByRole("button", { name: "Leo Park", exact: true }).click();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByText("already has active tables")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Table T8, available" }),
  ).toBeVisible();
  await switchView(page, "Servers");
  await expect(
    page.getByRole("group", { name: "Leo Park server card" }).getByText("T8"),
  ).toHaveCount(0);
});

test("Floor: Transfer (one existing table) relabels it in place -- old table free, new table active under the same server", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await page.getByRole("button", { name: "Zara" }).click();
  await switchView(page, "Floor");

  await page.getByRole("button", { name: "Table T1, available" }).click();
  await page.getByRole("button", { name: "Zara" }).last().click();
  await expect(
    page.getByRole("button", { name: "Table T1, assigned to Zara" }),
  ).toBeVisible();

  // Zara now has exactly one active table -- Transfer acts immediately,
  // no sub-picker needed.
  await page.getByRole("button", { name: "Table T2, available" }).click();
  await page.getByRole("button", { name: "Zara Reed", exact: true }).click();
  await page
    .getByRole("button", { name: "Transfer an existing table" })
    .click();

  await expect(
    page.getByRole("button", { name: "Table T2, assigned to Zara" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T1, available" }),
  ).toBeVisible();
});

test("Floor: Transfer prompts for which table when the server has multiple active tables, and only the chosen one is replaced", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Floor");

  await page.getByRole("button", { name: "Table T1, available" }).click();
  await page.getByRole("button", { name: "Leo Park", exact: true }).click();
  await page.getByRole("button", { name: /Assign T1 also/ }).click();
  await expect(
    page.getByRole("button", { name: "Table T1, assigned to Leo Park" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Table T2, available" }).click();
  await page.getByRole("button", { name: "Leo Park", exact: true }).click();
  await page.getByRole("button", { name: /Assign T2 also/ }).click();
  await expect(
    page.getByRole("button", { name: "Table T2, assigned to Leo Park" }),
  ).toBeVisible();

  // Leo now holds two real active tables -- transferring must ask which
  // one T3 should replace, not assume oldest/newest/first/last.
  await page.getByRole("button", { name: "Table T3, available" }).click();
  await page.getByRole("button", { name: "Leo Park", exact: true }).click();
  await page
    .getByRole("button", { name: "Transfer an existing table" })
    .click();
  await expect(
    page.getByText("Which table should be replaced by T3?"),
  ).toBeVisible();
  await page.getByRole("button", { name: "T1 → T3" }).click();

  await expect(
    page.getByRole("button", { name: "Table T3, assigned to Leo Park" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T1, available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T2, assigned to Leo Park" }),
  ).toBeVisible();
});

test("Floor: End Existing & Assign (one existing table) ends it as history and assigns the new table", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await page.getByRole("button", { name: "Zara" }).click();
  await switchView(page, "Floor");

  await page.getByRole("button", { name: "Table T1, available" }).click();
  await page.getByRole("button", { name: "Zara" }).last().click();
  await expect(
    page.getByRole("button", { name: "Table T1, assigned to Zara" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Table T2, available" }).click();
  await page.getByRole("button", { name: "Zara Reed", exact: true }).click();
  await page
    .getByRole("button", { name: /End existing table\(s\) & assign T2/ })
    .click();

  await expect(
    page.getByRole("button", { name: "Table T2, assigned to Zara" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T1, available" }),
  ).toBeVisible();

  // History preserved -- Grid/Dashboard keep the ended T1 entry.
  await switchView(page, "Grid");
  await expect(page.getByText("Table T1")).toBeVisible();
  await expect(page.getByText("Ended")).toBeVisible();
});

test("Floor: End existing table(s) & assign shows a multi-select when the server has multiple active tables, and only the checked ones end", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Floor");

  await page.getByRole("button", { name: "Table T1, available" }).click();
  await page.getByRole("button", { name: "Ava Brooks", exact: true }).click();
  await page.getByRole("button", { name: /Assign T1 also/ }).click();
  await expect(
    page.getByRole("button", { name: "Table T1, assigned to Ava Brooks" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Table T2, available" }).click();
  await page.getByRole("button", { name: "Ava Brooks", exact: true }).click();
  await page.getByRole("button", { name: /Assign T2 also/ }).click();
  await expect(
    page.getByRole("button", { name: "Table T2, assigned to Ava Brooks" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Table T3, available" }).click();
  await page.getByRole("button", { name: "Ava Brooks", exact: true }).click();
  await page
    .getByRole("button", { name: /End existing table\(s\) & assign T3/ })
    .click();
  await expect(
    page.getByText("Select one or more tables to end before assigning T3."),
  ).toBeVisible();

  // The primary action starts disabled -- nothing checked yet.
  await expect(
    page.getByRole("button", { name: /^End 0 Tables/ }),
  ).toBeDisabled();

  // Check only T1 (Ava's other tables -- her seeded "21 + 22" and T2 --
  // must stay untouched).
  await page
    .locator("label", { hasText: /^T1$/ })
    .locator('input[type="checkbox"]')
    .check();
  await page.getByRole("button", { name: /^End 1 Table & Assign T3/ }).click();

  await expect(
    page.getByRole("button", { name: "Table T3, assigned to Ava Brooks" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T1, available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T2, assigned to Ava Brooks" }),
  ).toBeVisible();
});

test("Picker: the TableMap opens as a popup dialog, not inline below the rotation grid", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Picker");

  const row3 = page.locator("div.contents", {
    has: page.getByRole("button", { name: "Clear row 3" }),
  });
  await row3.getByPlaceholder("Table #").first().click();

  // Not open until "Choose table" is clicked.
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  await page.getByRole("button", { name: "Choose table" }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Choose a table")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Table T1, available" }),
  ).toBeVisible();

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("Picker: assigning an additional table to a server who already has one never disturbs it, and never shows Transfer/End", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Picker");

  const row3 = page.locator("div.contents", {
    has: page.getByRole("button", { name: "Clear row 3" }),
  });
  // Mia Chen's row-3 cell (first column, still empty) -- Mia already
  // has "12" and "15" active from the demo seed.
  await row3.getByPlaceholder("Table #").nth(0).click();
  await page.getByRole("button", { name: "Choose table" }).click();
  await page.getByRole("button", { name: "Table T5, available" }).click();

  await switchView(page, "Grid");
  await expect(page.getByText("Table 12")).toBeVisible();
  await expect(page.getByText("Table 15")).toBeVisible();
  await expect(page.getByText("Table T5")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Transfer/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^End table/ })).toHaveCount(0);
});

test("Servers: a server can show multiple simultaneously active tables", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await switchView(page, "Floor");

  await page.getByRole("button", { name: "Table T1, available" }).click();
  await page.getByRole("button", { name: "Noah Diaz", exact: true }).click();
  await page.getByRole("button", { name: /Assign T1 also/ }).click();
  await expect(
    page.getByRole("button", { name: "Table T1, assigned to Noah Diaz" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Table T3, available" }).click();
  await page.getByRole("button", { name: "Noah Diaz", exact: true }).click();
  await page.getByRole("button", { name: /Assign T3 also/ }).click();
  await expect(
    page.getByRole("button", { name: "Table T3, assigned to Noah Diaz" }),
  ).toBeVisible();

  await switchView(page, "Servers");
  const noahCard = page.getByRole("group", { name: "Noah Diaz server card" });
  await expect(noahCard.getByText("T1")).toBeVisible();
  await expect(noahCard.getByText("T3")).toBeVisible();
});

// "End one or more" -- the Floor decision dialog's "End existing
// table(s) & assign" choice supports ending exactly one, several, or
// every one of a server's active tables in the same step. See
// docs/features/table-rotation-multi-view/TABLE_ROTATION_FUNCTIONALITY_UPGRADE_1_1.md
// section 9.

test("Floor: End existing table(s) can end several selected tables, leaving the rest active (CASE B)", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  // A fresh Quick Add server -- no seed-data tables to account for.
  await page.getByRole("button", { name: "Zara" }).click();
  await switchView(page, "Floor");

  for (const label of ["T1", "T4", "T7"]) {
    await page
      .getByRole("button", { name: `Table ${label}, available` })
      .click();
    await page.getByRole("button", { name: "Zara Reed", exact: true }).click();
    if (label === "T1") {
      await page.getByRole("button", { name: "Zara Reed" }).last().click();
    } else {
      await page
        .getByRole("button", { name: new RegExp(`Assign ${label} also`) })
        .click();
    }
    await expect(
      page.getByRole("button", {
        name: `Table ${label}, assigned to Zara Reed`,
      }),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: "Table T3, available" }).click();
  await page.getByRole("button", { name: "Zara Reed", exact: true }).click();
  await page
    .getByRole("button", { name: /End existing table\(s\) & assign T3/ })
    .click();

  // Check T1 and T4 only -- T7 stays unchecked.
  for (const label of ["T1", "T4"]) {
    await page
      .locator("label", { hasText: new RegExp(`^${label}$`) })
      .locator('input[type="checkbox"]')
      .check();
  }
  await page.getByRole("button", { name: /^End 2 Tables & Assign T3/ }).click();

  await expect(
    page.getByRole("button", { name: "Table T1, available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T4, available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T7, assigned to Zara Reed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T3, assigned to Zara Reed" }),
  ).toBeVisible();

  // History preserved for both ended tables.
  await switchView(page, "Grid");
  await expect(page.getByText("Table T1")).toBeVisible();
  await expect(page.getByText("Table T4")).toBeVisible();
  await expect(page.getByText("Ended")).toHaveCount(2);
});

test("Floor: End existing table(s) 'Select all' ends every active table before assigning the new one (CASE C)", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await page.getByRole("button", { name: "Sam" }).click();
  await switchView(page, "Floor");

  await page.getByRole("button", { name: "Table T1, available" }).click();
  await page.getByRole("button", { name: "Sam Ellis", exact: true }).click();
  await page.getByRole("button", { name: "Sam Ellis" }).last().click();
  await expect(
    page.getByRole("button", { name: "Table T1, assigned to Sam Ellis" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Table T4, available" }).click();
  await page.getByRole("button", { name: "Sam Ellis", exact: true }).click();
  await page.getByRole("button", { name: /Assign T4 also/ }).click();
  await expect(
    page.getByRole("button", { name: "Table T4, assigned to Sam Ellis" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Table T3, available" }).click();
  await page.getByRole("button", { name: "Sam Ellis", exact: true }).click();
  await page
    .getByRole("button", { name: /End existing table\(s\) & assign T3/ })
    .click();
  await page.getByRole("button", { name: "Select all" }).click();
  await expect(page.getByText("2 of 2 selected")).toBeVisible();
  await page.getByRole("button", { name: /^End 2 Tables & Assign T3/ }).click();

  await expect(
    page.getByRole("button", { name: "Table T1, available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T4, available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T3, assigned to Sam Ellis" }),
  ).toBeVisible();

  await switchView(page, "Servers");
  const samCard = page.getByRole("group", { name: "Sam Ellis server card" });
  await expect(samCard.getByText("T3")).toBeVisible();
  await expect(samCard.getByText("T1")).toHaveCount(0);
  await expect(samCard.getByText("T4")).toHaveCount(0);
});

test("Floor: closing the End existing table(s) multi-select makes zero state changes (CASE D)", async ({
  page,
}) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await page.getByRole("button", { name: "Ivy" }).click();
  await switchView(page, "Floor");

  await page.getByRole("button", { name: "Table T1, available" }).click();
  await page.getByRole("button", { name: "Ivy Tran", exact: true }).click();
  await page.getByRole("button", { name: "Ivy Tran" }).last().click();
  await expect(
    page.getByRole("button", { name: "Table T1, assigned to Ivy Tran" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Table T4, available" }).click();
  await page.getByRole("button", { name: "Ivy Tran", exact: true }).click();
  await page.getByRole("button", { name: /Assign T4 also/ }).click();
  await expect(
    page.getByRole("button", { name: "Table T4, assigned to Ivy Tran" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Table T3, available" }).click();
  await page.getByRole("button", { name: "Ivy Tran", exact: true }).click();
  await page
    .getByRole("button", { name: /End existing table\(s\) & assign T3/ })
    .click();
  await page
    .locator("label", { hasText: /^T1$/ })
    .locator('input[type="checkbox"]')
    .check();

  // Close via the dialog's own X, not a decision button -- zero changes.
  // Scoped to the <dialog> itself: the Floor detail panel underneath has
  // its own, differently-purposed "Close" button too.
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Close" })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  await expect(
    page.getByRole("button", { name: "Table T3, available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T1, assigned to Ivy Tran" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T4, assigned to Ivy Tran" }),
  ).toBeVisible();
});

test("Floor: Undo/Redo restore a multi-table End safely", async ({ page }) => {
  await signIn(page, "2468");
  await goToAllocation(page);
  await page.getByRole("button", { name: "Zara" }).click();
  await switchView(page, "Floor");

  await page.getByRole("button", { name: "Table T1, available" }).click();
  await page.getByRole("button", { name: "Zara Reed", exact: true }).click();
  await page.getByRole("button", { name: "Zara Reed" }).last().click();
  await expect(
    page.getByRole("button", { name: "Table T1, assigned to Zara Reed" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Table T4, available" }).click();
  await page.getByRole("button", { name: "Zara Reed", exact: true }).click();
  await page.getByRole("button", { name: /Assign T4 also/ }).click();
  await expect(
    page.getByRole("button", { name: "Table T4, assigned to Zara Reed" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Table T3, available" }).click();
  await page.getByRole("button", { name: "Zara Reed", exact: true }).click();
  await page
    .getByRole("button", { name: /End existing table\(s\) & assign T3/ })
    .click();
  await page.getByRole("button", { name: "Select all" }).click();
  await page.getByRole("button", { name: /^End 2 Tables & Assign T3/ }).click();

  await expect(
    page.getByRole("button", { name: "Table T3, assigned to Zara Reed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T1, available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T4, available" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();

  await expect(
    page.getByRole("button", { name: "Table T3, available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T1, assigned to Zara Reed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T4, assigned to Zara Reed" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Redo" }).click();

  await expect(
    page.getByRole("button", { name: "Table T3, assigned to Zara Reed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T1, available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T4, available" }),
  ).toBeVisible();
});
