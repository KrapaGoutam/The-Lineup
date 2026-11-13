import { beforeEach, describe, expect, it, vi } from "vitest";

// V2-004.004: the module guard is covered by its own tests; action tests isolate it.
vi.mock("@/features/modules/data/module-enforcement", () => ({
  guardModule: vi.fn(async () => null),
  guardModuleForSlug: vi.fn(async () => null),
}));
const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  user: vi.fn(),
  session: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("../data/recipes-actor", () => ({ getRecipesActor: mocks.user }));
vi.mock("@/features/context/data/workspace-expectation", () => ({
  assertWorkspaceExpectation: vi.fn(async () => ({
    ok: true,
    location: { id: "loc-1", time_zone: "America/New_York" },
  })),
}));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.session,
}));
import {
  getRecipeCategoriesAction,
  manageRecipeCategoryAction,
  setRecipeArchivedAction,
} from "./recipe-management-actions";
const id = "22222222-2222-4222-8222-222222222222";
const archive = {
  restaurantSlug: "test",
  recipeId: id,
  expectedVersion: 1,
  archived: true,
};
const category = {
  restaurantSlug: "test",
  command: {
    operation: "save" as const,
    id: null,
    version: null,
    name: "Test",
  },
};

const makeActor = (designation: string | null) => {
  if (!designation) return null;
  const isManager = [
    "owner",
    "general_manager",
    "assistant_manager",
    "manager",
    "shift_manager",
  ].includes(designation);
  return {
    organizationId: "server-org",
    scope: {
      organizationId: "server-org",
      locationId: "loc-1",
      timeZone: "America/New_York",
    },
    viewer: {
      profileId: "p-1",
      name: "User",
      designation,
    },
    isManager,
    // E-1: the write decision is its own database-backed capability; by default a manager has it.
    canManageCatalog: isManager,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from });
  mocks.session.mockResolvedValue(null);
  mocks.user.mockResolvedValue(makeActor("manager"));
  mocks.rpc.mockResolvedValue({ data: { id, version: 2 }, error: null });
});
describe("management action boundaries", () => {
  it.each([true, false])("management archive/restore %s", async (archived) => {
    expect(
      (await setRecipeArchivedAction({ ...archive, archived, categoryId: id }))
        .ok,
    ).toBe(true);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_organization_id: "server-org",
      p_archived: archived,
      p_category_id: id,
    });
  });
  it("management can add categories", async () =>
    expect((await manageRecipeCategoryAction(category)).ok).toBe(true));
  it.each(["staff", null])(
    "rejects %s before all management access",
    async (designation) => {
      mocks.user.mockResolvedValue(makeActor(designation));
      for (const result of [
        await setRecipeArchivedAction(archive),
        await manageRecipeCategoryAction(category),
        await getRecipeCategoriesAction({ restaurantSlug: "test" }),
      ])
        expect(result).toMatchObject({ ok: false, kind: "permission" });
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );
  it("E-1: refuses a manager whose database catalog decision is false (writes AND the category editor read)", async () => {
    mocks.user.mockResolvedValue({
      ...makeActor("manager")!,
      canManageCatalog: false,
    });
    for (const result of [
      await setRecipeArchivedAction(archive),
      await manageRecipeCategoryAction(category),
      await getRecipeCategoriesAction({ restaurantSlug: "test" }),
    ])
      expect(result).toMatchObject({ ok: false, kind: "permission" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("requires live session", async () => {
    mocks.session.mockResolvedValue({
      ok: false,
      sessionInvalid: true,
      error: "Expired",
    });
    expect(await setRecipeArchivedAction(archive)).toMatchObject({
      sessionInvalid: true,
    });
    expect(await manageRecipeCategoryAction(category)).toMatchObject({
      sessionInvalid: true,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("validates input before client creation", async () => {
    expect(
      (await setRecipeArchivedAction({ ...archive, expectedVersion: 0 })).ok,
    ).toBe(false);
    expect(
      (
        await manageRecipeCategoryAction({
          ...category,
          command: { ...category.command, name: " " },
        })
      ).ok,
    ).toBe(false);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each(["PT409", "42501", "22023"])(
    "propagates %s without retry",
    async (code) => {
      mocks.rpc.mockResolvedValue({ error: { code } });
      expect((await setRecipeArchivedAction(archive)).ok).toBe(false);
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
    },
  );
});
