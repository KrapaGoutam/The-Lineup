import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecipesModule } from "./recipes-module";
import { getRecipeIndexAction } from "../actions/recipe-actions";
import userEvent from "@testing-library/user-event";
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../actions/recipe-actions", () => ({ getRecipeIndexAction: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("Recipes landing", () => {
  it.each([true, false])(
    "filters archived rows and management controls for management=%s",
    async (management) => {
      vi.mocked(getRecipeIndexAction).mockResolvedValue({
        ok: true,
        data: {
          categories: [
            { id: "c", name: "Test", display_order: 1, is_fallback: false },
          ],
          recipes: [
            {
              id: "r",
              category_id: "c",
              name: "Archived drink",
              slug: "archived",
              recipe_number: 1,
              alternate_name: null,
              base_spirit: null,
              is_popular: false,
              is_active: false,
            },
          ],
        },
      });
      render(
        <RecipesModule
          restaurantSlug="test"
          demo={false}
          isManagement={management}
          onSessionInvalid={vi.fn()}
        />,
      );
      await screen.findByLabelText("Search recipes");
      expect(screen.queryByText("Archived drink")).not.toBeInTheDocument();
      if (!management) {
        expect(
          screen.queryByLabelText("Show archived"),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: "Manage Categories" }),
        ).not.toBeInTheDocument();
        return;
      }
      await userEvent.click(screen.getByLabelText("Show archived"));
      expect(screen.getByText("Archived drink").closest("li")).toHaveClass(
        "opacity-60",
      );
      await userEvent.type(screen.getByLabelText("Search recipes"), "Archived");
      expect(screen.getByText("Archived", { exact: true })).toBeVisible();
    },
  );
  it("renders the empty state", async () => {
    vi.mocked(getRecipeIndexAction).mockResolvedValue({
      ok: true,
      data: { categories: [], recipes: [] },
    });
    render(
      <RecipesModule
        restaurantSlug="test"
        demo={false}
        onSessionInvalid={vi.fn()}
      />,
    );
    expect(
      await screen.findByText("No recipes have been added yet."),
    ).toBeTruthy();
  });
  it("distinguishes a read error from empty", async () => {
    vi.mocked(getRecipeIndexAction).mockResolvedValue({
      ok: false,
      error: "Recipes could not be loaded.",
    });
    render(
      <RecipesModule
        restaurantSlug="test"
        demo={false}
        onSessionInvalid={vi.fn()}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Recipes could not be loaded.",
    );
  });
  it("shows a loading state while reading", () => {
    vi.mocked(getRecipeIndexAction).mockReturnValue(new Promise(() => {}));
    render(
      <RecipesModule
        restaurantSlug="test"
        demo={false}
        onSessionInvalid={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveAccessibleName("Loading");
  });
});
