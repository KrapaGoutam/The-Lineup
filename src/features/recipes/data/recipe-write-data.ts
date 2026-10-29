import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import type { RecipePayload, SaveResult } from "../domain/recipe-validation";

export function recipeWriteError(error: {
  code?: string;
  details?: string;
  message?: string;
}): SaveResult {
  if (error.code === "PT409")
    return {
      ok: false,
      kind: "stale",
      error:
        "Someone else changed this recipe. Reload the latest version or keep editing your changes.",
    };
  if (error.code === "42501")
    return {
      ok: false,
      kind: "permission",
      error: "You don't have permission to change recipes.",
    };
  if (error.code === "23505") {
    try {
      const detail = z
        .object({
          field: z.literal("recipe_number"),
          existing_label: z.string(),
        })
        .safeParse(JSON.parse(error.details ?? "{}"));
      if (detail.success)
        return {
          ok: false,
          kind: "duplicate",
          field: "recipe_number",
          error: `This recipe number is already used by ${detail.data.existing_label}.`,
        };
    } catch {
      /* Unknown details use the safe fallback. */
    }
    return {
      ok: false,
      kind: "duplicate",
      error: "A recipe with that number or name already exists.",
    };
  }
  if (error.code === "22023") {
    const field =
      /^(?:Invalid|Missing|Required) (recipe_number|name|category_id|alternate_name|description|base_spirit)\b/.exec(
        error.message ?? "",
      )?.[1];
    return {
      ok: false,
      kind: "validation",
      field,
      error:
        "Check the recipe fields and try again. A value is missing or outside the allowed limits.",
    };
  }
  return {
    ok: false,
    kind: "unknown",
    error: "Recipe could not be saved. Your changes are still here. Try again.",
  };
}
const savedSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  version: z.number().int().positive(),
  recipe_number: z.number().int(),
});
export async function saveRecipeData(
  client: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  recipeId: string | null,
  version: number | null,
  payload: RecipePayload,
): Promise<SaveResult> {
  try {
    const { data, error } = await client.rpc("bar_recipe_save", {
      p_organization_id: organizationId,
      // Generated RPC types omit SQL argument nullability; create requires nulls.
      p_recipe_id: recipeId!,
      p_expected_version: version!,
      p_payload: payload,
    });
    if (error) return recipeWriteError(error);
    const parsed = savedSchema.safeParse(data);
    return parsed.success
      ? { ok: true, data: parsed.data }
      : recipeWriteError({});
  } catch {
    return recipeWriteError({});
  }
}
