import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

/**
 * V2-009 Stage B, P-1..P-8: the canonical personas (docs/v2.0/ACCESS_MODEL.md section 3-4) in a real
 * browser with real Supabase Auth sessions, on a DISPOSABLE local stack only.
 *
 *   Monks       -> Webster
 *   Liquor Tap  -> NASA, League City
 *
 *   Jack   Webster staff | NASA staff | League City staff
 *   Sam    NASA staff                                   (no Monks membership)
 *   Tom    Webster staff                                (no Liquor Tap membership)
 *   Jerry  Webster staff | NASA staff                   (no League City assignment)
 *   John   Webster manager | NASA manager | League City assistant manager
 *
 * The documents define only the LOCATION roles. Every persona therefore holds the neutral
 * organization-level role `server` (an organization role is required by the schema and grants no
 * organization-wide authority once an organization has location rows); nothing else is assumed.
 *
 * Secrets: passwords are random per run, never logged, and live only in memory.
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
  key: string;
  client: SupabaseClient<Database>;
};
type Place = {
  orgId: string;
  slug: string;
  orgName: string;
  locId: string;
  locName: string;
};

const run = crypto.randomUUID().slice(0, 8);
let admin: SupabaseClient<Database>;
const actors: Record<string, Actor> = {};
const userIds: string[] = [];
const orgIds: string[] = [];
let overallProfileId: string | null = null;

const MONKS = { slug: "rm-monks", name: "Monks" };
const TAP = { slug: "rm-liquor-tap", name: "Liquor Tap" };
const place: Record<"webster" | "nasa" | "lc", Place> = {} as never;
let galveston: Place | null = null;

const MODULES: Database["public"]["Enums"]["location_module_key"][] = [
  "table_allocation",
  "tasks",
  "schedule",
  "tips",
  "team",
  "attendance",
  "payroll",
  "bar_inventory",
  "recipes",
];

async function makeActor(key: string, displayName: string): Promise<Actor> {
  const email = `rm-${run}-${key}@harness.invalid`;
  const password = crypto.randomBytes(24).toString("base64url");
  const created = must(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  const id = created.user!.id;
  userIds.push(id);
  must(await admin.from("profiles").insert({ id, display_name: displayName }));
  const client = createClient<Database>(env.url, env.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  must(await client.auth.signInWithPassword({ email, password }));
  const actor = { id, key, client };
  actors[key] = actor;
  return actor;
}

/** Real session cookies; the active-context cookie is optional (absent = a fresh sign-in). */
async function authenticate(
  context: BrowserContext,
  actor: Actor,
  active?: { orgId: string; locId: string } | string,
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
  if (active !== undefined) {
    const value =
      typeof active === "string"
        ? active
        : JSON.stringify({ v: 1, o: active.orgId, l: active.locId });
    await context.addCookies([
      {
        name: "lineup_active_context",
        value,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
}

type Status =
  | "resolved"
  | "no_access"
  | "selection_required"
  | "invalid_context"
  | "error";

/** Wait for the first settled entry state and report it (never sleeps on a fixed delay). */
async function settle(
  page: Page,
): Promise<{ status: Status; reason: string | null }> {
  const unavailable = page.getByTestId("context-unavailable");
  const workspace = page
    .locator(
      '[data-testid="context-indicator"], [data-testid="context-switcher"]',
    )
    .first();
  await expect(unavailable.or(workspace).first()).toBeVisible({
    timeout: 90_000,
  });
  if (await unavailable.count()) {
    return {
      status: (await unavailable.getAttribute("data-context-status")) as Status,
      reason: null,
    };
  }
  return { status: "resolved", reason: null };
}

async function workspaceLabel(page: Page): Promise<string> {
  const el = page
    .locator(
      '[data-testid="context-indicator"], [data-testid="context-switcher"] button[aria-haspopup="menu"]',
    )
    .first();
  const label = (await el.getAttribute("aria-label")) ?? "";
  return label.replace(/^(Workspace: |Switch workspace\. Current: )/, "");
}

/** The location ids the header switcher offers (empty for a single-context, non-interactive indicator). */
async function switcherLocationIds(page: Page): Promise<string[]> {
  const sw = page.getByTestId("context-switcher");
  if (!(await sw.count())) return [];
  await sw.getByRole("button", { name: /Switch workspace/ }).click();
  const menu = page.getByTestId("context-switcher-menu");
  await expect(menu).toBeVisible();
  const ids = await menu
    .getByRole("menuitemradio")
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-location-id") ?? ""),
    );
  await page.keyboard.press("Escape");
  return ids.sort();
}

function sorted(...places: Place[]): string[] {
  return places.map((p) => p.locId).sort();
}

async function expectDeniedNoData(page: Page, forbidden: string[]) {
  await expect(page.getByTestId("context-unavailable")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Tasks sections" }),
  ).toHaveCount(0);
  await expect(
    page.locator(
      '[data-testid="context-indicator"], [data-testid="context-switcher"]',
    ),
  ).toHaveCount(0);
  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const name of forbidden) expect(text).not.toContain(name.toLowerCase());
}

async function openTasks(page: Page, slug: string) {
  await page.goto(`/r/${slug}?tab=tasks`);
  const state = await settle(page);
  expect(state.status).toBe("resolved");
  await expect(
    page.getByRole("navigation", { name: "Tasks sections" }),
  ).toBeVisible({
    timeout: 60_000,
  });
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
  const taken = must(
    await admin
      .from("organizations")
      .select("slug")
      .in("slug", [MONKS.slug, TAP.slug]),
  );
  if (taken.length)
    throw Error(
      "fixture slug collision: refusing to touch a non-disposable stack",
    );

  for (const [key, name] of [
    ["jack", "Jack"],
    ["sam", "Sam"],
    ["tom", "Tom"],
    ["jerry", "Jerry"],
    ["john", "John"],
    ["overall", "Overall Owner"],
    ["gm", "Monks GM"],
    ["vic", "Two-org member"],
  ] as const) {
    await makeActor(key, `RM ${name} ${run}`);
  }

  const orgs = must(
    await admin
      .from("organizations")
      .insert([
        { name: MONKS.name, slug: MONKS.slug, created_by: actors.jack.id },
        { name: TAP.name, slug: TAP.slug, created_by: actors.jack.id },
      ])
      .select("id, slug"),
  );
  const monks = orgs.find((o) => o.slug === MONKS.slug)!;
  const tap = orgs.find((o) => o.slug === TAP.slug)!;
  orgIds.push(monks.id, tap.id);

  const locs = must(
    await admin
      .from("locations")
      .insert([
        {
          organization_id: monks.id,
          name: "Webster",
          time_zone: "America/Chicago",
        },
        { organization_id: tap.id, name: "NASA", time_zone: "America/Chicago" },
        {
          organization_id: tap.id,
          name: "League City",
          time_zone: "America/Chicago",
        },
      ])
      .select("id, name"),
  );
  const loc = (n: string) => locs.find((l) => l.name === n)!.id;
  place.webster = {
    orgId: monks.id,
    slug: MONKS.slug,
    orgName: MONKS.name,
    locId: loc("Webster"),
    locName: "Webster",
  };
  place.nasa = {
    orgId: tap.id,
    slug: TAP.slug,
    orgName: TAP.name,
    locId: loc("NASA"),
    locName: "NASA",
  };
  place.lc = {
    orgId: tap.id,
    slug: TAP.slug,
    orgName: TAP.name,
    locId: loc("League City"),
    locName: "League City",
  };

  must(
    await admin.from("location_module_configs").insert(
      Object.values(place).flatMap((p) =>
        MODULES.map((module_key) => ({
          location_id: p.locId,
          module_key,
          is_enabled: true,
        })),
      ),
    ),
  );

  const orgRole = (orgId: string, key: string) => ({
    organization_id: orgId,
    profile_id: actors[key].id,
    roles: ["server"] as Database["public"]["Enums"]["app_role"][],
    active: true,
  });
  must(
    await admin
      .from("memberships")
      .insert([
        orgRole(monks.id, "jack"),
        orgRole(tap.id, "jack"),
        orgRole(tap.id, "sam"),
        orgRole(monks.id, "tom"),
        orgRole(monks.id, "jerry"),
        orgRole(tap.id, "jerry"),
        orgRole(monks.id, "john"),
        orgRole(tap.id, "john"),
        { ...orgRole(monks.id, "gm"), roles: ["general_manager"] },
        orgRole(monks.id, "vic"),
        orgRole(tap.id, "vic"),
      ]),
  );
  const lm = (
    key: string,
    p: Place,
    role: Database["public"]["Enums"]["location_role"],
  ) => ({
    location_id: p.locId,
    profile_id: actors[key].id,
    role,
    active: true,
  });
  must(
    await admin
      .from("location_memberships")
      .insert([
        lm("jack", place.webster, "staff"),
        lm("jack", place.nasa, "staff"),
        lm("jack", place.lc, "staff"),
        lm("sam", place.nasa, "staff"),
        lm("tom", place.webster, "staff"),
        lm("jerry", place.webster, "staff"),
        lm("jerry", place.nasa, "staff"),
        lm("john", place.webster, "manager"),
        lm("john", place.nasa, "manager"),
        lm("john", place.lc, "assistant_manager"),
        lm("gm", place.webster, "manager"),
        lm("vic", place.webster, "staff"),
        lm("vic", place.nasa, "staff"),
      ]),
  );
  // One observable operational row per location for the direct-API probes (P-6 / P-7).
  must(
    await admin.from("dining_areas").insert(
      Object.values(place).map((p) => ({
        organization_id: p.orgId,
        location_id: p.locId,
        name: `RM area ${p.locName}`,
        area_order: 1,
      })),
    ),
  );
  // The Overall Owner fixture holds NO organization membership.
  must(
    await admin
      .from("overall_roles")
      .insert({ profile_id: actors.overall.id, role: "owner" }),
  );
  overallProfileId = actors.overall.id;
});

test.afterAll(async () => {
  if (!admin) return;
  if (overallProfileId)
    await admin
      .from("overall_roles")
      .delete()
      .eq("profile_id", overallProfileId);
  // Module configuration is delete-protected for client roles and its FK does not cascade: remove the
  // rows with the service role first (the same teardown the other local fixtures use).
  const locIds = [
    ...Object.values(place),
    ...(galveston ? [galveston] : []),
  ].map((p) => p.locId);
  if (locIds.length)
    await admin
      .from("location_module_configs")
      .delete()
      .in("location_id", locIds);
  for (const id of orgIds) {
    const r = await admin.from("organizations").delete().eq("id", id);
    if (r.error)
      throw Error("organization teardown failed: " + r.error.message);
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  const left = await admin
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .in("id", orgIds);
  const leftUsers = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .in("id", userIds);
  if ((left.count ?? 0) > 0 || (leftUsers.count ?? 0) > 0)
    throw Error("role-matrix fixture leftovers");
});

// ---------------------------------------------------------------------------------------------
// P-1  Sign-in entry: where each persona lands and exactly which workspaces the switcher offers
// ---------------------------------------------------------------------------------------------
const ENTRY: {
  key: "jack" | "sam" | "tom" | "jerry" | "john";
  lands: () => Place;
  switcher: () => string[];
}[] = [
  {
    key: "jack",
    lands: () => place.webster,
    switcher: () => sorted(place.webster, place.nasa, place.lc),
  },
  { key: "sam", lands: () => place.nasa, switcher: () => [] },
  { key: "tom", lands: () => place.webster, switcher: () => [] },
  {
    key: "jerry",
    lands: () => place.webster,
    switcher: () => sorted(place.webster, place.nasa),
  },
  {
    key: "john",
    lands: () => place.webster,
    switcher: () => sorted(place.webster, place.nasa, place.lc),
  },
];

for (const row of ENTRY) {
  test(`P-1 ${row.key}: global entry lands in the right workspace and offers exactly the permitted switcher`, async ({
    page,
    context,
  }) => {
    await authenticate(context, actors[row.key]); // fresh sign-in: no stored context
    await page.goto("/");
    const state = await settle(page);
    expect(state.status).toBe("resolved");
    const target = row.lands();
    expect(await workspaceLabel(page)).toBe(
      `${target.orgName}, ${target.locName}`,
    );
    // Sam's only context is outside the default tenant: the server redirects to its canonical route.
    if (row.key === "sam") expect(page.url()).toContain(`/r/${TAP.slug}`);
    expect(await switcherLocationIds(page)).toEqual(row.switcher());
  });
}

// ---------------------------------------------------------------------------------------------
// P-2  Every permitted context: workspace identity + the role-dependent surface (Tasks authoring)
// ---------------------------------------------------------------------------------------------
const PERMITTED: Record<string, { p: () => Place; canAuthor: boolean }[]> = {
  jack: [
    { p: () => place.webster, canAuthor: false },
    { p: () => place.nasa, canAuthor: false },
    { p: () => place.lc, canAuthor: false },
  ],
  sam: [{ p: () => place.nasa, canAuthor: false }],
  tom: [{ p: () => place.webster, canAuthor: false }],
  jerry: [
    { p: () => place.webster, canAuthor: false },
    { p: () => place.nasa, canAuthor: false },
  ],
  john: [
    { p: () => place.webster, canAuthor: true },
    { p: () => place.nasa, canAuthor: true },
    { p: () => place.lc, canAuthor: true }, // assistant manager: Tasks authoring is assistant-and-up
  ],
};

for (const [key, rows] of Object.entries(PERMITTED)) {
  test(`P-2 ${key}: each permitted context opens with its own identity and role-correct Tasks surface`, async ({
    page,
    context,
  }) => {
    for (const row of rows) {
      const p = row.p();
      await authenticate(context, actors[key], {
        orgId: p.orgId,
        locId: p.locId,
      });
      await openTasks(page, p.slug);
      expect(await workspaceLabel(page)).toBe(`${p.orgName}, ${p.locName}`);
      const newTask = page.getByRole("button", { name: "New task" });
      if (row.canAuthor) await expect(newTask).toBeVisible();
      else await expect(newTask).toHaveCount(0);
    }
  });
}

test("P-2 John: switching workspace through the switcher re-verifies and changes identity", async ({
  page,
  context,
}) => {
  await authenticate(context, actors.john, {
    orgId: place.webster.orgId,
    locId: place.webster.locId,
  });
  await openTasks(page, MONKS.slug);
  await page
    .getByTestId("context-switcher")
    .getByRole("button", { name: /Switch workspace/ })
    .click();
  await page
    .getByTestId("context-switcher-menu")
    .locator(`[data-location-id="${place.lc.locId}"]`)
    .click();
  await expect
    .poll(() => workspaceLabel(page), { timeout: 60_000 })
    .toBe("Liquor Tap, League City");
  await expect(page).toHaveURL(new RegExp(`/r/${TAP.slug}`));
});

// ---------------------------------------------------------------------------------------------
// P-3  Deep links / URL forgery to a denied context: no data, resolver deny state, recovery offered
// ---------------------------------------------------------------------------------------------
const DENIED: {
  label: string;
  who: "sam" | "tom" | "jerry";
  url: () => string;
  status: Status;
  forbidden: () => string[];
}[] = [
  {
    label: "League City by explicit selection",
    who: "sam",
    url: () => `/r/${TAP.slug}?location=${place.lc.locId}`,
    status: "invalid_context",
    forbidden: () => ["League City"],
  },
  {
    label: "the Monks route (no membership)",
    who: "sam",
    url: () => `/r/${MONKS.slug}`,
    status: "no_access",
    forbidden: () => ["Webster"],
  },
  {
    label: "Webster by explicit selection",
    who: "sam",
    url: () => `/r/${MONKS.slug}?location=${place.webster.locId}`,
    status: "no_access",
    forbidden: () => ["Webster"],
  },
  {
    label: "NASA by explicit selection",
    who: "tom",
    url: () => `/r/${TAP.slug}?location=${place.nasa.locId}`,
    status: "no_access",
    forbidden: () => ["NASA"],
  },
  {
    label: "League City by explicit selection",
    who: "jerry",
    url: () => `/r/${TAP.slug}?location=${place.lc.locId}`,
    status: "invalid_context",
    forbidden: () => ["League City"],
  },
];
for (const row of DENIED) {
  test(`P-3 ${row.who}: ${row.label} is denied (${row.status}) with no workspace`, async ({
    page,
    context,
  }) => {
    await authenticate(context, actors[row.who]);
    await page.goto(row.url());
    const state = await settle(page);
    expect(state.status).toBe(row.status);
    await expectDeniedNoData(page, row.forbidden());
  });
}

// ---------------------------------------------------------------------------------------------
// P-4  Forged / stale persisted context: the server rejects it and offers recovery
// ---------------------------------------------------------------------------------------------
test("P-4 Sam: a forged cookie naming League City is rejected and the saved context can be cleared", async ({
  page,
  context,
}) => {
  await authenticate(context, actors.sam, {
    orgId: place.lc.orgId,
    locId: place.lc.locId,
  });
  await page.goto(`/r/${TAP.slug}`);
  expect((await settle(page)).status).toBe("invalid_context");
  await expectDeniedNoData(page, ["League City"]);
  await page.getByTestId("context-clear-saved").click();
  await expect
    .poll(() => workspaceLabel(page).catch(() => ""), { timeout: 60_000 })
    .toBe("Liquor Tap, NASA");
});

test("P-4 Sam: a cookie naming another tenant's workspace is rejected on this route", async ({
  page,
  context,
}) => {
  await authenticate(context, actors.sam, {
    orgId: place.webster.orgId,
    locId: place.webster.locId,
  });
  await page.goto(`/r/${TAP.slug}`);
  expect((await settle(page)).status).toBe("invalid_context");
  await expectDeniedNoData(page, ["Webster"]);
});

test("P-4 Tom: a malformed context cookie is rejected outright", async ({
  page,
  context,
}) => {
  await authenticate(context, actors.tom, "not-a-valid-context");
  await page.goto(`/r/${MONKS.slug}`);
  expect((await settle(page)).status).toBe("invalid_context");
  await expectDeniedNoData(page, []);
});

// ---------------------------------------------------------------------------------------------
// P-5  John: per-location role. UI and database agree; a runtime downgrade applies on the next request
// ---------------------------------------------------------------------------------------------
async function kioskPairingProbe(p: Place) {
  const r = await actors.john.client.rpc("kiosk_generate_pairing_code", {
    p_location_id: p.locId,
    p_device_name: `RM probe ${p.locName}`,
    p_code_hash: crypto.randomBytes(32).toString("hex"),
  });
  return r.error ? (r.error.code ?? "ERR") : "OK";
}

async function openSettings(page: Page, p: Place) {
  await page.goto(`/r/${p.slug}?tab=settings`);
  expect((await settle(page)).status).toBe("resolved");
  await expect(
    page.getByRole("heading", { name: "Settings", level: 1 }),
  ).toBeVisible({ timeout: 60_000 });
}

test("P-5 John: manager-only Kiosks surface and RPC agree per location (NASA/Webster manager, League City assistant)", async ({
  page,
  context,
}) => {
  const expectations: [Place, boolean][] = [
    [place.webster, true],
    [place.nasa, true],
    [place.lc, false],
  ];
  for (const [p, manager] of expectations) {
    await authenticate(context, actors.john, {
      orgId: p.orgId,
      locId: p.locId,
    });
    await openSettings(page, p);
    const card = page.locator("#settings-kiosks");
    if (manager) await expect(card).toBeVisible({ timeout: 30_000 });
    // B4 re-baseline: by D7 the card is driven by kiosk_list_manageable_locations() (every location the person may manage, loaded
    // asynchronously), so in the League City workspace the card legitimately appears once that list loads. The old
    // toHaveCount(0) passed only if sampled before the list arrived (racy). The contract is: the database list the UI renders
    // from excludes the location, and the RPC refuses it.
    const listed = must(
      await actors.john.client.rpc("kiosk_list_manageable_locations"),
    ).map((row) => row.location_id);
    expect(listed.includes(p.locId)).toBe(manager);
    expect(await kioskPairingProbe(p)).toBe(manager ? "OK" : "42501");
  }
});

test("P-5 John: 'NASA -> staff' at runtime drops NASA only; Webster is unchanged (no sign-out)", async ({
  page,
  context,
}) => {
  must(
    await admin
      .from("location_memberships")
      .update({ role: "staff" })
      .eq("profile_id", actors.john.id)
      .eq("location_id", place.nasa.locId)
      .select("id"),
  );
  try {
    expect(await kioskPairingProbe(place.nasa)).toBe("42501");
    expect(await kioskPairingProbe(place.webster)).toBe("OK");
    await authenticate(context, actors.john, {
      orgId: place.nasa.orgId,
      locId: place.nasa.locId,
    });
    await openTasks(page, TAP.slug);
    await expect(page.getByRole("button", { name: "New task" })).toHaveCount(0);
    await authenticate(context, actors.john, {
      orgId: place.webster.orgId,
      locId: place.webster.locId,
    });
    await openTasks(page, MONKS.slug);
    await expect(page.getByRole("button", { name: "New task" })).toBeVisible();
  } finally {
    must(
      await admin
        .from("location_memberships")
        .update({ role: "manager" })
        .eq("profile_id", actors.john.id)
        .eq("location_id", place.nasa.locId)
        .select("id"),
    );
  }
});

// ---------------------------------------------------------------------------------------------
// P-6  Direct PostgREST with each persona's JWT: the UI is not the only barrier
// ---------------------------------------------------------------------------------------------
for (const key of ["jack", "sam", "tom", "jerry", "john"]) {
  test(`P-6 ${key}: direct API reads and writes honour the same location boundary`, async () => {
    const permitted = new Set(
      (key === "jack" || key === "john"
        ? [place.webster, place.nasa, place.lc]
        : key === "sam"
          ? [place.nasa]
          : key === "tom"
            ? [place.webster]
            : [place.webster, place.nasa]
      ).map((p) => p.locId),
    );
    const everything = [place.webster, place.nasa, place.lc];
    const seen = must(
      await actors[key].client.from("dining_areas").select("location_id"),
    );
    expect(seen.map((r) => r.location_id).sort()).toEqual(
      [...permitted].sort(),
    );
    for (const p of everything) {
      const authorized = await actors[key].client.rpc(
        "tasks_location_authorized",
        {
          p_organization_id: p.orgId,
          p_location_id: p.locId,
        },
      );
      expect(authorized.error).toBeNull();
      expect(authorized.data).toBe(permitted.has(p.locId));
      if (!permitted.has(p.locId)) {
        const before = must(
          await admin
            .from("dining_areas")
            .select("id", { count: "exact" })
            .eq("location_id", p.locId),
        ).length;
        const write = await actors[key].client.from("dining_areas").insert({
          organization_id: p.orgId,
          location_id: p.locId,
          name: "RM forged",
          area_order: 9,
        });
        expect(write.error).not.toBeNull();
        const after = must(
          await admin
            .from("dining_areas")
            .select("id", { count: "exact" })
            .eq("location_id", p.locId),
        ).length;
        expect(after).toBe(before);
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------
// P-7  Revocation mid-session (Jerry loses NASA while a tab is open): fails closed, Webster still works
// ---------------------------------------------------------------------------------------------
test("P-7 Jerry: NASA assignment revoked mid-session fails closed on the very next request; Webster keeps working", async ({
  page,
  context,
}) => {
  await authenticate(context, actors.jerry, {
    orgId: place.nasa.orgId,
    locId: place.nasa.locId,
  });
  await openTasks(page, TAP.slug);
  expect(await workspaceLabel(page)).toBe("Liquor Tap, NASA");
  expect(
    must(await actors.jerry.client.from("dining_areas").select("location_id"))
      .length,
  ).toBe(2);

  must(
    await admin
      .from("location_memberships")
      .update({ active: false })
      .eq("profile_id", actors.jerry.id)
      .eq("location_id", place.nasa.locId)
      .select("id"),
  );
  try {
    // Same JWT, no re-login: the database stops honouring NASA immediately.
    const rows = must(
      await actors.jerry.client.from("dining_areas").select("location_id"),
    );
    expect(rows.map((r) => r.location_id)).toEqual([place.webster.locId]);
    const auth = await actors.jerry.client.rpc("tasks_location_authorized", {
      p_organization_id: place.nasa.orgId,
      p_location_id: place.nasa.locId,
    });
    expect(auth.data).toBe(false);

    // The open tab's next request is rejected by the server (stale stored context).
    await page.reload();
    const state = await settle(page);
    expect(["invalid_context", "no_access"]).toContain(state.status);
    await expectDeniedNoData(page, []);

    // Webster, an explicit choice, still resolves.
    await page.goto(`/r/${MONKS.slug}?location=${place.webster.locId}`);
    expect((await settle(page)).status).toBe("resolved");
    expect(await workspaceLabel(page)).toBe("Monks, Webster");
  } finally {
    must(
      await admin
        .from("location_memberships")
        .update({ active: true })
        .eq("profile_id", actors.jerry.id)
        .eq("location_id", place.nasa.locId)
        .select("id"),
    );
  }
});

// ---------------------------------------------------------------------------------------------
// P-8  A location created after the seed: nobody without Overall authority gains access
// ---------------------------------------------------------------------------------------------
test("P-8 new location: John (no Overall role) has no access; the Overall Owner does", async ({
  page,
  context,
}) => {
  const created = must(
    await admin
      .from("locations")
      .insert({
        organization_id: place.nasa.orgId,
        name: "Galveston",
        time_zone: "America/Chicago",
      })
      .select("id")
      .single(),
  );
  galveston = {
    orgId: place.nasa.orgId,
    slug: TAP.slug,
    orgName: TAP.name,
    locId: created.id,
    locName: "Galveston",
  };
  must(
    await admin.from("location_module_configs").insert(
      MODULES.map((module_key) => ({
        location_id: galveston!.locId,
        module_key,
        is_enabled: true,
      })),
    ),
  );

  // John: still exactly his three workspaces; an explicit selection of the new one is refused.
  await authenticate(context, actors.john, {
    orgId: place.webster.orgId,
    locId: place.webster.locId,
  });
  await page.goto(`/r/${MONKS.slug}`);
  expect((await settle(page)).status).toBe("resolved");
  expect(await switcherLocationIds(page)).toEqual(
    sorted(place.webster, place.nasa, place.lc),
  );
  await authenticate(context, actors.john);
  await page.goto(`/r/${TAP.slug}?location=${galveston.locId}`);
  expect((await settle(page)).status).toBe("invalid_context");
  await expectDeniedNoData(page, ["Galveston"]);
  expect(
    (
      await actors.john.client.rpc("tasks_location_authorized", {
        p_organization_id: galveston.orgId,
        p_location_id: galveston.locId,
      })
    ).data,
  ).toBe(false);

  // The Overall Owner (no organization membership) reaches it.
  await authenticate(context, actors.overall);
  await page.goto(`/r/${TAP.slug}?location=${galveston.locId}`);
  expect((await settle(page)).status).toBe("resolved");
  expect(await workspaceLabel(page)).toBe("Liquor Tap, Galveston");
});

// ---------------------------------------------------------------------------------------------
// P-9  Service-role Team routes (X-08 / D-11 stale tab / V9-T): the tenant comes from the REQUEST
//      the tab sends and is authorised against LIVE membership, never from the cookie, and one
//      organization's authority must not reach into another organization.
// ---------------------------------------------------------------------------------------------
type TeamCall = { slug: string; target: string; reason?: string };

async function team(
  context: BrowserContext,
  route: "deactivate" | "reactivate",
  call: TeamCall,
) {
  const res = await context.request.post("/api/team/" + route, {
    data: {
      restaurantSlug: call.slug,
      targetProfileId: call.target,
      reason: call.reason ?? "role matrix probe",
    },
  });
  return res.status();
}

async function membershipActive(
  orgId: string,
  profileId: string,
): Promise<boolean | null> {
  const r = await admin
    .from("memberships")
    .select("active")
    .eq("organization_id", orgId)
    .eq("profile_id", profileId)
    .maybeSingle();
  return r.data ? r.data.active : null;
}

async function banned(profileId: string): Promise<boolean> {
  const u = must(await admin.auth.admin.getUserById(profileId)).user;
  if (!u) throw Error("auth user missing");
  return !!u.banned_until && new Date(u.banned_until).getTime() > Date.now();
}

test("P-9a authorization negatives: wrong organization, foreign target, location-only manager, staff, self", async ({
  context,
}) => {
  // The Monks GM holds NO Liquor Tap membership: a Liquor Tap request is refused outright.
  await authenticate(context, actors.gm, {
    orgId: place.webster.orgId,
    locId: place.webster.locId,
  });
  expect(
    await team(context, "deactivate", {
      slug: TAP.slug,
      target: actors.sam.id,
    }),
  ).toBe(401);
  // A foreign organization's member is not a member of THIS organization: not found, never touched.
  expect(
    await team(context, "deactivate", {
      slug: MONKS.slug,
      target: actors.sam.id,
    }),
  ).toBe(404);
  expect(await membershipActive(place.nasa.orgId, actors.sam.id)).toBe(true);
  expect(await banned(actors.sam.id)).toBe(false);
  // Own account.
  expect(
    await team(context, "deactivate", {
      slug: MONKS.slug,
      target: actors.gm.id,
    }),
  ).toBe(403);

  // V9-T evidence at the API: a LOCATION manager (organization role server) has no Team authority.
  await authenticate(context, actors.john, {
    orgId: place.nasa.orgId,
    locId: place.nasa.locId,
  });
  expect(
    await team(context, "deactivate", {
      slug: TAP.slug,
      target: actors.sam.id,
    }),
  ).toBe(403);
  expect(await membershipActive(place.nasa.orgId, actors.sam.id)).toBe(true);

  // Staff.
  await authenticate(context, actors.tom, {
    orgId: place.webster.orgId,
    locId: place.webster.locId,
  });
  expect(
    await team(context, "deactivate", {
      slug: MONKS.slug,
      target: actors.jerry.id,
    }),
  ).toBe(403);
  expect(await membershipActive(place.webster.orgId, actors.jerry.id)).toBe(
    true,
  );
});

test("P-9b a stale tab acts on the workspace it displays, never on the cookie's", async ({
  context,
}) => {
  // The GM's stored context points at Webster; the (stale) tab is showing Liquor Tap, where the GM has no authority.
  await authenticate(context, actors.gm, {
    orgId: place.webster.orgId,
    locId: place.webster.locId,
  });
  expect(
    await team(context, "deactivate", {
      slug: TAP.slug,
      target: actors.vic.id,
    }),
  ).toBe(401);
  expect(await membershipActive(place.nasa.orgId, actors.vic.id)).toBe(true);
  expect(await membershipActive(place.webster.orgId, actors.vic.id)).toBe(true);
});

test("P-9c deactivating a member in ONE organization must not lock them out of ANOTHER", async ({
  page,
  context,
}) => {
  await authenticate(context, actors.gm, {
    orgId: place.webster.orgId,
    locId: place.webster.locId,
  });
  try {
    expect(
      await team(context, "deactivate", {
        slug: MONKS.slug,
        target: actors.vic.id,
      }),
    ).toBe(200);
    // The Monks membership is gone ...
    expect(await membershipActive(place.webster.orgId, actors.vic.id)).toBe(
      false,
    );
    // ... and the Liquor Tap membership, which the Monks GM has no authority over, is untouched ...
    expect(await membershipActive(place.nasa.orgId, actors.vic.id)).toBe(true);
    // ... including the person's ability to sign in at all.
    expect(await banned(actors.vic.id)).toBe(false);
    await authenticate(context, actors.vic, {
      orgId: place.nasa.orgId,
      locId: place.nasa.locId,
    });
    await page.goto("/r/" + TAP.slug);
    expect((await settle(page)).status).toBe("resolved");
    expect(await workspaceLabel(page)).toBe("Liquor Tap, NASA");
  } finally {
    await authenticate(context, actors.gm, {
      orgId: place.webster.orgId,
      locId: place.webster.locId,
    });
    await team(context, "reactivate", {
      slug: MONKS.slug,
      target: actors.vic.id,
    });
  }
  expect(await membershipActive(place.webster.orgId, actors.vic.id)).toBe(true);
});

test("P-9d B4 re-baseline: a person deactivated EVERYWHERE loses membership and credential but gets NO Auth write (B1/F-5 contract: no global ban)", async ({
  context,
}) => {
  await authenticate(context, actors.gm, {
    orgId: place.webster.orgId,
    locId: place.webster.locId,
  });
  // Tom belongs to Monks only: deactivating him removes his last active membership.
  expect(
    await team(context, "deactivate", {
      slug: MONKS.slug,
      target: actors.tom.id,
    }),
  ).toBe(200);
  try {
    expect(await membershipActive(place.webster.orgId, actors.tom.id)).toBe(
      false,
    );
    // B1/F-5 contract: the transactional RPC never writes Auth; access ends via membership + credential.
    expect(await banned(actors.tom.id)).toBe(false);
  } finally {
    expect(
      await team(context, "reactivate", {
        slug: MONKS.slug,
        target: actors.tom.id,
      }),
    ).toBe(200);
  }
  expect(await membershipActive(place.webster.orgId, actors.tom.id)).toBe(true);
  expect(await banned(actors.tom.id)).toBe(false);
});
