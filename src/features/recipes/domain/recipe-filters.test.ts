import { describe, expect, it } from "vitest";
import type { Category, Recipe, RecipeIndex } from "./recipe-index";
import {
  deriveBrowsingData,
  filterRecipes,
  groupRecipes,
  sortRecipes,
} from "./recipe-filters";

const mockCategories: Category[] = [
  { id: "c-others", name: "Others", display_order: 0, is_fallback: true },
  { id: "c-margs", name: "Margaritas", display_order: 1, is_fallback: false },
  { id: "c-shots", name: "Shots", display_order: 2, is_fallback: false },
  {
    id: "c-empty",
    name: "Empty Category",
    display_order: 3,
    is_fallback: false,
  },
];

const mockRecipes: Recipe[] = [
  {
    id: "r1",
    category_id: "c-margs",
    recipe_number: 23,
    name: "Cadillac Margarita",
    slug: "cadillac-margarita",
    alternate_name: null,
    base_spirit: "Tequila",
    is_popular: true,
    is_menu_item: true,
    is_alcoholic: true,
    is_active: true,
  },
  {
    id: "r2",
    category_id: "c-margs",
    recipe_number: 21,
    name: "Jalapeño Margarita",
    slug: "jalapeno-margarita",
    alternate_name: "Spicy Marg",
    base_spirit: "Tequila",
    is_popular: false,
    is_menu_item: true,
    is_alcoholic: true,
    is_active: true,
  },
  {
    id: "r3",
    category_id: "c-shots",
    recipe_number: 40,
    name: "apple shot",
    slug: "apple-shot",
    alternate_name: null,
    base_spirit: "Vodka",
    is_popular: true,
    is_menu_item: false,
    is_alcoholic: true,
    is_active: true,
  },
  {
    id: "r4",
    category_id: "c-others",
    recipe_number: 99,
    name: "Virgin Colada",
    slug: "virgin-colada",
    alternate_name: null,
    base_spirit: null,
    is_popular: false,
    is_menu_item: false,
    is_alcoholic: false,
    is_active: true,
  },
  {
    id: "r5-archived",
    category_id: "c-margs",
    recipe_number: 22,
    name: "Archived Margarita",
    slug: "archived-margarita",
    alternate_name: null,
    base_spirit: "Tequila",
    is_popular: true,
    is_menu_item: true,
    is_alcoholic: true,
    is_active: false,
  },
];

const mockIndex: RecipeIndex = {
  categories: mockCategories,
  recipes: mockRecipes,
};

describe("filterRecipes", () => {
  it("returns all recipes for 'all' mode without mutating input", () => {
    const input = Object.freeze([...mockRecipes]);
    const result = filterRecipes(input, "all");
    expect(result).toHaveLength(5);
    expect(result).not.toBe(input);
  });

  it("filters by is_popular === true", () => {
    const result = filterRecipes(mockRecipes, "popular");
    expect(result.map((r) => r.id)).toEqual(["r1", "r3", "r5-archived"]);
  });

  it("filters by is_menu_item === true", () => {
    const result = filterRecipes(mockRecipes, "on_menu");
    expect(result.map((r) => r.id)).toEqual(["r1", "r2", "r5-archived"]);
  });

  it("filters by is_alcoholic === false and never infers from category/spirit", () => {
    const result = filterRecipes(mockRecipes, "non_alcoholic");
    expect(result.map((r) => r.id)).toEqual(["r4"]);
  });
});

describe("sortRecipes", () => {
  it("sorts by recipe_number ascending for 'book' mode without mutating input", () => {
    const input = Object.freeze([...mockRecipes]);
    const result = sortRecipes(input, "book");
    expect(result.map((r) => r.recipe_number)).toEqual([21, 22, 23, 40, 99]);
  });

  it("sorts by name A–Z case-insensitively and tie-breaks by recipe_number", () => {
    const recipes: Recipe[] = [
      {
        id: "a1",
        category_id: "c-shots",
        recipe_number: 10,
        name: "apple",
        slug: "apple-1",
        alternate_name: null,
        base_spirit: null,
        is_popular: false,
      },
      {
        id: "a2",
        category_id: "c-shots",
        recipe_number: 5,
        name: "Apple",
        slug: "apple-2",
        alternate_name: null,
        base_spirit: null,
        is_popular: false,
      },
      {
        id: "b",
        category_id: "c-shots",
        recipe_number: 2,
        name: "Banana",
        slug: "banana",
        alternate_name: null,
        base_spirit: null,
        is_popular: false,
      },
    ];
    const result = sortRecipes(recipes, "az");
    // "apple" and "Apple" are equal case-insensitively, so tie-breaker recipe_number 5 comes before 10
    expect(result.map((r) => r.id)).toEqual(["a2", "a1", "b"]);
  });
});

describe("groupRecipes", () => {
  it("keeps fallback category last, omits empty categories, and sorts by book order", () => {
    const groups = groupRecipes(mockCategories, mockRecipes, "book");
    expect(groups.map((g) => g.category.id)).toEqual([
      "c-margs",
      "c-shots",
      "c-others",
    ]);
    expect(groups.find((g) => g.category.id === "c-empty")).toBeUndefined();
    expect(groups[0].recipes.map((r) => r.recipe_number)).toEqual([21, 22, 23]);
    // activeCount excludes the archived recipe (r5-archived)
    expect(groups[0].activeCount).toBe(2);
  });

  it("sorts recipes within categories by A–Z when sortMode is az", () => {
    const groups = groupRecipes(mockCategories, mockRecipes, "az");
    // Margaritas: "Archived Margarita", "Cadillac Margarita", "Jalapeño Margarita"
    expect(groups[0].recipes.map((r) => r.slug)).toEqual([
      "archived-margarita",
      "cadillac-margarita",
      "jalapeno-margarita",
    ]);
  });
});

describe("deriveBrowsingData pipeline", () => {
  it("hides archived recipes for non-management", () => {
    const result = deriveBrowsingData({
      index: mockIndex,
      isManagement: false,
      showArchived: true, // should be ignored for non-management
      filterMode: "all",
      sortMode: "book",
      query: "",
    });
    expect(result.filteredRecipes.some((r) => r.id === "r5-archived")).toBe(
      false,
    );
    expect(result.totalVisible).toBe(4);
  });

  it("shows archived recipes for management when showArchived is true", () => {
    const result = deriveBrowsingData({
      index: mockIndex,
      isManagement: true,
      showArchived: true,
      filterMode: "all",
      sortMode: "book",
      query: "",
    });
    expect(result.filteredRecipes.some((r) => r.id === "r5-archived")).toBe(
      true,
    );
    expect(result.totalVisible).toBe(5);
  });

  it("combines filter chip with category grouping", () => {
    const result = deriveBrowsingData({
      index: mockIndex,
      isManagement: false,
      showArchived: false,
      filterMode: "popular",
      sortMode: "book",
      query: "",
    });
    // Active popular: r1 (Cadillac Margarita in c-margs), r3 (apple shot in c-shots)
    expect(result.groups.map((g) => g.category.id)).toEqual([
      "c-margs",
      "c-shots",
    ]);
    expect(result.totalVisible).toBe(2);
  });

  it("flattens to searchResults when query is active with Book order", () => {
    const result = deriveBrowsingData({
      index: mockIndex,
      isManagement: false,
      showArchived: false,
      filterMode: "all",
      sortMode: "book",
      query: "margarita",
    });
    expect(result.groups).toHaveLength(0);
    expect(result.searchResults).not.toBeNull();
    expect(result.searchResults?.map((r) => r.recipe_number)).toEqual([21, 23]);
  });

  it("flattens to searchResults when query is active with A–Z order", () => {
    const result = deriveBrowsingData({
      index: mockIndex,
      isManagement: false,
      showArchived: false,
      filterMode: "all",
      sortMode: "az",
      query: "margarita",
    });
    expect(result.groups).toHaveLength(0);
    expect(result.searchResults).not.toBeNull();
    // "Cadillac Margarita" before "Jalapeño Margarita"
    expect(result.searchResults?.map((r) => r.slug)).toEqual([
      "cadillac-margarita",
      "jalapeno-margarita",
    ]);
  });

  it("combines filter chip with search query", () => {
    const result = deriveBrowsingData({
      index: mockIndex,
      isManagement: false,
      showArchived: false,
      filterMode: "popular",
      sortMode: "book",
      query: "margarita",
    });
    // Only Cadillac Margarita is both popular and matching "margarita"
    expect(result.searchResults?.map((r) => r.slug)).toEqual([
      "cadillac-margarita",
    ]);
  });
});
