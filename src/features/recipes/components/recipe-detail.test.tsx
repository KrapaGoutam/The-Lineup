import {
  cleanup,
  render,
  screen,
  fireEvent,
  within,
} from "@testing-library/react";
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

describe("recipe detail - View I (The Bartender's Book)", () => {
  it("treats a legacy empty Perfect variant as absent and renders single House build", () => {
    const empty = { ...variant("perfect"), ingredients: [], steps: [] };
    render(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [empty, variant("house")] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByTestId("recipe-single")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Perfect" })).toBeNull();
    expect(screen.getByRole("heading", { name: "House" })).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("renders both complete recipes in open-book spread with Perfect and House and no tabs", () => {
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
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();

    const perfect = screen.getByRole("heading", { name: "Perfect" });
    const house = screen.getByRole("heading", { name: "House" });
    expect(
      perfect.compareDocumentPosition(house) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Both recipes are complete and rendered once each (no hidden duplicates)
    expect(screen.getAllByText("Synthetic step")).toHaveLength(2);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByTestId("recipe-spread")).toBeTruthy();
  });

  it("provides header back button and accessible headings for both pages", () => {
    const onBack = vi.fn();
    render(
      <RecipeDetailView
        recipe={recipe}
        backHref="/?tab=recipes"
        onBack={onBack}
      />,
    );

    const backLink = screen.getByRole("link", { name: /back to bar recipes/i });
    expect(backLink).toBeTruthy();
    fireEvent.click(backLink);
    expect(onBack).toHaveBeenCalled();

    const perfectHeading = document.getElementById(
      "recipe-variant-perfect-heading",
    );
    const houseHeading = document.getElementById(
      "recipe-variant-house-heading",
    );
    expect(perfectHeading).toBeTruthy();
    expect(houseHeading).toBeTruthy();
    expect(perfectHeading?.getAttribute("tabindex")).toBe("-1");
    expect(houseHeading?.getAttribute("tabindex")).toBe("-1");
  });

  it("marks House differences in header badge with difference count and tooltip", () => {
    const ing = (id: string, name: string, amount: string) => ({
      id,
      amount,
      unit: "oz",
      ingredient_name: name,
      preparation: null,
      sort_order: 1,
    });
    const perfect = {
      ...variant("perfect"),
      ingredients: [ing("p1", "Rum", "2"), ing("p2", "Syrup", "0.5")],
      steps: [
        { id: "ps1", instruction: "Shake", sort_order: 1 },
        { id: "ps2", instruction: "Strain into ribbed glass", sort_order: 2 },
      ],
    };
    const house = {
      ...variant("house"),
      ingredients: [ing("h1", "Rum", "2"), ing("h2", "Syrup", "0.25")],
      steps: [
        { id: "hs1", instruction: "Shake", sort_order: 1 },
        { id: "hs2", instruction: "Strain into rocks glass", sort_order: 2 },
      ],
    };
    render(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [perfect, house] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );

    // Syrup amount and step 2 differ (2 differences: ingredients, steps)
    const diffBadge = screen.getByText("2 differences");
    expect(diffBadge).toBeTruthy();
    const diffContainer = diffBadge.closest(".book-diff");
    expect(diffContainer?.getAttribute("title")).toContain("ingredients");
    expect(diffContainer?.getAttribute("title")).toContain("steps");
  });

  it("shows a shared center spine caption once when glass and rim are equivalent", () => {
    const shared = { glass: "Rocks", rim_type: "Salt", rim_notes: null };
    render(
      <RecipeDetailView
        recipe={{
          ...recipe,
          variants: [
            { ...variant("perfect"), ...shared },
            { ...variant("house"), ...shared },
          ],
        }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByTestId("recipe-spread")).toBeTruthy();
    expect(screen.getAllByTestId("recipe-image")).toHaveLength(1);
    const spine = document.querySelector(".book-spine");
    expect(spine).toBeTruthy();
    expect(within(spine as HTMLElement).getByText("Salt rim")).toBeTruthy();
    expect(within(spine as HTMLElement).getByText("Rocks")).toBeTruthy();
  });

  it("displays per-page metadata when House glass specs differ", () => {
    render(
      <RecipeDetailView
        recipe={{
          ...recipe,
          variants: [
            { ...variant("perfect"), glass: "Ribbed rocks", rim_type: "None" },
            { ...variant("house"), glass: "Rocks", rim_type: "None" },
          ],
        }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText("Ribbed rocks")).toBeTruthy();
    expect(screen.getByText("Rocks")).toBeTruthy();
    expect(screen.getAllByTestId("recipe-image")).toHaveLength(1);
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
    expect(screen.getByText("Synthetic tip")).toBeTruthy();
    expect(screen.getByText("Synthetic method")).toBeTruthy();
    expect(
      screen.getAllByText("Synthetic glass").length,
    ).toBeGreaterThanOrEqual(1);
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
    expect(screen.getByTestId("recipe-single")).toBeTruthy();
    expect(screen.queryByTestId("recipe-spread")).toBeNull();
    expect(screen.getByRole("heading", { name: "Perfect" })).toBeTruthy();

    rerender(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [variant("house")] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "House" })).toBeTruthy();
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

  it("renders open-book structure: book header -> dual spread with left page, center spine image, right page", () => {
    const content = {
      ...variant("perfect"),
      method: "Stir",
      ingredients: [
        {
          id: "i1",
          amount: "2",
          unit: "oz",
          ingredient_name: "Bourbon",
          preparation: null,
          sort_order: 1,
        },
      ],
    };

    const { container } = render(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [content, variant("house")] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );

    const titleEl = screen.getByRole("heading", { level: 1 });
    const spreadEl = screen.getByTestId("recipe-spread");
    const perfectPage = container.querySelector("#recipe-variant-perfect");
    const spineEl = container.querySelector(".book-spine");
    const housePage = container.querySelector("#recipe-variant-house");

    expect(titleEl).toBeTruthy();
    expect(spreadEl).toBeTruthy();
    expect(perfectPage).toBeTruthy();
    expect(spineEl).toBeTruthy();
    expect(housePage).toBeTruthy();

    // Verify DOM structure: title precedes spread
    expect(
      titleEl.compareDocumentPosition(spreadEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Within spread: perfect precedes spine, spine precedes house
    expect(
      perfectPage!.compareDocumentPosition(spineEl!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      spineEl!.compareDocumentPosition(housePage!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders Quick Measure and derived Oz Ratio inside Details disclosure", () => {
    const content = {
      ...variant("perfect"),
      ingredients: [
        {
          id: "i1",
          amount: "2",
          unit: "oz",
          ingredient_name: "Bourbon or rye",
          preparation: null,
          sort_order: 1,
        },
        {
          id: "i2",
          amount: "0.25",
          unit: "oz",
          ingredient_name: "Simple syrup",
          preparation: null,
          sort_order: 2,
        },
        {
          id: "i3",
          amount: "2",
          unit: "dashes",
          ingredient_name: "Orange bitters",
          preparation: null,
          sort_order: 3,
        },
      ],
    };

    render(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [content] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/quick measure/i)).toBeTruthy();
    const ratioBadge = screen.getByTestId("oz-ratio");
    expect(ratioBadge.textContent?.trim()).toBe("Oz Ratio 8 : 1");
    const qmSection = screen.getByLabelText(/quick measure/i);
    expect(within(qmSection).getByText("2 dashes")).toBeTruthy();
    expect(within(qmSection).getByText("Orange bitters")).toBeTruthy();
  });

  it("renders Bartender Tips preserving multiline and omits Tips when empty", () => {
    const withTips = {
      ...variant("perfect"),
      tips: "Line one tip\nLine two tip",
    };

    const { rerender } = render(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [withTips] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText(/BARTENDER NOTE/)).toBeTruthy();
    expect(
      screen.getByText(
        (content) =>
          content.includes("Line one tip") && content.includes("Line two tip"),
      ),
    ).toBeTruthy();

    const withoutTips = {
      ...variant("perfect"),
      tips: "   ",
    };

    rerender(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [withoutTips] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByText(/BARTENDER NOTE/)).toBeNull();
  });

  it("renders shared Bartender Tip in spine caption when Perfect and House tips match", () => {
    const sharedTip = "Shared bartender technique tip";
    const perfect = { ...variant("perfect"), tips: sharedTip };
    const house = { ...variant("house"), tips: sharedTip };

    render(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [perfect, house] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );

    const spine = document.querySelector(".book-spine");
    expect(spine).toBeTruthy();
    expect(within(spine as HTMLElement).getByText(sharedTip)).toBeTruthy();
  });

  it("supports unit toggle between oz and ml", () => {
    const content = {
      ...variant("perfect"),
      ingredients: [
        {
          id: "i1",
          amount: "2",
          unit: "oz",
          ingredient_name: "Bourbon",
          preparation: null,
          sort_order: 1,
        },
      ],
    };

    render(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [content, variant("house")] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );

    // Initial state is oz
    const ozButton = screen.getByRole("button", { name: "oz" });
    const mlButton = screen.getByRole("button", { name: "ml" });
    expect(ozButton.getAttribute("aria-pressed")).toBe("true");
    expect(mlButton.getAttribute("aria-pressed")).toBe("false");

    // Click ml
    fireEvent.click(mlButton);
    expect(mlButton.getAttribute("aria-pressed")).toBe("true");
    expect(ozButton.getAttribute("aria-pressed")).toBe("false");
    // 2 oz = 60 ml
    expect(screen.getByText("60")).toBeTruthy();
    expect(screen.getAllByText("ml").length).toBeGreaterThanOrEqual(1);
  });
});
