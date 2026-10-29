import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Category, Recipe } from "../domain/recipe-index";
import type { RecipeCategoryGroup } from "../domain/recipe-filters";
import { RecipePictureBook } from "./recipe-picture-book";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const mockCategories: Category[] = [
  { id: "c1", name: "Margaritas", display_order: 1, is_fallback: false },
  { id: "c2", name: "Others", display_order: 2, is_fallback: true },
];

const mockRecipes: Recipe[] = [
  {
    id: "r1",
    category_id: "c1",
    recipe_number: 21,
    name: "Jalapeño Margarita",
    slug: "jalapeno-margarita",
    alternate_name: null,
    base_spirit: "Tequila",
    is_popular: false,
    is_active: true,
  },
  {
    id: "r2",
    category_id: "c1",
    recipe_number: 23,
    name: "Cadillac Margarita",
    slug: "cadillac-margarita",
    alternate_name: null,
    base_spirit: "Tequila",
    is_popular: true,
    is_active: true,
  },
  {
    id: "r3",
    category_id: "c2",
    recipe_number: 99,
    name: "Virgin Colada",
    slug: "virgin-colada",
    alternate_name: null,
    base_spirit: null,
    is_popular: false,
    is_active: true,
  },
];

const mockGroups: RecipeCategoryGroup[] = [
  {
    category: mockCategories[0],
    recipes: [mockRecipes[0], mockRecipes[1]],
    activeCount: 2,
  },
  {
    category: mockCategories[1],
    recipes: [mockRecipes[2]],
    activeCount: 1,
  },
];

describe("RecipePictureBook", () => {
  it("renders category sections with headings, active counts, and cards", () => {
    render(
      <RecipePictureBook
        groups={mockGroups}
        searchResults={null}
        categories={mockCategories}
        query=""
        href={(slug) => `/?recipe=${slug}`}
        onNavigate={vi.fn()}
        onClearSearch={vi.fn()}
      />,
    );

    // Headings for each non-empty category
    expect(
      screen.getByRole("heading", { name: /margaritas \(2\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /others \(1\)/i }),
    ).toBeInTheDocument();

    // Cards rendered under groups
    expect(screen.getByText("Jalapeño Margarita")).toBeInTheDocument();
    expect(screen.getByText("Cadillac Margarita")).toBeInTheDocument();
    expect(screen.getByText("Virgin Colada")).toBeInTheDocument();
  });

  it("renders flat Results (n) grid and category captions when searching", () => {
    render(
      <RecipePictureBook
        groups={[]}
        searchResults={[mockRecipes[0], mockRecipes[1]]}
        categories={mockCategories}
        query="margarita"
        href={(slug) => `/?recipe=${slug}`}
        onNavigate={vi.fn()}
        onClearSearch={vi.fn()}
      />,
    );

    // Section heading is Results (2), not category names
    expect(
      screen.getByRole("heading", { name: /results \(2\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /others/i }),
    ).not.toBeInTheDocument();

    // Category captions shown on cards in search results mode
    const captions = screen.getAllByText("Margaritas");
    expect(captions.length).toBeGreaterThanOrEqual(2);
  });

  it("renders clear search message when search returns no matches", async () => {
    const onClearSearch = vi.fn();
    render(
      <RecipePictureBook
        groups={[]}
        searchResults={[]}
        categories={mockCategories}
        query="xyz123"
        href={(slug) => `/?recipe=${slug}`}
        onNavigate={vi.fn()}
        onClearSearch={onClearSearch}
      />,
    );

    expect(screen.getByText(/no recipes match/i)).toBeInTheDocument();
    const clearBtn = screen.getByRole("button", { name: /clear search/i });
    await userEvent.click(clearBtn);
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  it("renders filter empty state when filter matches 0 recipes", async () => {
    const onClearFilter = vi.fn();
    render(
      <RecipePictureBook
        groups={[]}
        searchResults={null}
        categories={mockCategories}
        query=""
        href={(slug) => `/?recipe=${slug}`}
        onNavigate={vi.fn()}
        onClearSearch={vi.fn()}
        onClearFilter={onClearFilter}
      />,
    );

    expect(
      screen.getByText("No recipes match this filter."),
    ).toBeInTheDocument();
    const clearBtn = screen.getByRole("button", { name: /clear filters/i });
    await userEvent.click(clearBtn);
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });
});
