import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.generated";

vi.mock("@/features/locations/data/primary-location", () => ({
  getPrimaryLocation: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  buildModuleConfigSnapshot,
  type LocationModuleConfig,
  type ModuleConfigReadResult,
} from "../domain/module-config";
import type { ConfigurableModuleKey } from "../domain/module-registry";
import {
  checkModuleAccess,
  guardModule,
  readModuleEnforcementMode,
} from "./module-enforcement";

const ORG = "00000000-0000-0000-0000-0000000000a1";
const LOC = "00000000-0000-0000-0000-0000000000b1";

const ACTIVE = { status: "ok", mode: "active", source: "database" } as const;
const STAGED = { status: "ok", mode: "staged", source: "database" } as const;

function cfg(
  key: ConfigurableModuleKey,
  enabled: boolean,
): LocationModuleConfig {
  return {
    locationId: LOC,
    moduleKey: key,
    isEnabled: enabled,
    metadata: {},
    createdAt: "t",
    updatedAt: "t",
    updatedBy: null,
  };
}
const enabledTasks = buildModuleConfigSnapshot(LOC, "active", [
  cfg("tasks", true),
]);

function modeClient(outcome: {
  data?: { mode: unknown } | null;
  error?: { code?: string } | null;
  throws?: boolean;
}) {
  return {
    from: (table: string) => {
      expect(table).toBe("module_enforcement_settings");
      return {
        select: () => ({
          maybeSingle: async () => {
            if (outcome.throws) throw new Error("network");
            return { data: outcome.data ?? null, error: outcome.error ?? null };
          },
        }),
      };
    },
  } as unknown as SupabaseClient<Database>;
}

afterEach(() => vi.restoreAllMocks());

describe("readModuleEnforcementMode", () => {
  it("reads staged and active", async () => {
    expect(
      await readModuleEnforcementMode(modeClient({ data: { mode: "staged" } })),
    ).toEqual({ status: "ok", mode: "staged", source: "database" });
    expect(
      await readModuleEnforcementMode(modeClient({ data: { mode: "active" } })),
    ).toEqual({ status: "ok", mode: "active", source: "database" });
  });

  it("treats an undeployed switch table as staged (no environment can be active without it)", async () => {
    for (const code of ["42P01", "PGRST205", "PGRST200"]) {
      expect(
        await readModuleEnforcementMode(modeClient({ error: { code } })),
      ).toEqual({ status: "ok", mode: "staged", source: "not_deployed" });
    }
  });

  it("fails closed on any other failure, an unknown mode, or a missing row", async () => {
    expect(
      await readModuleEnforcementMode(modeClient({ error: { code: "08006" } })),
    ).toEqual({ status: "unavailable" });
    expect(
      await readModuleEnforcementMode(modeClient({ error: { code: "42501" } })),
    ).toEqual({ status: "unavailable" });
    expect(
      await readModuleEnforcementMode(modeClient({ throws: true })),
    ).toEqual({ status: "unavailable" });
    expect(
      await readModuleEnforcementMode(modeClient({ data: { mode: "off" } })),
    ).toEqual({ status: "invalid" });
    expect(await readModuleEnforcementMode(modeClient({ data: null }))).toEqual(
      {
        status: "invalid",
      },
    );
  });
});

describe("checkModuleAccess / guardModule", () => {
  it("BE-47 staged: allows without resolving a location or reading configuration", async () => {
    const resolveLocation = vi.fn();
    const readConfigs = vi.fn();
    const result = await guardModule(
      { module: "tasks", organizationId: ORG },
      { readMode: async () => STAGED, resolveLocation, readConfigs },
    );
    expect(result).toBeNull();
    expect(resolveLocation).not.toHaveBeenCalled();
    expect(readConfigs).not.toHaveBeenCalled();
  });

  it("BE-48 active: denies a Disabled module with a safe, flagged failure", async () => {
    const failure = await guardModule(
      { module: "tasks", organizationId: ORG },
      {
        readMode: async () => ACTIVE,
        resolveLocation: async () => ({ id: LOC }),
        readConfigs: async () =>
          buildModuleConfigSnapshot(LOC, "active", [cfg("tasks", false)]),
      },
    );
    expect(failure).toMatchObject({
      ok: false,
      moduleUnavailable: true,
      error: "This feature is turned off for this location.",
    });
  });

  it("active: allows an explicitly Enabled module", async () => {
    expect(
      await guardModule(
        { module: "tasks", organizationId: ORG },
        {
          readMode: async () => ACTIVE,
          resolveLocation: async () => ({ id: LOC }),
          readConfigs: async () => enabledTasks,
        },
      ),
    ).toBeNull();
  });

  it("reads configuration for the VERIFIED location only (BE-10/BE-15)", async () => {
    const readConfigs = vi.fn(async () => enabledTasks);
    await guardModule(
      { module: "tasks", organizationId: ORG },
      {
        readMode: async () => ACTIVE,
        resolveLocation: async () => ({ id: LOC }),
        readConfigs,
      },
    );
    expect(readConfigs).toHaveBeenCalledTimes(1);
    expect(readConfigs).toHaveBeenCalledWith(LOC);
  });

  it("uses a caller-verified location without re-resolving (Tasks workspace check)", async () => {
    const resolveLocation = vi.fn();
    const readConfigs = vi.fn(async () => enabledTasks);
    await guardModule(
      { module: "tasks", organizationId: ORG, location: { id: LOC } },
      { readMode: async () => ACTIVE, resolveLocation, readConfigs },
    );
    expect(resolveLocation).not.toHaveBeenCalled();
    expect(readConfigs).toHaveBeenCalledWith(LOC);
  });

  it("BE-18 denies as stale (and flags it) when no verified location exists", async () => {
    const readConfigs = vi.fn();
    const failure = await guardModule(
      { module: "tasks", organizationId: ORG },
      {
        readMode: async () => ACTIVE,
        resolveLocation: async () => null,
        readConfigs,
      },
    );
    expect(failure).toMatchObject({ ok: false, contextStale: true });
    expect(readConfigs).not.toHaveBeenCalled();
  });

  it("BE-05/06 fails closed when configuration cannot be read", async () => {
    const failure = await guardModule(
      { module: "payroll", organizationId: ORG },
      {
        readMode: async () => ACTIVE,
        resolveLocation: async () => ({ id: LOC }),
        readConfigs: async () =>
          ({
            status: "unavailable",
            reason: "database_error",
          }) satisfies ModuleConfigReadResult,
      },
    );
    expect(failure).toMatchObject({ ok: false, moduleUnavailable: true });
  });

  it("BE-11 anonymous: surfaces sessionInvalid so the client signs out", async () => {
    const failure = await guardModule(
      { module: "tasks", organizationId: ORG },
      {
        readMode: async () => ACTIVE,
        resolveLocation: async () => ({ id: LOC }),
        readConfigs: async () => ({
          status: "unauthorized",
          reason: "unauthenticated",
        }),
      },
    );
    expect(failure).toMatchObject({ ok: false, sessionInvalid: true });
  });

  it("an unreadable switch denies", async () => {
    const failure = await guardModule(
      { module: "tasks", organizationId: ORG },
      { readMode: async () => ({ status: "unavailable" }) },
    );
    expect(failure).toMatchObject({ ok: false, moduleUnavailable: true });
  });

  it("an unexpected exception never lets the request through", async () => {
    const failure = await guardModule(
      { module: "tasks", organizationId: ORG },
      {
        readMode: async () => {
          throw new Error("boom");
        },
      },
    );
    expect(failure).toMatchObject({ ok: false, moduleUnavailable: true });
  });

  it("BE-08 rejects an unknown module key", async () => {
    const verdict = await checkModuleAccess(
      { module: "bogus", organizationId: ORG },
      { readMode: async () => STAGED },
    );
    expect(verdict).toEqual({ allowed: false, code: "invalid_module" });
  });

  it("settings is never gated, even with the switch active and nothing readable", async () => {
    const verdict = await checkModuleAccess(
      { module: "settings", organizationId: ORG },
      {
        readMode: async () => ACTIVE,
        resolveLocation: async () => null,
      },
    );
    expect(verdict).toMatchObject({ allowed: true, basis: "system_required" });
  });

  it("BE-46 the guard exposes no client-controllable activation or demo input", () => {
    // The target type carries module/organization/location only; the switch
    // comes from the database and demo mode is never an input.
    const target = { module: "tasks", organizationId: ORG, demoMode: true };
    const verdictPromise = checkModuleAccess(target, {
      readMode: async () => ({ status: "invalid" }),
    });
    return expect(verdictPromise).resolves.toMatchObject({ allowed: false });
  });
});
