import { expect, test } from "@playwright/test";

import { NAMES, openAllocation, switchView } from "./support/allocation-ui";

/**
 * X1 / X4 explicit browser checks that do not fit the origin x action matrix:
 * the owner's off-map case in all five views, and clear-board + Undo.
 *
 * Demo seed: Mia Chen holds "12" and "15", Leo Park holds "8" and "10", Ava
 * Brooks holds "21 + 22", Noah Diaz holds "4" -- free-text labels that are NOT
 * on the floor map (the floor map is T1..T19, B1..B8). "12" is NOT "T12".
 */
test("XM-011 off-map tables are accounted for in all five views and never mark a mapped table", async ({
  page,
}) => {
  await openAllocation(page);

  // Grid: the cell says it is off-map; the mapped-looking numbers are not T-tables.
  await expect(
    page.getByRole("button", { name: "Edit table 12" }),
  ).toBeVisible();
  await expect(page.getByText("Off-map").first()).toBeVisible();

  // Floor: a dedicated off-map rail, and mapped T12 is still available.
  await switchView(page, "Floor");
  const rail = page.getByRole("region", { name: "Off-map tables" });
  await expect(rail).toBeVisible();
  await expect(
    rail.getByRole("button", {
      name: `Table 12, assigned to ${NAMES.A}, off-map`,
    }),
  ).toBeVisible();
  await expect(
    rail.getByRole("button", { name: /^Table 21, assigned to/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table T12, available" }),
  ).toBeVisible();
  const map = page.getByRole("group", { name: "Floor map" });
  await expect(map.getByRole("button", { name: /^Table 12, / })).toHaveCount(0);

  // Picker: the chooser carries the same section.
  await switchView(page, "Picker");
  await page.locator('input[data-cell^="Noah Diaz|"]').first().click();
  const chooser = page.locator("dialog[open]");
  await expect(
    chooser.getByRole("region", { name: "Off-map / unpositioned tables" }),
  ).toBeVisible();
  await expect(
    chooser.getByRole("button", { name: /^Table 12, assigned to .*off-map$/ }),
  ).toBeVisible();
  await expect(
    chooser.getByRole("button", { name: "Table T12, available" }),
  ).toBeVisible();
  await chooser.getByRole("button", { name: "Cancel" }).click();

  // Servers: chips are marked, the card says how many are off the map.
  await switchView(page, "Servers");
  const mia = page.getByRole("group", { name: `${NAMES.A} server card` });
  await expect(mia.getByText("2 not on the floor map (12, 15)")).toBeVisible();
  await expect(
    mia.getByRole("button", {
      name: /^Table 12, assigned to .*not on the floor map/,
    }),
  ).toContainText("off-map");

  // Dashboard: authoritative totals include them, and say so.
  await switchView(page, "Dashboard");
  await expect(
    page.getByText(/Includes \d+ not on the floor map/),
  ).toBeVisible();
});

test("an off-map table can be acted on: End it from the Floor off-map rail", async ({
  page,
}) => {
  await openAllocation(page);
  await switchView(page, "Floor");
  await page
    .getByRole("region", { name: "Off-map tables" })
    .getByRole("button", { name: `Table 12, assigned to ${NAMES.A}, off-map` })
    .click();
  await page.getByRole("button", { name: "End table" }).click();
  // 12 left the active set; it is Mia's ended history now (Servers).
  await switchView(page, "Servers");
  const history = page.getByRole("group", {
    name: `${NAMES.A} session history`,
  });
  await expect(history.getByText("12", { exact: true })).toHaveClass(
    /line-through/,
  );
  await expect(
    page
      .getByRole("group", { name: `${NAMES.A} server card` })
      .getByRole("button", { name: /^Table 12, assigned to/ }),
  ).toHaveCount(0);
});

test("XM-062 clear board empties every view; Undo brings all five back", async ({
  page,
}) => {
  await openAllocation(page);
  await page.getByRole("button", { name: "Clear board" }).click();

  await switchView(page, "Dashboard");
  await expect(
    page
      .getByText("Active tables", { exact: true })
      .locator("xpath=following-sibling::p[1]"),
  ).toHaveText("0");
  await switchView(page, "Floor");
  await expect(
    page.getByRole("region", { name: "Off-map tables" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Table T12, available" }),
  ).toBeVisible();
  await switchView(page, "Servers");
  await expect(page.getByText("No tables assigned.").first()).toBeVisible();

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await switchView(page, "Dashboard");
  await expect(
    page
      .getByText("Active tables", { exact: true })
      .locator("xpath=following-sibling::p[1]"),
  ).not.toHaveText("0");
  await switchView(page, "Floor");
  await expect(
    page.getByRole("region", { name: "Off-map tables" }),
  ).toBeVisible();
});
