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

export async function getRecipeDetailAction(input: {
  restaurantSlug: string;
  slug: string;
}): Promise<
  | { ok: true; data: import("../domain/recipe-detail").RecipeDetail | null }
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
      slug: z
        .string()
        .min(1)
        .max(120)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: true, data: null };
  const client = await createClient();
  const invalid = await requireLiveSession(client);
  if (invalid) return invalid;
  const user = await getCurrentUser(parsed.data.restaurantSlug);
  if (!user)
    return { ok: false, error: "You need to sign in to view recipes." };
  const org = user.organizationId;
  const recipe = await client
    .from("bar_recipes")
    .select(
      "id,name,slug,recipe_number,base_spirit,description,is_popular,is_menu_item,category_id",
    )
    .eq("organization_id", org)
    .eq("is_active", true)
    .eq("slug", parsed.data.slug)
    .maybeSingle();
  if (recipe.error) return { ok: false, error: "Recipes could not be loaded." };
  if (!recipe.data) return { ok: true, data: null };
  const [category, variants] = await Promise.all([
    client
      .from("bar_recipe_categories")
      .select("name")
      .eq("organization_id", org)
      .eq("id", recipe.data.category_id)
      .maybeSingle(),
    client
      .from("bar_recipe_variants")
      .select(
        "id,variant,method,rim_type,rim_notes,glass,glass_notes,presentation_notes,tips,batch_notes",
      )
      .eq("organization_id", org)
      .eq("recipe_id", recipe.data.id),
  ]);
  if (category.error || variants.error || !category.data)
    return { ok: false, error: "Recipes could not be loaded." };
  const ids = variants.data.map((v) => v.id);
  if (!ids.length)
    return {
      ok: true,
      data: { ...recipe.data, category: category.data.name, variants: [] },
    };
  const [ingredients, steps, garnishes] = await Promise.all([
    client
      .from("bar_recipe_ingredients")
      .select(
        "id,variant_id,amount,unit,ingredient_name,preparation,sort_order",
      )
      .eq("organization_id", org)
      .in("variant_id", ids)
      .order("sort_order"),
    client
      .from("bar_recipe_steps")
      .select("id,variant_id,instruction,sort_order")
      .eq("organization_id", org)
      .in("variant_id", ids)
      .order("sort_order"),
    client
      .from("bar_recipe_garnishes")
      .select("id,variant_id,name,notes,sort_order")
      .eq("organization_id", org)
      .in("variant_id", ids)
      .order("sort_order"),
  ]);
  if (ingredients.error || steps.error || garnishes.error)
    return { ok: false, error: "Recipes could not be loaded." };
  return {
    ok: true,
    data: {
      ...recipe.data,
      category: category.data.name,
      variants: variants.data.map((v) => ({
        ...v,
        ingredients: ingredients.data.filter((i) => i.variant_id === v.id),
        steps: steps.data.filter((s) => s.variant_id === v.id),
        garnishes: garnishes.data.filter((g) => g.variant_id === v.id),
      })),
    },
  };
}
