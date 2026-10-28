import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { Database } from "@/types/database.generated";
import {
  mutateRecipeImageData,
  signRecipeImages,
} from "@/features/recipes/data/recipe-image-data";
import { imagePaths } from "@/features/recipes/domain/image-rules";
import { adminClient, env } from "./support/harness";
const admin = adminClient(),
  org = randomUUID(),
  foreignOrg = randomUUID(),
  run = randomUUID();
const clients = Array.from({ length: 3 }, () =>
  createClient<Database>(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
);
const [manager, staff, foreign] = clients;
const users: string[] = [],
  orgs: string[] = [];
let id = "",
  version = 1;
const files = {
  hero: new Blob([readFileSync("tests/fixtures/recipes/photo.synthetic.jpg")], {
    type: "image/jpeg",
  }),
  thumb: new Blob(
    [readFileSync("tests/fixtures/recipes/photo.synthetic.jpg")],
    {
      type: "image/jpeg",
    },
  ),
};
async function row() {
  const r = await admin
    .from("bar_recipes")
    .select("image_path,image_thumb_path,version,is_active")
    .eq("id", id)
    .single();
  expect(r.error).toBeNull();
  return r.data!;
}
async function listing() {
  const r = await admin.storage.from("recipe-images").list(`${org}/${id}`);
  expect(r.error).toBeNull();
  return r.data!.map((r) => r.name).sort();
}
async function archive(archived: boolean) {
  const r = await manager.rpc("bar_recipe_set_archived", {
    p_organization_id: org,
    p_recipe_id: id,
    p_expected_version: version,
    p_archived: archived,
  });
  expect(r.error).toBeNull();
  version = (r.data as { version: number }).version;
}
beforeAll(async () => {
  for (let i = 0; i < 3; i++) {
    const email = `recipes-r2d-${run}-${i}@harness.invalid`,
      password = randomBytes(24).toString("base64url");
    const u = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (u.error) throw u.error;
    users.push(u.data.user!.id);
    expect(
      (
        await admin
          .from("profiles")
          .insert({ id: users[i], display_name: "Recipes R2D synthetic" })
      ).error,
    ).toBeNull();
    expect(
      (await clients[i].auth.signInWithPassword({ email, password })).error,
    ).toBeNull();
  }
  for (const [oid, owner] of [
    [org, users[0]],
    [foreignOrg, users[2]],
  ]) {
    expect(
      (
        await admin.from("organizations").insert({
          id: oid,
          name: `Recipes R2D ${run}`,
          slug: `recipes-r2d-${oid}`,
          created_by: owner,
        })
      ).error,
    ).toBeNull();
    orgs.push(oid);
  }
  expect(
    (
      await admin.from("memberships").insert(
        users.map((uid, i) => ({
          organization_id: i === 2 ? foreignOrg : org,
          profile_id: uid,
          roles: i === 1 ? ["server"] : ["general_manager"],
          active: true,
        })),
      )
    ).error,
  ).toBeNull();
  const category = await manager.rpc("bar_recipe_category_save", {
    p_organization_id: org,
    p_category_id: null!,
    p_expected_version: null!,
    p_name: "Synthetic photo category",
  });
  expect(category.error).toBeNull();
  const saved = await manager.rpc("bar_recipe_save", {
    p_organization_id: org,
    p_recipe_id: null!,
    p_expected_version: null!,
    p_payload: {
      name: "R2D synthetic photo",
      recipe_number: 23,
      category_id: (category.data as { id: string }).id,
      variants: { perfect: { method: "Build" } },
    },
  });
  expect(saved.error).toBeNull();
  id = (saved.data as { id: string }).id;
});
afterAll(async () => {
  if (id) {
    const objects = await listing();
    if (objects.length)
      expect(
        (
          await admin.storage
            .from("recipe-images")
            .remove(objects.map((n) => `${org}/${id}/${n}`))
        ).error,
      ).toBeNull();
    expect(await listing()).toEqual([]);
  }
  for (const oid of orgs)
    expect(
      (
        await admin
          .from("organizations")
          .delete()
          .eq("id", oid)
          .eq("slug", `recipes-r2d-${oid}`)
      ).error,
    ).toBeNull();
  for (let i = 0; i < users.length; i++) {
    await clients[i].auth.signOut();
    expect(
      (await admin.from("profiles").delete().eq("id", users[i])).error,
    ).toBeNull();
    expect((await admin.auth.admin.deleteUser(users[i])).error).toBeNull();
  }
  for (const table of [
    "bar_recipes",
    "bar_recipe_categories",
    "bar_recipe_variants",
    "bar_recipe_ingredients",
    "bar_recipe_steps",
    "bar_recipe_garnishes",
  ]) {
    const r = await admin
      .from(table)
      .select("id", { head: true, count: "exact" })
      .in("organization_id", [org, foreignOrg]);
    expect(r.error).toBeNull();
    expect(r.count).toBe(0);
  }
  console.log(
    "R2-D explicit Storage prefix inspection: 0 orphan objects; synthetic DB graph/users removed",
  );
});
describe("R2-D actual application data path, DEV JWT Storage", () => {
  it("uploads pair, records metadata, signs with management and Staff", async () => {
    const result = await mutateRecipeImageData(
      manager,
      org,
      id,
      version,
      files,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.error);
    version = result.data.version;
    const metadata = await row();
    expect(metadata.image_path).toMatch(
      new RegExp(`^${org}/${id}/[a-f0-9-]+\\.jpg$`),
    );
    expect(metadata.image_thumb_path).toBe(
      metadata.image_path.replace(".jpg", "-thumb.jpg"),
    );
    expect(await listing()).toHaveLength(2);
    for (const client of [manager, staff]) {
      const signed = await signRecipeImages(client, org, id, metadata);
      expect(signed.expiresAt - Date.now()).toBeGreaterThan(3590000);
      expect((await fetch(signed.hero!)).ok).toBe(true);
    }
  });
  it("denies Staff upload and delete and foreign read/mutation", async () => {
    const p = imagePaths(org, id, "image/jpeg");
    expect(
      (
        await staff.storage
          .from("recipe-images")
          .upload(p.image_path, files.hero, {
            contentType: "image/jpeg",
            upsert: false,
          })
      ).error,
    ).not.toBeNull();
    const old = await row();
    const removed = await staff.storage
      .from("recipe-images")
      .remove([old.image_path]);
    expect(removed.data ?? []).toHaveLength(0);
    expect(
      (
        await foreign.storage
          .from("recipe-images")
          .createSignedUrl(old.image_path, 3600)
      ).error,
    ).not.toBeNull();
    expect(
      (await mutateRecipeImageData(foreign, org, id, version, files)).ok,
    ).toBe(false);
    expect(
      (await mutateRecipeImageData(staff, org, id, version, files)).ok,
    ).toBe(false);
    expect(await listing()).toHaveLength(2);
  });
  it("replaces via fresh paths and deletes old after metadata switch", async () => {
    const old = await row();
    const r = await mutateRecipeImageData(manager, org, id, version, files);
    expect(r.ok).toBe(true);
    if (!r.ok) throw Error(r.error);
    version = r.data.version;
    expect(r.data.image_path).not.toBe(old.image_path);
    expect(await listing()).toEqual(
      [r.data.image_path!, r.data.image_thumb_path!]
        .map((p) => p.split("/")[2])
        .sort(),
    );
  });
  it("compensates actual uploaded pair after PT409 preserving old metadata", async () => {
    const old = await row(),
      before = await listing();
    const r = await mutateRecipeImageData(manager, org, id, version - 1, files);
    expect(r).toMatchObject({ ok: false, kind: "stale" });
    expect(await row()).toEqual(old);
    expect(await listing()).toEqual(before);
    const signed = await signRecipeImages(staff, org, id, old);
    expect((await fetch(signed.hero!)).ok).toBe(true);
  });
  it("archive retains objects, management signs, Staff is denied; restore returns read", async () => {
    const before = await listing();
    await archive(true);
    expect(await listing()).toEqual(before);
    const metadata = await row();
    expect(
      (await signRecipeImages(manager, org, id, metadata)).hero,
    ).toBeTruthy();
    expect(
      (
        await staff.storage
          .from("recipe-images")
          .createSignedUrl(metadata.image_path, 3600)
      ).error,
    ).not.toBeNull();
    expect(
      (await mutateRecipeImageData(manager, org, id, version, files)).ok,
    ).toBe(false);
    expect(await listing()).toEqual(before);
    await archive(false);
    expect(
      (await signRecipeImages(staff, org, id, metadata)).hero,
    ).toBeTruthy();
  });
  it("clears metadata then removes both objects", async () => {
    const r = await mutateRecipeImageData(manager, org, id, version);
    expect(r.ok).toBe(true);
    expect(await row()).toMatchObject({
      image_path: null,
      image_thumb_path: null,
    });
    expect(await listing()).toEqual([]);
  });
});
