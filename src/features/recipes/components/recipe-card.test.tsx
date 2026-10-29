import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "../domain/recipe-index";
import { RecipeCard } from "./recipe-card";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const activeRecipe: Recipe = {
  id: "r1",
  category_id: "c1",
  recipe_number: 7,
  name: "Classic Daiquiri",
  slug: "classic-daiquiri",
  alternate_name: null,
  base_spirit: "Rum",
  is_popular: true,
  is_active: true,
  image_thumb_path: null,
};

const archivedRecipe: Recipe = {
  id: "r2",
  category_id: "c1",
  recipe_number: 14,
  name: "Old Fashioned",
  slug: "old-fashioned",
  alternate_name: null,
  base_spirit: "Bourbon",
  is_popular: false,
  is_active: false,
  image_thumb_path: null,
};

describe("RecipeCard", () => {
  it("renders a single navigation target (anchor) with number, name, and popular star", () => {
    const onNavigate = vi.fn();
    const href = (slug: string) => `/?tab=recipes&recipe=${slug}`;

    render(
      <RecipeCard
        recipe={activeRecipe}
        restaurantSlug="demo-bar"
        href={href}
        onNavigate={onNavigate}
      />,
    );

    // Exactly one anchor for the card
    const link = screen.getByRole("link", { name: /classic daiquiri/i });
    expect(link).toHaveAttribute(
      "href",
      "/?tab=recipes&recipe=classic-daiquiri",
    );

    // Zero-padded number
    expect(screen.getByText("07")).toBeInTheDocument();

    // Recipe name
    expect(screen.getByText("Classic Daiquiri")).toBeInTheDocument();

    // Popular star with accessible label
    expect(screen.getByLabelText("Popular")).toBeInTheDocument();

    // Placeholder image rendered when image_thumb_path is null
    expect(screen.getByTestId("recipe-image")).toBeInTheDocument();
  });

  it("navigates via onNavigate when clicked", async () => {
    const onNavigate =
      vi.fn<
        (event: React.MouseEvent<HTMLAnchorElement>, slug: string) => void
      >();
    const href = (slug: string) => `/?tab=recipes&recipe=${slug}`;

    render(
      <RecipeCard
        recipe={activeRecipe}
        restaurantSlug="demo-bar"
        href={href}
        onNavigate={onNavigate}
      />,
    );

    const link = screen.getByRole("link", { name: /classic daiquiri/i });
    await userEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate.mock.calls[0][1]).toBe("classic-daiquiri");
  });

  it("renders category caption when provided (e.g. in search results mode)", () => {
    const onNavigate = vi.fn();
    const href = (slug: string) => `/?tab=recipes&recipe=${slug}`;

    render(
      <RecipeCard
        recipe={activeRecipe}
        categoryName="Signature Cocktails"
        restaurantSlug="demo-bar"
        href={href}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByText("Signature Cocktails")).toBeInTheDocument();
  });

  it("renders archived card with dimmed opacity and visible Archived badge", () => {
    const onNavigate = vi.fn();
    const href = (slug: string) => `/?tab=recipes&recipe=${slug}`;

    render(
      <RecipeCard
        recipe={archivedRecipe}
        restaurantSlug="demo-bar"
        href={href}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.getByText("Archived")).toBeInTheDocument();
    const listItem = screen.getByRole("listitem");
    expect(listItem).toHaveClass("opacity-60");
  });
});
