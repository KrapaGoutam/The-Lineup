import { expect, type Locator, type Page } from "@playwright/test";

import type {
  Expectation,
  Origin,
  Role,
  Scenario,
  Step,
} from "../../../src/features/allocation/testing/cross-view-scenarios";
import { watchedTables } from "../../../src/features/allocation/testing/cross-view-scenarios";

/**
 * Drives the REAL Table Allocation UI (demo mode) for the shared cross-view
 * scenario matrix, one driver per origin, and asserts all five views against
 * one canonical expectation. Page objects only -- no scenario knowledge.
 */

// Demo cast. Mia, Leo and Ava each hold seed tables ("12", "15" / "8", "10" /
// "21 + 22"), which are free-text labels that are NOT on the floor map -- so
// every run also proves off-map seeds never disturb mapped tables.
export const NAMES: Record<Role, string> = {
  A: "Mia Chen",
  B: "Leo Park",
  C: "Ava Brooks",
};

const MAPPED = /^(T([1-9]|1[0-9])|B[1-8])$/;
export const isMapped = (label: string) => MAPPED.test(label);

export type ViewName = "Grid" | "Floor" | "Picker" | "Servers" | "Dashboard";

export async function openAllocation(page: Page) {
  await page.goto("/");
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill("2468");
  const account = page
    .getByRole("button", { name: "Account and quick settings" })
    .first();
  await expect(account).toBeVisible({ timeout: 60_000 });
  const direct = page.getByRole("button", {
    name: /^Table Allocation$|^Allocation$/,
  });
  if (await direct.isVisible()) {
    await direct.click();
  } else {
    const more = page.getByRole("button", { name: "More" });
    if ((await more.getAttribute("aria-expanded")) !== "true") {
      await more.click();
    }
    await page
      .getByRole("button", { name: /^Table Allocation$|^Allocation$/ })
      .click();
  }
  await switchView(page, "Grid");
}

export async function switchView(page: Page, name: ViewName) {
  const tab = page.getByRole("tab", { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

const dialog = (page: Page) => page.locator("dialog[open]");
const tileRe = (label: string) =>
  new RegExp(`^Table ${escapeRe(label)}, `, "u");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function dashboardActiveTables(page: Page): Promise<number> {
  await switchView(page, "Dashboard");
  const text = await page
    .getByText("Active tables", { exact: true })
    .locator("xpath=following-sibling::p[1]")
    .innerText();
  return Number(text.trim());
}

export async function baselineActiveTables(page: Page) {
  const n = await dashboardActiveTables(page);
  await switchView(page, "Grid");
  return n;
}

/* ------------------------------------------------------------------ */
/* Drivers                                                              */
/* ------------------------------------------------------------------ */

/** First EMPTY Grid/Picker cell input of a server (= earliest empty round). */
const firstEmptyInput = (page: Page, role: Role) =>
  page.locator(`input[data-cell^="${NAMES[role]}|"]`).first();

async function pickServerAndFinish(page: Page, label: string, role: Role) {
  // Floor / Servers: a server that already holds tables gets the "Assign X
  // also" decision for a FREE table.
  const also = page.getByRole("button", {
    name: new RegExp(`^\\+ Assign ${escapeRe(label)} also$`),
  });
  if (await also.isVisible({ timeout: 1000 }).catch(() => false)) {
    await also.click();
  }
  void role;
}

async function chooseInConflictDialog(
  page: Page,
  choose: "transfer" | "end-assign" | "cancel",
) {
  const d = dialog(page);
  await expect(d.getByText("What do you want to do?")).toBeVisible();
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

/** Start an assignment of `label` for `role` from `origin`, up to the point the
 *  shared resolver (or a plain assign) takes over. */
async function requestAssign(
  page: Page,
  origin: Origin,
  role: Role,
  label: string,
) {
  const name = NAMES[role];
  if (origin === "grid") {
    await switchView(page, "Grid");
    const input = firstEmptyInput(page, role);
    await input.fill(label);
    await input.press("Enter");
    return;
  }
  if (origin === "picker") {
    await switchView(page, "Picker");
    await firstEmptyInput(page, role).click();
    await expect(
      dialog(page).getByText(`Choose a table for ${name}`),
    ).toBeVisible();
    await dialog(page)
      .getByRole("button", { name: tileRe(label) })
      .click();
    return;
  }
  if (origin === "servers") {
    await switchView(page, "Servers");
    await page
      .getByRole("group", { name: `${name} server card` })
      .getByRole("button", { name: "Table", exact: true })
      .click();
    await dialog(page)
      .getByRole("button", { name: tileRe(label) })
      .click();
    return;
  }
  // floor
  await switchView(page, "Floor");
  const tile = page.getByRole("button", { name: tileRe(label) });
  await tile.click();
  const occupied = (await tile.getAttribute("aria-label"))?.includes(
    "assigned to",
  );
  if (occupied) {
    await page
      .getByRole("button", { name: "Assign to another server…" })
      .click();
    await page.getByRole("button", { name, exact: true }).click();
  } else {
    await dialog(page).getByRole("button", { name, exact: true }).click();
  }
}

export async function runStep(page: Page, step: Step) {
  switch (step.do) {
    case "assign": {
      await requestAssign(page, step.via, step.who, step.table);
      if (step.via === "floor" || step.via === "servers") {
        await pickServerAndFinish(page, step.table, step.who);
      }
      await expect(dialog(page)).toHaveCount(0);
      return;
    }
    case "same-server": {
      await requestAssign(page, step.via, step.who, step.table);
      await expect(
        page.getByText(`is already assigned to ${NAMES[step.who]}.`),
      ).toBeVisible();
      await expect(dialog(page)).toHaveCount(0);
      return;
    }
    case "conflict": {
      await requestAssign(page, step.via, step.who, step.table);
      await chooseInConflictDialog(page, step.choose);
      return;
    }
    case "end":
    case "transfer":
    case "unassign": {
      const label = step.table;
      if (step.via === "grid") {
        await switchView(page, "Grid");
        await page
          .getByRole("button", { name: `Unassign table ${label}` })
          .click();
        return;
      }
      const verb =
        step.do === "end"
          ? "End table"
          : step.do === "transfer"
            ? "Transfer"
            : "Unassign";
      if (step.via === "floor") {
        await switchView(page, "Floor");
        await page.getByRole("button", { name: tileRe(label) }).click();
        await page.getByRole("button", { name: verb, exact: true }).click();
        if (step.do === "transfer") {
          await page
            .getByRole("button", { name: NAMES[step.to], exact: true })
            .click();
        }
      } else {
        await switchView(page, "Servers");
        await page
          .getByRole("button", {
            name: new RegExp(
              `^Table ${escapeRe(label)}, assigned to .*open table actions$`,
            ),
          })
          .click();
        await dialog(page)
          .getByRole("button", { name: verb, exact: true })
          .click();
        if (step.do === "transfer") {
          await dialog(page)
            .getByRole("button", { name: NAMES[step.to], exact: true })
            .click();
        }
      }
      return;
    }
    case "skip": {
      if (step.via === "grid") {
        await switchView(page, "Grid");
        await firstEmptyInput(page, step.who)
          .locator("xpath=ancestor::form")
          .getByRole("button", { name: "Skip turn" })
          .click();
      } else {
        await switchView(page, "Picker");
        await firstEmptyInput(page, step.who).click();
        await dialog(page)
          .getByRole("button", { name: /^Skip turn/ })
          .click();
      }
      return;
    }
    case "undo":
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      return;
    case "redo":
      await page.getByRole("button", { name: "Redo", exact: true }).click();
      return;
  }
}

/* ------------------------------------------------------------------ */
/* assertBoardAcrossViews                                                */
/* ------------------------------------------------------------------ */

function tileExpectation(
  scope: Locator | Page,
  label: string,
  owner: Role | null,
) {
  if (isMapped(label)) {
    return owner
      ? expect(
          scope.getByRole("button", {
            name: new RegExp(
              `^Table ${escapeRe(label)}, assigned to ${escapeRe(NAMES[owner])}(,|$)`,
            ),
          }),
        ).toBeVisible()
      : expect(
          scope.getByRole("button", {
            name: `Table ${label}, available`,
          }),
        ).toBeVisible();
  }
  // Off-map (free-text) table: an "Off-map" row when held, nothing when not.
  return owner
    ? expect(
        scope.getByRole("button", {
          name: new RegExp(
            `^Table ${escapeRe(label)}, assigned to ${escapeRe(NAMES[owner])}.*, off-map$`,
          ),
        }),
      ).toBeVisible()
    : expect(
        scope.getByRole("button", {
          name: new RegExp(`^Table ${escapeRe(label)}, `),
        }),
      ).toHaveCount(0);
}

/**
 * Grid, Floor, Picker, Servers and Dashboard all asserted from the same
 * canonical expectation (owner per physical table, active/ended per server,
 * active-table count, ended history).
 */
export async function assertBoardAcrossViews(
  page: Page,
  scenario: Scenario,
  expectation: Expectation,
  baseline: number,
) {
  const watched = watchedTables(scenario);
  const roles: Role[] = ["A", "B", "C"];

  // ---- Floor -----------------------------------------------------------------
  await switchView(page, "Floor");
  for (const label of watched) {
    await tileExpectation(page, label, expectation.owners[label] ?? null);
  }

  // ---- Picker (open the chooser from an empty cell; a fresh column) --------------
  await switchView(page, "Picker");
  const pickerCell = page.locator('input[data-cell^="Noah Diaz|"]').first();
  await pickerCell.click();
  const chooser = dialog(page);
  await expect(chooser.getByText("Choose a table for Noah Diaz")).toBeVisible();
  for (const label of watched) {
    await tileExpectation(chooser, label, expectation.owners[label] ?? null);
  }
  await chooser.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(page)).toHaveCount(0);

  // ---- Servers ----------------------------------------------------------------------
  await switchView(page, "Servers");
  for (const role of roles) {
    const card = page.getByRole("group", {
      name: `${NAMES[role]} server card`,
    });
    const active = expectation.active[role] ?? [];
    for (const label of watched) {
      await expect(
        card.getByRole("button", {
          name: new RegExp(`^Table ${escapeRe(label)}, assigned to `),
        }),
      ).toHaveCount(active.includes(label) ? 1 : 0);
    }
    const ended = expectation.ended[role] ?? [];
    const history = page.getByRole("group", {
      name: `${NAMES[role]} session history`,
    });
    if (ended.length === 0) {
      await expect(history).toHaveCount(0);
    } else {
      await expect(history.locator("li", { hasText: "Ended" })).toHaveCount(
        ended.length,
      );
      for (const label of ended) {
        await expect(
          history.locator("li", { hasText: "Ended" }).getByText(label, {
            exact: true,
          }),
        ).toHaveCount(ended.filter((l) => l === label).length);
      }
    }
  }

  // ---- Dashboard -----------------------------------------------------------------------
  const total = await dashboardActiveTables(page);
  expect(total).toBe(baseline + expectation.activeDelta);
  const allEnded = roles.flatMap((role) => expectation.ended[role] ?? []);
  for (const label of new Set(allEnded)) {
    await expect(
      page.locator(".line-through", {
        hasText: new RegExp(`^${escapeRe(label)}$`),
      }),
    ).toHaveCount(allEnded.filter((l) => l === label).length);
  }

  // ---- Grid -------------------------------------------------------------------------------
  await switchView(page, "Grid");
  for (const label of watched) {
    const owner = expectation.owners[label] ?? null;
    await expect(
      page.getByRole("button", {
        name: new RegExp(
          `^Edit table (?:[^+]+ \\+ )*${escapeRe(label)}(?: \\+ [^+]+)*$`,
        ),
      }),
    ).toHaveCount(owner ? 1 : 0);
  }
  for (const label of new Set(allEnded)) {
    await expect(
      page.getByRole("button", { name: `Unassign ended table ${label}` }),
    ).toHaveCount(allEnded.filter((l) => l === label).length);
  }
}

export async function runScenario(page: Page, scenario: Scenario) {
  await openAllocation(page);
  const baseline = await baselineActiveTables(page);
  for (const step of scenario.steps) {
    await runStep(page, step);
    if (step.then) {
      await assertBoardAcrossViews(page, scenario, step.then, baseline);
    }
  }
  await assertBoardAcrossViews(page, scenario, scenario.expect, baseline);
}
