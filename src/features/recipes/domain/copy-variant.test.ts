import { describe, expect, it } from "vitest";
import { copyVariant, variantHasContent } from "./copy-variant";
import {
  emptyVariant,
  newEditorState,
  serializeEditorState,
} from "./recipe-editor-state";

describe("copy variant", () => {
  it("replaces existing House with current unsaved values and independent arrays", () => {
    const state = newEditorState("category", 1);
    state.variants.house = { ...emptyVariant(), method: "Old House" };
    state.variants.perfect!.method = "Unsaved Perfect";
    const perfect = state.variants.perfect!;
    state.variants.house = copyVariant(perfect, () => crypto.randomUUID());
    expect(state.variants.house.ingredients).not.toBe(perfect.ingredients);
    expect(state.variants.house.steps).not.toBe(perfect.steps);
    expect(state.variants.house.garnishes).not.toBe(perfect.garnishes);
    perfect.method = "Later Perfect";
    expect(serializeEditorState(state).variants.house?.method).toBe(
      "Unsaved Perfect",
    );
  });
  it.each([
    "method",
    "rim_type",
    "rim_notes",
    "glass",
    "glass_notes",
    "presentation_notes",
    "tips",
    "batch_notes",
  ] as const)("detects meaningful %s", (field) => {
    const source = emptyVariant();
    source[field] = "  ";
    expect(variantHasContent(source)).toBe(false);
    source[field] = "x";
    expect(variantHasContent(source)).toBe(true);
  });
  it("copies current values with independent rows and fresh keys, which are not serialized", () => {
    const state = newEditorState("category", 1);
    const perfect = state.variants.perfect!;
    Object.assign(perfect, {
      method: "Shake",
      rim_type: "Salt",
      rim_notes: "Light",
      glass: "Coupe",
      glass_notes: "Cold",
      presentation_notes: "Serve",
      tips: "Tip",
      batch_notes: "Batch",
      ingredients: [
        {
          key: "i",
          ingredient_name: "Tequila",
          amount: "2.5",
          unit: "oz",
          preparation: "",
        },
      ],
      steps: [{ key: "s", instruction: "Mix" }],
      garnishes: [{ key: "g", name: "Lime", notes: "Fresh" }],
    });
    let n = 0;
    const house = copyVariant(perfect, () => `new-${++n}`);
    state.variants.house = house;
    expect(house).toEqual({
      ...perfect,
      ingredients: [{ ...perfect.ingredients[0], key: "new-1" }],
      steps: [{ ...perfect.steps[0], key: "new-2" }],
      garnishes: [{ ...perfect.garnishes[0], key: "new-3" }],
    });
    house.ingredients[0].amount = "3";
    house.steps[0].instruction = "Stir";
    house.garnishes[0].name = "Orange";
    expect(perfect.ingredients[0].amount).toBe("2.5");
    expect(perfect.steps[0].instruction).toBe("Mix");
    expect(perfect.garnishes[0].name).toBe("Lime");
    expect(JSON.stringify(serializeEditorState(state))).not.toContain('"key"');
  });

  it("recognizes meaningful fields and even empty repeater rows", () => {
    expect(variantHasContent(null)).toBe(false);
    const variant = emptyVariant();
    variant.method = "  ";
    expect(variantHasContent(variant)).toBe(false);
    variant.steps.push({ key: "s", instruction: "" });
    expect(variantHasContent(variant)).toBe(true);
  });
});
