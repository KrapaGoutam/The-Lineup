import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
const { params } = vi.hoisted(() => ({
  params: { value: "tab=recipes&mode=new" },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(params.value),
}));
vi.mock("../actions/recipe-actions", () => ({
  getRecipeIndexAction: vi.fn(),
  getRecipeDetailAction: vi.fn(),
}));
vi.mock("../actions/recipe-write-actions", () => ({
  getRecipeEditorAction: vi.fn(),
  saveRecipeAction: vi.fn(),
}));
import {
  getRecipeEditorAction,
  saveRecipeAction,
} from "../actions/recipe-write-actions";
import { RecipesModule } from "./recipes-module";
import { RecipeEditorScreen } from "./recipe-editor-screen";
import { newEditorState } from "../domain/recipe-editor-state";
import { demoRecipeFromState } from "../domain/demo-recipes";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("editor access and demo safety", () => {
  it("archived management edit URLs render read-only with Restore and no editable form", () => {
    const recipe = {
      ...demoRecipeFromState(
        newEditorState("fallback", 1),
        "r",
        "archived",
        2,
        "Fallback",
      ),
      is_active: false,
    };
    render(
      <RecipeEditorScreen
        restaurantSlug="test"
        slug="archived"
        demo
        demoLoad={{
          categories: [
            {
              id: "fallback",
              name: "Fallback",
              is_fallback: true,
              is_active: true,
            },
          ],
          nextNumber: 2,
          recipe,
        }}
        demoSave={vi.fn()}
        onExit={vi.fn()}
        onSaved={vi.fn()}
        onSessionInvalid={vi.fn()}
      />,
    );
    expect(screen.getByText("Archived — hidden from staff")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Restore Recipe" }),
    ).toBeVisible();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
    expect(getRecipeEditorAction).not.toHaveBeenCalled();
  });
  it.each([
    "tab=recipes&mode=new",
    "tab=recipes&recipe=r1-test-citrus&mode=edit",
  ])("Staff falls back to read-only for %s", async (url) => {
    params.value = url;
    render(
      <RecipesModule
        restaurantSlug="test"
        demo
        isManagement={false}
        onSessionInvalid={vi.fn()}
      />,
    );
    if (url.includes("recipe="))
      await screen.findByRole("heading", { name: /R1 Test Citrus/ });
    else await screen.findByRole("heading", { name: "Bar Recipes" });
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add Recipe|Edit Recipe|Save/ }),
    ).not.toBeInTheDocument();
    expect(getRecipeEditorAction).not.toHaveBeenCalled();
    expect(saveRecipeAction).not.toHaveBeenCalled();
  });
  it("demo editor saves only through the in-memory callback", async () => {
    const demoSave = vi.fn().mockResolvedValue({
      ok: true,
      data: { id: "r", slug: "demo", version: 1, recipe_number: 1 },
    });
    render(
      <RecipeEditorScreen
        restaurantSlug="test"
        slug={null}
        demo
        demoLoad={{
          categories: [
            {
              id: "fallback",
              name: "Fallback",
              is_active: true,
              is_fallback: true,
            },
          ],
          nextNumber: 1,
          recipe: null,
        }}
        demoSave={demoSave}
        onExit={vi.fn()}
        onSaved={vi.fn()}
        onSessionInvalid={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByLabelText("Name"), "Demo");
    await userEvent.type(
      screen.getByLabelText("Method", { exact: true }),
      "Stir",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(demoSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Demo",
        variants: expect.objectContaining({
          perfect: expect.objectContaining({ method: "Stir" }),
        }),
      }),
      null,
      null,
    );
    expect(getRecipeEditorAction).not.toHaveBeenCalled();
    expect(saveRecipeAction).not.toHaveBeenCalled();
  });
});
