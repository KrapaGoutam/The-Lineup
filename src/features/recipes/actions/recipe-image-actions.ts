"use server";
import { z } from "zod";
import { guardModule } from "@/features/modules/data/module-enforcement";
import { getRecipesActor } from "../data/recipes-actor";
import { assertWorkspaceExpectation } from "@/features/context/data/workspace-expectation";
import { createClient } from "@/lib/supabase/server";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import {
  mutateRecipeImageData,
  signRecipeImages,
  signRecipeThumbnails,
  type ImageMutation,
  type ThumbnailUrls,
} from "../data/recipe-image-data";
import { validateOutput, type ImageUrls } from "../domain/image-rules";
import type { ManagementResult } from "../domain/recipe-management";

const STALE_CONTEXT_MESSAGE =
  "Your active restaurant or location changed in another tab. Please reload before saving.";

const scopeSchema = z.object({
  restaurantSlug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  recipeId: z.uuid(),
  expectedContext: z.unknown().optional(),
});
// One Picture Book screen shows at most the whole index; Server Actions run
// one at a time, so thumbnails are signed per batch, never per card.
const thumbBatchSchema = z.object({
  restaurantSlug: scopeSchema.shape.restaurantSlug,
  recipeIds: z.array(z.uuid()).min(1).max(250),
  expectedContext: z.unknown().optional(),
});
const mutationSchema = scopeSchema.extend({
  expectedVersion: z.number().int().positive(),
});
async function context(
  slug: string,
  mutation: boolean,
  expectedContext?: unknown,
) {
  const client = await createClient();
  const invalid = await requireLiveSession(client);
  if (invalid) return { error: invalid };
  const actor = await getRecipesActor(slug);
  if (!actor || (mutation && !actor.isManager))
    return {
      error: {
        ok: false as const,
        kind: "permission" as const,
        error: mutation
          ? "You don't have permission to manage this photo."
          : "Photo unavailable.",
      },
    };
  const expectationRaw = (
    expectedContext as Record<string, unknown> | undefined
  )?.expectation ??
    expectedContext ?? {
      profileId: actor.viewer.profileId,
      organizationId: actor.organizationId,
      locationId: actor.scope.locationId,
    };
  const outcome = await assertWorkspaceExpectation(
    expectationRaw,
    {
      profileId: actor.viewer.profileId,
      organizationId: actor.organizationId,
    },
    {
      resolveLocation: async () => ({
        id: actor.scope.locationId,
        time_zone: actor.scope.timeZone ?? "UTC",
      }),
    },
  );
  if (!outcome.ok) {
    return {
      error: {
        ok: false as const,
        kind: "permission" as const,
        error:
          outcome.code === "invalid"
            ? "That request is invalid."
            : STALE_CONTEXT_MESSAGE,
        contextStale: true as const,
      },
    };
  }
  const blocked = await guardModule({
    module: "recipes",
    organizationId: actor.organizationId,
    location: { id: actor.scope.locationId },
  });
  if (blocked)
    return {
      error: {
        ok: false as const,
        kind: "permission" as const,
        error: blocked.error,
      },
    };
  return { client, org: actor.organizationId };
}
export async function uploadRecipeImageAction(
  form: FormData,
): Promise<ManagementResult<ImageMutation>> {
  let expectedContext: unknown = undefined;
  const rawContext = form.get("expectedContext");
  if (typeof rawContext === "string" && rawContext.length > 0) {
    try {
      expectedContext = JSON.parse(rawContext);
    } catch {
      expectedContext = rawContext;
    }
  }
  const parsed = mutationSchema.safeParse({
    restaurantSlug: form.get("restaurantSlug"),
    recipeId: form.get("recipeId"),
    expectedVersion: Number(form.get("expectedVersion")),
    expectedContext,
  });
  if (!parsed.success)
    return {
      ok: false,
      kind: "validation",
      error: "That photo request is invalid.",
    };
  const ctx = await context(
    parsed.data.restaurantSlug,
    true,
    parsed.data.expectedContext,
  );
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
  const ctx = await context(
    parsed.data.restaurantSlug,
    true,
    parsed.data.expectedContext,
  );
  if (ctx.error) return ctx.error;
  return mutateRecipeImageData(
    ctx.client,
    ctx.org,
    parsed.data.recipeId,
    parsed.data.expectedVersion,
  );
}
export async function getRecipeThumbUrlsAction(
  input: z.infer<typeof thumbBatchSchema>,
): Promise<ManagementResult<ThumbnailUrls>> {
  const parsed = thumbBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Photo unavailable." };
  const ctx = await context(
    parsed.data.restaurantSlug,
    false,
    parsed.data.expectedContext,
  );
  if (ctx.error) return ctx.error;
  try {
    // Organization-scoped caller-session read: RLS hides archived recipes from Staff.
    const rows = await ctx.client
      .from("bar_recipes")
      .select("id,image_thumb_path")
      .eq("organization_id", ctx.org)
      .in("id", parsed.data.recipeIds);
    if (rows.error || !rows.data)
      return { ok: false, error: "Photo unavailable." };
    return {
      ok: true,
      data: await signRecipeThumbnails(ctx.client, ctx.org, rows.data),
    };
  } catch {
    return { ok: false, error: "Photo unavailable." };
  }
}
export async function getRecipeImageUrlsAction(
  input: z.infer<typeof scopeSchema>,
): Promise<ManagementResult<ImageUrls>> {
  const parsed = scopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Photo unavailable." };
  const ctx = await context(
    parsed.data.restaurantSlug,
    false,
    parsed.data.expectedContext,
  );
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
