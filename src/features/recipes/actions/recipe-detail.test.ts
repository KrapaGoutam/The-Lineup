import { beforeEach, describe, expect, it, vi } from "vitest";
const { client, user, session, from } = vi.hoisted(() => ({
  client: vi.fn(),
  user: vi.fn(),
  session: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: client }));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: user }));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: session,
}));
import { getRecipeDetailAction } from "./recipe-actions";
beforeEach(() => {
  vi.clearAllMocks();
  client.mockResolvedValue({ from });
  session.mockResolvedValue(null);
  user.mockResolvedValue({ organizationId: "org-a" });
});
describe("detail authorization", () => {
  it("scopes active recipe and all related reads to the resolved organization", async () => {
    const filters: string[] = [];
    const data: Record<string, unknown> = {
      bar_recipes: {
        id: "r",
        category_id: "c",
        name: "R1",
        slug: "r1",
        recipe_number: 1,
        base_spirit: null,
        description: null,
        is_popular: false,
        is_menu_item: false,
      },
      bar_recipe_categories: { name: "Test" },
      bar_recipe_variants: [
        {
          id: "v",
          variant: "house",
          method: null,
          rim_type: null,
          rim_notes: null,
          glass: null,
          glass_notes: null,
          presentation_notes: null,
          tips: null,
          batch_notes: null,
        },
      ],
      bar_recipe_ingredients: [
        {
          id: "i",
          variant_id: "v",
          amount: "Top",
          unit: null,
          ingredient_name: "Test",
          preparation: null,
          sort_order: 1,
        },
      ],
      bar_recipe_steps: [],
      bar_recipe_garnishes: [],
    };
    from.mockImplementation((table: string) => {
      const result = { data: data[table], error: null };
      const q = {
        select: vi.fn(() => q),
        eq: vi.fn((key, value) => {
          filters.push(`${table}.${key}=${value}`);
          return q;
        }),
        in: vi.fn(() => q),
        order: vi.fn((key) => {
          filters.push(`${table}.order=${key}`);
          return q;
        }),
        maybeSingle: vi.fn(async () => result),
        then: (resolve: (v: typeof result) => void) => resolve(result),
      };
      return q;
    });
    const result = await getRecipeDetailAction({
      restaurantSlug: "test",
      slug: "r1",
    });
    expect(result.ok && result.data?.variants[0].ingredients[0].amount).toBe(
      "Top",
    );
    for (const table of Object.keys(data))
      expect(filters).toContain(`${table}.organization_id=org-a`);
    expect(filters).toContain("bar_recipes.is_active=true");
    expect(filters).toContain("bar_recipes.slug=r1");
    for (const table of [
      "bar_recipe_ingredients",
      "bar_recipe_steps",
      "bar_recipe_garnishes",
    ])
      expect(filters).toContain(`${table}.order=sort_order`);
  });
  it("denies inactive members and expired sessions before querying", async () => {
    user.mockResolvedValue(null);
    expect(
      (await getRecipeDetailAction({ restaurantSlug: "test", slug: "r1" })).ok,
    ).toBe(false);
    expect(from).not.toHaveBeenCalled();
    session.mockResolvedValue({
      ok: false,
      error: "expired",
      sessionInvalid: true,
    });
    expect(
      await getRecipeDetailAction({ restaurantSlug: "test", slug: "r1" }),
    ).toMatchObject({ sessionInvalid: true });
    expect(from).not.toHaveBeenCalled();
  });
  it("returns not found for malformed or unavailable slugs", async () => {
    expect(
      await getRecipeDetailAction({ restaurantSlug: "test", slug: "bad slug" }),
    ).toEqual({ ok: true, data: null });
    from.mockImplementation(() => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return q;
    });
    expect(
      await getRecipeDetailAction({ restaurantSlug: "test", slug: "foreign" }),
    ).toEqual({ ok: true, data: null });
  });
});
