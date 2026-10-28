import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecipeDetailView } from "./recipe-detail";
import type { DetailVariant, RecipeDetail } from "../domain/recipe-detail";
const variant = (kind: string): DetailVariant => ({
  id: kind,
  variant: kind,
  method: null,
  rim_type: null,
  rim_notes: null,
  glass: null,
  glass_notes: null,
  presentation_notes: null,
  tips: null,
  batch_notes: null,
  ingredients: [
    {
      id: kind,
      amount: "Top",
      unit: null,
      ingredient_name: "Synthetic ingredient",
      preparation: null,
      sort_order: 1,
    },
  ],
  steps: [{ id: kind, instruction: "Synthetic step", sort_order: 1 }],
  garnishes: [],
});
const recipe: RecipeDetail = {
  id: "r",
  name: "Synthetic detail",
  slug: "synthetic-detail",
  recipe_number: 23,
  base_spirit: null,
  description: null,
  is_popular: false,
  is_menu_item: false,
  category: "Synthetic category",
  variants: [variant("perfect"), variant("house")],
};
afterEach(cleanup);
describe("recipe detail", () => {
  it("renders both variants and accessible House-first tabs", () => {
    render(
      <RecipeDetailView
        recipe={recipe}
        backHref="/?tab=recipes"
        onBack={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /Synthetic detail/ }),
    ).toBeTruthy();
    const house = screen.getByRole("tab", { name: "House" });
    expect(house).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(house, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Perfect" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByText("Synthetic step").length).toBeGreaterThan(0);
    expect(screen.queryByText("Method")).toBeNull();
  });
  it("shows stored ordered content and optional fields without inventing values", () => {
    const content = {
      ...variant("perfect"),
      method: "Synthetic method",
      rim_type: "Synthetic rim",
      glass: "Synthetic glass",
      tips: "Synthetic tip",
      ingredients: [
        {
          id: "i1",
          amount: "2",
          unit: "oz",
          ingredient_name: "First ingredient",
          preparation: null,
          sort_order: 1,
        },
        {
          id: "i2",
          amount: "Top",
          unit: null,
          ingredient_name: "Second ingredient",
          preparation: "Synthetic prep",
          sort_order: 2,
        },
      ],
      steps: [
        { id: "s1", instruction: "First step", sort_order: 1 },
        { id: "s2", instruction: "Second step", sort_order: 2 },
      ],
      garnishes: [
        { id: "g1", name: "First garnish", notes: null, sort_order: 1 },
        {
          id: "g2",
          name: "Second garnish",
          notes: "Synthetic note",
          sort_order: 2,
        },
      ],
    };
    const { container } = render(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [content] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );
    expect(container.textContent).toMatch(
      /First ingredient.*Second ingredient/,
    );
    expect(container.querySelector("ol")?.textContent).toMatch(
      /First step.*Second step/,
    );
    expect(container.textContent).toMatch(/First garnish.*Second garnish/);
    for (const text of [
      "Synthetic method",
      "Synthetic rim",
      "Synthetic glass",
      "Synthetic tip",
    ])
      expect(screen.getByText(text)).toBeTruthy();
  });
  it("renders a single variant without tabs and handles no variants", () => {
    const { rerender } = render(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [variant("perfect")] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Perfect Bartending Recipe" }),
    ).toBeTruthy();
    rerender(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [variant("house")] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "House Recipe" })).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    rerender(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );
    expect(
      screen.getByText("No recipe details are available yet."),
    ).toBeTruthy();
  });
});
