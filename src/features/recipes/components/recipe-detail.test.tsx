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

describe("recipe detail", () => {
  it("treats a legacy empty Perfect variant as absent without hiding meaningful House data", () => {
    const empty = { ...variant("perfect"), ingredients: [], steps: [] };
    render(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [empty, variant("house")] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByTestId("recipe-single")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Perfect Bartending Recipe" }),
    ).toBeNull();
    expect(screen.getByRole("heading", { name: "House Recipe" })).toBeTruthy();
    expect(
      screen.queryByRole("navigation", { name: "Jump to recipe" }),
    ).toBeNull();
    expect(screen.queryByText("Perfect Presentation")).toBeNull();
  });
  it("renders both complete recipes stacked Perfect then House with no tabs", () => {
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
    const perfect = screen.getByRole("heading", {
      name: "Perfect Bartending Recipe",
    });
    const house = screen.getByRole("heading", { name: "House Recipe" });
    expect(
      perfect.compareDocumentPosition(house) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Both recipes are complete and rendered once each (no hidden duplicates).
    expect(screen.getAllByText("Synthetic step")).toHaveLength(2);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("offers keyboard-accessible Perfect and House jump links only when both exist", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
    }) as unknown as typeof window.matchMedia;
    const { rerender } = render(
      <RecipeDetailView recipe={recipe} backHref="/" onBack={vi.fn()} />,
    );
    const nav = screen.getByRole("navigation", { name: "Jump to recipe" });
    const house = within(nav).getByRole("link", { name: /House/ });
    expect(within(nav).getByRole("link", { name: /Perfect/ })).toBeTruthy();
    fireEvent.click(house);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
    expect(document.activeElement?.id).toBe("recipe-variant-house-heading");
    rerender(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [variant("perfect")] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("navigation", { name: "Jump to recipe" }),
    ).toBeNull();
  });

  it("marks House differences with a text note and leaves unchanged rows plain", () => {
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
    // Syrup amount and the second step differ; Rum and step 1 do not.
    expect(screen.getAllByText("House adjustment")).toHaveLength(2);
    const houseRum = screen.getAllByText("Rum")[1].closest("li")!;
    expect(houseRum.textContent).not.toContain("House adjustment");
    const perfectSyrup = screen.getAllByText(/Syrup/)[0].closest("li")!;
    expect(perfectSyrup.textContent).toContain("differs in House recipe");
  });

  it("shows a shared Final Presentation once when specs are equivalent", () => {
    const shared = { glass: "Rocks", rim_type: "None" };
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
    expect(
      screen.getAllByRole("heading", { name: "Final Presentation" }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("heading", { name: "House Presentation" }),
    ).toBeNull();
    const presentation = screen
      .getByRole("heading", { name: "Final Presentation" })
      .closest("section")!;
    expect(within(presentation).getAllByText("Rocks")).toHaveLength(1);
    expect(screen.getAllByTestId("recipe-image")).toHaveLength(1);
  });

  it("splits Final Presentation when House specs differ, with one canonical image", () => {
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
    expect(
      screen.getByRole("heading", { name: "Perfect Presentation" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "House Presentation" }),
    ).toBeTruthy();
    const section = screen
      .getByRole("heading", { name: "Final Presentation" })
      .closest("section")!;
    expect(within(section).getByText("Ribbed rocks")).toBeTruthy();
    expect(within(section).getByText("Rocks")).toBeTruthy();
    // Only unchanged fields (Rim) are not flagged; Glass carries the note.
    expect(within(section).getAllByText("House adjustment")).toHaveLength(1);
    expect(screen.getAllByTestId("recipe-image")).toHaveLength(1);
  });

  it("shows Quick Glance values for both variants only where they differ", () => {
    render(
      <RecipeDetailView
        recipe={{
          ...recipe,
          variants: [
            { ...variant("perfect"), method: "Shake", glass: "Ribbed rocks" },
            { ...variant("house"), method: "Shake", glass: "Rocks" },
          ],
        }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );
    const glance = screen.getByLabelText(/quick glance/i);
    expect(within(glance).getAllByText("Shake")).toHaveLength(1);
    expect(within(glance).getByText("Ribbed rocks")).toBeTruthy();
    expect(within(glance).getByText("Rocks")).toBeTruthy();
    expect(within(glance).queryByText("Garnish")).toBeNull();
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
    expect(screen.getAllByText("Synthetic rim").length).toBe(2);
    // Method and Glass appear in both the Quick Glance strip and the recipe/presentation
    expect(screen.getAllByText("Synthetic method").length).toBe(2);
    expect(screen.getAllByText(/Synthetic glass/).length).toBe(2);
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
    expect(
      screen.queryByRole("navigation", { name: "Jump to recipe" }),
    ).toBeNull();
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

  it("renders detail order: title -> Quick Glance -> recipe content -> hero image", () => {
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
        {
          id: "i2",
          amount: ".25",
          unit: "oz",
          ingredient_name: "Simple",
          preparation: null,
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

    const titleEl = screen.getByRole("heading", { level: 1 });
    const quickGlanceSection = screen.getByLabelText(/quick glance/i);
    const quickMeasureSection = screen.getByLabelText(/quick measure/i);
    const imageContainer = container.querySelector(
      "[data-testid='recipe-image']",
    );

    expect(titleEl).toBeTruthy();
    expect(quickGlanceSection).toBeTruthy();
    expect(quickMeasureSection).toBeTruthy();
    expect(imageContainer).toBeTruthy();

    // Verify DOM order: title precedes Quick Glance
    expect(
      titleEl.compareDocumentPosition(quickGlanceSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Quick Glance precedes Quick Measure / Recipe content
    expect(
      quickGlanceSection.compareDocumentPosition(quickMeasureSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Recipe content precedes hero image (hero image must NEVER render before recipe content)
    expect(
      quickMeasureSection.compareDocumentPosition(imageContainer!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders Quick Measure and derived Oz Ratio when compatible", () => {
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
    expect(ratioBadge.textContent).toBe("Oz Ratio 8 : 1");
    expect(screen.getByText("+ 2 dashes Orange bitters")).toBeTruthy();
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

    expect(
      screen.getByRole("heading", { name: "Bartender Tips" }),
    ).toBeTruthy();
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

    expect(
      screen.queryByRole("heading", { name: "Bartender Tips" }),
    ).toBeNull();
  });

  it("labels the House variant tips House Notes and keeps Bartender Tips for Perfect (UI_UX_PLAN D-LBL)", () => {
    const perfect = { ...variant("perfect"), tips: "Perfect tip" };
    const house = { ...variant("house"), tips: "House tip" };

    render(
      <RecipeDetailView
        recipe={{ ...recipe, variants: [perfect, house] }}
        backHref="/"
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole("heading", { name: "House Notes" }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("heading", { name: "Bartender Tips" }),
    ).toHaveLength(1);
    const houseNotes = screen.getByRole("heading", { name: "House Notes" });
    expect(houseNotes.parentElement?.textContent).toContain("House tip");
    expect(houseNotes.parentElement?.textContent).not.toContain("Perfect tip");
  });
});
