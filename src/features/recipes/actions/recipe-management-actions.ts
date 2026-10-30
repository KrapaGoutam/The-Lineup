"use server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
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
const restaurant = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
async function context(slug: string) {
  const client = await createClient();
  const invalid = await requireLiveSession(client);
  if (invalid) return { error: invalid };
  const user = await getCurrentUser(slug);
  if (!user || user.designation === "staff")
    return {
      error: {
        ok: false as const,
        kind: "permission" as const,
        error: "You don't have permission to manage recipes.",
      },
    };
  return { client, org: user.organizationId };
}
export async function setRecipeArchivedAction(input: {
  restaurantSlug: string;
  recipeId: string;
  expectedVersion: number;
  archived: boolean;
  categoryId?: string;
}): Promise<ManagementResult> {
  const parsed = z
    .object({
      restaurantSlug: restaurant,
      recipeId: z.uuid(),
      expectedVersion: z.number().int().positive(),
      archived: z.boolean(),
      categoryId: z.uuid().optional(),
    })
    .safeParse(input);
  if (!parsed.success)
    return { ok: false, kind: "validation", error: "That request is invalid." };
  const ctx = await context(parsed.data.restaurantSlug);
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
}): Promise<ManagementResult<ManagementCategory[]>> {
  if (!restaurant.safeParse(input.restaurantSlug).success)
    return { ok: false, error: "That request is invalid." };
  const ctx = await context(input.restaurantSlug);
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
}): Promise<
  ManagementResult<{ count?: number; id?: string; version?: number }>
> {
  const parsed = z
    .object({ restaurantSlug: restaurant, command: categoryCommandSchema })
    .safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      kind: "validation",
      error: "Enter a category name of 1–80 characters and a valid request.",
    };
  const ctx = await context(parsed.data.restaurantSlug);
  if (ctx.error) return ctx.error;
  return categoryData(ctx.client, ctx.org, parsed.data.command);
}
