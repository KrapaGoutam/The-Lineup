import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import type {
  CategoryCommand,
  ManagementResult,
} from "../domain/recipe-management";
type Client = Awaited<ReturnType<typeof createClient>>;
export function managementError(error: {
  code?: string;
}): Exclude<ManagementResult, { ok: true }> {
  switch (error.code) {
    case "PT409":
      return {
        ok: false,
        kind: "stale",
        error:
          "Someone else changed this record. Reload latest before trying again.",
      };
    case "42501":
      return {
        ok: false,
        kind: "permission",
        error: "You don't have permission to manage recipes.",
      };
    case "23505":
      return {
        ok: false,
        kind: "duplicate",
        error: "A category with that name already exists.",
      };
    case "22023":
      return {
        ok: false,
        kind: "validation",
        error:
          "Check the category and try again. Choose an active category to restore. A fallback category cannot be moved or deactivated; move or archive active recipes before deactivating their category.",
      };
    default:
      return {
        ok: false,
        kind: "unknown",
        error: "The change could not be completed. Try again.",
      };
  }
}
const record = z.object({ id: z.uuid(), version: z.number().int().positive() });
export async function archiveRecipeData(
  client: Client,
  org: string,
  id: string,
  version: number,
  archived: boolean,
  categoryId?: string,
): Promise<ManagementResult> {
  try {
    const { data, error } = await client.rpc("bar_recipe_set_archived", {
      p_organization_id: org,
      p_recipe_id: id,
      p_expected_version: version,
      p_archived: archived,
      ...(categoryId ? { p_category_id: categoryId } : {}),
    });
    if (error) return managementError(error);
    const parsed = record.safeParse(data);
    return parsed.success
      ? { ok: true, data: parsed.data }
      : managementError({});
  } catch {
    return managementError({});
  }
}
export async function categoryData(
  client: Client,
  org: string,
  command: CategoryCommand,
): Promise<
  ManagementResult<{ count?: number; id?: string; version?: number }>
> {
  try {
    const response =
      command.operation === "save"
        ? await client.rpc("bar_recipe_category_save", {
            p_organization_id: org,
            p_category_id: command.id!,
            p_expected_version: command.version!,
            p_name: command.name,
          })
        : command.operation === "active"
          ? await client.rpc("bar_recipe_category_set_active", {
              p_organization_id: org,
              p_category_id: command.id,
              p_expected_version: command.version,
              p_active: command.active,
            })
          : await client.rpc("bar_recipe_category_reorder", {
              p_organization_id: org,
              p_ordered_ids: command.ids,
            });
    if (response.error) return managementError(response.error);
    const parsed = (
      command.operation === "reorder"
        ? z.object({ count: z.number().int().nonnegative() })
        : record
    ).safeParse(response.data);
    return parsed.success
      ? { ok: true, data: parsed.data }
      : managementError({});
  } catch {
    return managementError({});
  }
}
