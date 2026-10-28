import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecipesModule } from "./recipes-module";
import { getRecipeIndexAction } from "../actions/recipe-actions";
vi.mock("../actions/recipe-actions", () => ({ getRecipeIndexAction: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("Recipes landing", () => {
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
