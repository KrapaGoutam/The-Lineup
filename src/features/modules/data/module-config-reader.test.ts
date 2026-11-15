import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

import { resolveModuleState, isModuleUsable } from "../domain/module-config";
import { readLocationModuleConfigs } from "./module-config-reader";

const LOC = "00000000-0000-0000-0000-0000000620b2";

interface Outcome<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

interface FakeOptions {
  user?: { id: string } | null;
  authError?: { name: string } | null;
  location?: Outcome<{
    id: string;
    active: boolean;
    archived_at: string | null;
  }>;
  rows?: Outcome<Array<Record<string, unknown>>>;
  throwOn?: "auth" | "locations" | "configs";
}

function fakeClient(options: FakeOptions = {}) {
  const calls: string[] = [];
  const client = {
    auth: {
      getUser: async () => {
        if (options.throwOn === "auth") throw new Error("network");
        return {
          data: {
            user: options.user === undefined ? { id: "u1" } : options.user,
          },
          error: options.authError ?? null,
        };
      },
    },
    from: (table: string) => {
      calls.push(table);
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            calls.push(`${table}.${column}=${value}`);
            if (table === "locations") {
              return {
                maybeSingle: async () => {
                  if (options.throwOn === "locations")
                    throw new Error("network");
                  return (
                    options.location ?? {
                      data: { id: LOC, active: true, archived_at: null },
                      error: null,
                    }
                  );
                },
              };
            }
            if (options.throwOn === "configs") {
              return Promise.reject(new Error("network"));
            }
            return Promise.resolve(options.rows ?? { data: [], error: null });
          },
        }),
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

function dbRow(over: Record<string, unknown> = {}) {
  return {
    location_id: LOC,
    module_key: "tasks",
    is_enabled: true,
    metadata: {},
    created_at: "2026-11-05T00:00:00Z",
    updated_at: "2026-11-05T00:00:00Z",
    updated_by: null,
    ...over,
  };
}

describe("readLocationModuleConfigs (V2-004.001)", () => {
  it("returns enabled / disabled / missing from real rows", async () => {
    const { client } = fakeClient({
      rows: {
        data: [dbRow(), dbRow({ module_key: "payroll", is_enabled: false })],
        error: null,
      },
    });
    const result = await readLocationModuleConfigs(LOC, client);
    expect(result.status).toBe("ok");
    expect(resolveModuleState(result, "tasks").status).toBe("enabled");
    expect(resolveModuleState(result, "payroll").status).toBe("disabled");
    expect(resolveModuleState(result, "recipes").status).toBe("missing");
  });

  it("a location with zero rows is 'ok' with every module missing (not enabled)", async () => {
    const { client } = fakeClient();
    const result = await readLocationModuleConfigs(LOC, client);
    expect(result.status).toBe("ok");
    expect(resolveModuleState(result, "tasks")).toEqual({ status: "missing" });
    expect(isModuleUsable(resolveModuleState(result, "tasks"))).toBe(false);
  });

  it("reports inactive and archived lifecycle", async () => {
    for (const [loc, lifecycle] of [
      [{ id: LOC, active: false, archived_at: null }, "inactive"],
      [
        { id: LOC, active: false, archived_at: "2026-11-01T00:00:00Z" },
        "archived",
      ],
    ] as const) {
      const { client } = fakeClient({ location: { data: loc, error: null } });
      const result = await readLocationModuleConfigs(LOC, client);
      expect(result).toMatchObject({ status: "ok", lifecycle });
    }
  });

  it("MC-018: a location the caller cannot see is location_unavailable, not empty config", async () => {
    const { client, calls } = fakeClient({
      location: { data: null, error: null },
    });
    const result = await readLocationModuleConfigs(LOC, client);
    expect(result).toEqual({
      status: "location_unavailable",
      locationId: LOC,
      reason: "not_found",
    });
    // No configuration is read for a location that is not visible.
    expect(calls).not.toContain("location_module_configs");
  });

  it("rejects a malformed location id without querying", async () => {
    const { client, calls } = fakeClient();
    for (const bad of [
      "",
      "   ",
      "not-a-uuid",
      "' or 1=1 --",
      "x".repeat(200),
    ]) {
      const result = await readLocationModuleConfigs(bad, client);
      expect(result.status).toBe("location_unavailable");
    }
    expect(calls).toEqual([]);
  });

  it("MC-018: no session is unauthorized", async () => {
    const { client } = fakeClient({ user: null });
    expect(await readLocationModuleConfigs(LOC, client)).toEqual({
      status: "unauthorized",
      reason: "unauthenticated",
    });
    const failed = fakeClient({ authError: { name: "AuthApiError" } });
    expect(await readLocationModuleConfigs(LOC, failed.client)).toEqual({
      status: "unauthorized",
      reason: "unauthenticated",
    });
  });

  it("MC-018: a transient auth transport failure is unavailable, not unauthenticated", async () => {
    const { client } = fakeClient({
      authError: { name: "AuthRetryableFetchError" },
    });
    expect(await readLocationModuleConfigs(LOC, client)).toEqual({
      status: "unavailable",
      reason: "database_error",
    });
  });

  it("MC-018: permission errors are unauthorized", async () => {
    const { client } = fakeClient({
      rows: { data: null, error: { code: "42501", message: "denied" } },
    });
    expect(await readLocationModuleConfigs(LOC, client)).toEqual({
      status: "unauthorized",
      reason: "permission_denied",
    });
  });

  it.each(["42P01", "PGRST205"])(
    "MC-018/MC-020: a missing table (%s) is unavailable/schema_missing, never an empty configuration",
    async (code) => {
      const { client } = fakeClient({
        rows: { data: null, error: { code, message: "no table" } },
      });
      const result = await readLocationModuleConfigs(LOC, client);
      expect(result).toEqual({
        status: "unavailable",
        reason: "schema_missing",
      });
      expect(isModuleUsable(resolveModuleState(result, "tasks"))).toBe(false);
    },
  );

  it("MC-018: any other database error is unavailable/database_error", async () => {
    const { client } = fakeClient({
      rows: { data: null, error: { code: "57P01", message: "terminating" } },
    });
    expect(await readLocationModuleConfigs(LOC, client)).toEqual({
      status: "unavailable",
      reason: "database_error",
    });
    const onLocation = fakeClient({
      location: { data: null, error: { code: "XX000", message: "boom" } },
    });
    expect(await readLocationModuleConfigs(LOC, onLocation.client)).toEqual({
      status: "unavailable",
      reason: "database_error",
    });
  });

  it.each(["auth", "locations", "configs"] as const)(
    "MC-018: a thrown %s failure never escapes and never looks like success",
    async (throwOn) => {
      const { client } = fakeClient({ throwOn });
      const result = await readLocationModuleConfigs(LOC, client);
      expect(result).toEqual({
        status: "unavailable",
        reason: "database_error",
      });
    },
  );

  it("a null data payload without an error is unavailable, not empty", async () => {
    const { client } = fakeClient({ rows: { data: null, error: null } });
    expect(await readLocationModuleConfigs(LOC, client)).toEqual({
      status: "unavailable",
      reason: "database_error",
    });
  });

  it("one malformed row fails the whole read instead of being skipped", async () => {
    const { client } = fakeClient({
      rows: {
        data: [
          dbRow(),
          dbRow({ module_key: "payroll", metadata: { roles: ["owner"] } }),
        ],
        error: null,
      },
    });
    const result = await readLocationModuleConfigs(LOC, client);
    expect(result).toMatchObject({ status: "error", code: "invalid_row" });
    expect(isModuleUsable(resolveModuleState(result, "tasks"))).toBe(false);
  });

  it("ignores a module key from a newer database instead of failing", async () => {
    const { client } = fakeClient({
      rows: {
        data: [dbRow(), dbRow({ module_key: "future_module" })],
        error: null,
      },
    });
    const result = await readLocationModuleConfigs(LOC, client);
    expect(result.status).toBe("ok");
    expect(resolveModuleState(result, "tasks").status).toBe("enabled");
  });

  it("scopes the configuration query to the requested location", async () => {
    const { client, calls } = fakeClient();
    await readLocationModuleConfigs(`  ${LOC.toUpperCase()}  `, client);
    expect(calls).toContain(
      `location_module_configs.location_id=${LOC.toUpperCase()}`,
    );
  });
});

describe("default client creation", () => {
  it("falls back to an unavailable result when the server client cannot be created", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => {
        throw new Error("missing env");
      },
    }));
    const mod = await import("./module-config-reader");
    expect(await mod.readLocationModuleConfigs(LOC)).toEqual({
      status: "unavailable",
      reason: "database_error",
    });
    vi.doUnmock("@/lib/supabase/server");
  });
});
