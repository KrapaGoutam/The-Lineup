import crypto from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { adminClient } from "../support/harness";
import {
  countDev,
  cleanupFixtures,
  diffCounts,
  type DevCounts,
} from "../support/dev-counts";

const admin = adminClient();
const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const run = crypto.randomBytes(5).toString("hex");
const slug = `v2ms-${run}`;
const users: string[] = [];
const orgs: string[] = [];
const locations: string[] = [];
const pins: Record<string, string> = {};
let baseline: DevCounts;
async function checked<T>(
  promise: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const result = await promise;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
const hmac = (text: string) =>
  crypto
    .createHmac("sha256", process.env.APP_PIN_PEPPER!)
    .update(text)
    .digest("hex");
test.beforeAll(async () => {
  // Inspect public bundles before authentication or fixtures; never infer from READY.
  const html = await (await fetch(base)).text();
  let corpus = html;
  for (const match of [
    ...html.matchAll(/src="(\/_next\/[^\"]+\.js[^\"]*)"/g),
  ].slice(0, 45))
    corpus += await (await fetch(new URL(match[1], base))).text();
  expect(corpus).not.toContain("ftadewtkjlaotfdvtjcv");
  expect(corpus).toContain("opmujepkemwcdxxorhfd");
  if (!process.env.APP_PIN_PEPPER || process.env.APP_PIN_PEPPER.length < 32)
    throw new Error("APP_PIN_PEPPER unavailable");
  baseline = await countDev(admin);
  for (const key of ["owner", "manager", "staff"]) {
    pins[key] = String(crypto.randomInt(1000, 9999));
    const created = await admin.auth.admin.createUser({
      email: `${slug}-${key}@harness.invalid`,
      password: crypto.randomBytes(20).toString("hex"),
      email_confirm: true,
    });
    if (created.error) throw new Error(created.error.message);
    const user = created.data;
    if (!user.user) throw new Error("Fixture auth user unavailable");
    users.push(user.user.id);
    await checked(
      admin
        .from("profiles")
        .insert({ id: user.user.id, display_name: `Module ${key} ${run}` }),
    );
  }
  const org = await checked(
    admin
      .from("organizations")
      .insert({ name: `Module Settings ${run}`, slug, created_by: users[0] })
      .select("id")
      .single(),
  );
  if (!org) throw new Error("Missing fixture organization");
  orgs.push(org.id);
  for (const [index, key] of ["owner", "manager", "staff"].entries()) {
    const profile = users[index];
    await checked(
      admin.from("memberships").insert({
        organization_id: org.id,
        profile_id: profile,
        roles: [
          key === "owner"
            ? "owner"
            : key === "manager"
              ? "general_manager"
              : "server",
        ],
        active: true,
      }),
    );
    const updated = await admin.auth.admin.updateUserById(profile, {
      password: hmac(`authpw:${org.id}:${pins[key]}`),
    });
    if (updated.error) throw new Error(updated.error.message);
    await checked(
      admin.from("passcode_credentials").insert({
        organization_id: org.id,
        profile_id: profile,
        locator: hmac(`${org.id}:${pins[key]}`),
        synthetic_email: `${slug}-${key}@harness.invalid`,
        active: true,
      }),
    );
  }
  for (const name of ["NASA", "League City", "Archived"]) {
    const loc = await checked(
      admin
        .from("locations")
        .insert({
          organization_id: org.id,
          name,
          time_zone: "America/Chicago",
          active: name !== "Archived",
          archived_at: name === "Archived" ? new Date().toISOString() : null,
        })
        .select("id")
        .single(),
    );
    if (!loc) throw new Error("Missing fixture location");
    locations.push(loc.id);
  }
  await checked(
    admin.from("location_memberships").insert(
      users.map((profile_id, index) => ({
        profile_id,
        location_id: locations[0],
        role: index === 2 ? "staff" : "manager",
        active: true,
      })),
    ),
  );
});
test.afterAll(async () => {
  if (locations.length)
    await checked(
      admin
        .from("location_module_configs")
        .delete()
        .in("location_id", locations),
    );
  const errors = await cleanupFixtures(admin, { orgIds: orgs, userIds: users });
  expect(errors).toEqual([]);
  if (baseline) {
    const after = await countDev(admin);
    const drift = diffCounts(baseline, after);
    console.info("Module browser cleanup", JSON.stringify(drift));
    expect(drift).toEqual({});
  }
});
async function login(page: Page, key: string) {
  await page.goto(`/r/${slug}`);
  await page.waitForSelector('body[data-hydrated="true"]');
  await page.getByLabel("Restaurant passcode").fill(pins[key]);
  await expect(
    page.getByRole("button", { name: "Account and quick settings" }).first(),
  ).toBeVisible({ timeout: 60000 });
}
async function openLocations(page: Page) {
  const button = page.getByRole("button", { name: "Settings", exact: true });
  if (await button.isVisible()) await button.click();
  else {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: /^Settings/ }).click();
  }
  await page.locator("#settings-locations").click();
}
async function modules(page: Page, name: string) {
  await page
    .getByRole("button", { name: `Manage ${name}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Modules", exact: true }).click();
  return page.getByRole("region", { name: "Location modules" });
}
test("HTTPS/DEV real persistence, second manager, location isolation, archive and staff", async ({
  browser,
  page,
}) => {
  await login(page, "owner");
  await openLocations(page);
  let section = await modules(page, "NASA");
  await expect(
    section.getByText("Not configured", { exact: true }),
  ).toHaveCount(9);
  await section
    .getByRole("button", { name: "Enable Tasks", exact: true })
    .click();
  await expect(section.getByText("Enabled", { exact: true })).toBeVisible();
  await section
    .getByRole("button", { name: "Disable Tasks", exact: true })
    .click();
  await expect(section.getByText("Disabled", { exact: true })).toBeVisible();
  await page.reload();
  await openLocations(page);
  section = await modules(page, "NASA");
  await expect(section.getByText("Disabled", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  section = await modules(page, "League City");
  await expect(
    section.getByText("Not configured", { exact: true }),
  ).toHaveCount(9);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Show archived locations/ }).click();
  await page.getByRole("button", { name: "View modules of Archived" }).click();
  await expect(
    page
      .getByRole("region", { name: "Location modules" })
      .getByText(/Archived locations are read-only/),
  ).toBeVisible();
  expect(
    await page
      .getByRole("button", { name: "Enable Tasks", exact: true })
      .count(),
  ).toBe(0);
  const context = await browser.newContext();
  const other = await context.newPage();
  try {
    await login(other, "manager");
    await openLocations(other);
    section = await modules(other, "NASA");
    await expect(section.getByText("Disabled", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  try {
    await login(staff, "staff");
    await expect(staff.locator("#settings-locations")).toHaveCount(0);
  } finally {
    await staffContext.close();
  }
  const rows = await checked(
    admin
      .from("location_module_configs")
      .select("location_id,module_key,is_enabled")
      .in("location_id", locations),
  );
  expect(rows).toEqual([
    { location_id: locations[0], module_key: "tasks", is_enabled: false },
  ]);
});
