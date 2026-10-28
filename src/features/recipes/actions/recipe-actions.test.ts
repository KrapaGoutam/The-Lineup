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
import { getRecipeIndexAction } from "./recipe-actions";

beforeEach(() => {
  vi.clearAllMocks();
  client.mockResolvedValue({ from });
  session.mockResolvedValue(null);
  user.mockResolvedValue({ organizationId: "org-a", designation: "staff" });
});
describe("recipe index read", () => {
  it("reads only active rows for the server-resolved organization for staff and management", async () => {
    const filters: [string, unknown][] = [];
    from.mockImplementation((table: string) => {
      const result = { data: [], error: null };
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((key, value) => {
          filters.push([`${table}.${key}`, value]);
          return query;
        }),
        order: vi.fn(() => query),
        range: vi.fn(async () => result),
        then: (resolve: (v: typeof result) => void) => resolve(result),
      };
      return query;
    });
    for (const designation of ["staff", "manager"]) {
      user.mockResolvedValue({ organizationId: "org-a", designation });
      expect(await getRecipeIndexAction({ restaurantSlug: "test" })).toEqual({
        ok: true,
        data: { categories: [], recipes: [] },
      });
    }
    expect(filters).toContainEqual(["bar_recipes.organization_id", "org-a"]);
    expect(filters).toContainEqual(["bar_recipes.is_active", true]);
    expect(filters).toContainEqual([
      "bar_recipe_categories.organization_id",
      "org-a",
    ]);
  });
  it("does not query without active membership", async () => {
    user.mockResolvedValue(null);
    expect((await getRecipeIndexAction({ restaurantSlug: "test" })).ok).toBe(
      false,
    );
    expect(from).not.toHaveBeenCalled();
  });
  it("propagates invalid sessions without querying", async () => {
    session.mockResolvedValue({
      ok: false,
      error: "Session expired",
      sessionInvalid: true,
    });
    expect(
      await getRecipeIndexAction({ restaurantSlug: "test" }),
    ).toMatchObject({ ok: false, sessionInvalid: true });
    expect(from).not.toHaveBeenCalled();
  });
});
