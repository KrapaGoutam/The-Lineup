import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { z } from "zod";
import {
  IMAGE_TTL,
  imagePaths,
  isScopedImagePath,
  validateOutput,
  type ImageMetadata,
  type ImageUrls,
} from "../domain/image-rules";
import type { ManagementResult } from "../domain/recipe-management";
import { managementError } from "./recipe-management-data";
type Client = SupabaseClient<Database>;
export type ImageMutation = ImageMetadata & {
  id: string;
  version: number;
  cleanupWarning?: boolean;
};
export async function signRecipeImages(
  client: Client,
  org: string,
  id: string,
  metadata: ImageMetadata,
): Promise<ImageUrls> {
  const paths = [metadata.image_path, metadata.image_thumb_path].filter(
    (p): p is string => !!p && isScopedImagePath(p, org, id),
  );
  const expiresAt = Date.now() + IMAGE_TTL * 1000;
  if (!paths.length) return { hero: null, thumb: null, expiresAt };
  const { data, error } = await client.storage
    .from("recipe-images")
    .createSignedUrls(paths, IMAGE_TTL);
  if (error) throw new Error("Photo could not be loaded.");
  const url = (path: string | null) =>
    data?.find((row) => row.path === path)?.signedUrl || null;
  return {
    hero: url(metadata.image_path),
    thumb: url(metadata.image_thumb_path),
    expiresAt,
  };
}
export type ThumbnailUrls = {
  urls: Record<string, string>;
  expiresAt: number;
};
/** Signs every scoped thumbnail in ONE Storage request (STORAGE_PLAN S-9). */
export async function signRecipeThumbnails(
  client: Client,
  org: string,
  rows: { id: string; image_thumb_path: string | null }[],
): Promise<ThumbnailUrls> {
  const expiresAt = Date.now() + IMAGE_TTL * 1000;
  const scoped = rows.filter(
    (row): row is { id: string; image_thumb_path: string } =>
      !!row.image_thumb_path &&
      isScopedImagePath(row.image_thumb_path, org, row.id),
  );
  if (!scoped.length) return { urls: {}, expiresAt };
  const { data, error } = await client.storage
    .from("recipe-images")
    .createSignedUrls(
      scoped.map((row) => row.image_thumb_path),
      IMAGE_TTL,
    );
  if (error) throw new Error("Photo could not be loaded.");
  const urls: Record<string, string> = {};
  for (const row of scoped) {
    const signed = data?.find((item) => item.path === row.image_thumb_path);
    if (signed?.signedUrl) urls[row.id] = signed.signedUrl;
  }
  return { urls, expiresAt };
}
async function cleanup(client: Client, paths: string[]): Promise<boolean> {
  if (!paths.length) return true;
  try {
    const { data, error } = await client.storage
      .from("recipe-images")
      .remove(paths);
    return !error && data?.length === paths.length;
  } catch {
    return false;
  }
}
export async function mutateRecipeImageData(
  client: Client,
  org: string,
  id: string,
  version: number,
  files?: { hero: Blob; thumb: Blob },
): Promise<ManagementResult<ImageMutation>> {
  const uploaded: string[] = [];
  let committed = false;
  try {
    const current = await client
      .from("bar_recipes")
      .select("image_path,image_thumb_path,is_active")
      .eq("organization_id", org)
      .eq("id", id)
      .maybeSingle();
    if (current.error || !current.data?.is_active)
      return {
        ok: false,
        kind: "permission",
        error:
          "This recipe is unavailable for photo editing. Restore archived recipes first.",
      };
    const old = [current.data.image_path, current.data.image_thumb_path].filter(
      (p): p is string => !!p && isScopedImagePath(p, org, id),
    );
    let paths: ImageMetadata = { image_path: null, image_thumb_path: null };
    if (files) {
      const mime = await validateOutput(files.hero, "hero");
      if ((await validateOutput(files.thumb, "thumb")) !== mime)
        throw new Error("format");
      paths = imagePaths(org, id, mime);
      for (const [path, blob] of [
        [paths.image_path!, files.hero],
        [paths.image_thumb_path!, files.thumb],
      ] as const) {
        const result = await client.storage
          .from("recipe-images")
          .upload(path, blob, {
            contentType: mime,
            cacheControl: "31536000",
            upsert: false,
          });
        if (result.error) throw new Error("upload");
        uploaded.push(path);
      }
    }
    const response = await client.rpc("bar_recipe_set_image", {
      p_organization_id: org,
      p_recipe_id: id,
      p_expected_version: version,
      p_image_path: paths.image_path!,
      p_thumb_path: paths.image_thumb_path!,
    });
    if (response.error) {
      const cleaned = await cleanup(client, uploaded);
      if (!cleaned) console.warn("Recipe photo compensation cleanup failed");
      return managementError(response.error);
    }
    // A successful RPC owns the new objects even if its return shape is unexpected.
    committed = true;
    const parsed = z
      .object({ id: z.uuid(), version: z.number().int().positive() })
      .safeParse(response.data);
    const cleaned = await cleanup(client, old);
    if (!cleaned) console.warn("Recipe photo old-object cleanup failed");
    if (!parsed.success) return managementError({});
    return {
      ok: true,
      data: {
        ...parsed.data,
        ...paths,
        ...(!cleaned ? { cleanupWarning: true } : {}),
      },
    };
  } catch {
    if (!committed && !(await cleanup(client, uploaded)))
      console.warn("Recipe photo compensation cleanup failed");
    return {
      ok: false,
      kind: "unknown",
      error:
        "Photo could not be saved. Your previous photo is unchanged. Try again.",
    };
  }
}
