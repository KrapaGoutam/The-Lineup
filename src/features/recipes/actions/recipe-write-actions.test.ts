import { beforeEach, describe, expect, it, vi } from "vitest";
const { client, user, session, save, from } = vi.hoisted(() => ({
  client: vi.fn(),
  user: vi.fn(),
  session: vi.fn(),
  save: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: client }));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: user }));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: session,
}));
vi.mock("../data/recipe-write-data", () => ({ saveRecipeData: save }));
vi.mock("./recipe-actions", () => ({ getRecipeDetailAction: vi.fn() }));
import { getRecipeDetailAction } from "./recipe-actions";
import {
  getRecipeEditorAction,
  saveRecipeAction,
} from "./recipe-write-actions";
import {
  newEditorState,
  serializeEditorState,
} from "../domain/recipe-editor-state";
const category = "11111111-1111-4111-8111-111111111111";
const recipe = "22222222-2222-4222-8222-222222222222";
const input = () => {
  const state = newEditorState(category, 38);
  state.variants.perfect!.method = "Stir";
  return {
    restaurantSlug: "test",
    recipeId: null,
    expectedVersion: null,
    payload: {
      ...serializeEditorState(state),
      name: "Test",
    },
  };
};
beforeEach(() => {
  vi.resetAllMocks();
  client.mockResolvedValue({ from });
  session.mockResolvedValue(null);
  user.mockResolvedValue({
    organizationId: "server-org",
    designation: "manager",
  });
  save.mockResolvedValue({
    ok: true,
    data: { id: recipe, slug: "test", version: 1, recipe_number: 38 },
  });
});
describe("recipe management actions", () => {
  it.each(["owner", "manager", "assistant_manager"])(
    "allows %s with only server-resolved org",
    async (designation) => {
      user.mockResolvedValue({ organizationId: "server-org", designation });
      expect(await saveRecipeAction(input())).toMatchObject({ ok: true });
      expect(save).toHaveBeenCalledWith(
        { from },
        "server-org",
        null,
        null,
        input().payload,
      );
    },
  );
  it("passes the expected version for updates", async () => {
    await saveRecipeAction({
      ...input(),
      recipeId: recipe,
      expectedVersion: 7,
    });
    expect(save).toHaveBeenCalledWith(
      { from },
      "server-org",
      recipe,
      7,
      input().payload,
    );
  });
  it.each([null, { organizationId: "org", designation: "staff" }])(
    "rejects non-management before RPC or editor reads",
    async (viewer) => {
      user.mockResolvedValue(viewer);
      expect(await saveRecipeAction(input())).toMatchObject({
        ok: false,
        kind: "permission",
      });
      expect(
        await getRecipeEditorAction({ restaurantSlug: "test", slug: null }),
      ).toMatchObject({ ok: false });
      expect(save).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
    },
  );
  it("propagates invalid session without writes", async () => {
    session.mockResolvedValue({
      ok: false,
      error: "expired",
      sessionInvalid: true,
    });
    expect(await saveRecipeAction(input())).toMatchObject({
      sessionInvalid: true,
    });
    expect(save).not.toHaveBeenCalled();
  });
  it("rejects unsafe shapes and inconsistent identity/version", async () => {
    expect(
      await saveRecipeAction({ ...input(), expectedVersion: 1 }),
    ).toMatchObject({ kind: "validation" });
    expect(
      await saveRecipeAction({
        ...input(),
        payload: { ...input().payload, slug: "forged" },
      }),
    ).toMatchObject({ kind: "validation" });
    expect(save).not.toHaveBeenCalled();
  });
  it("loads active choices and retains only the current inactive category; max includes archives", async () => {
    const filters: [string, unknown][] = [];
    const basic = {
      id: recipe,
      version: 7,
      category_id: category,
      alternate_name: null,
      is_alcoholic: false,
    };
    from.mockImplementation((table: string) => {
      const q = {
        select: vi.fn(() => q),
        eq: vi.fn((key, value) => {
          filters.push([`${table}.${key}`, value]);
          return q;
        }),
        order: vi.fn(() => q),
        limit: vi.fn(() => q),
        range: vi.fn(async () => ({
          data: [
            {
              id: category,
              name: "Inactive current",
              is_active: false,
              is_fallback: false,
            },
            { id: "other", name: "Inactive other", is_active: false },
            {
              id: "active",
              name: "Active",
              is_active: true,
              is_fallback: true,
            },
          ],
          error: null,
        })),
        maybeSingle: vi.fn(async () => ({
          data: { ...basic, recipe_number: 999 },
          error: null,
        })),
      };
      return q;
    });
    vi.mocked(getRecipeDetailAction).mockResolvedValue({
      ok: true,
      data: {
        id: recipe,
        name: "Test",
        slug: "test",
        recipe_number: 1,
        base_spirit: null,
        description: null,
        is_popular: false,
        is_menu_item: false,
        category: "Inactive current",
        variants: [],
      },
    });
    const result = await getRecipeEditorAction({
      restaurantSlug: "test",
      slug: "test",
    });
    expect(result.ok && result.data.categories.map((c) => c.id)).toEqual([
      category,
      "active",
    ]);
    expect(result.ok && result.data.recipe?.version).toBe(7);
    expect(result.ok && result.data.nextNumber).toBe(1000);
    expect(filters).toContainEqual([
      "bar_recipe_categories.organization_id",
      "server-org",
    ]);
  });
});
