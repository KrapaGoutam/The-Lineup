import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

export const localEnv = {
  url:
    process.env.LOCAL_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "http://127.0.0.1:54321",
  anon:
    process.env.LOCAL_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  secret:
    process.env.LOCAL_SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

export type TestUser = {
  id: string;
  name: string;
  email: string;
  client: SupabaseClient<Database>;
};

export function must<
  R extends { data: unknown; error: { message: string } | null },
>(r: R): R["data"] {
  if (r.error) throw Error(r.error.message);
  return r.data;
}

export type InventoryRecipesFixture = {
  run: string;
  admin: SupabaseClient<Database>;
  org: { id: string; name: string; slug: string };
  foreignOrg: { id: string; name: string; slug: string };
  locA: string;
  locB: string;
  foreignLoc: string;
  owner: TestUser;
  managerA: TestUser;
  managerB: TestUser;
  staffA: TestUser;
  overallManager: TestUser;
  foreignUser: TestUser;
  teardown: () => Promise<void>;
};

export async function createInventoryRecipesFixture(): Promise<InventoryRecipesFixture> {
  if (
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(localEnv.url) ||
    !localEnv.secret ||
    !localEnv.anon
  ) {
    throw Error("Disposable loopback Supabase credentials required");
  }

  const admin = createClient<Database>(localEnv.url, localEnv.secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const run = crypto.randomUUID().slice(0, 8);
  const users: TestUser[] = [];

  async function makeUser(key: string, name: string) {
    const email = `inv-rec-${run}-${key}@harness.invalid`;
    const password = crypto.randomBytes(24).toString("base64url");
    const result = must(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    );
    const id = result.user!.id;
    must(await admin.from("profiles").insert({ id, display_name: name }));
    const client = createClient<Database>(localEnv.url, localEnv.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    must(await client.auth.signInWithPassword({ email, password }));
    const user = { id, name, email, client };
    users.push(user);
    return user;
  }

  const owner = await makeUser("owner", `Owen Owner ${run}`);
  const managerA = await makeUser("mgr-a", `Maya Manager A ${run}`);
  const managerB = await makeUser("mgr-b", `Max Manager B ${run}`);
  const staffA = await makeUser("staff-a", `Sam Staff A ${run}`);
  const overallManager = await makeUser("overall-mgr", `Olive Overall ${run}`);
  const foreignUser = await makeUser("foreign", `Felix Foreign ${run}`);

  const org = must(
    await admin
      .from("organizations")
      .insert({
        name: `InvRec ${run}`,
        slug: `inv-rec-${run}`,
        created_by: owner.id,
      })
      .select()
      .single(),
  )!;

  const foreignOrg = must(
    await admin
      .from("organizations")
      .insert({
        name: `Foreign ${run}`,
        slug: `foreign-${run}`,
        created_by: foreignUser.id,
      })
      .select()
      .single(),
  )!;

  const locations = must(
    await admin
      .from("locations")
      .insert([
        {
          organization_id: org.id,
          name: "Location A",
          time_zone: "America/Chicago",
        },
        {
          organization_id: org.id,
          name: "Location B",
          time_zone: "America/Chicago",
        },
        {
          organization_id: foreignOrg.id,
          name: "Foreign Loc",
          time_zone: "America/Chicago",
        },
      ])
      .select(),
  )!;

  const locA = locations.find((l) => l.name === "Location A")!.id;
  const locB = locations.find((l) => l.name === "Location B")!.id;
  const foreignLoc = locations.find((l) => l.name === "Foreign Loc")!.id;

  // Tenant memberships:
  // owner -> 'owner'
  // managerA, managerB, staffA -> 'server'
  must(
    await admin.from("memberships").insert([
      {
        organization_id: org.id,
        profile_id: owner.id,
        roles: ["owner"],
      },
      {
        organization_id: org.id,
        profile_id: managerA.id,
        roles: ["shift_manager"],
      },
      {
        organization_id: org.id,
        profile_id: managerB.id,
        roles: ["shift_manager"],
      },
      {
        organization_id: org.id,
        profile_id: staffA.id,
        roles: ["server"],
      },
      {
        organization_id: foreignOrg.id,
        profile_id: foreignUser.id,
        roles: ["owner"],
      },
    ]),
  );

  // Location memberships:
  // managerA: manager at A, staff at B
  // managerB: manager at B, staff at A
  // staffA: staff at A
  must(
    await admin.from("location_memberships").insert([
      {
        location_id: locA,
        profile_id: managerA.id,
        role: "manager",
      },
      {
        location_id: locB,
        profile_id: managerA.id,
        role: "staff",
      },
      {
        location_id: locB,
        profile_id: managerB.id,
        role: "manager",
      },
      {
        location_id: locA,
        profile_id: managerB.id,
        role: "staff",
      },
      {
        location_id: locA,
        profile_id: staffA.id,
        role: "staff",
      },
      {
        location_id: foreignLoc,
        profile_id: foreignUser.id,
        role: "manager",
      },
    ]),
  );

  // Overall roles:
  // overallManager has NO row in memberships, only overall_roles
  must(
    await admin.from("overall_roles").insert({
      profile_id: overallManager.id,
      role: "manager",
    }),
  );

  // Enable bar_inventory and recipes modules at all locations
  must(
    await admin.from("location_module_configs").insert([
      {
        location_id: locA,
        module_key: "bar_inventory",
        is_enabled: true,
      },
      {
        location_id: locA,
        module_key: "recipes",
        is_enabled: true,
      },
      {
        location_id: locB,
        module_key: "bar_inventory",
        is_enabled: true,
      },
      {
        location_id: locB,
        module_key: "recipes",
        is_enabled: true,
      },
      {
        location_id: foreignLoc,
        module_key: "bar_inventory",
        is_enabled: true,
      },
      {
        location_id: foreignLoc,
        module_key: "recipes",
        is_enabled: true,
      },
    ]),
  );

  return {
    run,
    admin,
    org: { id: org.id, name: org.name, slug: org.slug },
    foreignOrg: {
      id: foreignOrg.id,
      name: foreignOrg.name,
      slug: foreignOrg.slug,
    },
    locA,
    locB,
    foreignLoc,
    owner,
    managerA,
    managerB,
    staffA,
    overallManager,
    foreignUser,
    teardown: async () => {
      // Clean up in reverse dependency order
      await admin
        .from("overall_roles")
        .delete()
        .in(
          "profile_id",
          users.map((u) => u.id),
        );
      await admin
        .from("location_module_configs")
        .delete()
        .in("location_id", [locA, locB, foreignLoc]);

      // Recipe tables
      await admin
        .from("bar_recipe_garnishes")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("bar_recipe_steps")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("bar_recipe_ingredients")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("bar_recipe_variants")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("bar_recipes")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("bar_recipe_categories")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);

      // Inventory operational tables
      await admin
        .from("inventory_order_draft_items")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("inventory_order_drafts")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("inventory_adjustments")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("inventory_stock")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("inventory_date_lots")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("inventory_freshness_rules")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("inventory_saved_views")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);

      // Inventory catalog tables
      await admin
        .from("inventory_products")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("inventory_subcategories")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("inventory_categories")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("inventory_vendors")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);

      // Location & Organization tables
      await admin
        .from("location_memberships")
        .delete()
        .in("location_id", [locA, locB, foreignLoc]);
      await admin.from("locations").delete().in("id", [locA, locB, foreignLoc]);
      await admin
        .from("memberships")
        .delete()
        .in("organization_id", [org.id, foreignOrg.id]);
      await admin
        .from("organizations")
        .delete()
        .in("id", [org.id, foreignOrg.id]);

      for (const u of users) {
        await admin.from("profiles").delete().eq("id", u.id);
        await admin.auth.admin.deleteUser(u.id);
      }
    },
  };
}
