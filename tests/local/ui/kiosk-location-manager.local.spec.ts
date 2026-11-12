import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

/**
 * V2-008 B1 (D7 + F-1), real browser, real Supabase Auth cookies, DISPOSABLE
 * local stack only. A location-only manager (organization role `server`, an
 * active `manager` location row) must reach Kiosks management from Settings
 * without any general Location Administration, and must lose it the moment
 * their organization membership is deactivated.
 */

function localEnv() {
  let url = process.env.LOCAL_SUPABASE_URL ?? "";
  let anon = process.env.LOCAL_SUPABASE_ANON_KEY ?? "";
  let secret = process.env.LOCAL_SUPABASE_SERVICE_KEY ?? "";
  if (!url || !anon || !secret) {
    const out = execSync("npx supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pick = (re: RegExp) => out.match(re)?.[1]?.trim() ?? "";
    url ||= pick(/API_URL=["']?([^"'\r\n]+)/);
    anon ||=
      pick(/PUBLISHABLE_KEY=["']?([^"'\r\n]+)/) ||
      pick(/ANON_KEY=["']?([^"'\r\n]+)/);
    secret ||=
      pick(/SECRET_KEY=["']?([^"'\r\n]+)/) ||
      pick(/SERVICE_ROLE_KEY=["']?([^"'\r\n]+)/);
  }
  return { url, anon, secret };
}
const env = localEnv();

function must<R extends { data: unknown; error: { message: string } | null }>(
  r: R,
): NonNullable<R["data"]> {
  if (r.error) throw Error(r.error.message);
  return r.data as NonNullable<R["data"]>;
}

type Actor = {
  id: string;
  client: SupabaseClient<Database>;
  token: string;
};

const run = crypto.randomUUID().slice(0, 8);
let admin: SupabaseClient<Database>;
const actors: Record<string, Actor> = {};
const userIds: string[] = [];
const orgIds: string[] = [];
let org = { id: "", slug: "" };
let locA1 = "";
let locA2 = "";
let deviceId = "";

async function makeActor(key: string): Promise<Actor> {
  const email = `kiosk-ui-${run}-${key}@harness.invalid`;
  const password = crypto.randomBytes(24).toString("base64url");
  const created = must(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  const id = created.user!.id;
  userIds.push(id);
  must(await admin.from("profiles").insert({ id, display_name: `KUI ${key}` }));
  const client = createClient<Database>(env.url, env.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const session = must(
    await client.auth.signInWithPassword({ email, password }),
  ).session!;
  const actor = { id, client, token: session.access_token };
  actors[key] = actor;
  return actor;
}

async function authenticate(
  context: BrowserContext,
  actor: Actor,
  locationId: string,
) {
  await context.clearCookies();
  const session = must(await actor.client.auth.getSession()).session!;
  const ssr = createServerClient(env.url, env.anon, {
    cookies: {
      getAll: () => [],
      setAll: async (cookies) =>
        context.addCookies(
          cookies.map(({ name, value }) => ({
            name,
            value,
            domain: "localhost",
            path: "/",
            httpOnly: true,
            sameSite: "Lax" as const,
          })),
        ),
    },
  });
  must(await ssr.auth.setSession(session));
  await context.addCookies([
    {
      name: "lineup_active_context",
      value: JSON.stringify({ v: 1, o: org.id, l: locationId }),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function openSettings(page: Page) {
  await page.goto(`/r/${org.slug}?tab=settings`);
  await expect(
    page.getByRole("heading", { name: "Settings", level: 1 }),
  ).toBeVisible({ timeout: 60_000 });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if (
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(env.url) ||
    !env.anon ||
    !env.secret
  ) {
    throw Error("Disposable loopback Supabase credentials required");
  }
  admin = createClient<Database>(env.url, env.secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const key of ["owner", "mgr", "mgr2", "asst", "staff"]) {
    await makeActor(key);
  }
  const created = must(
    await admin
      .from("organizations")
      .insert({
        name: `Kiosk UI ${run}`,
        slug: `kiosk-ui-${run}`,
        created_by: actors.owner.id,
      })
      .select()
      .single(),
  );
  org = { id: created.id, slug: created.slug };
  orgIds.push(org.id);

  const locs = must(
    await admin
      .from("locations")
      .insert([
        {
          organization_id: org.id,
          name: "KUI Alpha",
          time_zone: "America/Chicago",
        },
        {
          organization_id: org.id,
          name: "KUI Beta",
          time_zone: "America/Chicago",
        },
      ])
      .select("id, name"),
  );
  locA1 = locs.find((l) => l.name === "KUI Alpha")!.id;
  locA2 = locs.find((l) => l.name === "KUI Beta")!.id;

  must(
    await admin.from("memberships").insert(
      ["owner", "mgr", "mgr2", "asst", "staff"].map((key) => ({
        organization_id: org.id,
        profile_id: actors[key].id,
        roles: [
          key === "owner" ? "owner" : "server",
        ] as Database["public"]["Enums"]["app_role"][],
        active: true,
      })),
    ),
  );
  must(
    await admin.from("location_memberships").insert([
      // The organization owner needs location rows too: once ANY row exists in an
      // organization the legacy fallback is gone (V2-008 Batch A fallback cliff),
      // and V2 backfill gives owners a manager row (V2-D019 ladder).
      {
        location_id: locA1,
        profile_id: actors.owner.id,
        role: "manager",
        active: true,
      },
      {
        location_id: locA2,
        profile_id: actors.owner.id,
        role: "manager",
        active: true,
      },
      {
        location_id: locA1,
        profile_id: actors.mgr.id,
        role: "manager",
        active: true,
      },
      {
        location_id: locA1,
        profile_id: actors.mgr2.id,
        role: "manager",
        active: true,
      },
      {
        location_id: locA2,
        profile_id: actors.mgr2.id,
        role: "manager",
        active: true,
      },
      {
        location_id: locA1,
        profile_id: actors.asst.id,
        role: "assistant_manager",
        active: true,
      },
      {
        location_id: locA1,
        profile_id: actors.staff.id,
        role: "staff",
        active: true,
      },
    ]),
  );
  const device = must(
    await admin
      .from("kiosk_devices")
      .insert({
        organization_id: org.id,
        location_id: locA1,
        name: "KUI Host Stand",
        device_token_hash: crypto.randomBytes(32).toString("hex"),
      })
      .select("id")
      .single(),
  );
  deviceId = device.id;
});

test.afterAll(async () => {
  if (!admin) return;
  for (const id of orgIds)
    await admin.from("organizations").delete().eq("id", id);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  const left = await admin
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .in("id", orgIds);
  if ((left.count ?? 0) > 0) throw Error("kiosk UI fixture leftovers");
});

test("location-only manager gets Kiosks without any Location Administration", async ({
  page,
  context,
}) => {
  await authenticate(context, actors.mgr, locA1);
  await openSettings(page);

  const kiosksCard = page.locator("#settings-kiosks");
  await expect(kiosksCard).toBeVisible({ timeout: 30_000 });
  await expect(kiosksCard).toContainText("Kiosks");

  // Nothing of general administration is offered.
  await expect(page.locator("#settings-locations")).toHaveCount(0);
  await expect(page.locator("#settings-team")).toHaveCount(0);
  await expect(page.locator("#settings-schedule")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit hours" })).toHaveCount(0);

  await kiosksCard.getByRole("button").click();
  await expect(
    page.getByRole("heading", { name: "Kiosks", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Station Kiosk Tablets" }),
  ).toBeVisible();
  await expect(
    page.locator("main").getByText("KUI Alpha").first(),
  ).toBeVisible();
  // Single assigned location: no picker, and the other location never appears.
  await expect(page.locator("#kiosk-location-select")).toHaveCount(0);
  await expect(page.getByText("KUI Beta")).toHaveCount(0);
  await expect(page.getByText("KUI Host Stand")).toBeVisible();
  // Only one manageable location: nothing to reassign to.
  await expect(
    page.getByRole("button", { name: "Reassign KUI Host Stand" }),
  ).toHaveCount(0);
  // Still no Location Administration surface.
  await expect(page.getByText(/create location|archive location/i)).toHaveCount(
    0,
  );

  // Back returns to Settings with focus on the Kiosks card.
  await page.getByRole("button", { name: "Back to Settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Settings", level: 1 }),
  ).toBeVisible();
  await expect(kiosksCard.getByRole("button")).toBeFocused();
});

test("location-only manager pairs, renames and revokes a tablet", async ({
  page,
  context,
}) => {
  await authenticate(context, actors.mgr, locA1);
  await openSettings(page);
  await page.locator("#settings-kiosks").getByRole("button").click();
  await expect(page.getByText("KUI Host Stand")).toBeVisible();

  // Pair: the displayed code only ever uses the 31-character generator alphabet.
  await page.getByRole("button", { name: "Add Kiosk Device" }).first().click();
  await page.getByLabel("Device Name / Label").fill("KUI Patio");
  await page.getByRole("button", { name: "Generate Pairing Code" }).click();
  const code = page.locator("div.font-mono >> span").first();
  await expect(code).toHaveText(/^[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}$/);
  await page.getByRole("button", { name: "Done" }).click();
  const pairing = must(
    await admin
      .from("kiosk_pairing_codes")
      .select("location_id, device_name, created_by")
      .eq("device_name", "KUI Patio"),
  );
  expect(pairing).toHaveLength(1);
  expect(pairing[0].location_id).toBe(locA1);
  expect(pairing[0].created_by).toBe(actors.mgr.id);

  // Rename.
  await page.getByRole("button", { name: "Rename KUI Host Stand" }).click();
  await page.getByLabel("Device Name").fill("KUI Host Stand 2");
  await page.getByRole("button", { name: "Save Name" }).click();
  await expect(page.getByText("KUI Host Stand 2")).toBeVisible();

  // Revoke requires a reason (>= 3 characters).
  await page.getByRole("button", { name: "Revoke KUI Host Stand 2" }).click();
  const revoke = page.getByRole("button", { name: "Revoke Device" });
  await expect(revoke).toBeDisabled();
  await page.getByLabel(/Reason for Revocation/).fill("no");
  await expect(revoke).toBeDisabled();
  await page.getByLabel(/Reason for Revocation/).fill("Lost tablet");
  await revoke.click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();

  const row = must(
    await admin
      .from("kiosk_devices")
      .select("status, revoked_by, revocation_reason, device_token_hash")
      .eq("id", deviceId)
      .single(),
  );
  expect(row.status).toBe("revoked");
  expect(row.revoked_by).toBe(actors.mgr.id);
  expect(row.revocation_reason).toBe("Lost tablet");
  expect(row.device_token_hash).toBeNull();
});

test("a manager of two locations sees a picker limited to their locations", async ({
  page,
  context,
}) => {
  await authenticate(context, actors.mgr2, locA1);
  await openSettings(page);
  await page.locator("#settings-kiosks").getByRole("button").click();
  const picker = page.locator("#kiosk-location-select");
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("option")).toHaveText([
    "KUI Alpha",
    "KUI Beta",
  ]);
  await picker.selectOption({ label: "KUI Beta" });
  await expect(page.getByText(/paired to KUI Beta/)).toBeVisible();
});

test("assistant manager and staff are offered no Kiosks entry", async ({
  page,
  context,
}) => {
  for (const key of ["asst", "staff"]) {
    await authenticate(context, actors[key], locA1);
    await openSettings(page);
    // Give the (empty) server answer time to arrive before asserting absence.
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#settings-kiosks")).toHaveCount(0);
    await expect(page.locator("#settings-locations")).toHaveCount(0);
  }
});

test("organization owner keeps Location Administration and also gets Kiosks", async ({
  page,
  context,
}) => {
  await authenticate(context, actors.owner, locA1);
  await openSettings(page);
  await expect(page.locator("#settings-locations")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("#settings-kiosks")).toBeVisible({
    timeout: 30_000,
  });

  // Existing path (Location Administration -> Manage -> Kiosks) is untouched.
  await page.locator("#settings-locations").getByRole("button").click();
  await page.getByRole("button", { name: "Manage KUI Alpha" }).click();
  await page.getByRole("button", { name: "Kiosks" }).click();
  await expect(
    page.getByRole("heading", { name: "Station Kiosk Tablets" }),
  ).toBeVisible();
});

test("deactivating the organization membership revokes kiosk authority on an open page", async ({
  page,
  context,
}) => {
  await authenticate(context, actors.mgr2, locA1);
  await openSettings(page);
  await page.locator("#settings-kiosks").getByRole("button").click();
  await expect(
    page.getByRole("heading", { name: "Station Kiosk Tablets" }),
  ).toBeVisible();

  // Out-of-band deactivation (the F-1 window): session and location row stay live.
  must(
    await admin
      .from("memberships")
      .update({ active: false })
      .eq("profile_id", actors.mgr2.id),
  );

  await page.getByRole("button", { name: "Add Kiosk Device" }).first().click();
  await page.getByRole("button", { name: "Generate Pairing Code" }).click();
  await expect(
    page.getByText(/Unauthorized to register kiosk devices/i),
  ).toBeVisible();
  const codes = must(
    await admin
      .from("kiosk_pairing_codes")
      .select("id")
      .eq("created_by", actors.mgr2.id),
  );
  expect(codes).toHaveLength(0);
});
