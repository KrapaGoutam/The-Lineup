export type Category = {
  id: string;
  name: string;
  display_order: number;
  is_fallback: boolean;
};
export type Recipe = {
  is_active?: boolean;
  id: string;
  category_id: string;
  recipe_number: number;
  name: string;
  slug: string;
  alternate_name: string | null;
  base_spirit: string | null;
  is_popular: boolean;
};
export type RecipeIndex = { categories: Category[]; recipes: Recipe[] };

export function groups(index: RecipeIndex) {
  return [...index.categories]
    .sort(
      (a, b) =>
        Number(a.is_fallback) - Number(b.is_fallback) ||
        a.display_order - b.display_order ||
        a.name.localeCompare(b.name),
    )
    .map((category) => ({
      category,
      recipes: index.recipes
        .filter((r) => r.category_id === category.id)
        .sort((a, b) => a.recipe_number - b.recipe_number),
    }))
    .filter((group) => group.recipes.length > 0);
}
const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
export function search(index: RecipeIndex, query: string) {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(" ");
  return index.recipes
    .map((recipe) => {
      const name = normalize(recipe.name),
        alt = normalize(recipe.alternate_name ?? ""),
        spirit = normalize(recipe.base_spirit ?? ""),
        category = normalize(
          index.categories.find((c) => c.id === recipe.category_id)?.name ?? "",
        ),
        number = String(recipe.recipe_number);
      const fields = [
        name,
        alt,
        spirit,
        category,
        number,
        `#${number}`,
        number.padStart(3, "0"),
      ];
      const rank = [number, `#${number}`, number.padStart(3, "0")].includes(q)
        ? 0
        : name.startsWith(q)
          ? 1
          : name.includes(q)
            ? 2
            : alt.includes(q)
              ? 3
              : spirit.includes(q)
                ? 4
                : 5;
      return { recipe, fields, rank };
    })
    .filter((x) =>
      words.every((word) => x.fields.some((field) => field.includes(word))),
    )
    .sort(
      (a, b) =>
        a.rank - b.rank || a.recipe.recipe_number - b.recipe.recipe_number,
    )
    .map((x) => x.recipe);
}
