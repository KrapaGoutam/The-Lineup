import { expect, test, type Page } from "@playwright/test";

// MOCKED BROWSER TESTS: these run against the deterministic demo passcodes and
// the in-memory demo staff source. They do not exercise the hosted database or
// the real assignment RPC.

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

async function openSettings(page: Page) {
  await expect(accountButton(page)).toBeVisible();
  const desktopButton = page.getByRole("button", {
    name: "Settings",
    exact: true,
  });
  if (await desktopButton.isVisible()) {
    await desktopButton.click();
    return;
  }
  const moreButton = page.getByRole("button", { name: "More" });
  if ((await moreButton.getAttribute("aria-expanded")) !== "true") {
    await moreButton.click();
  }
  await page.getByRole("button", { name: /^Settings/ }).click();
}

async function openLocations(page: Page) {
  await signIn(page, "2468");
  await openSettings(page);
  await page.locator("#settings-locations").click();
  await expect(
    page.getByRole("heading", { name: "Locations", exact: true }),
  ).toBeVisible();
}

async function openStaffTab(page: Page, branch: string) {
  await page.getByRole("button", { name: `Manage ${branch}` }).click();
  await page.getByRole("button", { name: "Staff", exact: true }).click();
  await expect(page.getByTestId("location-staff-management")).toBeVisible();
}

test.describe("Staff Assignment Management (V2-002.004) — mocked demo", () => {
  test("manager assigns, changes role, removes and reactivates staff at a branch", async ({
    page,
  }) => {
    await openLocations(page);
    await openStaffTab(page, "Webster Branch");

    // Existing assignment is shown with its location role and status.
    const john = page.getByTestId("staff-row-demo-john");
    await expect(john.getByText("Manager", { exact: true })).toBeVisible();
    await expect(john.getByText("Assigned", { exact: true })).toBeVisible();

    // Inactive organization membership is distinct from "Not Assigned".
    await expect(
      page
        .getByTestId("staff-row-demo-lee")
        .getByText("Organization Membership Inactive"),
    ).toBeVisible();

    // Assign
    await page.getByRole("button", { name: "+ Assign Staff" }).click();
    await page
      .getByRole("button", { name: "Select Priya Shah to assign" })
      .click();
    const roleSelect = page.getByLabel("Location role", { exact: true });
    await expect(roleSelect.locator("option")).toHaveText([
      "Manager",
      "Assistant Manager",
      "Staff",
    ]);
    await roleSelect.selectOption("assistant_manager");
    await page.getByRole("button", { name: "Confirm Assignment" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Priya Shah assigned to Webster Branch as Assistant Manager.",
    );
    const priya = page.getByTestId("staff-row-demo-priya");
    await expect(priya.getByText("Assistant Manager")).toBeVisible();

    // Change role
    await priya
      .getByRole("button", { name: "Change role for Priya Shah" })
      .click();
    await priya
      .getByLabel(/New location role for Priya Shah/)
      .selectOption("staff");
    await priya.getByRole("button", { name: "Save Role" }).click();
    await expect(page.getByRole("status")).toContainText(
      "role at Webster Branch changed to Staff",
    );

    // Remove (confirmation required)
    await priya
      .getByRole("button", { name: "Remove assigned access for Priya Shah" })
      .click();
    await expect(
      page.getByText(
        "Their organization membership and assignments to other locations will remain unchanged.",
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Remove Access", exact: true })
      .click();
    await expect(priya.getByText("Inactive Assignment")).toBeVisible();

    // Reactivate
    await priya.getByRole("button", { name: "Reactivate Priya Shah" }).click();
    await priya
      .getByLabel(/New location role for Priya Shah/)
      .selectOption("manager");
    await priya.getByRole("button", { name: "Reactivate Assignment" }).click();
    await expect(priya.getByText("Assigned", { exact: true })).toBeVisible();
  });

  test("manager edits two locations for one employee independently in one save", async ({
    page,
  }) => {
    await openLocations(page);
    await page.getByRole("button", { name: "Staff Assignments" }).click();

    await page
      .getByRole("button", { name: "Manage locations for Sam Ortega" })
      .click();
    const form = page.getByRole("form", {
      name: /Location assignments for Sam Ortega/,
    });
    await expect(form).toBeVisible();

    // Sam starts as Staff at NASA only.
    await expect(form.getByLabel(/Location role at NASA Branch/)).toHaveValue(
      "staff",
    );
    await form.getByRole("checkbox", { name: "Webster Branch" }).check();
    await form
      .getByLabel(/Location role at Webster Branch/)
      .selectOption("manager");
    await form
      .getByLabel(/Location role at NASA Branch/)
      .selectOption("assistant_manager");
    await expect(form.getByTestId("pending-changes")).toContainText(
      "Assign to Webster Branch as Manager",
    );
    await form.getByRole("button", { name: "Save Assignments" }).click();

    await expect(page.getByRole("status")).toContainText(
      "Saved location assignments for Sam Ortega.",
    );
  });

  test("unsaved changes trigger a discard warning", async ({ page }) => {
    await openLocations(page);
    await page.getByRole("button", { name: "Staff Assignments" }).click();
    await page
      .getByRole("button", { name: "Manage locations for Priya Shah" })
      .click();
    const form = page.getByRole("form", {
      name: /Location assignments for Priya Shah/,
    });
    await form.getByRole("checkbox", { name: "Webster Branch" }).check();
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Discard unsaved changes?")).toBeVisible();
    await page.getByRole("button", { name: "Keep Editing" }).click();
    await expect(
      form.getByRole("checkbox", { name: "Webster Branch" }),
    ).toBeChecked();
  });

  test("assignment editor has no horizontal overflow at the current viewport", async ({
    page,
  }) => {
    await openLocations(page);
    await page.getByRole("button", { name: "Staff Assignments" }).click();
    await page
      .getByRole("button", { name: "Manage locations for John Carter" })
      .click();
    await expect(
      page.getByRole("form", { name: /Location assignments for John Carter/ }),
    ).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("staff do not see the Locations or staff assignment entry points", async ({
    page,
  }) => {
    await signIn(page, "1357");
    await openSettings(page);
    await expect(page.locator("#settings-locations")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Staff Assignments" }),
    ).toHaveCount(0);
  });
});
