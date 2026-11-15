"use server";
import { z } from "zod";
import { guardModule } from "@/features/modules/data/module-enforcement";
import { getRecipesActor } from "../data/recipes-actor";
import { assertWorkspaceExpectation } from "@/features/context/data/workspace-expectation";
import { createClient } from "@/lib/supabase/server";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import {
  archiveRecipeData,
  categoryData,
} from "../data/recipe-management-data";
import {
  categoryCommandSchema,
  type CategoryCommand,
  type ManagementCategory,
  type ManagementResult,
} from "../domain/recipe-management";

const STALE_CONTEXT_MESSAGE =
  "Your active restaurant or location changed in another tab. Please reload before saving.";

const restaurant = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
async function context(slug: string, expectedContext?: unknown) {
  const client = await createClient();
  const invalid = await requireLiveSession(client);
  if (invalid) return { error: invalid };
  const actor = await getRecipesActor(slug);
  if (!actor || !actor.canManageCatalog)
    return {
      error: {
        ok: false as const,
        kind: "permission" as const,
        error: "You don't have permission to manage recipes.",
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
export async function setRecipeArchivedAction(input: {
  restaurantSlug: string;
  recipeId: string;
  expectedVersion: number;
  archived: boolean;
  categoryId?: string;
  expectedContext?: unknown;
}): Promise<ManagementResult> {
  const parsed = z
    .object({
      restaurantSlug: restaurant,
      recipeId: z.uuid(),
      expectedVersion: z.number().int().positive(),
      archived: z.boolean(),
      categoryId: z.uuid().optional(),
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success)
    return { ok: false, kind: "validation", error: "That request is invalid." };
  const ctx = await context(
    parsed.data.restaurantSlug,
    parsed.data.expectedContext,
  );
  if (ctx.error) return ctx.error;
  return archiveRecipeData(
    ctx.client,
    ctx.org,
    parsed.data.recipeId,
    parsed.data.expectedVersion,
    parsed.data.archived,
    parsed.data.categoryId,
  );
}
export async function getRecipeCategoriesAction(input: {
  restaurantSlug: string;
  expectedContext?: unknown;
}): Promise<ManagementResult<ManagementCategory[]>> {
  const parsed = z
    .object({
      restaurantSlug: restaurant,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };
  const ctx = await context(
    parsed.data.restaurantSlug,
    parsed.data.expectedContext,
  );
  if (ctx.error) return ctx.error;
  const { data, error } = await ctx.client
    .from("bar_recipe_categories")
    .select("id,name,version,is_active,is_fallback,display_order")
    .eq("organization_id", ctx.org)
    .order("is_fallback")
    .order("display_order")
    .order("id");
  return error
    ? { ok: false, error: "Categories could not be loaded." }
    : { ok: true, data };
}
export async function manageRecipeCategoryAction(input: {
  restaurantSlug: string;
  command: CategoryCommand;
  expectedContext?: unknown;
}): Promise<
  ManagementResult<{ count?: number; id?: string; version?: number }>
> {
  const parsed = z
    .object({
      restaurantSlug: restaurant,
      command: categoryCommandSchema,
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      kind: "validation",
      error: "Enter a category name of 1–80 characters and a valid request.",
    };
  const ctx = await context(
    parsed.data.restaurantSlug,
    parsed.data.expectedContext,
  );
  if (ctx.error) return ctx.error;
  return categoryData(ctx.client, ctx.org, parsed.data.command);
}
