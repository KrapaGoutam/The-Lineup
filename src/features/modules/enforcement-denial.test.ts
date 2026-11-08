import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * V2-004.004 (BE-20, BE-21…BE-29): when the module guard denies, a Server
 * Action must stop BEFORE it touches the database. One representative action
 * per module group, driven through the real action code with the data edge
 * mocked and the guard forced to deny. (The decision itself is covered by the
 * domain/data unit tests, the SQL seams by pgTAP and the real-JWT suite.)
 */

const edge = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  storage: vi.fn(),
  guard: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/allocation/data/allocation-actor", () => ({
  getAllocationActor: async () => ({
    profileId: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    designation: "owner",
    name: "Owner",
  }),
}));
vi.mock("@/features/tips/data/tips-actor", () => ({
  getTipsActor: async () => ({
    organizationId: "22222222-2222-4222-8222-222222222222",
    scope: {
      organizationId: "22222222-2222-4222-8222-222222222222",
      locationId: "33333333-3333-4333-8333-333333333333",
      timeZone: "America/Chicago",
    },
    viewer: {
      profileId: "11111111-1111-4111-8111-111111111111",
      name: "Owner",
      designation: "owner",
    },
  }),
}));
vi.mock("@/features/schedules/data/schedule-actor", () => ({
  getScheduleActor: async () => ({
    organizationId: "22222222-2222-4222-8222-222222222222",
    scope: {
      organizationId: "22222222-2222-4222-8222-222222222222",
      locationId: "33333333-3333-4333-8333-333333333333",
      timeZone: "America/Chicago",
    },
    viewer: {
      profileId: "11111111-1111-4111-8111-111111111111",
      name: "Owner",
      designation: "owner",
    },
  }),
}));
vi.mock("@/features/context/data/workspace-expectation", () => ({
  assertWorkspaceExpectation: async () => ({
    ok: true,
    location: {
      id: "33333333-3333-4333-8333-333333333333",
      time_zone: "America/Chicago",
    },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/modules/data/module-enforcement", () => ({
  guardModule: edge.guard,
  guardModuleForSlug: edge.guard,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: edge.rpc,
    from: edge.from,
    storage: { from: edge.storage },
    auth: { getUser: edge.getUser },
  }),
}));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: async () => null,
}));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: async () => ({
    profileId: "11111111-1111-4111-8111-111111111111",
    organizationId: "22222222-2222-4222-8222-222222222222",
    designation: "owner",
    role: "owner",
    name: "Owner",
  }),
}));
vi.mock("@/features/locations/data/primary-location", () => ({
  getPrimaryLocation: async () => ({
    id: "33333333-3333-4333-8333-333333333333",
    time_zone: "America/Chicago",
  }),
}));
vi.mock("@/features/team/data/audit-log", () => ({
  writeAuditEvent: vi.fn(),
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const LOC = "33333333-3333-4333-8333-333333333333";
const PROFILE = "11111111-1111-4111-8111-111111111111";
const SLUG = "the-monks";

const DENIED = {
  ok: false as const,
  error: "This feature is turned off for this location.",
  moduleUnavailable: true as const,
};

function untouched() {
  expect(edge.rpc).not.toHaveBeenCalled();
  expect(edge.from).not.toHaveBeenCalled();
  expect(edge.storage).not.toHaveBeenCalled();
}

beforeEach(() => {
  edge.rpc.mockReset();
  edge.from.mockReset();
  edge.storage.mockReset();
  edge.getUser
    .mockReset()
    .mockResolvedValue({ data: { user: { id: PROFILE } } });
  edge.guard.mockReset().mockResolvedValue(DENIED);
});

describe("a denied module never reaches the database", () => {
  it("BE-21 Table Allocation: board undo", async () => {
    const { undoBoardAction } = await import(
      "@/features/allocation/actions/allocation-actions"
    );
    const result = await undoBoardAction({
      restaurantSlug: SLUG,
      organizationId: ORG,
      serviceSessionId: 1,
    });
    expect(result).toMatchObject({ ok: false, moduleUnavailable: true });
    untouched();
    expect(edge.guard).toHaveBeenCalledWith(
      expect.objectContaining({ module: "table_allocation" }),
    );
  });

  it("BE-21 Table Allocation: a board mutation names its CLAIMED location, never selects one", async () => {
    const { executeBoardActionRemote } = await import(
      "@/features/allocation/actions/allocation-actions"
    );
    const result = await executeBoardActionRemote({
      restaurantSlug: SLUG,
      organizationId: ORG,
      locationId: LOC,
      timeZone: "America/Chicago",
      serviceSessionId: 1,
      action: { type: "clearBoard" } as never,
    });
    expect(result).toMatchObject({ ok: false, moduleUnavailable: true });
    untouched();
    expect(edge.guard).toHaveBeenCalledWith(
      expect.objectContaining({
        module: "table_allocation",
        claimedLocationId: LOC,
      }),
    );
  });

  it("BE-23 Tips: finalize", async () => {
    const { finalizeTipsAction } = await import(
      "@/features/tips/actions/tips-actions"
    );
    const result = await finalizeTipsAction({
      restaurantSlug: SLUG,
      organizationId: ORG,
      locationId: LOC,
      tipPoolId: 7,
    });
    expect(result).toMatchObject({ ok: false, moduleUnavailable: true });
    untouched();
  });

  it("BE-24 Schedule: delete shift and publish", async () => {
    const { deleteShiftAction, publishScheduleAction } = await import(
      "@/features/schedules/actions/schedule-actions"
    );
    expect(
      await deleteShiftAction({
        restaurantSlug: SLUG,
        organizationId: ORG,
        shiftId: "5",
      }),
    ).toMatchObject({ ok: false, moduleUnavailable: true });
    expect(
      await publishScheduleAction({
        restaurantSlug: SLUG,
        locationId: LOC,
        timeZone: "America/Chicago",
      }),
    ).toMatchObject({ ok: false, moduleUnavailable: true });
    untouched();
  });

  it("BE-27 Bar Inventory: order drafts and catalog commands", async () => {
    const { listOrderDraftsAction } = await import(
      "@/features/bar-inventory/actions/order-draft-actions"
    );
    expect(await listOrderDraftsAction({ restaurantSlug: SLUG })).toMatchObject(
      { ok: false, moduleUnavailable: true },
    );
    untouched();
  });

  it("BE-28 Recipes: archive", async () => {
    const { setRecipeArchivedAction } = await import(
      "@/features/recipes/actions/recipe-management-actions"
    );
    const result = await setRecipeArchivedAction({
      restaurantSlug: SLUG,
      recipeId: "44444444-4444-4444-8444-444444444444",
      expectedVersion: 1,
      archived: true,
    } as never);
    expect(result).toMatchObject({ ok: false });
    untouched();
  });

  it("BE-29 Team: rename and designation change (optional Team operations)", async () => {
    const { renameTeamMemberAction } = await import(
      "@/features/team/actions/member-actions"
    );
    const { updateTeamDesignationAction } = await import(
      "@/features/team/actions/team-actions"
    );
    expect(
      await renameTeamMemberAction({
        restaurantSlug: SLUG,
        organizationId: ORG,
        targetProfileId: PROFILE,
        previousDisplayName: "A",
        nextDisplayName: "Bee",
      }),
    ).toMatchObject({ ok: false, moduleUnavailable: true });
    expect(
      await updateTeamDesignationAction({
        restaurantSlug: SLUG,
        organizationId: ORG,
        targetProfileId: PROFILE,
        previousDesignation: "staff",
        nextDesignation: "manager",
      }),
    ).toMatchObject({ ok: false, moduleUnavailable: true });
    untouched();
  });
});
