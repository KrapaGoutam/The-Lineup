import { describe, expect, it } from "vitest";
import {
  editorStatesEqual,
  moveRow,
  newEditorState,
  serializeEditorState,
  existingEditorState,
  emptyVariant,
} from "./recipe-editor-state";
import { demoRecipeFromState } from "./demo-recipes";
import { payloadErrors } from "./recipe-validation";

describe("recipe editor state", () => {
  it("starts with the fallback category and editable suggested number", () => {
    const state = newEditorState("fallback", 38);
    expect(state.category_id).toBe("fallback");
    expect(state.recipe_number).toBe("38");
    expect(state.variants.perfect).not.toBeNull();
    expect(state.variants.house).toBeNull();
  });
  it("normalizes optional fields and omits row keys while preserving order", () => {
    const state = newEditorState("fallback", 38);
    state.name = "  Example  ";
    state.variants.perfect!.ingredients = [
      {
        key: "one",
        ingredient_name: " A ",
        amount: " 2 ",
        unit: " ",
        preparation: "",
      },
      {
        key: "two",
        ingredient_name: "B",
        amount: "Top",
        unit: "",
        preparation: "",
      },
    ];
    state.variants.perfect!.ingredients = moveRow(
      state.variants.perfect!.ingredients,
      1,
      -1,
    );
    const payload = serializeEditorState(state);
    expect(payload.name).toBe("Example");
    expect(payload.alternate_name).toBeNull();
    expect(payload.variants.perfect!.ingredients).toEqual([
      { ingredient_name: "B", amount: "Top", unit: null, preparation: null },
      { ingredient_name: "A", amount: "2", unit: null, preparation: null },
    ]);
  });
  it("compares normalized payloads and detects a renumber", () => {
    const a = newEditorState("fallback", 38);
    const b = structuredClone(a);
    b.name = " ";
    expect(editorStatesEqual(a, b)).toBe(true);
    b.recipe_number = "39";
    expect(editorStatesEqual(a, b)).toBe(false);
  });
  it("matches database single-line whitespace normalization and preserves multiline prose", () => {
    const a = newEditorState("category", 1);
    a.name = "Test drink";
    const b = structuredClone(a);
    b.name = " Test  drink ";
    expect(editorStatesEqual(a, b)).toBe(true);
    b.description = " First line\nSecond line ";
    b.variants.perfect!.tips = " Notes\nMore notes ";
    const payload = serializeEditorState(b);
    expect(payload.description).toBe("First line\nSecond line");
    expect(payload.variants.perfect!.tips).toBe("Notes\nMore notes");
  });
  it("initializes existing House-only content with fresh row keys and retains inactive category id", () => {
    const state = newEditorState("inactive-category", 23);
    state.name = "House only";
    state.variants = {
      perfect: null,
      house: {
        ...emptyVariant(),
        method: "Custom method",
        ingredients: [
          {
            key: "old",
            ingredient_name: "A",
            amount: "To taste",
            unit: "",
            preparation: "",
          },
        ],
        steps: [{ key: "old", instruction: "Mix" }],
        garnishes: [{ key: "old", name: "Leaf", notes: "" }],
      },
    };
    const record = demoRecipeFromState(
      state,
      "recipe",
      "immutable",
      3,
      "Inactive",
    );
    let counter = 0;
    const loaded = existingEditorState(record, () => `fresh-${++counter}`);
    expect(loaded.category_id).toBe("inactive-category");
    expect(loaded.variants.perfect).toBeNull();
    expect(loaded.variants.house!.ingredients[0].key).toBe("fresh-1");
    expect(editorStatesEqual(state, loaded)).toBe(true);
    const payload = serializeEditorState(loaded);
    expect(payload.variants.house!.ingredients[0].amount).toBe("To taste");
    for (const field of [
      "slug",
      "version",
      "sort_order",
      "image_path",
      "is_active",
      "key",
    ])
      expect(JSON.stringify(payload)).not.toContain(`"${field}"`);
  });
  it("normalizes both variants, optional fields and keeps reorder boundaries stable", () => {
    const state = newEditorState("category", 1);
    state.name = "Test";
    state.variants.house = { ...emptyVariant(), tips: " House notes " };
    expect(serializeEditorState(state).variants.house!.tips).toBe(
      "House notes",
    );
    expect(payloadErrors(serializeEditorState(state))).toEqual({});
    const rows = ["a", "b"];
    expect(moveRow(rows, 0, -1)).toBe(rows);
    expect(moveRow(rows, 1, 1)).toBe(rows);
    expect(moveRow(rows, -1, 1)).toBe(rows);
    state.variants = { perfect: null, house: null };
    expect(payloadErrors(serializeEditorState(state))).toHaveProperty(
      "variants",
    );
  });
});
