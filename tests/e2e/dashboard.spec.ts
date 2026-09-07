import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, passcode: string) {
  await page.goto("/");
  await signInOnCurrentPage(page, passcode);
}

// For signing back in after "Sign out" within the same test, without a
// page.goto() -- a full navigation would reload the page and wipe every
// bit of in-memory demo state (team roster, accounts, board, etc.), not
// just end the session, which isn't what "sign out and back in" means.
async function signInOnCurrentPage(page: Page, passcode: string) {
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await page.getByRole("button", { name: "Open workspace" }).click();
}

test("manager can bulk-import shifts via CSV", async ({ page }) => {
  await signIn(page, "2468");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await page.setInputFiles('input[type="file"]', {
    name: "shifts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "employee_name,shift_kind,from_date,to_date,custom_start,custom_end,note\nMia Chen,morning,2026-09-20,,,,",
    ),
  });
  await expect(page.getByText("Valid")).toBeVisible();
  await page.getByRole("button", { name: /Create 1 draft shift/ }).click();
  await expect(page.getByText("Import shifts from CSV")).toHaveCount(0);
});

test("CSV import blocks commit on an unresolved row error", async ({
  page,
}) => {
  await signIn(page, "2468");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await page.setInputFiles('input[type="file"]', {
    name: "shifts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "employee_name,shift_kind,from_date,to_date,custom_start,custom_end,note\nGhost Person,morning,2026-09-20,,,,",
    ),
  });
  await expect(page.getByText(/Unknown employee/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Create.*draft shift/ }),
  ).toBeDisabled();
});

test("manager can use all three operational modules", async ({ page }) => {
  await signIn(page, "2468");

  await expect(
    page.getByRole("heading", { name: "Weekly & monthly roster" }),
  ).toBeVisible();
  await expect(page.getByText("Manager access")).toBeVisible();
  await expect(page.getByRole("button", { name: /Publish/ })).toBeVisible();

  await page
    .getByRole("button", { name: "Table allocation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Table allocation rotation" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear board" })).toBeVisible();

  await page.getByRole("button", { name: "Tip split", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tip split" })).toBeVisible();
  await expect(page.getByText("$17.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("$5.00", { exact: true }).first()).toBeVisible();
});

test("server sees published schedule, can edit any column (Feature 011), and sees own tip estimate", async ({
  page,
}) => {
  await signIn(page, "1357");

  await expect(page.getByText("Server access")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add shift" })).toHaveCount(0);

  await page
    .getByRole("button", { name: "Table allocation", exact: true })
    .click();
  // Manage-only actions (clear board, reorder) stay manager/owner-only.
  await expect(page.getByRole("button", { name: "Clear board" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /^Move .* up$/ })).toHaveCount(
    0,
  );
  // But Feature 011 opens plain column writes to everyone: a server sees
  // more than just their own enabled input — one input, no second field
  // under it, for every column regardless of whose it is.
  await expect(
    page.locator('input[aria-label="Table number or combined tables"]:enabled'),
  ).not.toHaveCount(0);
  await expect(
    page.getByLabel("Reason for editing another server's column"),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Tip split", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My tip estimate" }),
  ).toBeVisible();
  await expect(page.getByText("$5.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finalize day" })).toHaveCount(
    0,
  );
});

test("unregistered user can self-register and lands in the app", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Not registered? Create an account" })
    .click();
  await page.getByLabel("Your name").fill("New Server");
  await page.getByLabel("Phone or email").fill("server@example.com");
  await page.getByLabel("Choose a passcode").fill("4321");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Server access")).toBeVisible();
});

test("self-registers with no phone or email — only name and passcode are required", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Not registered? Create an account" })
    .click();
  await page.getByLabel("Your name").fill("No Contact Server");
  await page.getByLabel("Choose a passcode").fill("5150");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Server access")).toBeVisible();
});

test("registering with a passcode already in use shows an error", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Not registered? Create an account" })
    .click();
  await page.getByLabel("Your name").fill("Duplicate Server");
  await page.getByLabel("Phone or email").fill("dup@example.com");
  await page.getByLabel("Choose a passcode").fill("2468");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("That passcode is already in use")).toBeVisible();
});

test("manager can promote a staff member to Assistant Manager, and back", async ({
  page,
}) => {
  await signIn(page, "2468");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  await page
    .getByRole("button", { name: "Set Ava Brooks to Assistant Manager" })
    .click();
  await expect(
    page.getByText("Assistant Manager", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Set Ava Brooks to Staff" }).click();
  await expect(
    page.getByText("Assistant Manager", { exact: true }),
  ).toHaveCount(0);
});

test("a manager is never offered the ability to grant Manager or Owner", async ({
  page,
}) => {
  await signIn(page, "2468");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Set .* to Manager$/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Set .* to Owner$/ }),
  ).toHaveCount(0);
});

test("an owner can promote someone to Manager, after which a manager can no longer change that person's designation", async ({
  page,
}) => {
  await signIn(page, "9999");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByRole("button", { name: "Set Zara Reed to Manager" }).click();
  await expect(
    page.getByText("Manager", { exact: true }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await signInOnCurrentPage(page, "2468");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Set Zara Reed to/ }),
  ).toHaveCount(0);
});

test("promoting someone to Assistant Manager gives them full manager-level access once they sign back in", async ({
  page,
}) => {
  await signIn(page, "2468");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page
    .getByRole("button", { name: "Set Mia Chen to Assistant Manager" })
    .click();

  await page.getByRole("button", { name: "Sign out" }).click();
  await signInOnCurrentPage(page, "1357");
  await expect(page.getByText("Server access")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add shift" })).toBeVisible();
  await page
    .getByRole("button", { name: "Table allocation", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Clear board" })).toBeVisible();
});

test("server never sees the Team tab", async ({ page }) => {
  await signIn(page, "1357");
  await expect(
    page.getByRole("button", { name: "Team", exact: true }),
  ).toHaveCount(0);
});

test("an unlinked server can open Attendance without seeing anyone else's data", async ({
  page,
}) => {
  await signIn(page, "1357");
  await page.getByRole("button", { name: "Attendance", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Attendance Report" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your account isn't linked to the attendance system yet."),
  ).toBeVisible();
  await expect(page.getByText("People", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Anil (Host)")).toHaveCount(0);
});

test("a manager can link attendance and the server then sees only that record", async ({
  page,
}) => {
  await signIn(page, "2468");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page
    .getByRole("button", { name: "Link Mia Chen's attendance record" })
    .click();
  await page
    .getByLabel("Attendance-system record")
    .selectOption({ label: "Anil (Server)" });
  await page.getByRole("button", { name: "Save link" }).click();
  await expect(page.getByText("Their attendance is now linked.")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Sign out" }).click();
  await signInOnCurrentPage(page, "1357");
  await page.getByRole("button", { name: "Attendance", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Anil (Server)" }),
  ).toBeVisible();
  await expect(page.getByText("People", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Anil (Host)" })).toHaveCount(
    0,
  );
  // Several tiles/rows can legitimately show the same "8.5h" figure (the
  // day/week/month/selected-period dashboard tiles and the row total all
  // derive from the same single demo attendance row) -- assert the actual
  // table cell specifically, not just that the text exists anywhere.
  await expect(
    page.getByRole("cell", { name: "8.5h", exact: true }),
  ).toBeVisible();
});

test("theme toggle switches and persists the theme across reload", async ({
  page,
}) => {
  await signIn(page, "2468");
  const html = page.locator("html");
  const initialTheme = await html.getAttribute("data-theme");
  expect(initialTheme === "light" || initialTheme === "dark").toBe(true);

  const otherTheme = initialTheme === "light" ? "dark" : "light";
  const toggleName =
    initialTheme === "light" ? "Switch to dark theme" : "Switch to light theme";
  await page.getByRole("button", { name: toggleName }).click();
  await expect(html).toHaveAttribute("data-theme", otherTheme);

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", otherTheme);
});

test("theme toggle is reachable from the login screen before signing in", async ({
  page,
}) => {
  await page.goto("/");
  const html = page.locator("html");
  const initialTheme = await html.getAttribute("data-theme");
  const toggleName =
    initialTheme === "light" ? "Switch to dark theme" : "Switch to light theme";
  await page.getByRole("button", { name: toggleName }).click();
  await expect(html).not.toHaveAttribute("data-theme", initialTheme ?? "");
});

test("numeric keypad completes a full sign-in via taps alone at phone width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const digit of ["2", "4", "6", "8"]) {
    await page.getByRole("button", { name: `Digit ${digit}` }).click();
  }
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Weekly & monthly roster" }),
  ).toBeVisible();
});

test("numeric keypad is hidden at desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Digit 1" })).toHaveCount(0);
});

test("an unrostered employee can be added to the live allocation board", async ({
  page,
}) => {
  await signIn(page, "2468");
  await page
    .getByRole("button", { name: "Table allocation", exact: true })
    .click();
  await expect(page.getByText("Floor team changed?")).toBeVisible();
  await page.getByRole("button", { name: "Ivy" }).click();
  await expect(page.getByText("Ivy Tran")).toBeVisible();
});

test("manager can add a row on demand, and undo removes it; a server never sees the control", async ({
  page,
}) => {
  await signIn(page, "2468");
  await page
    .getByRole("button", { name: "Table allocation", exact: true })
    .click();
  const rowsBadge = page.getByText(/^\d+ rows$/);
  const before = Number((await rowsBadge.textContent())?.match(/\d+/)?.[0]);

  await page.getByRole("button", { name: "Add row" }).click();
  await expect(rowsBadge).toHaveText(`${before + 1} rows`);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(rowsBadge).toHaveText(`${before} rows`);
});

test("a server never sees the manual add-row control on the allocation board", async ({
  page,
}) => {
  await signIn(page, "1357");
  await page
    .getByRole("button", { name: "Table allocation", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Add row" })).toHaveCount(0);
});

test("manager can reorder columns; boundaries are no-ops", async ({ page }) => {
  await signIn(page, "2468");
  await page
    .getByRole("button", { name: "Table allocation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Move Mia Chen up" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Move Leo Park up" }).click();
  await expect(
    page.getByRole("button", { name: "Move Leo Park up" }),
  ).toBeDisabled();
});

test("editing another server's column succeeds without a reason, and is still attributed", async ({
  page,
}) => {
  await signIn(page, "2468");
  await page
    .getByRole("button", { name: "Table allocation", exact: true })
    .click();
  await page
    .locator('input[aria-label="Table number or combined tables"]:enabled')
    .first()
    .fill("99");
  // No reason field exists to fill in anymore — the edit still succeeds.
  await page.getByRole("button", { name: "Add table" }).first().click();
  await expect(page.getByText("Table 99")).toBeVisible();
  await expect(page.getByText(/edited .* column/)).toBeVisible();
});

test("no reason field renders anywhere on the allocation board", async ({
  page,
}) => {
  await signIn(page, "2468");
  await page
    .getByRole("button", { name: "Table allocation", exact: true })
    .click();
  await expect(
    page.getByLabel("Reason for editing another server's column"),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder(/[Rr]eason/)).toHaveCount(0);
});

test("board locks once tips are finalized, and a manager can reopen it", async ({
  page,
}) => {
  await signIn(page, "2468");
  await page.getByRole("button", { name: "Tip split", exact: true }).click();
  await page.getByRole("button", { name: "Finalize day" }).click();
  await page
    .getByRole("button", { name: "Table allocation", exact: true })
    .click();
  await expect(page.getByText(/board is locked for everyone/)).toBeVisible();

  await page
    .getByRole("button", { name: "Reopen tips for corrections" })
    .click();
  await page
    .getByLabel("Reason for reopening tips")
    .fill("Wrong table for Noah");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/board is locked for everyone/)).toHaveCount(0);
});
