/** R2-A / RC-019/020/027-046/110-125/133/155. Real JWTs, DEV only.
 * Creates only Recipes R2 organizations, never uses existing harness data.
 * Metadata and actual Storage files are verified absent during teardown.
 */
import { randomBytes, randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminClient, env } from "./support/harness";

type Actor = { id: string; client: SupabaseClient };
type Saved = {
  id: string;
  slug: string;
  version: number;
  recipe_number: number;
};
const admin = adminClient();
const org = randomUUID();
const foreignOrg = randomUUID();
const run = randomUUID();
const actors: Actor[] = [];
const organizations: string[] = [];
const paths = new Set<string>();
let manager: Actor, staff: Actor, inactive: Actor, foreign: Actor;
let category: string, fallback: string, spare: string, drink: Saved;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(env.url, env.anonKey, options);

function payload(
  number = 23,
  name = "R2 Synthetic Drink",
  categoryId = category,
) {
  return {
    recipe_number: number,
    name,
    category_id: categoryId,
    variants: {
      perfect: {
        ingredients: [
          { ingredient_name: "Synthetic citrus", amount: "Splash" },
        ],
        steps: [{ instruction: "Combine synthetic ingredients" }],
        garnishes: [{ name: "Synthetic peel" }],
      },
      house: { method: "Stir", tips: "Synthetic House notes" },
    },
  };
}
async function actor(label: string): Promise<Actor> {
  const password = randomBytes(24).toString("base64url");
  const email = `recipes-r2-${run}-${label}@harness.invalid`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(`Create actor: ${created.error?.message}`);
  const result = {
    id: created.data.user.id,
    client: createClient(env.url, env.anonKey, options),
  };
  actors.push(result);
  const profile = await admin
    .from("profiles")
    .insert({ id: result.id, display_name: `Recipes R2 ${label}` });
  if (profile.error) throw new Error(profile.error.message);
  const login = await result.client.auth.signInWithPassword({
    email,
    password,
  });
  if (login.error) throw new Error(login.error.message);
  return result;
}
async function save(
  as: Actor,
  body = payload(),
  existing: Saved | null = null,
  organization = org,
) {
  return as.client.rpc("bar_recipe_save", {
    p_organization_id: organization,
    p_recipe_id: existing?.id ?? null,
    p_expected_version: existing?.version ?? null,
    p_payload: body,
  });
}
async function archive(archived: boolean) {
  const result = await manager.client.rpc("bar_recipe_set_archived", {
    p_organization_id: org,
    p_recipe_id: drink.id,
    p_expected_version: drink.version,
    p_archived: archived,
    p_category_id: null,
  });
  expect(result.error).toBeNull();
  drink = result.data as Saved;
}
async function createCategory(name: string) {
  const result = await manager.client.rpc("bar_recipe_category_save", {
    p_organization_id: org,
    p_category_id: null,
    p_expected_version: null,
    p_name: name,
  });
  expect(result.error).toBeNull();
  return result.data.id as string;
}
const image = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==", "base64");
const storage = (as: Actor) => as.client.storage.from("recipe-images");
async function snapshot() {
  const result = await admin
    .from("bar_recipes")
    .select(
      "*,bar_recipe_variants(*,bar_recipe_ingredients(*),bar_recipe_steps(*),bar_recipe_garnishes(*))",
    )
    .eq("id", drink.id)
    .single();
  expect(result.error).toBeNull();
  return result.data;
}

beforeAll(async () => {
  manager = await actor("manager");
  staff = await actor("staff");
  inactive = await actor("inactive");
  foreign = await actor("foreign");
  for (const [id, owner] of [
    [org, manager.id],
    [foreignOrg, foreign.id],
  ]) {
    const result = await admin.from("organizations").insert({
      id,
      name: `Recipes R2 ${run}`,
      slug: `recipes-r2-${id}`,
      created_by: owner,
    });
    if (result.error) throw new Error(result.error.message);
    organizations.push(id);
  }
  const members = await admin.from("memberships").insert([
    {
      organization_id: org,
      profile_id: manager.id,
      roles: ["general_manager"],
      active: true,
    },
    {
      organization_id: org,
      profile_id: staff.id,
      roles: ["server"],
      active: true,
    },
    {
      organization_id: org,
      profile_id: inactive.id,
      roles: ["shift_manager"],
      active: false,
    },
    {
      organization_id: foreignOrg,
      profile_id: foreign.id,
      roles: ["owner"],
      active: true,
    },
  ]);
  if (members.error) throw new Error(members.error.message);
  category = await createCategory("Synthetic Category");
  spare = await createCategory("Empty Category");
  const fb = await admin
    .from("bar_recipe_categories")
    .insert({
      organization_id: org,
      name: "Others",
      slug: "others",
      is_fallback: true,
      created_by: manager.id,
    })
    .select("id")
    .single();
  if (fb.error) throw new Error(fb.error.message);
  fallback = fb.data.id;
});

afterAll(async () => {
  // Use the Storage API for backing files; delete only this run's exact paths.
  if (paths.size) {
    const removed = await admin.storage
      .from("recipe-images")
      .remove([...paths]);
    expect(removed.error).toBeNull();
  }
  if (drink) {
    const objects = await admin.storage
      .from("recipe-images")
      .list(`${org}/${drink.id}`);
    expect(objects.error).toBeNull();
    expect(objects.data).toEqual([]);
    console.log(
      "R2-A Storage cleanup: 0 objects/orphans in synthetic recipe folder",
    );
  }
  for (const id of organizations) {
    const removed = await admin
      .from("organizations")
      .delete()
      .eq("id", id)
      .eq("slug", `recipes-r2-${id}`);
    expect(removed.error).toBeNull();
  }
  for (const table of [
    "bar_recipes",
    "bar_recipe_categories",
    "bar_recipe_variants",
    "bar_recipe_ingredients",
    "bar_recipe_steps",
    "bar_recipe_garnishes",
  ]) {
    const result = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .in("organization_id", [org, foreignOrg]);
    expect(result.error).toBeNull();
    expect(result.count).toBe(0);
  }
  for (const user of actors) {
    await user.client.auth.signOut();
    const profile = await admin.from("profiles").delete().eq("id", user.id);
    expect(profile.error).toBeNull();
    const removed = await admin.auth.admin.deleteUser(user.id);
    expect(removed.error).toBeNull();
  }
  console.log(
    "R2-A DB cleanup: 0 synthetic rows across all six Recipes tables",
  );
});

describe("hosted DEV management", () => {
  it("creates both variants, suffixes collisions, renumbers and preserves slug", async () => {
    const created = await save(manager);
    expect(created.error).toBeNull();
    drink = created.data as Saved;
    expect(drink.slug).toBe("r2-synthetic-drink");
    const colliding = await save(manager, payload(24));
    expect(colliding.error).toBeNull();
    expect(colliding.data.slug).toBe("r2-synthetic-drink-2");
    const id = drink.id,
      slug = drink.slug;
    const edited = await save(manager, payload(38, "Renamed Synthetic"), drink);
    expect(edited.error).toBeNull();
    drink = edited.data as Saved;
    expect(drink).toMatchObject({ id, slug, recipe_number: 38, version: 2 });
    expect((await snapshot()).bar_recipe_variants).toHaveLength(2);
    const duplicate = await save(manager, payload(38));
    expect(duplicate.error?.code).toBe("23505");
    expect(JSON.parse(duplicate.error!.details)).toMatchObject({
      kind: "duplicate",
      field: "recipe_number",
      existing_id: id,
      existing_label: "38 Renamed Synthetic",
    });
  });
  it("rejects stale/invalid children without changing any saved content", async () => {
    const before = await snapshot();
    const stale = await save(manager, payload(39), { ...drink, version: 1 });
    expect(stale.error?.code).toBe("PT409");
    expect(JSON.parse(stale.error!.details)).toMatchObject({
      kind: "stale",
      current_version: drink.version,
    });
    const body = payload(39);
    body.variants.perfect.ingredients[0].ingredient_name = "";
    const invalid = await save(manager, body, drink);
    expect(invalid.error?.code).toBe("22023");
    expect(await snapshot()).toEqual(before);
  });
  it("denies Staff, inactive management, foreign organization and direct writes", async () => {
    for (const user of [staff, inactive, foreign])
      expect((await save(user)).error?.code).toBe("42501");
    expect(
      (await save(manager, payload(), drink, foreignOrg)).error?.code,
    ).toBe("42501");
    const foreignCategory = await foreign.client.rpc(
      "bar_recipe_category_save",
      {
        p_organization_id: foreignOrg,
        p_category_id: null,
        p_expected_version: null,
        p_name: "Foreign",
      },
    );
    expect(foreignCategory.error).toBeNull();
    expect(
      (
        await save(
          manager,
          payload(38, "Invalid", foreignCategory.data.id),
          drink,
        )
      ).error?.code,
    ).toBe("22023");
    expect(
      (
        await manager.client
          .from("bar_recipes")
          .update({ name: "Direct" })
          .eq("id", drink.id)
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await anon.rpc("bar_recipe_save", {
          p_organization_id: org,
          p_recipe_id: null,
          p_expected_version: null,
          p_payload: payload(),
        })
      ).error,
    ).not.toBeNull();
  });
  it("enforces category ordering, fallback rules and inactive-current retention", async () => {
    const rename = await manager.client.rpc("bar_recipe_category_save", {
      p_organization_id: org,
      p_category_id: fallback,
      p_expected_version: 1,
      p_name: "Miscellaneous",
    });
    expect(rename.error).toBeNull();
    const reorder = await manager.client.rpc("bar_recipe_category_reorder", {
      p_organization_id: org,
      p_ordered_ids: [spare, category],
    });
    expect(reorder.error).toBeNull();
    expect(
      (
        await manager.client.rpc("bar_recipe_category_reorder", {
          p_organization_id: org,
          p_ordered_ids: [fallback, spare, category],
        })
      ).error?.code,
    ).toBe("22023");
    expect(
      (
        await manager.client.rpc("bar_recipe_category_set_active", {
          p_organization_id: org,
          p_category_id: fallback,
          p_expected_version: 2,
          p_active: false,
        })
      ).error?.code,
    ).toBe("22023");
    expect(
      (
        await manager.client.rpc("bar_recipe_category_set_active", {
          p_organization_id: org,
          p_category_id: category,
          p_expected_version: 2,
          p_active: false,
        })
      ).error?.code,
    ).toBe("22023");
    expect(
      (
        await manager.client.rpc("bar_recipe_category_set_active", {
          p_organization_id: org,
          p_category_id: spare,
          p_expected_version: 2,
          p_active: false,
        })
      ).error,
    ).toBeNull();
    expect(
      (await save(manager, payload(38, "Other inactive", spare), drink)).error
        ?.code,
    ).toBe("22023");
    // Legacy inactive-current fixture: privileged setup only, then real JWT save.
    expect(
      (
        await admin
          .from("bar_recipes")
          .update({ category_id: spare })
          .eq("id", drink.id)
      ).error,
    ).toBeNull();
    const retained = await save(manager, payload(38, "Retained", spare), drink);
    expect(retained.error).toBeNull();
    drink = retained.data as Saved;
    const moved = await save(manager, payload(38, "Restored category"), drink);
    expect(moved.error).toBeNull();
    drink = moved.data as Saved;
  });
  it("archives and restores with attribution and Staff visibility", async () => {
    await archive(true);
    expect(
      (await staff.client.from("bar_recipes").select("id").eq("id", drink.id))
        .data,
    ).toEqual([]);
    expect((await save(manager, payload(38), drink)).error?.code).toBe("22023");
    await archive(false);
    expect(
      (await staff.client.from("bar_recipes").select("id").eq("id", drink.id))
        .data,
    ).toHaveLength(1);
    expect(await snapshot()).toMatchObject({
      is_active: true,
      archived_at: null,
      archived_by: null,
      updated_by: manager.id,
    });
  });
});

describe("hosted DEV Storage using tiny synthetic objects", () => {
  it("allows management INSERT/DELETE and Staff active SELECT, denies Staff writes and foreign access", async () => {
    const path = `${org}/${drink.id}/${randomUUID()}.jpg`;
    paths.add(path);
    expect(
      (
        await storage(manager).upload(path, image, {
          contentType: "image/jpeg",
          upsert: false,
        })
      ).error,
    ).toBeNull();
    expect((await storage(staff).download(path)).error).toBeNull();
    expect((await storage(staff).createSignedUrl(path, 60)).error).toBeNull();
    const denied = `${org}/${drink.id}/${randomUUID()}.jpg`;
    paths.add(denied);
    expect(
      (
        await storage(staff).upload(denied, image, {
          contentType: "image/jpeg",
        })
      ).error,
    ).not.toBeNull();
    expect((await storage(staff).remove([path])).data ?? []).toHaveLength(0);
    expect((await storage(manager).download(path)).error).toBeNull();
    expect((await storage(foreign).download(path)).error).not.toBeNull();
    expect(
      (
        await storage(foreign).upload(denied, image, {
          contentType: "image/jpeg",
        })
      ).error,
    ).not.toBeNull();
    expect((await storage(foreign).remove([path])).data ?? []).toHaveLength(0);
    expect((await storage(manager).remove([path])).error).toBeNull();
    expect((await storage(manager).download(path)).error).not.toBeNull();
  });
  it("denies overwrite and archived Staff reads, permits management archived reads", async () => {
    const uuid = randomUUID();
    const hero = `${org}/${drink.id}/${uuid}.jpg`,
      thumb = `${org}/${drink.id}/${uuid}-thumb.jpg`;
    paths.add(hero);
    paths.add(thumb);
    for (const path of [hero, thumb])
      expect(
        (
          await storage(manager).upload(path, image, {
            contentType: "image/jpeg",
          })
        ).error,
      ).toBeNull();
    expect(
      (
        await storage(manager).update(hero, image, {
          contentType: "image/jpeg",
        })
      ).error,
    ).not.toBeNull();
    const metadata = await manager.client.rpc("bar_recipe_set_image", {
      p_organization_id: org,
      p_recipe_id: drink.id,
      p_expected_version: drink.version,
      p_image_path: hero,
      p_thumb_path: thumb,
    });
    expect(metadata.error).toBeNull();
    drink = { ...drink, version: metadata.data.version };
    await archive(true);
    expect((await storage(staff).download(hero)).error).not.toBeNull();
    expect(
      (await storage(staff).createSignedUrl(hero, 60)).error,
    ).not.toBeNull();
    expect((await storage(manager).download(hero)).error).toBeNull();
    const deniedArchived = `${org}/${drink.id}/${randomUUID()}.jpg`;
    paths.add(deniedArchived);
    expect(
      (
        await storage(manager).upload(deniedArchived, image, {
          contentType: "image/jpeg",
        })
      ).error,
    ).not.toBeNull();
    expect((await storage(manager).remove([hero])).data ?? []).toHaveLength(0);
    await archive(false);
  });
});
