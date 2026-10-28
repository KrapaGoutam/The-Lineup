import type { EditorRecipe, RecipeEditorState } from "./recipe-editor-state";
import { serializeEditorState } from "./recipe-editor-state";
export function demoRecipeFromState(
  state: RecipeEditorState,
  id: string,
  slug: string,
  version: number,
  category: string,
): EditorRecipe {
  const payload = serializeEditorState(state);
  return {
    ...payload,
    id,
    slug,
    version,
    category,
    variants: (["perfect", "house"] as const).flatMap((kind) => {
      const v = payload.variants[kind];
      return v
        ? [
            {
              ...v,
              id: `${id}-${kind}`,
              variant: kind,
              ingredients: v.ingredients.map((i, n) => ({
                ...i,
                id: `${id}-${kind}-i${n}`,
                sort_order: n,
              })),
              steps: v.steps.map((s, n) => ({
                ...s,
                id: `${id}-${kind}-s${n}`,
                sort_order: n,
              })),
              garnishes: v.garnishes.map((g, n) => ({
                ...g,
                id: `${id}-${kind}-g${n}`,
                sort_order: n,
              })),
            },
          ]
        : [];
    }),
  };
}
