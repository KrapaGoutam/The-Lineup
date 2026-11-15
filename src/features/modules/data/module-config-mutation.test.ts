import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { loadModuleEditor, saveModuleConfig } from "./module-config-mutation";
import { buildModuleConfigSnapshot } from "../domain/module-config";
import { verifyLocationAdminAuthority } from "@/features/locations/actions/location-admin-actions";
import { readLocationModuleConfigs } from "./module-config-reader";
vi.mock("@/features/locations/actions/location-admin-actions", () => ({
  verifyLocationAdminAuthority: vi.fn(),
}));
vi.mock("./module-config-reader", () => ({
  readLocationModuleConfigs: vi.fn(),
}));
const locationId = "00000000-0000-0000-0000-000000000001",
  organizationId = "00000000-0000-0000-0000-000000000002";
const input = {
  locationId,
  organizationId,
  actorId: "actor",
  moduleKey: "tasks" as const,
  isEnabled: false,
  expectedUpdatedAt: null,
};
function setup(
  options: {
    user?: boolean;
    authority?: boolean;
    lifecycle?: "active" | "inactive" | "archived";
    foreign?: boolean;
    writeError?: string;
    empty?: boolean;
  } = {},
) {
  vi.mocked(verifyLocationAdminAuthority).mockResolvedValue(
    options.authority ?? true,
  );
  vi.mocked(readLocationModuleConfigs).mockResolvedValue(
    buildModuleConfigSnapshot(locationId, options.lifecycle ?? "active", []),
  );
  const row = {
    location_id: locationId,
    module_key: "tasks",
    is_enabled: false,
    metadata: {},
    created_at: "t",
    updated_at: "t",
    updated_by: "actor",
  };
  const insert = vi.fn();
  const update = vi.fn();
  const eq = vi.fn();
  const write = {
    select: () => ({
      maybeSingle: async () => ({
        data: options.empty ? null : row,
        error: options.writeError ? { code: options.writeError } : null,
      }),
    }),
    eq,
  };
  eq.mockReturnValue(write);
  insert.mockReturnValue(write);
  update.mockReturnValue(write);
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: options.user === false ? null : { id: "actor" } },
        error: null,
      }),
    },
    from: (table: string) =>
      table === "locations"
        ? {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: locationId,
                    organization_id: options.foreign ? "other" : organizationId,
                  },
                  error: null,
                }),
              }),
            }),
          }
        : { insert, update },
  };
  return {
    client: client as unknown as SupabaseClient<Database>,
    insert,
    update,
  };
}
describe("module settings server boundary", () => {
  it.each([false, true])(
    "authenticates and checks canonical authority (%s)",
    async (authority) => {
      const s = setup({ authority });
      const result = await saveModuleConfig(input, s.client);
      expect(result.ok).toBe(authority);
      expect(s.insert).toHaveBeenCalledTimes(authority ? 1 : 0);
    },
  );
  it.each([
    { user: false },
    { foreign: true },
    { lifecycle: "archived" as const },
  ])("denies before write %j", async (opts) => {
    const s = setup(opts);
    expect((await saveModuleConfig(input, s.client)).ok).toBe(false);
    expect(s.insert).not.toHaveBeenCalled();
  });
  it.each([
    { moduleKey: "settings" },
    { moduleKey: "unknown" },
    { isEnabled: 1 },
    { metadata: { roles: ["owner"] } },
    { actorId: "other" },
    { expectedUpdatedAt: "old" },
  ])("rejects tampering %j", async (patch) => {
    const s = setup();
    expect(
      (await saveModuleConfig({ ...input, ...patch } as typeof input, s.client))
        .ok,
    ).toBe(false);
    expect(s.insert).not.toHaveBeenCalled();
  });
  it("permits inactive preparation; writes only intended key and no audit columns", async () => {
    const s = setup({ lifecycle: "inactive" });
    expect((await saveModuleConfig(input, s.client)).ok).toBe(true);
    expect(s.insert).toHaveBeenCalledWith({
      location_id: locationId,
      module_key: "tasks",
      is_enabled: false,
    });
  });
  it("reports concurrent first insert as conflict", async () => {
    const s = setup({ writeError: "23505" });
    expect(await saveModuleConfig(input, s.client)).toEqual({
      ok: false,
      code: "conflict",
    });
  });
  it("preserves reader failures", async () => {
    const s = setup();
    vi.mocked(readLocationModuleConfigs).mockResolvedValue({
      status: "unavailable",
      reason: "schema_missing",
    });
    expect(await loadModuleEditor(input, s.client)).toEqual({
      ok: false,
      code: "schema_missing",
    });
  });
});

it("preserves authentication transport failures as database unavailable", async () => {
  const s = setup();
  vi.spyOn(s.client.auth, "getUser").mockResolvedValue({
    data: { user: null },
    error: { name: "AuthRetryableFetchError" },
  } as Awaited<ReturnType<typeof s.client.auth.getUser>>);
  expect(await loadModuleEditor(input, s.client)).toEqual({
    ok: false,
    code: "database_error",
  });
});
