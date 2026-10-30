import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseCanonicalMarkdown } from "./generate-normalized-payload.mjs";
import { importSchema } from "./import-schema.mjs";

const CANONICAL_PATH =
  "artifacts/recipes-prod-execution/canonical_monks_recipes.md";
const hasCanonical = existsSync(CANONICAL_PATH);

describe("canonical recipe markdown parsing with synthetic fixture", () => {
  it("parses synthetic markdown recipes", () => {
    const synthetic = `
## 1 — Test Cocktail
\`\`\`yaml
db_recipe_number: 1
source_recipe_number: 1
name: "Test Cocktail"
slug: "test-cocktail"
category: "Signature Cocktails"
is_active: true
\`\`\`
### Perfect Recipe
#### Ingredients
| # | Ingredient | Amount / detail |
|---:|---|---|
| 1 | Vodka | 2 oz |
**Method:** Stir
#### Steps
1. Stir with ice.
**Rim:** None
**Garnish:** Lime
**Ideal glass:** Rocks
### House Recipe
#### Ingredients
| # | Ingredient | Amount / detail |
|---:|---|---|
| 1 | House Vodka | 2 oz |
**Method:** Stir
#### Steps
1. Stir with ice.
**Rim:** None
**Garnish:** Lime
**Ideal glass:** Rocks
`;
    const recipes = parseCanonicalMarkdown(synthetic);
    expect(recipes).toHaveLength(1);
    expect(recipes[0].name).toBe("Test Cocktail");
    expect(recipes[0].category_slug).toBe("signature-cocktails");
  });
});

describe.runIf(hasCanonical)(
  "canonical recipe markdown parsing and validation",
  () => {
    const rawText = hasCanonical ? readFileSync(CANONICAL_PATH, "utf8") : "";
    const recipes = hasCanonical ? parseCanonicalMarkdown(rawText) : [];

    it("parses exactly 38 recipes", () => {
      expect(recipes).toHaveLength(38);
    });

    it("assigns unique DB recipe numbers 1 through 38", () => {
      const numbers = recipes.map((r) => r.recipe_number);
      expect(numbers).toEqual(Array.from({ length: 38 }, (_, i) => i + 1));
    });

    it("maps recipes to the 5 allowed categories with correct counts", () => {
      const counts: Record<string, number> = {};
      for (const r of recipes) {
        counts[r.category_slug] = (counts[r.category_slug] || 0) + 1;
      }
      expect(counts).toEqual({
        "signature-cocktails": 20,
        margaritas: 4,
        martinis: 6,
        mocktails: 7,
        shots: 1,
      });
    });

    it("provides both perfect and house variants for all 38 recipes (76 variants)", () => {
      for (const r of recipes) {
        expect(r.variants.perfect).toBeDefined();
        expect(r.variants.house).toBeDefined();
        expect(r.variants.perfect?.ingredients.length).toBeGreaterThan(0);
        expect(r.variants.perfect?.steps.length).toBeGreaterThan(0);
        expect(r.variants.house?.ingredients.length).toBeGreaterThan(0);
        expect(r.variants.house?.steps.length).toBeGreaterThan(0);
      }
    });

    it("includes the two owner-approved resolved warnings", () => {
      const virginCoco = recipes.find(
        (r) => r.name.toLowerCase() === "virgin coco margarita splash",
      );
      expect(virginCoco?.import_warnings).toEqual([
        {
          id: "virgin-coco-quantity",
          message:
            "House quantities are ambiguous in the source (0.75 oz or 2 oz). Do not choose one automatically.",
          status: "resolved",
          resolution:
            "Owner approved standard balanced House build: Coconut cream 0.75 oz, Sweet & sour mix 0.75 oz.",
          approved_by: "Owner (Raj)",
          approved_on: "2026-10-29",
        },
      ]);

      const smokedVanilla = recipes.find(
        (r) => r.name.toLowerCase() === "smoked vanilla old fashioned",
      );
      expect(smokedVanilla?.import_warnings).toEqual([
        {
          id: "smoked-vanilla-alternative",
          message:
            "The house build presents Absolut Vanilia - 0.5 oz or Vanilla syrup - 0.5 oz as alternatives.",
          status: "resolved",
          resolution:
            "Owner approved House build using Vanilla syrup 0.5 oz (syrup modifier profile).",
          approved_by: "Owner (Raj)",
          approved_on: "2026-10-29",
        },
      ]);
    });

    it("verifies owner decisions on ingredients for recipes 20 and 33", () => {
      const virginCoco = recipes.find(
        (r) => r.name.toLowerCase() === "virgin coco margarita splash",
      );
      const cocoCream = virginCoco?.variants.house?.ingredients.find((i) =>
        i.ingredient_name.toLowerCase().includes("coconut cream"),
      );
      const sourMix = virginCoco?.variants.house?.ingredients.find((i) =>
        i.ingredient_name.toLowerCase().includes("sweet and sour"),
      );
      expect(cocoCream?.amount).toBe("0.75 oz");
      expect(sourMix?.amount).toBe("0.75 oz");

      const smokedVanilla = recipes.find(
        (r) => r.name.toLowerCase() === "smoked vanilla old fashioned",
      );
      const names = smokedVanilla?.variants.house?.ingredients.map(
        (i) => i.ingredient_name,
      );
      expect(names).toContain("Vanilla syrup");
      expect(names).not.toContain("Absolut Vanilia");
      expect(names).not.toContain("Or");
    });

    it("validates the entire structure against importSchema", () => {
      const payload = {
        format: "the-lineup.bar-recipes.import",
        version: 1,
        source: {
          title: "The Monks Cocktail Recipe Book — DB-Ready Markdown",
          document: "monks_cocktail_recipes_db_ready.md",
          sha256:
            "f3a82e5b448da2ad6b8006dffec30a0a7ef1bcfe82044f42fe9774772c45bced",
          approved_by: "Canonical source import",
          approved_on: "2026-10-29",
          corrections: [
            {
              recipe_number: 20,
              field: "variants.house.ingredients",
              note: "Owner approved House build using Vanilla syrup 0.5 oz; excluded alternative Absolut Vanilia.",
              approved_on: "2026-10-29",
            },
            {
              recipe_number: 33,
              field: "variants.house.ingredients",
              note: "Owner approved standard balanced House build: Coconut cream 0.75 oz, Sweet & sour mix 0.75 oz.",
              approved_on: "2026-10-29",
            },
          ],
        },
        categories: [
          {
            name: "Signature Cocktails",
            slug: "signature-cocktails",
            display_order: 0,
          },
          { name: "Margaritas", slug: "margaritas", display_order: 1 },
          { name: "Martinis", slug: "martinis", display_order: 2 },
          { name: "Mocktails", slug: "mocktails", display_order: 3 },
          { name: "Shots", slug: "shots", display_order: 4 },
        ],
        recipes,
      };
      expect(importSchema.safeParse(payload).success).toBe(true);
    });
  },
);
