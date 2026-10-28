import { describe, expect, it } from "vitest";
import { groups, search, type RecipeIndex } from "./recipe-index";
const index: RecipeIndex = {
  categories: [
    { id: "f", name: "Other", display_order: 0, is_fallback: true },
    { id: "a", name: "Cocktails", display_order: 2, is_fallback: false },
  ],
  recipes: [
    {
      id: "1",
      category_id: "a",
      recipe_number: 23,
      name: "R1 Test Citrus",
      slug: "citrus",
      alternate_name: "Jalape\u00f1o",
      base_spirit: "Gin",
      is_popular: false,
    },
    {
      id: "2",
      category_id: "a",
      recipe_number: 1,
      name: "R1 Test Highball",
      slug: "highball",
      alternate_name: null,
      base_spirit: null,
      is_popular: false,
    },
    {
      id: "3",
      category_id: "f",
      recipe_number: 3,
      name: "R1 Test Other",
      slug: "other",
      alternate_name: null,
      base_spirit: null,
      is_popular: false,
    },
  ],
};
describe("recipe index", () => {
  it("orders fallback last and recipes by their stored number", () => {
    const result = groups(index);
    expect(result.map((g) => g.category.id)).toEqual(["a", "f"]);
    expect(result[0].recipes.map((r) => r.recipe_number)).toEqual([1, 23]);
  });
  it("returns no groups for an empty organization", () =>
    expect(groups({ categories: index.categories, recipes: [] })).toEqual([]));
  it("searches accents, multiple words and padded numbers", () => {
    expect(search(index, "jalapeno gin").map((r) => r.id)).toEqual(["1"]);
    expect(search(index, "023").map((r) => r.id)).toEqual(["1"]);
  });
});
