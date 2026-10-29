import type { RecipeDetail } from "./recipe-detail";

/** Client-only editor model. Row keys are deliberately excluded from save payloads. */
export type Ingredient = {
  key: string;
  ingredient_name: string;
  amount: string;
  unit: string;
  preparation: string;
};
export type Step = { key: string; instruction: string };
export type Garnish = { key: string; name: string; notes: string };
export type Variant = {
  method: string;
  rim_type: string;
  rim_notes: string;
  glass: string;
  glass_notes: string;
  presentation_notes: string;
  tips: string;
  batch_notes: string;
  ingredients: Ingredient[];
  steps: Step[];
  garnishes: Garnish[];
};
export type RecipeEditorState = {
  category_id: string;
  recipe_number: string;
  name: string;
  alternate_name: string;
  description: string;
  base_spirit: string;
  is_alcoholic: boolean;
  is_popular: boolean;
  is_menu_item: boolean;
  variants: { perfect: Variant | null; house: Variant | null };
};
export function emptyVariant(): Variant {
  return {
    method: "",
    rim_type: "",
    rim_notes: "",
    glass: "",
    glass_notes: "",
    presentation_notes: "",
    tips: "",
    batch_notes: "",
    ingredients: [],
    steps: [],
    garnishes: [],
  };
}
export function newEditorState(
  categoryId: string,
  nextNumber: number,
): RecipeEditorState {
  return {
    category_id: categoryId,
    recipe_number: String(nextNumber),
    name: "",
    alternate_name: "",
    description: "",
    base_spirit: "",
    is_alcoholic: true,
    is_popular: false,
    is_menu_item: false,
    variants: { perfect: emptyVariant(), house: null },
  };
}
const normalized = (value: string, multiline = false) =>
  multiline ? value.trim() : value.trim().replace(/\s+/g, " ");
const optional = (value: string, multiline = false) =>
  normalized(value, multiline) || null;
function serializeVariant(v: Variant | null) {
  if (!v) return null;
  return {
    method: optional(v.method),
    rim_type: optional(v.rim_type),
    rim_notes: optional(v.rim_notes),
    glass: optional(v.glass),
    glass_notes: optional(v.glass_notes),
    presentation_notes: optional(v.presentation_notes),
    tips: optional(v.tips, true),
    batch_notes: optional(v.batch_notes, true),
    ingredients: v.ingredients.map(
      ({ ingredient_name, amount, unit, preparation }) => ({
        ingredient_name: normalized(ingredient_name),
        amount: optional(amount),
        unit: optional(unit),
        preparation: optional(preparation),
      }),
    ),
    steps: v.steps.map(({ instruction }) => ({
      instruction: instruction.trim(),
    })),
    garnishes: v.garnishes.map(({ name, notes }) => ({
      name: normalized(name),
      notes: optional(notes),
    })),
  };
}
export function serializeEditorState(s: RecipeEditorState) {
  return {
    category_id: s.category_id,
    recipe_number: Number(s.recipe_number),
    name: normalized(s.name),
    alternate_name: optional(s.alternate_name),
    description: optional(s.description, true),
    base_spirit: optional(s.base_spirit),
    is_alcoholic: s.is_alcoholic,
    is_popular: s.is_popular,
    is_menu_item: s.is_menu_item,
    variants: {
      perfect: serializeVariant(s.variants.perfect),
      house: serializeVariant(s.variants.house),
    },
  };
}
export function editorStatesEqual(
  a: RecipeEditorState,
  b: RecipeEditorState,
): boolean {
  return (
    JSON.stringify(serializeEditorState(a)) ===
    JSON.stringify(serializeEditorState(b))
  );
}
export function moveRow<T>(rows: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length)
    return rows;
  const result = rows.slice();
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}

export type EditorCategory = {
  id: string;
  name: string;
  is_fallback: boolean;
  is_active: boolean;
};
export type EditorRecipe = RecipeDetail & {
  category_id: string;
  alternate_name: string | null;
  is_alcoholic: boolean;
  version: number;
};
export type EditorLoad = {
  categories: EditorCategory[];
  nextNumber: number;
  recipe: EditorRecipe | null;
};
export function existingEditorState(
  recipe: EditorRecipe,
  key: () => string,
): RecipeEditorState {
  const state = newEditorState(recipe.category_id, recipe.recipe_number);
  Object.assign(state, {
    name: recipe.name,
    alternate_name: recipe.alternate_name ?? "",
    description: recipe.description ?? "",
    base_spirit: recipe.base_spirit ?? "",
    is_alcoholic: recipe.is_alcoholic,
    is_popular: recipe.is_popular,
    is_menu_item: recipe.is_menu_item,
  });
  state.variants = { perfect: null, house: null };
  for (const variant of recipe.variants) {
    if (variant.variant !== "perfect" && variant.variant !== "house") continue;
    const value = emptyVariant();
    for (const field of [
      "method",
      "rim_type",
      "rim_notes",
      "glass",
      "glass_notes",
      "presentation_notes",
      "tips",
      "batch_notes",
    ] as const)
      value[field] = variant[field] ?? "";
    value.ingredients = variant.ingredients.map((i) => ({
      key: key(),
      ingredient_name: i.ingredient_name,
      amount: i.amount ?? "",
      unit: i.unit ?? "",
      preparation: i.preparation ?? "",
    }));
    value.steps = variant.steps.map((s) => ({
      key: key(),
      instruction: s.instruction,
    }));
    value.garnishes = variant.garnishes.map((g) => ({
      key: key(),
      name: g.name,
      notes: g.notes ?? "",
    }));
    state.variants[variant.variant] = value;
  }
  return state;
}
