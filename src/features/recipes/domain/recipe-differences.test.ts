import { describe, expect, it } from "vitest";
import type { DetailVariant } from "./recipe-detail";
import {
  derivePresentation,
  deriveVariantDifferences,
} from "./recipe-differences";
import { deriveGlanceFields, deriveQuickGlance } from "./recipe-glance";

const make = (
  kind: "perfect" | "house",
  over: Partial<DetailVariant> = {},
): DetailVariant => ({
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
  ingredients: [],
  steps: [],
  garnishes: [],
  ...over,
});
const ing = (id: string, name: string, amount: string, unit = "oz") => ({
  id,
  amount,
  unit,
  ingredient_name: name,
  preparation: null,
  sort_order: 1,
});

describe("deriveVariantDifferences", () => {
  it("flags only rows without an identical counterpart, ignoring case and spacing", () => {
    const perfect = make("perfect", {
      ingredients: [ing("p1", "Rum", "2"), ing("p2", "Syrup", "0.5")],
      steps: [{ id: "ps1", instruction: "Shake  well", sort_order: 1 }],
    });
    const house = make("house", {
      ingredients: [ing("h1", " rum ", "2"), ing("h2", "Syrup", "0.25")],
      steps: [{ id: "hs1", instruction: "shake well", sort_order: 1 }],
    });
    const d = deriveVariantDifferences(perfect, house);
    expect([...d.perfect.ingredientIds]).toEqual(["p2"]);
    expect([...d.house.ingredientIds]).toEqual(["h2"]);
    expect(d.house.stepIds.size).toBe(0);
  });

  it("flags nothing when only one variant exists", () => {
    const d = deriveVariantDifferences(
      make("perfect", { ingredients: [ing("p1", "Rum", "2")] }),
      undefined,
    );
    expect(d.perfect.ingredientIds.size).toBe(0);
  });

  it("matches duplicate rows one-to-one", () => {
    const d = deriveVariantDifferences(
      make("perfect", {
        ingredients: [ing("p1", "Mint", "4", ""), ing("p2", "Mint", "4", "")],
      }),
      make("house", { ingredients: [ing("h1", "Mint", "4", "")] }),
    );
    expect(d.perfect.ingredientIds.size).toBe(1);
    expect(d.house.ingredientIds.size).toBe(0);
  });
});

describe("derivePresentation", () => {
  it("is shared when specs are equivalent", () => {
    const p = derivePresentation([
      make("perfect", { glass: "Rocks" }),
      make("house", { glass: " rocks " }),
    ]);
    expect(p.mode).toBe("shared");
    expect(p.specs).toHaveLength(1);
  });

  it("splits per variant when any persisted spec differs", () => {
    const p = derivePresentation([
      make("perfect", {
        garnishes: [{ id: "g", name: "Mint", notes: null, sort_order: 1 }],
      }),
      make("house", {
        garnishes: [
          { id: "g1", name: "Mint", notes: null, sort_order: 1 },
          { id: "g2", name: "Lime", notes: "wheel", sort_order: 2 },
        ],
      }),
    ]);
    expect(p.mode).toBe("split");
    expect(p.specs.map((s) => s.garnish)).toEqual([
      "Mint",
      "Mint, Lime · wheel",
    ]);
    expect([...p.differing]).toEqual(["garnish"]);
  });

  it("is shared for a single variant", () => {
    expect(derivePresentation([make("house", { rim_type: "Salt" })]).mode).toBe(
      "shared",
    );
  });
});

describe("deriveGlanceFields", () => {
  const fields = (variants: DetailVariant[]) =>
    deriveGlanceFields(
      deriveQuickGlance({ variants } as Parameters<
        typeof deriveQuickGlance
      >[0]),
    );

  it("collapses equal values and splits differing or one-sided ones", () => {
    const f = fields([
      make("perfect", { method: "Shake", glass: "Ribbed rocks" }),
      make("house", { method: "Shake", glass: "Rocks", rim_type: "Salt" }),
    ]);
    expect(f.map((x) => [x.key, x.shared])).toEqual([
      ["method", true],
      ["glass", false],
      ["rim", false],
    ]);
    expect(f[2].values[0].text).toBeNull();
  });

  it("omits fields nobody has and returns nothing for empty data", () => {
    expect(fields([make("perfect")])).toEqual([]);
  });
});
