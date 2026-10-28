import { expect, test, type Page } from "@playwright/test";

// Tasks V1.1 / T-5 (#154): the Opening reminder popup and catch-up UX.
//
// Demo mode: the in-memory engine is the demo twin of the database sweep
// (task_opening_reminders_sweep, T-4), enabled with `?demoReminders=1` so every
// other demo test is left alone. The demo location opens at 09:00
// America/Chicago; the Playwright clock pins "now" (2026-10-28 is CDT, UTC-5, so
// 09:00 = 14:00Z). Demo state lives in memory, so a page reload returns to the
// sign-in screen and rebuilds everything: "reload after dismiss" is therefore
// proven against a persistent fake server in the component tests
// (opening-reminder-prompt.test.tsx), and here by navigation, focus and time.
// Demo passcodes: 2468 Maya Singh (manager), 1357 Mia Chen (staff).

const DAY = "2026-10-28";
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00Z`);
const MINUTES = 60_000;

async function start(
  page: Page,
  url: string,
  passcode: string,
  time: string,
): Promise<void> {
  await page.clock.install({ time: at(time) });
  await page.goto(url);
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(passcode);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}

/** Open a module from the nav, using "More" when it is not a direct button. */
async function openModule(page: Page, name: string) {
  const direct = page.getByRole("button", { name, exact: true });
  if (await direct.first().isVisible()) {
    await direct.first().click();
    return;
  }
  const more = page.getByRole("button", { name: "More" });
  if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
  await page.getByRole("button", { name, exact: true }).click();
}

const dialogs = (page: Page) => page.getByRole("dialog");

async function openInbox(page: Page) {
  await page
    .getByRole("button", { name: /^Notifications(, \d+ unread)?$/ })
    .click();
  return page.getByRole("dialog", { name: "Notifications" });
}

test("OPEN stage: one popup on arrival, Dismiss acknowledges it for good", async ({
  page,
}) => {
  await start(page, "/?demoReminders=1", "2468", "14:00");
  const dialog = page.getByRole("dialog", { name: "Opening Tasks Are Ready" });
  await expect(dialog).toBeVisible();
  await expect(dialogs(page)).toHaveCount(1);
  await expect(dialog).toContainText("Opening");
  await dialog.getByRole("button", { name: "Dismiss" }).click();
  await expect(dialogs(page)).toHaveCount(0);

  // Rerender, module change, focus and time passing: the same stage never repeats.
  await openModule(page, "Schedule");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.fastForward(2 * MINUTES);
  await expect(dialogs(page)).toHaveCount(0);
});

test("+15 stage pops after OPEN was dismissed; +30 pops after that", async ({
  page,
}) => {
  await start(page, "/?demoReminders=1", "2468", "14:00");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(dialogs(page)).toHaveCount(0);

  await page.clock.fastForward(15 * MINUTES);
  const p15 = page.getByRole("dialog", {
    name: "Opening Tasks Need Attention",
  });
  await expect(p15).toBeVisible();
  await expect(p15).toContainText(/Opening items? (is|are) still incomplete\./);
  await expect(dialogs(page)).toHaveCount(1);
  await p15.getByRole("button", { name: "Dismiss" }).click();
  await expect(dialogs(page)).toHaveCount(0);

  await page.clock.fastForward(15 * MINUTES);
  const p30 = page.getByRole("dialog", {
    name: "Opening Tasks Need Attention",
  });
  await expect(p30).toBeVisible();
  await expect(p30).toContainText(/Opening items? needs? attention\./);
  await expect(dialogs(page)).toHaveCount(1);
});

test("CATCH-UP: OPEN, +15 and +30 are all stored but only the +30 popup appears", async ({
  page,
}) => {
  // First look at 09:34: work stayed incomplete through all three instants.
  await start(page, "/?demoReminders=1", "2468", "14:34");
  const dialog = page.getByRole("dialog", {
    name: "Opening Tasks Need Attention",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/needs? attention\./);
  // Never three in a row: exactly one dialog, and none appears after dismissal.
  await expect(dialogs(page)).toHaveCount(1);
  await dialog.getByRole("button", { name: "Dismiss" }).click();
  await expect(dialogs(page)).toHaveCount(0);
  await page.clock.fastForward(MINUTES);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(dialogs(page)).toHaveCount(0);

  // History keeps every legitimately stored stage; older ones stay unread.
  const inbox = await openInbox(page);
  await expect(
    inbox.getByText("Opening tasks are not complete", { exact: true }),
  ).toHaveCount(1);
  await expect(
    inbox.getByText("Opening tasks are still incomplete", { exact: true }),
  ).toHaveCount(1);
  await expect(
    inbox.getByText("Opening tasks are overdue", { exact: true }),
  ).toHaveCount(1);
  const row = (title: string) =>
    inbox
      .getByRole("button")
      .filter({ has: page.getByText(title, { exact: true }) });
  await expect(row("Opening tasks are not complete")).toContainText("New");
  await expect(row("Opening tasks are still incomplete")).toContainText("New");
  await expect(row("Opening tasks are overdue")).not.toContainText("New");
});

test("CTA: View Opening Tasks acknowledges and opens Tasks -> Today from another module", async ({
  page,
}) => {
  await start(page, "/?tab=schedule&demoReminders=1", "2468", "14:34");
  const dialog = page.getByRole("dialog", {
    name: "Opening Tasks Need Attention",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "View Opening Tasks" }).click();
  await expect(dialogs(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Tasks", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
  // T-1 addressing: Tasks is the default landing, so `tab` is dropped and the
  // other parameters survive.
  await expect(page).toHaveURL(/\/\?demoReminders=1$/);
  await page.clock.fastForward(MINUTES);
  await expect(dialogs(page)).toHaveCount(0);
});

test("CTA keeps the restaurant route (/r/<slug>)", async ({ page }) => {
  await start(
    page,
    "/r/the-monks?tab=schedule&demoReminders=1",
    "2468",
    "14:34",
  );
  const dialog = page.getByRole("dialog", {
    name: "Opening Tasks Need Attention",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "View Opening Tasks" }).click();
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
  await expect(page).toHaveURL(/\/r\/the-monks\?demoReminders=1$/);
});

test("Staff: their own generic reminder, no coworker details, Tasks CTA", async ({
  page,
}) => {
  await start(page, "/?demoReminders=1", "1357", "14:34");
  const dialog = page.getByRole("dialog", { name: "Opening Task Reminder" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Your Opening work needs attention.");
  await expect(dialogs(page)).toHaveCount(1);
  const text = (await dialog.innerText()) ?? "";
  expect(text).not.toMatch(/\d/);
  for (const coworker of [
    "Maya",
    "Leo",
    "Ava",
    "Krapa",
    "Set patio",
    "Count register",
  ]) {
    expect(text).not.toContain(coworker);
  }
  await dialog.getByRole("button", { name: "View My Opening Tasks" }).click();
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
  // Staff get no management scope selector from this path (T-2 unchanged).
  await expect(page.getByLabel("Show tasks for")).toHaveCount(0);
});

test("completed Opening work: no popup at any stage", async ({ page }) => {
  // Signed in before opening, the checklist is finished, then every stage passes.
  await start(page, "/?demoReminders=1", "2468", "13:50");
  await expect(dialogs(page)).toHaveCount(0);
  const open = page.getByRole("region", { name: "Opening work" });
  await expect(open).toBeVisible();
  for (let guard = 0; guard < 20; guard += 1) {
    const next = open
      .getByRole("checkbox", { name: /^Mark complete:/ })
      .first();
    if ((await next.count()) === 0) break;
    await next.click();
  }
  await expect(
    open.getByRole("checkbox", { name: /^Mark complete:/ }),
  ).toHaveCount(0);
  await page.clock.fastForward(45 * MINUTES);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(dialogs(page)).toHaveCount(0);
});

test("dialog accessibility: named, described, focused, Escape dismisses and focus returns", async ({
  page,
}) => {
  await start(page, "/?demoReminders=1", "2468", "14:00");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(dialogs(page)).toHaveCount(0);

  const trigger = page.getByRole("button", {
    name: /^Notifications(, \d+ unread)?$/,
  });
  await trigger.focus();
  await page.clock.fastForward(15 * MINUTES);
  const dialog = page.getByRole("dialog", {
    name: "Opening Tasks Need Attention",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(
    /Opening items? (is|are) still incomplete\./,
  );
  // Initial focus lands on the primary action; Tab never reaches the page
  // behind the modal (it cycles within the dialog, or out to browser chrome).
  const cta = dialog.getByRole("button", { name: "View Opening Tasks" });
  await expect(cta).toBeFocused();
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press("Tab");
    const reachedPage = await dialog.evaluate(
      (el) =>
        document.activeElement !== null &&
        document.activeElement !== document.body &&
        !el.contains(document.activeElement),
    );
    expect(reachedPage).toBe(false);
  }
  // Escape is the same acknowledgement as Dismiss and does not come back.
  await page.keyboard.press("Escape");
  await expect(dialogs(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.clock.fastForward(MINUTES);
  await expect(dialogs(page)).toHaveCount(0);
});

test("responsive: the popup fits the viewport with comfortable tap targets", async ({
  page,
}) => {
  await start(page, "/?demoReminders=1", "2468", "14:34");
  const dialog = page.getByRole("dialog", {
    name: "Opening Tasks Need Attention",
  });
  await expect(dialog).toBeVisible();
  const viewport = page.viewportSize()!;
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  for (const name of ["View Opening Tasks", "Dismiss"]) {
    const button = (await dialog.getByRole("button", { name }).boundingBox())!;
    expect(button.height).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("without ?demoReminders the ordinary demo is never interrupted", async ({
  page,
}) => {
  await start(page, "/", "2468", "14:34");
  await expect(page.getByRole("region", { name: "Today" })).toBeVisible();
  await page.clock.fastForward(5 * MINUTES);
  await expect(dialogs(page)).toHaveCount(0);
});
