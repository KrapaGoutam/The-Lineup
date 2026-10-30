import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
vi.mock("../actions/recipe-management-actions", () => ({
  getRecipeCategoriesAction: vi.fn(),
  manageRecipeCategoryAction: vi.fn(),
  setRecipeArchivedAction: vi.fn(),
}));
import {
  getRecipeCategoriesAction,
  manageRecipeCategoryAction,
  setRecipeArchivedAction,
} from "../actions/recipe-management-actions";
import { RecipeArchiveControl } from "./recipe-archive-control";
import { RecipeCategoryDialog } from "./recipe-category-dialog";
import type { RecipeDetail } from "../domain/recipe-detail";
const categories = [
  {
    id: "normal",
    name: "Normal",
    version: 1,
    is_active: true,
    is_fallback: false,
    display_order: 1,
  },
  {
    id: "second",
    name: "Second",
    version: 2,
    is_active: true,
    is_fallback: false,
    display_order: 2,
  },
  {
    id: "fallback",
    name: "Fallback",
    version: 1,
    is_active: true,
    is_fallback: true,
    display_order: 3,
  },
];
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRecipeCategoriesAction).mockResolvedValue({
    ok: true,
    data: categories,
  });
  vi.mocked(manageRecipeCategoryAction).mockResolvedValue({
    ok: true,
    data: { id: "normal", version: 2 },
  });
  vi.mocked(setRecipeArchivedAction).mockResolvedValue({
    ok: true,
    data: { id: "recipe", version: 3 },
  });
});
const recipe: RecipeDetail = {
  id: "recipe",
  name: "Test",
  slug: "test",
  recipe_number: 1,
  base_spirit: null,
  description: null,
  is_popular: false,
  is_menu_item: false,
  variants: [],
  category: "Normal",
  category_id: "normal",
  is_active: true,
  version: 2,
};
function archive(archived = false, dirty = false) {
  const onChanged = vi.fn(),
    onReload = vi.fn();
  render(
    <RecipeArchiveControl
      recipe={{
        ...recipe,
        is_active: !archived,
        category_id: archived ? "inactive" : "normal",
      }}
      dirty={dirty}
      demo={false}
      restaurantSlug="test"
      onChanged={onChanged}
      onReload={onReload}
      onSessionInvalid={vi.fn()}
    />,
  );
  return { onChanged, onReload };
}
describe("archive controls", () => {
  it("disables archive while dirty", () => {
    archive(false, true);
    expect(
      screen.getByRole("button", { name: "Archive Recipe" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Save or discard your changes first"),
    ).toBeVisible();
  });
  it("confirms, cancels, then archives", async () => {
    const user = userEvent.setup(),
      props = archive();
    await user.click(screen.getByRole("button", { name: "Archive Recipe" }));
    expect(
      screen.getByText("Hidden from staff. You can restore it later."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setRecipeArchivedAction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Archive Recipe" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Archive Recipe",
      }),
    );
    expect(setRecipeArchivedAction).toHaveBeenCalledWith({
      restaurantSlug: "test",
      recipeId: "recipe",
      expectedVersion: 2,
      archived: true,
    });
    expect(props.onChanged).toHaveBeenCalledWith(false, 3, undefined);
  });
  it("requires an active category to restore from inactive category", async () => {
    const user = userEvent.setup(),
      props = archive(true);
    await user.click(screen.getByRole("button", { name: "Restore Recipe" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Restore Recipe" }),
    ).toBeDisabled();
    await user.selectOptions(
      await screen.findByLabelText("Restore category"),
      "normal",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Restore Recipe" }),
    );
    expect(setRecipeArchivedAction).toHaveBeenCalledWith(
      expect.objectContaining({ archived: false, categoryId: "normal" }),
    );
    expect(props.onChanged).toHaveBeenCalledWith(true, 3, "normal");
  });
  it("never retries stale archive and offers explicit reload", async () => {
    vi.mocked(setRecipeArchivedAction).mockResolvedValue({
      ok: false,
      kind: "stale",
      error: "Changed",
    });
    const user = userEvent.setup(),
      props = archive();
    await user.click(screen.getByRole("button", { name: "Archive Recipe" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Archive Recipe",
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Reload latest" }),
    );
    expect(props.onReload).toHaveBeenCalledOnce();
    expect(setRecipeArchivedAction).toHaveBeenCalledOnce();
  });
});
describe("category dialog", () => {
  function setup(demo = false) {
    const onChanged = vi.fn();
    render(
      <RecipeCategoryDialog
        restaurantSlug="test"
        demo={demo}
        demoCategories={categories}
        onChanged={onChanged}
        onSessionInvalid={vi.fn()}
      />,
    );
    return { onChanged };
  }
  it("adds and renames through canonical reads, protects fallback and restores focus", async () => {
    const props = setup(),
      user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Manage Categories" }));
    await screen.findByLabelText("Name for Normal");
    expect(
      screen.getByRole("button", { name: "Move Fallback up" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("switch", { name: "Active Fallback" }),
    ).toBeDisabled();
    await user.type(screen.getByLabelText("New category name"), "Added");
    await user.click(screen.getByRole("button", { name: "Add category" }));
    expect(manageRecipeCategoryAction).toHaveBeenCalledWith({
      restaurantSlug: "test",
      command: { operation: "save", id: null, version: null, name: "Added" },
    });
    expect(props.onChanged).toHaveBeenCalledWith(categories);
    await user.clear(screen.getByLabelText("Name for Fallback"));
    await user.type(
      screen.getByLabelText("Name for Fallback"),
      "Renamed fallback",
    );
    await user.click(
      within(screen.getByRole("region", { name: "Fallback" })).getByRole(
        "button",
        { name: "Rename" },
      ),
    );
    expect(manageRecipeCategoryAction).toHaveBeenLastCalledWith({
      restaurantSlug: "test",
      command: {
        operation: "save",
        id: "fallback",
        version: 1,
        name: "Renamed fallback",
      },
    });
    await user.click(screen.getByRole("button", { name: "Close categories" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Manage Categories" }),
      ).toHaveFocus(),
    );
  });
  it("moves in both directions and activates/deactivates with expected versions", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Manage Categories" }));
    await user.click(
      await screen.findByRole("button", { name: "Move Normal down" }),
    );
    expect(manageRecipeCategoryAction).toHaveBeenLastCalledWith({
      restaurantSlug: "test",
      command: { operation: "reorder", ids: ["second", "normal"] },
    });
    await user.click(screen.getByRole("button", { name: "Move Second up" }));
    await user.click(screen.getByRole("switch", { name: "Active Normal" }));
    expect(manageRecipeCategoryAction).toHaveBeenLastCalledWith({
      restaurantSlug: "test",
      command: { operation: "active", id: "normal", version: 1, active: false },
    });
  });
  it("shows rejection and explicit stale refresh without losing local names", async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Manage Categories" }));
    vi.mocked(manageRecipeCategoryAction).mockResolvedValueOnce({
      ok: false,
      kind: "validation",
      error: "Move or archive active recipes first",
    });
    await user.click(
      await screen.findByRole("switch", { name: "Active Normal" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Move or archive",
    );
    vi.mocked(manageRecipeCategoryAction).mockResolvedValueOnce({
      ok: false,
      kind: "stale",
      error: "Changed",
    });
    await user.clear(screen.getByLabelText("Name for Normal"));
    await user.type(screen.getByLabelText("Name for Normal"), "Local");
    await user.click(
      within(screen.getByRole("region", { name: "Normal" })).getByRole(
        "button",
        { name: "Rename" },
      ),
    );
    expect(screen.getByLabelText("Name for Normal")).toHaveValue("Local");
    await user.click(
      await screen.findByRole("button", { name: "Reload latest" }),
    );
    expect(await screen.findByLabelText("Name for Normal")).toHaveValue(
      "Normal",
    );
  });
  it("protects dirty close and demo never calls live mutations", async () => {
    setup(true);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Manage Categories" }));
    await user.type(screen.getByLabelText("New category name"), "Local");
    fireEvent(
      screen.getByRole("dialog", { name: "Manage Categories" }),
      new Event("cancel", { bubbles: true, cancelable: true }),
    );
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("New category name")).toHaveValue("Local");
    await user.click(screen.getByRole("button", { name: "Add category" }));
    expect(screen.getByLabelText("Name for Local")).toBeVisible();
    expect(manageRecipeCategoryAction).not.toHaveBeenCalled();
    expect(getRecipeCategoriesAction).not.toHaveBeenCalled();
  });
});
