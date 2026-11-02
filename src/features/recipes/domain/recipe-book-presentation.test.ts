import { describe, expect, it } from "vitest";
import {
  countDifferences,
  emphasiseVerb,
  formatGlass,
  formatGarnishes,
  formatRim,
  isLongRecipe,
  parseQuantityAmount,
  splitQuantity,
} from "./recipe-book-presentation";
import type { DetailVariant } from "./recipe-detail";
import type { PresentationData } from "./recipe-differences";

describe("recipe-book-presentation helpers", () => {
  describe("parseQuantityAmount", () => {
    it("parses integers, decimals, simple fractions, mixed numbers, and unicode fractions", () => {
      expect(parseQuantityAmount("2")).toBe(2);
      expect(parseQuantityAmount("0.25")).toBe(0.25);
      expect(parseQuantityAmount(".25")).toBe(0.25);
      expect(parseQuantityAmount("1.5")).toBe(1.5);
      expect(parseQuantityAmount("1/2")).toBe(0.5);
      expect(parseQuantityAmount("3/4")).toBe(0.75);
      expect(parseQuantityAmount("1 1/2")).toBe(1.5);
      expect(parseQuantityAmount("¼")).toBe(0.25);
      expect(parseQuantityAmount("½")).toBe(0.5);
      expect(parseQuantityAmount("1 ½")).toBe(1.5);
    });

    it("returns null for non-numeric or empty strings", () => {
      expect(parseQuantityAmount("")).toBeNull();
      expect(parseQuantityAmount("   ")).toBeNull();
      expect(parseQuantityAmount("top")).toBeNull();
      expect(parseQuantityAmount("8–10")).toBeNull();
      expect(parseQuantityAmount(null)).toBeNull();
      expect(parseQuantityAmount(undefined)).toBeNull();
    });
  });

  describe("splitQuantity", () => {
    it("splits oz quantities into whole and fraction components with two decimals", () => {
      expect(splitQuantity("2", "oz", "oz")).toEqual({
        w: "2",
        f: "",
        u: "oz",
      });
      expect(splitQuantity("0.25", "oz", "oz")).toEqual({
        w: "0",
        f: ".25",
        u: "oz",
      });
      expect(splitQuantity(".25", "oz", "oz")).toEqual({
        w: "0",
        f: ".25",
        u: "oz",
      });
      expect(splitQuantity("1.5", "oz", "oz")).toEqual({
        w: "1",
        f: ".50",
        u: "oz",
      });
      expect(splitQuantity("0.75", "oz", "oz")).toEqual({
        w: "0",
        f: ".75",
        u: "oz",
      });
    });

    it("converts oz to ml at 30 ml / oz with at most one decimal", () => {
      expect(splitQuantity("2", "oz", "ml")).toEqual({
        w: "60",
        f: "",
        u: "ml",
      });
      expect(splitQuantity("0.25", "oz", "ml")).toEqual({
        w: "7",
        f: ".5",
        u: "ml",
      });
      expect(splitQuantity("0.75", "oz", "ml")).toEqual({
        w: "22",
        f: ".5",
        u: "ml",
      });
      expect(splitQuantity("1.5", "oz", "ml")).toEqual({
        w: "45",
        f: "",
        u: "ml",
      });
    });

    it("handles non-ounce units and text amounts without conversion", () => {
      expect(splitQuantity("8–10", "", "oz")).toEqual({
        w: "8–10",
        f: "",
        u: "",
      });
      expect(splitQuantity("8–10", "", "ml")).toEqual({
        w: "8–10",
        f: "",
        u: "",
      });
      expect(splitQuantity("", "top", "oz")).toEqual({
        w: "",
        f: "",
        u: "top",
      });
      expect(splitQuantity("", "top", "ml")).toEqual({
        w: "",
        f: "",
        u: "top",
      });
      expect(splitQuantity("1", "dash", "oz")).toEqual({
        w: "1",
        f: "",
        u: "dash",
      });
      expect(splitQuantity("1", "dash", "ml")).toEqual({
        w: "1",
        f: "",
        u: "dash",
      });
      expect(splitQuantity("3", "", "oz")).toEqual({
        w: "3",
        f: "",
        u: "",
      });
    });

    it("handles null or undefined inputs safely", () => {
      expect(splitQuantity(null, null)).toEqual({ w: "", f: "", u: "" });
      expect(splitQuantity(undefined, undefined)).toEqual({
        w: "",
        f: "",
        u: "",
      });
    });
  });

  describe("emphasiseVerb", () => {
    it("emphasises matching verb in the first word", () => {
      expect(emphasiseVerb("Add all ingredients to mixing glass.")).toEqual({
        pre: "",
        verb: "Add",
        post: " all ingredients to mixing glass.",
      });
      expect(emphasiseVerb("Stir until chilled and diluted.")).toEqual({
        pre: "",
        verb: "Stir",
        post: " until chilled and diluted.",
      });
      expect(emphasiseVerb("Strain over a large cube.")).toEqual({
        pre: "",
        verb: "Strain",
        post: " over a large cube.",
      });
      expect(emphasiseVerb("Smoke if desired.")).toEqual({
        pre: "",
        verb: "Smoke",
        post: " if desired.",
      });
    });

    it("emphasises matching verb in the second word", () => {
      expect(emphasiseVerb("Gently muddle mint.")).toEqual({
        pre: "Gently ",
        verb: "muddle",
        post: " mint.",
      });
      expect(emphasiseVerb("Lightly shake with ice.")).toEqual({
        pre: "Lightly ",
        verb: "shake",
        post: " with ice.",
      });
    });

    it("returns plain text when no matching verb is found in the first two words", () => {
      expect(emphasiseVerb("Wait for 5 minutes.")).toEqual({
        pre: "",
        verb: "",
        post: "Wait for 5 minutes.",
      });
      expect(emphasiseVerb("")).toEqual({
        pre: "",
        verb: "",
        post: "",
      });
    });
  });

  describe("isLongRecipe", () => {
    const makeVariant = (ingCount: number, stepCount: number): DetailVariant =>
      ({
        id: "v",
        variant: "perfect",
        ingredients: Array.from({ length: ingCount }, (_, i) => ({
          id: `i${i}`,
          amount: "1",
          unit: "oz",
          ingredient_name: `Ing ${i}`,
          sort_order: i,
        })),
        steps: Array.from({ length: stepCount }, (_, i) => ({
          id: `s${i}`,
          instruction: `Step ${i}`,
          sort_order: i,
        })),
        garnishes: [],
      }) as unknown as DetailVariant;

    it("returns false when both ingredients and steps are <= 5 (Old Fashioned)", () => {
      expect(isLongRecipe([makeVariant(5, 5), makeVariant(5, 4)])).toBe(false);
    });

    it("returns true when ingredients or steps exceed 5 (Mojito)", () => {
      expect(isLongRecipe([makeVariant(5, 6), makeVariant(6, 6)])).toBe(true);
      expect(isLongRecipe([makeVariant(6, 3), makeVariant(5, 4)])).toBe(true);
    });
  });

  describe("formatRim", () => {
    it("returns 'No rim' when empty or 'none'", () => {
      expect(formatRim(null)).toBe("No rim");
      expect(formatRim("")).toBe("No rim");
      expect(formatRim("None")).toBe("No rim");
      expect(formatRim("none")).toBe("No rim");
      expect(formatRim("No rim")).toBe("No rim");
    });

    it("formats rim with 'rim' suffix if omitted", () => {
      expect(formatRim("Salt")).toBe("Salt rim");
      expect(formatRim("Sugar")).toBe("Sugar rim");
      expect(formatRim("Smoked salt rim")).toBe("Smoked salt rim");
    });

    it("formats rim with notes", () => {
      expect(formatRim("Salt", "half rim")).toBe("Salt · half rim");
    });
  });

  describe("formatGlass and formatGarnishes", () => {
    it("formats glass correctly", () => {
      expect(formatGlass("Rocks")).toBe("Rocks");
      expect(formatGlass("Old Fashioned / Rocks")).toBe(
        "Old Fashioned / Rocks",
      );
      expect(formatGlass("Highball", "tall")).toBe("Highball · tall");
    });

    it("formats garnishes correctly", () => {
      expect(formatGarnishes([])).toBe("");
      expect(
        formatGarnishes([
          { id: "g1", name: "Mint sprig", notes: null, sort_order: 1 },
          { id: "g2", name: "Lime wheel", notes: "fresh", sort_order: 2 },
        ]),
      ).toBe("Mint sprig, Lime wheel · fresh");
    });
  });

  describe("countDifferences", () => {
    it("counts differences across ingredients, method, glass, rim, garnish, and steps", () => {
      const perfect = {
        id: "p",
        variant: "perfect",
        method: "Stir",
        glass: "Rocks",
        rim_type: "None",
        garnishes: [{ id: "g1", name: "Cherry", notes: null, sort_order: 1 }],
        ingredients: [],
        steps: [],
      } as unknown as DetailVariant;

      const house = {
        id: "h",
        variant: "house",
        method: "Stir",
        glass: "Rocks",
        rim_type: "None",
        garnishes: [
          { id: "g2", name: "Orange peel", notes: null, sort_order: 1 },
        ],
        ingredients: [],
        steps: [],
      } as unknown as DetailVariant;

      const diffs = {
        house: {
          ingredientIds: new Set(["i1"]),
          stepIds: new Set(["s1"]),
          addedIngredients: [],
          adjustedIngredients: [],
          addedSteps: [],
          adjustedSteps: [],
        },
      };

      const presentation: PresentationData = {
        mode: "shared",
        differing: new Set(),
        specs: [],
      };

      const result = countDifferences(perfect, house, diffs, presentation);
      expect(result.count).toBe(3); // ingredients, garnish, steps
      expect(result.areas).toEqual(["ingredients", "garnish", "steps"]);
      expect(result.label).toBe("3 differences");
      expect(result.title).toBe(
        "Differs from Perfect: ingredients, garnish, steps",
      );
    });
  });
});
