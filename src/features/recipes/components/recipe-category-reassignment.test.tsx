import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RecipeEditor } from "./recipe-editor";
import { demoRecipeFromState } from "../domain/demo-recipes";
import {
  emptyVariant,
  newEditorState,
  type EditorLoad,
} from "../domain/recipe-editor-state";
import { groupRecipes } from "../domain/recipe-filters";
import type { Category, Recipe } from "../domain/recipe-index";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

afterEach(cleanup);

function categoryFixture() {
  const state = newEditorState("cat-1", 16);
  state.name = "Old Fashioned";
  state.base_spirit = "Bourbon";
  state.variants.perfect!.method = "Stir";
  state.variants.perfect!.ingredients = [
    {
      key: "k1",
      ingredient_name: "Bourbon or rye",
      amount: "2",
      unit: "oz",
      preparation: "",
    },
  ];
  state.variants.house = { ...emptyVariant(), method: "Stir" };

  const recipe = demoRecipeFromState(
    state,
    "recipe-16",
    "old-fashioned",
    1,
    "Classics",
  );

  const categories = [
    { id: "cat-1", name: "Classics", is_fallback: false, is_active: true },
    { id: "cat-2", name: "Modern", is_fallback: false, is_active: true },
    { id: "cat-fallback", name: "Other", is_fallback: true, is_active: true },
  ];

  const data: EditorLoad = {
    categories,
    nextNumber: 17,
    recipe,
  };

  const onSave = vi.fn().mockResolvedValue({
    ok: true,
    data: {
      id: "recipe-16",
      slug: "old-fashioned",
      version: 2,
      recipe_number: 16,
    },
  });

  const onReload = vi.fn().mockResolvedValue({
    ...data,
    recipe: { ...recipe, version: 3 },
  });

  const props = {
    data,
    onSave,
    onReload,
    onExit: vi.fn(),
    onSaved: vi.fn(),
    onSessionInvalid: vi.fn(),
  };

  const rendered = render(<RecipeEditor {...props} />);
  return { ...props, recipe, categories, rendered };
}

describe("category reassignment in editor", () => {
  it("displays current category and marks editor dirty when another category is selected", async () => {
    const user = userEvent.setup();
    const { onSave } = categoryFixture();

    const categorySelect = screen.getByLabelText(
      "Category",
    ) as HTMLSelectElement;
    expect(categorySelect.value).toBe("cat-1");

    // Initially not dirty
    expect(screen.getByText("No changes")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    // Select "Modern" (cat-2)
    await user.selectOptions(categorySelect, "cat-2");
    expect(categorySelect.value).toBe("cat-2");

    // Editor is now marked dirty
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();

    // Click Save
    await user.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    const [payload, recipeId, version] = onSave.mock.calls[0];
    expect(recipeId).toBe("recipe-16");
    expect(version).toBe(1);
    expect(payload.category_id).toBe("cat-2");
    expect(payload.recipe_number).toBe(16);
    expect(payload.name).toBe("Old Fashioned");
  });

  it("cancel does not persist category reassignment", async () => {
    const user = userEvent.setup();
    const { onSave, onExit } = categoryFixture();

    const categorySelect = screen.getByLabelText(
      "Category",
    ) as HTMLSelectElement;
    await user.selectOptions(categorySelect, "cat-2");
    expect(categorySelect.value).toBe("cat-2");

    // Click Cancel -> discard prompt
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Discard changes?")).toBeTruthy();

    // Confirm discard
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("handles stale PT409 conflict during category reassignment", async () => {
    const user = userEvent.setup();
    const { onSave } = categoryFixture();

    onSave.mockResolvedValueOnce({
      ok: false,
      error: "This recipe was updated in another window.",
      kind: "stale",
    });

    const categorySelect = screen.getByLabelText(
      "Category",
    ) as HTMLSelectElement;
    await user.selectOptions(categorySelect, "cat-2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.getByText(/This recipe was updated in another window/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload latest" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeTruthy();

    // The user's category selection is retained while stale prompt is active
    expect(categorySelect.value).toBe("cat-2");
  });

  it("moving a recipe updates category grouping", () => {
    const categories: Category[] = [
      { id: "cat-1", name: "Classics", display_order: 1, is_fallback: false },
      { id: "cat-2", name: "Modern", display_order: 2, is_fallback: false },
    ];

    const recipesBefore: Recipe[] = [
      {
        id: "r1",
        recipe_number: 16,
        name: "Old Fashioned",
        slug: "old-fashioned",
        category_id: "cat-1",
        alternate_name: null,
        base_spirit: "Bourbon",
        is_popular: false,
        is_menu_item: false,
        is_alcoholic: true,
        is_active: true,
      },
    ];

    const groupsBefore = groupRecipes(categories, recipesBefore);
    expect(groupsBefore).toHaveLength(1);
    expect(groupsBefore[0].category.name).toBe("Classics");
    expect(groupsBefore[0].recipes[0].name).toBe("Old Fashioned");

    // Reassigned to cat-2
    const recipesAfter: Recipe[] = [
      {
        ...recipesBefore[0],
        category_id: "cat-2",
      },
    ];

    const groupsAfter = groupRecipes(categories, recipesAfter);
    expect(groupsAfter).toHaveLength(1);
    expect(groupsAfter[0].category.name).toBe("Modern");
    expect(groupsAfter[0].recipes[0].name).toBe("Old Fashioned");
  });
});
