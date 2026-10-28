import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RecipeEditor } from "./recipe-editor";
import { demoRecipeFromState } from "../domain/demo-recipes";
import {
  emptyVariant,
  newEditorState,
  type EditorLoad,
} from "../domain/recipe-editor-state";
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);
function fixture(edit = false) {
  const state = newEditorState("fallback", 38);
  state.name = "Synthetic drink";
  state.base_spirit = "Gin";
  state.variants.perfect!.method = "Shake";
  state.variants.perfect!.ingredients = [
    {
      key: "a",
      ingredient_name: "First",
      amount: "2",
      unit: "oz",
      preparation: "",
    },
    {
      key: "b",
      ingredient_name: "Second",
      amount: "Top",
      unit: "",
      preparation: "",
    },
  ];
  state.variants.perfect!.steps = [
    { key: "a", instruction: "First step" },
    { key: "b", instruction: "Second step" },
  ];
  state.variants.perfect!.garnishes = [
    { key: "a", name: "First garnish", notes: "" },
    { key: "b", name: "Second garnish", notes: "" },
  ];
  state.variants.house = { ...emptyVariant(), method: "House method" };
  const recipe = demoRecipeFromState(
    state,
    "recipe",
    "synthetic-drink",
    7,
    "Fallback",
  );
  const data: EditorLoad = {
    categories: [
      { id: "fallback", name: "Fallback", is_fallback: true, is_active: !edit },
    ],
    nextNumber: 38,
    recipe: edit ? recipe : null,
  };
  const onSave = vi.fn().mockResolvedValue({
    ok: true,
    data: {
      id: "recipe",
      slug: "synthetic-drink",
      version: 8,
      recipe_number: 38,
    },
  });
  const onReload = vi.fn().mockResolvedValue({
    ...data,
    recipe: { ...recipe, name: "Latest drink", version: 9 },
  });
  const props = {
    data,
    onSave,
    onReload,
    onExit: vi.fn(),
    onSaved: vi.fn(),
    onSessionInvalid: vi.fn(),
  };
  render(<RecipeEditor {...props} />);
  return { ...props, state };
}
describe("recipe editor", () => {
  it("renders Add and suppresses clean saves", () => {
    const props = fixture();
    expect(screen.getByRole("heading", { name: "Add Recipe" })).toBeVisible();
    expect(screen.getByLabelText("Recipe number")).toHaveValue(38);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form"));
    expect(props.onSave).not.toHaveBeenCalled();
  });
  it("hydrates basics, Perfect, House and inactive current category", () => {
    fixture(true);
    expect(screen.getByLabelText("Name")).toHaveValue("Synthetic drink");
    expect(screen.getByLabelText("Base spirit")).toHaveValue("Gin");
    expect(
      screen
        .getAllByLabelText("Method")
        .map((e) => (e as HTMLInputElement).value),
    ).toEqual(["Shake", "House method"]);
    expect(
      screen.getByRole("option", { name: "Fallback (inactive)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
  it.each(["Ingredient", "Step", "Garnish"])(
    "adds, removes and reorders %s rows",
    async (singular) => {
      fixture(true);
      const user = userEvent.setup();
      const perfect = screen
        .getByText("Perfect Bartending Recipe")
        .closest("details")!;
      const scope = within(perfect);
      const label =
        singular === "Ingredient"
          ? "Ingredient name"
          : singular === "Step"
            ? "Instruction"
            : "Garnish name";
      await user.click(
        scope.getByRole("button", {
          name: `Move ${singular.toLowerCase()} 2 up`,
        }),
      );
      expect(scope.getAllByLabelText(label)[0]).toHaveValue(
        singular === "Ingredient"
          ? "Second"
          : singular === "Step"
            ? "Second step"
            : "Second garnish",
      );
      await user.click(
        scope.getByRole("button", { name: `Add ${singular.toLowerCase()}` }),
      );
      expect(scope.getAllByLabelText(label)).toHaveLength(3);
      await user.click(
        scope.getByRole("button", {
          name: `Remove ${singular.toLowerCase()} 3`,
        }),
      );
      expect(scope.getAllByLabelText(label)).toHaveLength(2);
      await user.click(
        scope.getByRole("button", {
          name: `Move ${singular.toLowerCase()} 1 down`,
        }),
      );
      expect(scope.getAllByLabelText(label)[0]).toHaveValue(
        singular === "Ingredient"
          ? "First"
          : singular === "Step"
            ? "First step"
            : "First garnish",
      );
    },
  );
  it("protects dirty Cancel and beforeunload, then permits discard", async () => {
    const props = fixture(true);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), " changed");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Discard changes?");
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Name")).toHaveValue(
      "Synthetic drink changed",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(props.onExit).toHaveBeenCalledOnce();
  });
  it("clean Cancel exits immediately", async () => {
    const props = fixture(true);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onExit).toHaveBeenCalledOnce();
  });
  it("shows validation summary and focuses first invalid field", async () => {
    const props = fixture();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Recipe number"));
    await user.type(screen.getByLabelText("Recipe number"), "0");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Check the highlighted fields",
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Recipe number")).toHaveFocus(),
    );
    expect(screen.getByLabelText("Recipe number")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Name")).toHaveAttribute(
      "aria-describedby",
      "name-error",
    );
    expect(props.onSave).not.toHaveBeenCalled();
  });
  it("shows structured duplicate number inline and preserves form", async () => {
    const props = fixture(true);
    const user = userEvent.setup();
    props.onSave.mockResolvedValue({
      ok: false,
      kind: "duplicate",
      field: "recipe_number",
      error: "Recipe number is already used by 38 Cadillac Margarita.",
    });
    await user.type(screen.getByLabelText("Name"), " changed");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Recipe number")).toHaveFocus(),
    );
    expect(document.getElementById("recipe_number-error")).toHaveTextContent(
      "38 Cadillac Margarita",
    );
    expect(screen.getByLabelText("Name")).toHaveValue(
      "Synthetic drink changed",
    );
  });
  it("stale save keeps edits, Keep editing dismisses, Reload latest resets snapshot/version", async () => {
    const props = fixture(true);
    const user = userEvent.setup();
    props.onSave.mockResolvedValue({
      ok: false,
      kind: "stale",
      error: "Someone else changed this recipe.",
    });
    await user.type(screen.getByLabelText("Name"), " local");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(
      await screen.findByRole("button", { name: "Keep editing" }),
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Synthetic drink local");
    expect(
      screen.queryByRole("button", { name: "Reload latest" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(
      await screen.findByRole("button", { name: "Reload latest" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveValue("Latest drink"),
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(screen.getByLabelText("Name"), " reconciled");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave.mock.lastCall?.[2]).toBe(9);
  });
  it("failed reload retains unsaved input", async () => {
    const props = fixture(true);
    const user = userEvent.setup();
    props.onSave.mockResolvedValue({
      ok: false,
      kind: "stale",
      error: "Stale",
    });
    props.onReload.mockRejectedValue(new Error());
    await user.type(screen.getByLabelText("Name"), " local");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(
      await screen.findByRole("button", { name: "Reload latest" }),
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Synthetic drink local");
    expect(
      await screen.findByText(/latest recipe could not be loaded/),
    ).toBeVisible();
  });
  it("network failure retains values and permits retry", async () => {
    const props = fixture(true);
    const user = userEvent.setup();
    props.onSave.mockRejectedValueOnce(new Error());
    await user.type(screen.getByLabelText("Name"), " local");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/changes are still here/)).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveValue("Synthetic drink local");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSaved).toHaveBeenCalledOnce();
  });
  it("successful save uses serializer and updates version/snapshot; custom suggestions are legal", async () => {
    const props = fixture(true);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Recipe number"));
    await user.type(screen.getByLabelText("Recipe number"), "39");
    await user.clear(screen.getByLabelText("Base spirit"));
    await user.type(screen.getByLabelText("Base spirit"), "Custom spirit");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        recipe_number: 39,
        base_spirit: "Custom spirit",
      }),
      "recipe",
      7,
    );
    expect(JSON.stringify(props.onSave.mock.calls[0][0])).not.toContain(
      '"key"',
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Recipe saved")).toBeVisible();
    await user.type(screen.getByLabelText("Name"), " again");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(props.onSave.mock.lastCall?.[2]).toBe(8);
  });
  it("disables controls while saving and prevents duplicate submission", async () => {
    const props = fixture(true);
    const user = userEvent.setup();
    props.onSave.mockReturnValue(new Promise(() => {}));
    await user.type(screen.getByLabelText("Name"), " local");
    await user.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.submit(screen.getByRole("form"));
    expect(props.onSave).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Name")).toBeDisabled();
  });
});
