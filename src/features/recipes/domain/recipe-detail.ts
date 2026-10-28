import type { Database } from "@/types/database.generated";
type Tables = Database["public"]["Tables"];
type Row<T extends keyof Tables> = Tables[T]["Row"];
export type DetailVariant = Pick<
  Row<"bar_recipe_variants">,
  | "id"
  | "variant"
  | "method"
  | "rim_type"
  | "rim_notes"
  | "glass"
  | "glass_notes"
  | "presentation_notes"
  | "tips"
  | "batch_notes"
> & {
  ingredients: Pick<
    Row<"bar_recipe_ingredients">,
    "id" | "amount" | "unit" | "ingredient_name" | "preparation" | "sort_order"
  >[];
  steps: Pick<Row<"bar_recipe_steps">, "id" | "instruction" | "sort_order">[];
  garnishes: Pick<
    Row<"bar_recipe_garnishes">,
    "id" | "name" | "notes" | "sort_order"
  >[];
};
export type RecipeDetail = Pick<
  Row<"bar_recipes">,
  | "id"
  | "name"
  | "slug"
  | "recipe_number"
  | "base_spirit"
  | "description"
  | "is_popular"
  | "is_menu_item"
> & {
  category: string;
  variants: DetailVariant[];
  is_active?: boolean;
  version?: number;
  category_id?: string;
};
