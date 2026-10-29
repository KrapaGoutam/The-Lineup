import { describe, expect, it } from "vitest";
import {
  deriveOzRatio,
  deriveQuickGlance,
  deriveQuickMeasure,
} from "./recipe-glance";
import type { DetailVariant, RecipeDetail } from "./recipe-detail";

describe("deriveQuickMeasure", () => {
  it("derives structured measurement items and preserves source text", () => {
    const ingredients = [
      {
        id: "1",
        amount: "2",
        unit: "oz",
        ingredient_name: "Bourbon or rye",
        preparation: null,
        sort_order: 1,
      },
      {
        id: "2",
        amount: ".25",
        unit: "oz",
        ingredient_name: "Simple syrup",
        preparation: null,
        sort_order: 2,
      },
      {
        id: "3",
        amount: "2",
        unit: "dashes",
        ingredient_name: "Orange bitters",
        preparation: null,
        sort_order: 3,
      },
    ];

    const result = deriveQuickMeasure(ingredients);
    expect(result).toEqual([
      {
        id: "1",
        measure: "2 oz",
        name: "Bourbon or rye",
        rawText: "2 oz Bourbon or rye",
      },
      {
        id: "2",
        measure: ".25 oz",
        name: "Simple syrup",
        rawText: ".25 oz Simple syrup",
      },
      {
        id: "3",
        measure: "2 dashes",
        name: "Orange bitters",
        rawText: "2 dashes Orange bitters",
      },
    ]);
  });

  it("handles mixed amounts without units and omits empty rows", () => {
    const ingredients = [
      {
        id: "1",
        amount: "Top",
        unit: null,
        ingredient_name: "Club soda",
        preparation: null,
        sort_order: 1,
      },
      {
        id: "2",
        amount: "",
        unit: "",
        ingredient_name: "",
        preparation: null,
        sort_order: 2,
      },
      {
        id: "3",
        amount: null,
        unit: null,
        ingredient_name: "Mint sprig",
        preparation: null,
        sort_order: 3,
      },
    ];

    const result = deriveQuickMeasure(ingredients);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "1",
      measure: "Top",
      name: "Club soda",
      rawText: "Top Club soda",
    });
    expect(result[1]).toEqual({
      id: "3",
      measure: "",
      name: "Mint sprig",
      rawText: "Mint sprig",
    });
  });

  it("does not mutate input array or objects", () => {
    const original = [
      {
        id: "1",
        amount: "2",
        unit: "oz",
        ingredient_name: "Gin",
        preparation: null,
        sort_order: 1,
      },
    ];
    const frozen = Object.freeze([...original]);
    const result = deriveQuickMeasure(frozen);
    expect(result).toHaveLength(1);
    expect(frozen[0].ingredient_name).toBe("Gin");
  });
});

describe("deriveOzRatio", () => {
  it("computes 8:1 for 2 oz spirit and .25 oz syrup with dashes excluded", () => {
    const ingredients = [
      {
        id: "1",
        amount: "2",
        unit: "oz",
        ingredient_name: "Bourbon or rye",
        preparation: null,
        sort_order: 1,
      },
      {
        id: "2",
        amount: "0.25",
        unit: "oz",
        ingredient_name: "Simple syrup",
        preparation: null,
        sort_order: 2,
      },
      {
        id: "3",
        amount: "2",
        unit: "dashes",
        ingredient_name: "Orange bitters",
        preparation: null,
        sort_order: 3,
      },
    ];

    const ratio = deriveOzRatio(ingredients);
    expect(ratio).not.toBeNull();
    expect(ratio?.ratio).toBe("8 : 1");
    expect(ratio?.parts).toEqual([
      { amount: "2 oz", name: "Bourbon or rye" },
      { amount: "0.25 oz", name: "Simple syrup" },
    ]);
    expect(ratio?.excluded).toEqual(["2 dashes Orange bitters"]);
    expect(ratio?.excludedSummary).toBe("+ 2 dashes Orange bitters");
  });

  it("handles leading decimal point like .25 and multiple bitters", () => {
    const ingredients = [
      {
        id: "1",
        amount: "2",
        unit: "oz",
        ingredient_name: "Makers Mark",
        preparation: null,
        sort_order: 1,
      },
      {
        id: "2",
        amount: ".25",
        unit: "oz",
        ingredient_name: "Simple syrup",
        preparation: null,
        sort_order: 2,
      },
      {
        id: "3",
        amount: "2",
        unit: "dashes",
        ingredient_name: "Orange bitters",
        preparation: null,
        sort_order: 3,
      },
      {
        id: "4",
        amount: "1",
        unit: "dash",
        ingredient_name: "Aromatic bitters",
        preparation: null,
        sort_order: 4,
      },
    ];

    const ratio = deriveOzRatio(ingredients);
    expect(ratio?.ratio).toBe("8 : 1");
    expect(ratio?.excluded).toEqual([
      "2 dashes Orange bitters",
      "1 dash Aromatic bitters",
    ]);
    expect(ratio?.excludedSummary).toBe(
      "+ 2 dashes Orange bitters, 1 dash Aromatic bitters",
    );
  });

  it("computes ratio for three compatible ounce values", () => {
    const ingredients = [
      {
        id: "1",
        amount: "1.5",
        unit: "oz",
        ingredient_name: "Rye whiskey",
        preparation: null,
        sort_order: 1,
      },
      {
        id: "2",
        amount: "0.75",
        unit: "oz",
        ingredient_name: "Sweet vermouth",
        preparation: null,
        sort_order: 2,
      },
      {
        id: "3",
        amount: "0.75",
        unit: "oz",
        ingredient_name: "Campari",
        preparation: null,
        sort_order: 3,
      },
    ];

    const ratio = deriveOzRatio(ingredients);
    expect(ratio?.ratio).toBe("2 : 1 : 1");
  });

  it("omits ratio when mixed volume units are present (e.g. ml and oz)", () => {
    const ingredients = [
      {
        id: "1",
        amount: "50",
        unit: "ml",
        ingredient_name: "Gin",
        preparation: null,
        sort_order: 1,
      },
      {
        id: "2",
        amount: "1",
        unit: "oz",
        ingredient_name: "Dry vermouth",
        preparation: null,
        sort_order: 2,
      },
    ];

    expect(deriveOzRatio(ingredients)).toBeNull();
  });

  it("omits ratio when a metric amount is written without a space (30ml)", () => {
    const row = (
      id: string,
      amount: string,
      unit: string | null,
      name: string,
    ) => ({
      id,
      amount,
      unit,
      ingredient_name: name,
      preparation: null,
      sort_order: 1,
    });
    expect(
      deriveOzRatio([
        row("1", "2", "oz", "Gin"),
        row("2", "1", "oz", "Dry vermouth"),
        row("3", "30ml", null, "Campari"),
      ]),
    ).toBeNull();
    expect(
      deriveOzRatio([
        row("1", "2", "oz", "Gin"),
        row("2", "1", "oz", "Dry vermouth"),
        row("3", "1.5cl", null, "Campari"),
      ]),
    ).toBeNull();
  });

  it("treats fl oz as an ounce unit instead of silently excluding it", () => {
    const row = (id: string, amount: string, unit: string, name: string) => ({
      id,
      amount,
      unit,
      ingredient_name: name,
      preparation: null,
      sort_order: 1,
    });
    const result = deriveOzRatio([
      row("1", "2", "fl oz", "Gin"),
      row("2", "1", "fl oz", "Dry vermouth"),
      row("3", "1", "oz", "Campari"),
    ]);
    expect(result?.ratio).toBe("2 : 1 : 1");
    expect(result?.excluded).toEqual([]);
  });

  it("omits ratio when less than two ounce ingredients are present", () => {
    const ingredients = [
      {
        id: "1",
        amount: "2",
        unit: "oz",
        ingredient_name: "Bourbon",
        preparation: null,
        sort_order: 1,
      },
      {
        id: "2",
        amount: "Top",
        unit: null,
        ingredient_name: "Club soda",
        preparation: null,
        sort_order: 2,
      },
    ];

    expect(deriveOzRatio(ingredients)).toBeNull();
  });

  it("omits ratio when amount is ambiguous or malformed text", () => {
    const ingredients = [
      {
        id: "1",
        amount: "2-3",
        unit: "oz",
        ingredient_name: "Rum",
        preparation: null,
        sort_order: 1,
      },
      {
        id: "2",
        amount: "1",
        unit: "oz",
        ingredient_name: "Lime juice",
        preparation: null,
        sort_order: 2,
      },
    ];

    expect(deriveOzRatio(ingredients)).toBeNull();
  });

  it("omits ratio when amount is zero or negative", () => {
    const ingredients = [
      {
        id: "1",
        amount: "0",
        unit: "oz",
        ingredient_name: "Spirit",
        preparation: null,
        sort_order: 1,
      },
      {
        id: "2",
        amount: "1",
        unit: "oz",
        ingredient_name: "Syrup",
        preparation: null,
        sort_order: 2,
      },
    ];

    expect(deriveOzRatio(ingredients)).toBeNull();
  });

  it("excludes top and splash correctly without omitting ratio if 2 oz ingredients exist", () => {
    const ingredients = [
      {
        id: "1",
        amount: "2",
        unit: "oz",
        ingredient_name: "Tequila",
        preparation: null,
        sort_order: 1,
      },
      {
        id: "2",
        amount: "1",
        unit: "oz",
        ingredient_name: "Lime juice",
        preparation: null,
        sort_order: 2,
      },
      {
        id: "3",
        amount: "Top",
        unit: null,
        ingredient_name: "Grapefruit soda",
        preparation: null,
        sort_order: 3,
      },
      {
        id: "4",
        amount: "Splash",
        unit: null,
        ingredient_name: "Agave nectar",
        preparation: null,
        sort_order: 4,
      },
    ];

    const ratio = deriveOzRatio(ingredients);
    expect(ratio).not.toBeNull();
    expect(ratio?.ratio).toBe("2 : 1");
    expect(ratio?.excluded).toEqual([
      "Top Grapefruit soda",
      "Splash Agave nectar",
    ]);
    expect(ratio?.excludedSummary).toBe("+ other ingredients as listed");
  });
});

describe("deriveQuickGlance", () => {
  const sampleVariant = (
    kind: "perfect" | "house",
    overrides?: Partial<DetailVariant>,
  ): DetailVariant => ({
    id: kind,
    variant: kind,
    method: "Stir",
    rim_type: null,
    rim_notes: null,
    glass: "Old Fashioned / Rocks",
    glass_notes: null,
    presentation_notes: null,
    tips: null,
    batch_notes: null,
    ingredients: [
      {
        id: "1",
        amount: "2",
        unit: "oz",
        ingredient_name: kind === "house" ? "Makers Mark" : "Bourbon or rye",
        preparation: null,
        sort_order: 1,
      },
      {
        id: "2",
        amount: ".25",
        unit: "oz",
        ingredient_name: "Simple syrup",
        preparation: null,
        sort_order: 2,
      },
      {
        id: "3",
        amount: "2",
        unit: "dashes",
        ingredient_name: "Orange bitters",
        preparation: null,
        sort_order: 3,
      },
    ],
    steps: [{ id: "s1", instruction: "Stir with ice.", sort_order: 1 }],
    garnishes: [
      { id: "g1", name: "Orange peel and cherry", notes: null, sort_order: 1 },
    ],
    ...overrides,
  });

  it("derives complete quick glance summary for Perfect and House", () => {
    const recipe: RecipeDetail = {
      id: "r16",
      name: "Old Fashioned",
      slug: "old-fashioned",
      recipe_number: 16,
      base_spirit: "Bourbon",
      description: null,
      is_popular: true,
      is_menu_item: false,
      category: "Cocktails",
      variants: [sampleVariant("perfect"), sampleVariant("house")],
    };

    const glance = deriveQuickGlance(recipe);
    expect(glance.variants).toHaveLength(2);
    expect(glance.commonGlass).toBe("Old Fashioned / Rocks");

    const perfect = glance.variants[0];
    expect(perfect.label).toBe("Perfect");
    expect(perfect.method).toBe("Stir");
    expect(perfect.summaryText).toBe(
      "Stir · 2 oz Bourbon or rye · .25 oz Simple syrup · 2 dashes Orange bitters",
    );
    expect(perfect.garnish).toBe("Orange peel and cherry");

    const house = glance.variants[1];
    expect(house.label).toBe("House");
    expect(house.summaryText).toBe(
      "Stir · 2 oz Makers Mark · .25 oz Simple syrup · 2 dashes Orange bitters",
    );
  });

  it("handles single-variant recipes without undefined or broken punctuation", () => {
    const recipe: RecipeDetail = {
      id: "r1",
      name: "Minimal Recipe",
      slug: "minimal-recipe",
      recipe_number: 1,
      base_spirit: null,
      description: null,
      is_popular: false,
      is_menu_item: false,
      category: "Classics",
      variants: [
        sampleVariant("perfect", {
          method: null,
          glass: null,
          garnishes: [],
          ingredients: [],
        }),
      ],
    };

    const glance = deriveQuickGlance(recipe);
    expect(glance.variants).toHaveLength(1);
    expect(glance.commonGlass).toBeNull();
    expect(glance.variants[0].summaryText).toBe("");
    expect(glance.variants[0].glass).toBeNull();
    expect(glance.variants[0].garnish).toBeNull();
  });
});
