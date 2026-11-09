"use server";
import { z } from "zod";
import { guardModule } from "@/features/modules/data/module-enforcement";
import { getRecipesActor } from "../data/recipes-actor";
import { assertWorkspaceExpectation } from "@/features/context/data/workspace-expectation";
import { createClient } from "@/lib/supabase/server";
import { requireLiveSession } from "@/lib/supabase/require-live-session";
import { saveRecipeData } from "../data/recipe-write-data";
import {
  recipePayloadSchema,
  type SaveResult,
} from "../domain/recipe-validation";
import type { EditorCategory, EditorLoad } from "../domain/recipe-editor-state";
import { getRecipeDetailAction } from "./recipe-actions";

const STALE_CONTEXT_MESSAGE =
  "Your active restaurant or location changed in another tab. Please reload before saving.";

async function checkWorkspace(
  raw: unknown,
  actor: NonNullable<Awaited<ReturnType<typeof getRecipesActor>>>,
) {
  const expectationRaw = (raw as Record<string, unknown> | undefined)
    ?.expectation ??
    raw ?? {
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
      ok: false as const,
      error:
        outcome.code === "invalid"
          ? "That request is invalid."
          : STALE_CONTEXT_MESSAGE,
      contextStale: true as const,
    };
  }
  return { ok: true as const };
}

const restaurant = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export async function saveRecipeAction(input: {
  restaurantSlug: string;
  recipeId: string | null;
  expectedVersion: number | null;
  payload: unknown;
  expectedContext?: unknown;
}): Promise<SaveResult> {
  const parsed = z
    .object({
      restaurantSlug: restaurant,
      recipeId: z.uuid().nullable(),
      expectedVersion: z.number().int().positive().nullable(),
      payload: recipePayloadSchema.extend({ category_id: z.uuid() }),
      expectedContext: z.unknown().optional(),
    })
    .refine((v) => (v.recipeId === null) === (v.expectedVersion === null))
    .safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      kind: "validation",
      error: "Check the recipe fields and try again.",
    };
  const client = await createClient();
  const invalid = await requireLiveSession(client);
  if (invalid) return invalid;
  const actor = await getRecipesActor(parsed.data.restaurantSlug);
  if (!actor || !actor.isManager)
    return {
      ok: false,
      kind: "permission",
      error: "You don't have permission to change recipes.",
    };
  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) {
    return {
      ok: false,
      kind: "permission",
      error: workspace.error,
      contextStale: true,
    };
  }
  const blocked = await guardModule({
    module: "recipes",
    organizationId: actor.organizationId,
    location: { id: actor.scope.locationId },
  });
  if (blocked) return { ok: false, kind: "permission", error: blocked.error };
  return saveRecipeData(
    client,
    actor.organizationId,
    parsed.data.recipeId,
    parsed.data.expectedVersion,
    parsed.data.payload,
  );
}
export async function getRecipeEditorAction(input: {
  restaurantSlug: string;
  slug: string | null;
  expectedContext?: unknown;
}): Promise<
  | { ok: true; data: EditorLoad }
  | { ok: false; error: string; sessionInvalid?: true; contextStale?: true }
> {
  const parsed = z
    .object({
      restaurantSlug: restaurant,
      slug: restaurant.nullable(),
      expectedContext: z.unknown().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "That request is invalid." };
  const client = await createClient();
  const invalid = await requireLiveSession(client);
  if (invalid) return invalid;
  const actor = await getRecipesActor(parsed.data.restaurantSlug);
  if (!actor || !actor.isManager)
    return { ok: false, error: "You don't have permission to edit recipes." };
  const workspace = await checkWorkspace(parsed.data.expectedContext, actor);
  if (!workspace.ok) return workspace;
  const blocked = await guardModule({
    module: "recipes",
    organizationId: actor.organizationId,
    location: { id: actor.scope.locationId },
  });
  if (blocked) return blocked;
  const org = actor.organizationId;
  const categories: EditorCategory[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await client
      .from("bar_recipe_categories")
      .select("id,name,is_fallback,is_active")
      .eq("organization_id", org)
      .order("display_order")
      .order("id")
      .range(offset, offset + 999);
    if (page.error)
      return { ok: false, error: "Recipe editor could not be loaded." };
    categories.push(...page.data);
    if (page.data.length < 1000) break;
  }
  const max = await client
    .from("bar_recipes")
    .select("recipe_number")
    .eq("organization_id", org)
    .order("recipe_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (max.error)
    return { ok: false, error: "Recipe editor could not be loaded." };
  const nextNumber = (max.data?.recipe_number ?? 0) + 1;
  if (!parsed.data.slug)
    return {
      ok: true,
      data: {
        categories: categories.filter((c) => c.is_active),
        nextNumber,
        recipe: null,
      },
    };
  const basic = await client
    .from("bar_recipes")
    .select("id,version,category_id,alternate_name,is_alcoholic,is_active")
    .eq("organization_id", org)
    .eq("slug", parsed.data.slug)
    .maybeSingle();
  if (basic.error || !basic.data)
    return { ok: false, error: "This recipe is unavailable for editing." };
  const detail = await getRecipeDetailAction({
    restaurantSlug: parsed.data.restaurantSlug,
    slug: parsed.data.slug,
    expectedContext: parsed.data.expectedContext,
  });
  if (!detail.ok) return detail;
  if (!detail.data)
    return { ok: false, error: "This recipe is unavailable for editing." };
  // A graph read must never pair old fields with a newer expected version.
  const check = await client
    .from("bar_recipes")
    .select("version")
    .eq("organization_id", org)
    .eq("id", basic.data.id)
    .maybeSingle();
  if (check.error || check.data?.version !== basic.data.version)
    return {
      ok: false,
      error:
        "Recipe changed while loading. Try again to load the latest version.",
    };
  return {
    ok: true,
    data: {
      nextNumber,
      categories: categories.filter(
        (c) => c.is_active || c.id === basic.data?.category_id,
      ),
      recipe: { ...detail.data, ...basic.data },
    },
  };
}
