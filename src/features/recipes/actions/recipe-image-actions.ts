"use server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import {
  mutateRecipeImageData,
  signRecipeImages,
  type ImageMutation,
} from "../data/recipe-image-data";
import { validateOutput, type ImageUrls } from "../domain/image-rules";
import type { ManagementResult } from "../domain/recipe-management";
const scopeSchema = z.object({
  restaurantSlug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  recipeId: z.uuid(),
});
const mutationSchema = scopeSchema.extend({
  expectedVersion: z.number().int().positive(),
});
async function context(slug: string, mutation: boolean) {
  const client = await createClient();
  const invalid = await requireLiveSession(client);
  if (invalid) return { error: invalid };
  const user = await getCurrentUser(slug);
  if (!user || (mutation && user.designation === "staff"))
    return {
      error: {
        ok: false as const,
        kind: "permission" as const,
        error: "You don't have permission to manage this photo.",
      },
    };
  return { client, org: user.organizationId };
}
export async function uploadRecipeImageAction(
  form: FormData,
): Promise<ManagementResult<ImageMutation>> {
  const parsed = mutationSchema.safeParse({
    restaurantSlug: form.get("restaurantSlug"),
    recipeId: form.get("recipeId"),
    expectedVersion: Number(form.get("expectedVersion")),
  });
  if (!parsed.success)
    return {
      ok: false,
      kind: "validation",
      error: "That photo request is invalid.",
    };
  const ctx = await context(parsed.data.restaurantSlug, true);
  if (ctx.error) return ctx.error;
  const hero = form.get("hero"),
    thumb = form.get("thumb");
  try {
    if (!(hero instanceof Blob) || !(thumb instanceof Blob))
      throw new Error("Choose a valid photo.");
    if (
      (await validateOutput(hero, "hero")) !==
      (await validateOutput(thumb, "thumb"))
    )
      throw new Error("Photo formats must match.");
  } catch (error) {
    return {
      ok: false,
      kind: "validation",
      error: error instanceof Error ? error.message : "Choose a valid photo.",
    };
  }
  return mutateRecipeImageData(
    ctx.client,
    ctx.org,
    parsed.data.recipeId,
    parsed.data.expectedVersion,
    { hero, thumb },
  );
}
export async function removeRecipeImageAction(
  input: z.infer<typeof mutationSchema>,
): Promise<ManagementResult<ImageMutation>> {
  const parsed = mutationSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      kind: "validation",
      error: "That photo request is invalid.",
    };
  const ctx = await context(parsed.data.restaurantSlug, true);
  if (ctx.error) return ctx.error;
  return mutateRecipeImageData(
    ctx.client,
    ctx.org,
    parsed.data.recipeId,
    parsed.data.expectedVersion,
  );
}
export async function getRecipeImageUrlsAction(
  input: z.infer<typeof scopeSchema>,
): Promise<ManagementResult<ImageUrls>> {
  const parsed = scopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Photo unavailable." };
  const ctx = await context(parsed.data.restaurantSlug, false);
  if (ctx.error) return ctx.error;
  try {
    const row = await ctx.client
      .from("bar_recipes")
      .select("image_path,image_thumb_path")
      .eq("organization_id", ctx.org)
      .eq("id", parsed.data.recipeId)
      .maybeSingle();
    if (row.error || !row.data)
      return { ok: false, error: "Photo unavailable." };
    return {
      ok: true,
      data: await signRecipeImages(
        ctx.client,
        ctx.org,
        parsed.data.recipeId,
        row.data,
      ),
    };
  } catch {
    return { ok: false, error: "Photo unavailable." };
  }
}
