import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecipesModule } from "./recipes-module";
import { getRecipeIndexAction } from "../actions/recipe-actions";
import { RECIPES_VIEW_STORAGE_KEY } from "../hooks/use-view-preference";
import type { RecipeIndex } from "../domain/recipe-index";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../actions/recipe-actions", () => ({
  getRecipeIndexAction: vi.fn(),
  getRecipeDetailAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

beforeEach(() => {
  window.localStorage.clear();
});

const testIndex: RecipeIndex = {
  categories: [
    { id: "c1", name: "Margaritas", display_order: 1, is_fallback: false },
    { id: "c2", name: "Others", display_order: 2, is_fallback: true },
  ],
  recipes: [
    {
      id: "r1",
      category_id: "c1",
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
      category_id: "c1",
      recipe_number: 21,
      name: "Jalapeño Margarita",
      slug: "jalapeno-margarita",
      alternate_name: "Spicy",
      base_spirit: "Tequila",
      is_popular: false,
      is_menu_item: true,
      is_alcoholic: true,
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
      is_menu_item: false,
      is_alcoholic: false,
      is_active: true,
    },
  ],
};

describe("Recipes browsing: view toggle, filters, and sort", () => {
  it("defaults to List view and switches to Picture Book preserving search, filter, and sort", async () => {
    vi.mocked(getRecipeIndexAction).mockResolvedValue({
      ok: true,
      data: testIndex,
    });

    render(
      <RecipesModule
        restaurantSlug="test-bar"
        demo={false}
        isManagement={false}
        onSessionInvalid={vi.fn()}
      />,
    );

    // Initial default: List view
    const listBtn = await screen.findByRole("button", { name: "List" });
    const picBtn = screen.getByRole("button", { name: "Picture Book" });
    expect(listBtn).toHaveAttribute("aria-pressed", "true");
    expect(picBtn).toHaveAttribute("aria-pressed", "false");

    // All filter default
    const allChip = screen.getByRole("button", { name: "All" });
    expect(allChip).toHaveAttribute("aria-pressed", "true");

    // Book order default
    const bookOrderBtn = screen.getByRole("button", { name: "Book order" });
    const azBtn = screen.getByRole("button", { name: "A–Z" });
    expect(bookOrderBtn).toHaveAttribute("aria-pressed", "true");
    expect(azBtn).toHaveAttribute("aria-pressed", "false");

    // Set a search query
    const searchInput = screen.getByLabelText("Search recipes");
    await userEvent.type(searchInput, "margarita");
    expect(
      screen.getByRole("heading", { name: /results \(2\)/i }),
    ).toBeInTheDocument();

    // Select A–Z sort
    await userEvent.click(azBtn);
    expect(azBtn).toHaveAttribute("aria-pressed", "true");
    expect(bookOrderBtn).toHaveAttribute("aria-pressed", "false");

    // Switch to Picture Book
    await userEvent.click(picBtn);
    expect(picBtn).toHaveAttribute("aria-pressed", "true");
    expect(listBtn).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem(RECIPES_VIEW_STORAGE_KEY)).toBe(
      "picture",
    );

    // Verify search and sort are preserved across view switch
    expect(searchInput).toHaveValue("margarita");
    expect(azBtn).toHaveAttribute("aria-pressed", "true");
    // In Picture Book, search results mode renders cards
    expect(screen.getAllByTestId("recipe-image")).toHaveLength(2);

    // Switch back to List
    await userEvent.click(listBtn);
    expect(listBtn).toHaveAttribute("aria-pressed", "true");
    expect(window.localStorage.getItem(RECIPES_VIEW_STORAGE_KEY)).toBe("list");
    expect(searchInput).toHaveValue("margarita");
  });

  it("filters by Popular, On menu, and Non-alcoholic with aria-pressed states", async () => {
    vi.mocked(getRecipeIndexAction).mockResolvedValue({
      ok: true,
      data: testIndex,
    });

    render(
      <RecipesModule
        restaurantSlug="test-bar"
        demo={false}
        isManagement={false}
        onSessionInvalid={vi.fn()}
      />,
    );

    await screen.findByText("Cadillac Margarita");

    const popChip = screen.getByRole("button", { name: /popular/i });
    const menuChip = screen.getByRole("button", { name: /on menu/i });
    const nonAlcChip = screen.getByRole("button", { name: /non-alcoholic/i });
    const allChip = screen.getByRole("button", { name: "All" });

    // Filter Popular
    await userEvent.click(popChip);
    expect(popChip).toHaveAttribute("aria-pressed", "true");
    expect(allChip).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Cadillac Margarita")).toBeInTheDocument();
    expect(screen.queryByText("Jalapeño Margarita")).not.toBeInTheDocument();
    expect(screen.queryByText("Virgin Colada")).not.toBeInTheDocument();

    // Filter On menu
    await userEvent.click(menuChip);
    expect(menuChip).toHaveAttribute("aria-pressed", "true");
    expect(popChip).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Cadillac Margarita")).toBeInTheDocument();
    expect(screen.getByText("Jalapeño Margarita")).toBeInTheDocument();
    expect(screen.queryByText("Virgin Colada")).not.toBeInTheDocument();

    // Filter Non-alcoholic
    await userEvent.click(nonAlcChip);
    expect(nonAlcChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Virgin Colada")).toBeInTheDocument();
    expect(screen.queryByText("Cadillac Margarita")).not.toBeInTheDocument();
    expect(screen.queryByText("Jalapeño Margarita")).not.toBeInTheDocument();

    // Back to All
    await userEvent.click(allChip);
    expect(allChip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Cadillac Margarita")).toBeInTheDocument();
    expect(screen.getByText("Jalapeño Margarita")).toBeInTheDocument();
    expect(screen.getByText("Virgin Colada")).toBeInTheDocument();
  });

  it("handles empty filter state and restores on Clear filters", async () => {
    // Only alcoholic recipes
    vi.mocked(getRecipeIndexAction).mockResolvedValue({
      ok: true,
      data: {
        categories: [testIndex.categories[0]],
        recipes: [testIndex.recipes[0]],
      },
    });

    render(
      <RecipesModule
        restaurantSlug="test-bar"
        demo={false}
        isManagement={false}
        onSessionInvalid={vi.fn()}
      />,
    );

    await screen.findByText("Cadillac Margarita");

    // Click Non-alcoholic filter -> 0 matches
    await userEvent.click(
      screen.getByRole("button", { name: /non-alcoholic/i }),
    );
    expect(
      screen.getByText("No recipes match this filter."),
    ).toBeInTheDocument();

    // Click Clear filters -> restores All
    await userEvent.click(
      screen.getByRole("button", { name: /clear filters/i }),
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Cadillac Margarita")).toBeInTheDocument();
  });

  it("permits both Staff and Management to use view toggle, filter, and sort controls", async () => {
    vi.mocked(getRecipeIndexAction).mockResolvedValue({
      ok: true,
      data: testIndex,
    });

    // Staff
    const { unmount } = render(
      <RecipesModule
        restaurantSlug="test-bar"
        demo={false}
        isManagement={false}
        onSessionInvalid={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "List" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Picture Book" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Book order" }),
    ).toBeInTheDocument();
    // Staff never has management controls
    expect(screen.queryByLabelText("Show archived")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add Recipe" }),
    ).not.toBeInTheDocument();
    unmount();

    // Management
    render(
      <RecipesModule
        restaurantSlug="test-bar"
        demo={false}
        isManagement={true}
        onSessionInvalid={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "List" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Picture Book" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Show archived")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add Recipe" }),
    ).toBeInTheDocument();
  });
});
