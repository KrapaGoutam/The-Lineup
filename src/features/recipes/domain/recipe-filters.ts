import type { Category, Recipe, RecipeIndex } from "./recipe-index";
import { search } from "./recipe-index";

export type RecipeFilterMode = "all" | "popular" | "on_menu" | "non_alcoholic";
export type RecipeSortMode = "book" | "az";

export interface RecipeCategoryGroup {
  category: Category;
  recipes: Recipe[];
  activeCount: number;
}

/**
 * Filter recipes by the selected chip mode.
 * - All: no special restriction
 * - Popular: is_popular === true
 * - On menu: is_menu_item === true
 * - Non-alcoholic: is_alcoholic === false (explicitly not alcoholic; never inferred)
 */
export function filterRecipes(
  recipes: readonly Recipe[],
  filterMode: RecipeFilterMode,
): Recipe[] {
  switch (filterMode) {
    case "popular":
      return recipes.filter((r) => r.is_popular === true);
    case "on_menu":
      return recipes.filter((r) => r.is_menu_item === true);
    case "non_alcoholic":
      return recipes.filter((r) => r.is_alcoholic === false);
    case "all":
    default:
      return [...recipes];
  }
}

/**
 * Sort recipes deterministically:
 * - Book order: recipe_number ascending
 * - A–Z: recipe name locale-aware, case-insensitive, tie-broken by recipe_number
 * Never mutates the source array.
 */
export function sortRecipes(
  recipes: readonly Recipe[],
  sortMode: RecipeSortMode = "book",
): Recipe[] {
  const copy = [...recipes];
  if (sortMode === "az") {
    return copy.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
      });
      if (cmp !== 0) return cmp;
      return a.recipe_number - b.recipe_number;
    });
  }
  return copy.sort((a, b) => a.recipe_number - b.recipe_number);
}

/**
 * Groups recipes by category:
 * - Categories ordered by is_fallback (fallback last), display_order, then name
 * - Recipes within each category sorted by sortMode
 * - Empty categories are omitted
 * - Category activeCount excludes archived recipes
 */
export function groupRecipes(
  categories: readonly Category[],
  recipes: readonly Recipe[],
  sortMode: RecipeSortMode = "book",
): RecipeCategoryGroup[] {
  return [...categories]
    .sort(
      (a, b) =>
        Number(a.is_fallback) - Number(b.is_fallback) ||
        a.display_order - b.display_order ||
        a.name.localeCompare(b.name),
    )
    .map((category) => {
      const matching = recipes.filter((r) => r.category_id === category.id);
      return {
        category,
        recipes: sortRecipes(matching, sortMode),
        activeCount: matching.filter((r) => r.is_active !== false).length,
      };
    })
    .filter((group) => group.recipes.length > 0);
}

export interface DerivedBrowsingResult {
  /** Visible recipes after showArchived and filterMode applied */
  filteredRecipes: Recipe[];
  /** Search results if query is active, sorted by sortMode */
  searchResults: Recipe[] | null;
  /** Category groups if query is empty */
  groups: RecipeCategoryGroup[];
  /** Total count of visible recipes matching filters */
  totalVisible: number;
}

/**
 * Pure derived browsing pipeline for both List View and Picture Book View.
 */
export function deriveBrowsingData({
  index,
  isManagement,
  showArchived,
  filterMode,
  sortMode,
  query,
}: {
  index: RecipeIndex;
  isManagement: boolean;
  showArchived: boolean;
  filterMode: RecipeFilterMode;
  sortMode: RecipeSortMode;
  query: string;
}): DerivedBrowsingResult {
  // 1. Role / archive visibility
  const allowed = index.recipes.filter(
    (r) => r.is_active !== false || (isManagement && showArchived),
  );

  // 2. Filter chip
  const filtered = filterRecipes(allowed, filterMode);

  // 3. Search query
  const trimmed = query.trim();
  if (trimmed) {
    // Search over the filtered recipes with categories context
    const matching = search(
      { categories: index.categories, recipes: filtered },
      trimmed,
    );
    const sortedSearch = sortRecipes(matching, sortMode);
    return {
      filteredRecipes: filtered,
      searchResults: sortedSearch,
      groups: [],
      totalVisible: filtered.length,
    };
  }

  // 4. Grouped by category when not searching
  const grouped = groupRecipes(index.categories, filtered, sortMode);
  return {
    filteredRecipes: filtered,
    searchResults: null,
    groups: grouped,
    totalVisible: filtered.length,
  };
}
