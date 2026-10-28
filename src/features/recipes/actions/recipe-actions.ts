"use server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { createClient } from "@/lib/supabase/server";
import type { RecipeIndex } from "../domain/recipe-index";

export async function getRecipeIndexAction(input: {
  restaurantSlug: string;
}): Promise<
  | { ok: true; data: RecipeIndex }
  | { ok: false; error: string; sessionInvalid?: true }
> {
  const parsed = z
    .object({
      restaurantSlug: z
        .string()
        .trim()
        .min(1)
        .max(120)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };
  const client = await createClient();
  const invalid = await requireLiveSession(client);
  if (invalid) return invalid;
  const user = await getCurrentUser(parsed.data.restaurantSlug);
  if (!user)
    return { ok: false, error: "You need to sign in to view recipes." };
  const categories = await client
    .from("bar_recipe_categories")
    .select("id,name,display_order,is_fallback")
    .eq("organization_id", user.organizationId)
    .eq("is_active", true);
  if (categories.error)
    return { ok: false, error: "Recipes could not be loaded." };
  const recipes: RecipeIndex["recipes"] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await client
      .from("bar_recipes")
      .select(
        "id,category_id,recipe_number,name,slug,alternate_name,base_spirit,is_popular",
      )
      .eq("organization_id", user.organizationId)
      .eq("is_active", true)
      .order("recipe_number")
      .range(offset, offset + 999);
    if (page.error) return { ok: false, error: "Recipes could not be loaded." };
    recipes.push(...page.data);
    if (page.data.length < 1000) break;
  }
  return { ok: true, data: { categories: categories.data, recipes } };
}
