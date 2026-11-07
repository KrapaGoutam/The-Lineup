import { beforeEach, describe, expect, it, vi } from "vitest";

// V2-004.004: the module guard is covered by its own tests; action tests isolate it.
vi.mock("@/features/modules/data/module-enforcement", () => ({
  guardModule: vi.fn(async () => null),
  guardModuleForSlug: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getCurrentUser: vi.fn(),
  getPrimaryLocation: vi.fn(),
  getTasksSnapshot: vi.fn(),
  getTaskHistory: vi.fn(),
  requireLiveSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/require-live-session", () => ({
  requireLiveSession: mocks.requireLiveSession,
}));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/features/locations/data/primary-location", () => ({
  getPrimaryLocation: mocks.getPrimaryLocation,
}));
vi.mock("@/features/context/data/active-context", () => ({
  resolveCurrentActiveContext: vi.fn(),
}));
vi.mock("@/features/tasks/data/tasks-data", () => ({
  getTasksSnapshot: mocks.getTasksSnapshot,
}));
vi.mock("@/features/tasks/data/task-history-data", () => ({
  getTaskHistory: mocks.getTaskHistory,
}));
vi.mock("@/features/tasks/data/opening-reminder-prompt-data", () => ({
  getOpeningReminderPrompt: vi.fn(),
}));

import type { TaskCommand } from "@/features/tasks/domain/task-commands";

import {
  getTaskHistoryAction,
  getTasksSnapshotAction,
  runTaskCommandAction,
} from "./tasks-actions";

const P = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const O = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const O2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SLUG = "the-monks";
const ctx = (locationId: string, over: Record<string, string> = {}) => ({
  profileId: P,
  organizationId: O,
  locationId,
  ...over,
});
const persisted = (id: string | null) =>
  mocks.getPrimaryLocation.mockResolvedValue(
    id ? { id, time_zone: "America/Chicago" } : null,
  );

const createCommand: TaskCommand = {
  type: "create",
  input: {
    title: "Wipe the bar",
    instructions: null,
    category: "other",
    priority: "normal",
    startDate: null,
    dueDate: null,
    dueTime: null,
    dueWindow: null,
    assignmentMode: "anyone",
    assigneeIds: [],
    eachPerson: false,
  },
};

const run = (expectedContext: unknown) =>
  runTaskCommandAction({
    restaurantSlug: SLUG,
    command: createCommand,
    expectedContext,
  });

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  mocks.requireLiveSession.mockReset().mockResolvedValue(null);
  mocks.getCurrentUser.mockReset().mockResolvedValue({
    profileId: P,
    name: "Pat",
    designation: "manager",
    organizationId: O,
  });
  mocks.getPrimaryLocation.mockReset();
  mocks.getTasksSnapshot.mockReset().mockResolvedValue({ tasks: [] });
  mocks.getTaskHistory.mockReset().mockResolvedValue({ entries: [] });
});

describe("runTaskCommandAction workspace consistency (V2-003.005)", () => {
  it("MT-19: expected A + verified A -> the write runs, at the VERIFIED location", async () => {
    persisted(A);
    const result = await run(ctx(A));
    expect(result.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "task_create",
      expect.objectContaining({ p_organization_id: O, p_location_id: A }),
    );
  });

  it("MT-20: a deliberately selected B (expected B + verified B) writes only at B", async () => {
    persisted(B);
    expect((await run(ctx(B))).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "task_create",
      expect.objectContaining({ p_location_id: B }),
    );
  });

  it("MT-11/12: expected A + persisted B -> refused as stale with ZERO database calls", async () => {
    persisted(B);
    const result = await run(ctx(A));
    expect(result).toMatchObject({ ok: false, contextStale: true });
    expect(result.ok === false && result.error).toMatch(
      /active location changed/i,
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.getTasksSnapshot).not.toHaveBeenCalled();
  });

  it("MT-13: a forged expectation (asserting B while persisted at A) grants nothing", async () => {
    persisted(A);
    expect(await run(ctx(B))).toMatchObject({ ok: false, contextStale: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["not an object", "A"],
    ["an invalid location id", ctx("not-a-uuid")],
    ["carrying extra fields", { ...ctx(A), role: "owner" }],
  ])(
    "MT-13: a %s expectation fails safely: invalid, zero database calls, not flagged as a stale tab",
    async (_n, raw) => {
      persisted(A);
      const result = await run(raw);
      expect(result).toEqual({ ok: false, error: "That request is invalid." });
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.getPrimaryLocation).not.toHaveBeenCalled();
    },
  );

  it("MT-14: no longer authorized for A (no verifiable location) -> refused, nothing substituted", async () => {
    persisted(null);
    expect(await run(ctx(A))).toMatchObject({ ok: false, contextStale: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("MT-15: the tab was built for another organization -> refused before any location lookup", async () => {
    persisted(A);
    expect(await run(ctx(A, { organizationId: O2 }))).toMatchObject({
      ok: false,
      contextStale: true,
    });
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("MT-18: a different employee signed in since the tab rendered -> refused", async () => {
    persisted(A);
    expect(await run(ctx(A, { profileId: B }))).toMatchObject({
      ok: false,
      contextStale: true,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("an unauthenticated caller never reaches the consistency check or the database", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    persisted(A);
    expect(await run(ctx(A))).toMatchObject({ ok: false });
    expect(mocks.getPrimaryLocation).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("a revoked session short-circuits first", async () => {
    mocks.requireLiveSession.mockResolvedValue({
      ok: false,
      error: "signed out",
      sessionInvalid: true,
    });
    expect(await run(ctx(A))).toMatchObject({ sessionInvalid: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("every command type is gated, not just create (update by task id included)", async () => {
    persisted(B);
    const result = await runTaskCommandAction({
      restaurantSlug: SLUG,
      command: {
        type: "complete",
        taskId: "11111111-1111-4111-8111-111111111111",
      },
      expectedContext: ctx(A),
    });
    expect(result).toMatchObject({ ok: false, contextStale: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("Tasks reads never render another location under this tab's label", () => {
  it("snapshot: stale -> refused and nothing loaded", async () => {
    persisted(B);
    const result = await getTasksSnapshotAction({
      restaurantSlug: SLUG,
      expectedContext: ctx(A),
    });
    expect(result).toMatchObject({ ok: false, contextStale: true });
    expect(mocks.getTasksSnapshot).not.toHaveBeenCalled();
  });

  it("snapshot: consistent -> loaded", async () => {
    persisted(A);
    expect(
      await getTasksSnapshotAction({
        restaurantSlug: SLUG,
        expectedContext: ctx(A),
      }),
    ).toMatchObject({ ok: true });
  });

  it("history: stale -> refused and nothing loaded", async () => {
    persisted(B);
    const result = await getTaskHistoryAction({
      restaurantSlug: SLUG,
      expectedContext: ctx(A),
    });
    expect(result).toMatchObject({ ok: false, contextStale: true });
    expect(mocks.getTaskHistory).not.toHaveBeenCalled();
  });

  it("a read without an expectation is invalid (fail closed)", async () => {
    persisted(A);
    expect(await getTasksSnapshotAction({ restaurantSlug: SLUG })).toEqual({
      ok: false,
      error: "That request is invalid.",
    });
    expect(mocks.getTasksSnapshot).not.toHaveBeenCalled();
  });
});

describe("module enforcement (V2-004.004, BE-22)", () => {
  it("a module denial refuses the write with NO database call, and checks the VERIFIED location", async () => {
    const { guardModule } = await import(
      "@/features/modules/data/module-enforcement"
    );
    persisted(A);
    vi.mocked(guardModule).mockResolvedValueOnce({
      ok: false,
      error: "This feature is turned off for this location.",
      moduleUnavailable: true,
    });

    const result = await run(ctx(A));

    expect(result).toMatchObject({ ok: false, moduleUnavailable: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.getTasksSnapshot).not.toHaveBeenCalled();
    expect(guardModule).toHaveBeenLastCalledWith({
      module: "tasks",
      organizationId: O,
      location: { id: A, time_zone: "America/Chicago" },
    });
  });

  it("the read paths are guarded too (snapshot and history)", async () => {
    const { guardModule } = await import(
      "@/features/modules/data/module-enforcement"
    );
    persisted(A);
    const denied = {
      ok: false as const,
      error: "This feature is turned off for this location.",
      moduleUnavailable: true as const,
    };
    vi.mocked(guardModule).mockResolvedValueOnce(denied);
    expect(
      await getTasksSnapshotAction({
        restaurantSlug: SLUG,
        expectedContext: ctx(A),
      }),
    ).toMatchObject({ ok: false, moduleUnavailable: true });
    vi.mocked(guardModule).mockResolvedValueOnce(denied);
    expect(
      await getTaskHistoryAction({
        restaurantSlug: SLUG,
        expectedContext: ctx(A),
      }),
    ).toMatchObject({ ok: false, moduleUnavailable: true });
    expect(mocks.getTasksSnapshot).not.toHaveBeenCalled();
    expect(mocks.getTaskHistory).not.toHaveBeenCalled();
  });
});
