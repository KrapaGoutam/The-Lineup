import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  save: vi.fn(),
  client: {},
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mocks.client,
}));
vi.mock("../data/module-config-mutation", () => ({
  saveModuleConfig: mocks.save,
  loadModuleEditor: vi.fn(),
}));
import { saveModuleSettingsAction } from "./module-config-actions";
const input = {
  locationId: "location",
  organizationId: "org",
  actorId: "actor",
  moduleKey: "tasks" as const,
  isEnabled: false,
  expectedUpdatedAt: null,
};
describe("module settings server refresh", () => {
  beforeEach(() => vi.clearAllMocks());
  it("refreshes server navigation after successful save", async () => {
    mocks.save.mockResolvedValue({ ok: true, data: {} });
    expect((await saveModuleSettingsAction(input)).ok).toBe(true);
    expect(mocks.save).toHaveBeenCalledWith(input, mocks.client);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("does not refresh or report success after a denied save", async () => {
    mocks.save.mockResolvedValue({ ok: false, code: "unauthorized" });
    expect((await saveModuleSettingsAction(input)).ok).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
