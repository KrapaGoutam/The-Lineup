import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminClient, env } from "./harness";
import { countDev, diffCounts, cleanupFixtures } from "./dev-counts";
import { CONFIGURABLE_MODULE_KEYS } from "../../../src/features/modules/domain/module-registry";

export async function checked<T>(
  operation: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const result = await operation;
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function verifyDevApp(base: string) {
  const html = await (await fetch(base)).text();
  let corpus = html;
  // App-router route chunks can be referenced by the RSC payload rather than
  // an initial script tag. Inspect both, before creating any fixture/session.
  const chunks = new Set([
    ...[...html.matchAll(/src="(\/_next\/[^" ]+\.js[^" ]*)"/g)].map(
      (match) => match[1],
    ),
    ...[...html.matchAll(/static\/chunks\/[^"\\\s]+\.js/g)].map(
      (match) => `/_next/${match[0]}`,
    ),
  ]);
  for (const chunk of [...chunks].slice(0, 50))
    corpus += await (await fetch(new URL(chunk, base))).text();
  if (
    corpus.includes("ftadewtkjlaotfdvtjcv") ||
    !corpus.includes("opmujepkemwcdxxorhfd")
  )
    throw new Error(
      "Browser app is not verified DEV; refusing fixtures/authentication",
    );
}

export async function createNavigationFixture() {
  const admin = adminClient();
  const run = crypto.randomBytes(6).toString("hex");
  const slug = `v2nav-${run}`;
  const orgIds: string[] = [];
  const userIds: string[] = [];
  const locationIds: string[] = [];
  const users: Record<
    string,
    { id: string; pin: string; email: string; client: SupabaseClient }
  > = {};
  const locations: Record<string, string> = {};
  const pepper = process.env.APP_PIN_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("DEV pepper unavailable");
  const hmac = (value: string) =>
    crypto.createHmac("sha256", pepper).update(value).digest("hex");
  async function counts() {
    const baseline = await countDev(admin);
    const result = await admin
      .from("location_module_configs")
      .select("*", { count: "exact", head: true });
    if (result.error) throw new Error("Configuration count unavailable");
    return { ...baseline, location_module_configs: result.count ?? 0 };
  }
  const before = await counts();
  async function teardown() {
    for (const user of Object.values(users)) await user.client.auth.signOut();
    if (locationIds.length)
      await checked(
        admin
          .from("location_module_configs")
          .delete()
          .in("location_id", locationIds),
      );
    // Delete disposable tenants through their declared cascade contract. Never
    // delete audit rows or bypass append-only lifecycle restrictions directly.
    if (orgIds.length)
      await checked(admin.from("organizations").delete().in("id", orgIds));
    const errors = await cleanupFixtures(admin, { orgIds: [], userIds });
    if (errors.length)
      throw new Error(`Synthetic teardown failed: ${errors.join(", ")}`);
    const after = await counts();
    const drift = diffCounts(before, after);
    const configDrift =
      before.location_module_configs !== after.location_module_configs;
    console.info(
      "Navigation DEV counts",
      JSON.stringify({
        before,
        after,
        drift,
        trackedOrganizations: orgIds,
        trackedLocations: locationIds,
        trackedUsers: userIds,
      }),
    );
    if (Object.keys(drift).length || configDrift)
      throw new Error("Synthetic fixture count drift");
    for (const [table, ids] of [
      ["organizations", orgIds],
      ["locations", locationIds],
      ["profiles", userIds],
    ] as const) {
      const remaining = await checked(
        admin
          .from(table)
          .select("id")
          .in("id", [...ids]),
      );
      if (remaining?.length) throw new Error(`Synthetic ${table} residue`);
    }
  }
  try {
    const usedPins = new Set<string>();
    for (const key of ["owner", "manager", "staff"]) {
      let pin: string;
      do {
        pin = String(crypto.randomInt(1000, 10000));
      } while (usedPins.has(pin));
      usedPins.add(pin);
      const email = `${slug}-${key}@harness.invalid`;
      const created = await admin.auth.admin.createUser({
        email,
        password: crypto.randomBytes(22).toString("hex"),
        email_confirm: true,
      });
      if (created.error || !created.data.user)
        throw new Error("Synthetic auth creation failed");
      const id = created.data.user.id;
      userIds.push(id);
      await checked(
        admin
          .from("profiles")
          .insert({ id, display_name: `Navigation ${key}` }),
      );
      users[key] = {
        id,
        pin,
        email,
        client: createClient(env.url, env.anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
      };
    }
    for (const suffix of ["a", "b"]) {
      const org = await checked(
        admin
          .from("organizations")
          .insert({
            name: `Navigation ${suffix} ${run}`,
            slug: suffix === "a" ? slug : `${slug}-b`,
            created_by: users.owner.id,
          })
          .select("id")
          .single(),
      );
      if (!org) throw new Error("Synthetic tenant missing");
      orgIds.push(org.id);
      await checked(
        admin.from("memberships").insert(
          (suffix === "a" ? ["owner", "manager", "staff"] : ["owner"]).map(
            (key) => ({
              organization_id: org.id,
              profile_id: users[key].id,
              roles: [
                key === "owner"
                  ? "owner"
                  : key === "manager"
                    ? "general_manager"
                    : "server",
              ],
              active: true,
            }),
          ),
        ),
      );
    }
    for (const [name, org, active, archived] of [
      ["A", orgIds[0], true, false],
      ["B", orgIds[0], true, false],
      ["Missing", orgIds[0], true, false],
      ["Disabled", orgIds[0], true, false],
      ["Inactive", orgIds[0], false, false],
      ["Archived", orgIds[0], false, true],
      ["C", orgIds[1], true, false],
    ] as const) {
      const location = await checked(
        admin
          .from("locations")
          .insert({
            organization_id: org,
            name,
            time_zone: "America/Chicago",
            active,
            archived_at: archived ? new Date().toISOString() : null,
          })
          .select("id")
          .single(),
      );
      if (!location) throw new Error("Synthetic location missing");
      locations[name] = location.id;
      locationIds.push(location.id);
    }
    await checked(
      admin.from("location_memberships").insert(
        ["A", "B", "Missing", "Disabled"].map((name) => ({
          profile_id: users.staff.id,
          location_id: locations[name],
          role: "staff",
          active: true,
        })),
      ),
    );
    await checked(
      admin.from("location_memberships").insert([
        ...["A", "B", "Missing", "Disabled", "C"].map((name) => ({
          profile_id: users.owner.id,
          location_id: locations[name],
          role: "manager",
          active: true,
        })),
        ...["A", "B", "Missing", "Disabled"].map((name) => ({
          profile_id: users.manager.id,
          location_id: locations[name],
          role: "manager",
          active: true,
        })),
      ]),
    );
    for (const key of ["owner", "manager", "staff"]) {
      const user = users[key];
      const password = hmac(`authpw:${orgIds[0]}:${user.pin}`);
      const updated = await admin.auth.admin.updateUserById(user.id, {
        password,
      });
      if (updated.error) throw new Error("Synthetic credential setup failed");
      await checked(
        admin.from("passcode_credentials").insert({
          organization_id: orgIds[0],
          profile_id: user.id,
          locator: hmac(`${orgIds[0]}:${user.pin}`),
          synthetic_email: user.email,
          active: true,
        }),
      );
      const signed = await user.client.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (signed.error) throw new Error("Synthetic JWT sign-in failed");
    }
    const rows = [
      ...(
        [
          ["tasks", true],
          ["table_allocation", true],
          ["bar_inventory", true],
          ["recipes", false],
          ["team", false],
        ] as const
      ).map(([module_key, is_enabled]) => ({
        location_id: locations.A,
        module_key,
        is_enabled,
      })),
      ...(
        [
          ["tasks", true],
          ["table_allocation", false],
          ["bar_inventory", false],
          ["recipes", true],
          ["team", false],
        ] as const
      ).map(([module_key, is_enabled]) => ({
        location_id: locations.B,
        module_key,
        is_enabled,
      })),
      ...["Disabled", "C"].flatMap((name) =>
        CONFIGURABLE_MODULE_KEYS.map((module_key) => ({
          location_id: locations[name],
          module_key,
          is_enabled: false,
        })),
      ),
    ];
    await checked(admin.from("location_module_configs").insert(rows));
    const stored = await checked(
      admin
        .from("location_module_configs")
        .select("location_id,module_key,is_enabled")
        .in("location_id", locationIds),
    );
    if (stored?.length !== rows.length)
      throw new Error("Synthetic config readback mismatch");
    console.info(
      "Navigation synthetic persisted scenarios",
      JSON.stringify(stored),
    );
    return { admin, slug, orgIds, users, locations, before, teardown };
  } catch (error) {
    await teardown();
    throw error;
  }
}
