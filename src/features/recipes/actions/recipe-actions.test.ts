import { beforeEach, describe, expect, it, vi } from "vitest";

// V2-004.004: the module guard is covered by its own tests; action tests isolate it.
vi.mock("@/features/modules/data/module-enforcement", () => ({
  guardModule: vi.fn(async () => null),
  guardModuleForSlug: vi.fn(async () => null),
}));
const { client, user, session, from } = vi.hoisted(() => ({
  client: vi.fn(),
  user: vi.fn(),
  session: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: client }));
vi.mock("../data/recipes-actor", () => ({ getRecipesActor: user }));
vi.mock("@/features/context/data/workspace-expectation", () => ({
  assertWorkspaceExpectation: vi.fn(async () => ({
    ok: true,
    location: { id: "loc-1", time_zone: "America/New_York" },
  })),
}));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: session,
}));
import { getRecipeIndexAction } from "./recipe-actions";

const makeActor = (designation: "staff" | "manager") => ({
  organizationId: "org-a",
  scope: {
    organizationId: "org-a",
    locationId: "loc-1",
    timeZone: "America/New_York",
  },
  viewer: {
    profileId: "p-1",
    name: "User",
    designation,
  },
  isManager: designation === "manager",
  canManageCatalog: designation === "manager",
});

beforeEach(() => {
  vi.clearAllMocks();
  client.mockResolvedValue({ from });
  session.mockResolvedValue(null);
  user.mockResolvedValue(makeActor("staff"));
});
describe("recipe index read", () => {
  it("scopes reads to the server-resolved organization; management may read archived rows", async () => {
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
    for (const designation of ["staff", "manager"] as const) {
      user.mockResolvedValue(makeActor(designation));
      expect(await getRecipeIndexAction({ restaurantSlug: "test" })).toEqual({
        ok: true,
        // E-1: the write decision rides along so the UI never offers a refused action.
        data: {
          categories: [],
          recipes: [],
          canManage: designation === "manager",
        },
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
