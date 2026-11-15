import { describe, expect, it } from "vitest";

import {
  buildModuleConfigSnapshot,
  type LocationModuleConfig,
  type ModuleConfigReadResult,
} from "./module-config";
import {
  decideModuleAccess,
  moduleDenialMessage,
  type EnforcementModeReadResult,
  type ModuleDenialCode,
} from "./module-enforcement";
import {
  CONFIGURABLE_MODULE_KEYS,
  type ConfigurableModuleKey,
} from "./module-registry";

const LOC_A = "00000000-0000-0000-0000-00000000a001";
const LOC_B = "00000000-0000-0000-0000-00000000b002";

const ACTIVE: EnforcementModeReadResult = {
  status: "ok",
  mode: "active",
  source: "database",
};
const STAGED: EnforcementModeReadResult = {
  status: "ok",
  mode: "staged",
  source: "database",
};

function config(
  locationId: string,
  moduleKey: ConfigurableModuleKey,
  isEnabled: boolean,
): LocationModuleConfig {
  return {
    locationId,
    moduleKey,
    isEnabled,
    metadata: {},
    createdAt: "2026-11-06T00:00:00Z",
    updatedAt: "2026-11-06T00:00:00Z",
    updatedBy: null,
  };
}

function snapshot(
  locationId: string,
  configs: LocationModuleConfig[],
  lifecycle: "active" | "inactive" | "archived" = "active",
) {
  return buildModuleConfigSnapshot(locationId, lifecycle, configs);
}

describe("decideModuleAccess — active enforcement (BE-01…BE-10)", () => {
  it("BE-01 explicit Enabled continues (subject to the existing auth checks)", () => {
    const verdict = decideModuleAccess({
      module: "tasks",
      enforcement: ACTIVE,
      configuration: snapshot(LOC_A, [config(LOC_A, "tasks", true)]),
    });
    expect(verdict).toEqual({
      allowed: true,
      enforcement: "active",
      basis: "enabled",
    });
  });

  it("BE-02 explicit Disabled denies", () => {
    const verdict = decideModuleAccess({
      module: "tasks",
      enforcement: ACTIVE,
      configuration: snapshot(LOC_A, [config(LOC_A, "tasks", false)]),
    });
    expect(verdict).toEqual({ allowed: false, code: "module_disabled" });
  });

  it("BE-03 Missing denies — a missing row is never Enabled", () => {
    const verdict = decideModuleAccess({
      module: "tasks",
      enforcement: ACTIVE,
      configuration: snapshot(LOC_A, [config(LOC_A, "tips", true)]),
    });
    expect(verdict).toEqual({ allowed: false, code: "module_missing" });
  });

  it("BE-04 an invalid configuration read denies", () => {
    const verdict = decideModuleAccess({
      module: "tasks",
      enforcement: ACTIVE,
      configuration: {
        status: "error",
        code: "invalid_row",
        message: "x",
      },
    });
    expect(verdict).toEqual({ allowed: false, code: "invalid_configuration" });
  });

  it("BE-05 a missing schema (configuration table absent) fails closed when active", () => {
    const verdict = decideModuleAccess({
      module: "tasks",
      enforcement: ACTIVE,
      configuration: { status: "unavailable", reason: "schema_missing" },
    });
    expect(verdict).toEqual({
      allowed: false,
      code: "configuration_unavailable",
    });
  });

  it("BE-06 a database failure fails closed when active", () => {
    const verdict = decideModuleAccess({
      module: "payroll",
      enforcement: ACTIVE,
      configuration: { status: "unavailable", reason: "database_error" },
    });
    expect(verdict).toEqual({
      allowed: false,
      code: "configuration_unavailable",
    });
  });

  it("BE-07 an unauthenticated / refused read denies and flags the session", () => {
    expect(
      decideModuleAccess({
        module: "tasks",
        enforcement: ACTIVE,
        configuration: { status: "unauthorized", reason: "unauthenticated" },
      }),
    ).toEqual({ allowed: false, code: "unauthorized", sessionInvalid: true });
    expect(
      decideModuleAccess({
        module: "tasks",
        enforcement: ACTIVE,
        configuration: { status: "unauthorized", reason: "permission_denied" },
      }),
    ).toEqual({ allowed: false, code: "unauthorized" });
  });

  it("BE-08 an unrecognised module key denies, in every mode", () => {
    for (const enforcement of [ACTIVE, STAGED]) {
      expect(
        decideModuleAccess({
          module: "not_a_module",
          enforcement,
          configuration: snapshot(LOC_A, []),
        }),
      ).toEqual({ allowed: false, code: "invalid_module" });
    }
  });

  it("BE-09 settings (system-required) is always usable, even when everything fails", () => {
    for (const configuration of [
      null,
      { status: "unavailable", reason: "database_error" } as const,
      snapshot(LOC_A, []),
    ] satisfies (ModuleConfigReadResult | null)[]) {
      expect(
        decideModuleAccess({
          module: "settings",
          enforcement: ACTIVE,
          configuration,
        }),
      ).toMatchObject({ allowed: true, basis: "system_required" });
    }
    // ... and when the switch itself cannot be read.
    expect(
      decideModuleAccess({
        module: "settings",
        enforcement: { status: "unavailable" },
        configuration: null,
      }),
    ).toMatchObject({ allowed: true, basis: "system_required" });
  });

  it("BE-10 one location's Enabled row never grants another location", () => {
    // The caller reads the VERIFIED location's rows; a foreign location's
    // rows cannot enter that snapshot, and a snapshot for B has no tasks row.
    const forB = snapshot(LOC_B, [config(LOC_A, "tasks", true)].slice(0, 0));
    expect(
      decideModuleAccess({
        module: "tasks",
        enforcement: ACTIVE,
        configuration: forB,
      }),
    ).toEqual({ allowed: false, code: "module_missing" });
  });

  it("denies an inactive or archived location even when the module is Enabled", () => {
    for (const lifecycle of ["inactive", "archived"] as const) {
      expect(
        decideModuleAccess({
          module: "tasks",
          enforcement: ACTIVE,
          configuration: snapshot(
            LOC_A,
            [config(LOC_A, "tasks", true)],
            lifecycle,
          ),
        }),
      ).toEqual({ allowed: false, code: "location_unavailable" });
    }
  });

  it("denies when no verified location exists (stale / ambiguous context)", () => {
    expect(
      decideModuleAccess({
        module: "tasks",
        enforcement: ACTIVE,
        configuration: null,
      }),
    ).toEqual({ allowed: false, code: "stale_context" });
  });

  it("an unreadable activation switch denies (not knowing is not permission)", () => {
    expect(
      decideModuleAccess({
        module: "tasks",
        enforcement: { status: "unavailable" },
        configuration: snapshot(LOC_A, [config(LOC_A, "tasks", true)]),
      }),
    ).toEqual({ allowed: false, code: "configuration_unavailable" });
    expect(
      decideModuleAccess({
        module: "tasks",
        enforcement: { status: "invalid" },
        configuration: snapshot(LOC_A, [config(LOC_A, "tasks", true)]),
      }),
    ).toEqual({ allowed: false, code: "invalid_configuration" });
  });

  it("every configurable module is individually enforced", () => {
    for (const key of CONFIGURABLE_MODULE_KEYS) {
      const others = CONFIGURABLE_MODULE_KEYS.filter((k) => k !== key).map(
        (k) => config(LOC_A, k, true),
      );
      expect(
        decideModuleAccess({
          module: key,
          enforcement: ACTIVE,
          configuration: snapshot(LOC_A, [
            ...others,
            config(LOC_A, key, false),
          ]),
        }),
      ).toEqual({ allowed: false, code: "module_disabled" });
      expect(
        decideModuleAccess({
          module: key,
          enforcement: ACTIVE,
          configuration: snapshot(LOC_A, others),
        }),
      ).toEqual({ allowed: false, code: "module_missing" });
    }
  });
});

describe("decideModuleAccess — staged (pre-activation) behaviour (BE-47)", () => {
  it("allows a Disabled, Missing or unreadable module without consulting configuration", () => {
    for (const configuration of [
      snapshot(LOC_A, [config(LOC_A, "tasks", false)]),
      snapshot(LOC_A, []),
      null,
    ]) {
      expect(
        decideModuleAccess({
          module: "tasks",
          enforcement: STAGED,
          configuration,
        }),
      ).toEqual({ allowed: true, enforcement: "staged", basis: "staged" });
    }
  });

  it("treats a switch table that is not deployed as staged", () => {
    expect(
      decideModuleAccess({
        module: "tasks",
        enforcement: { status: "ok", mode: "staged", source: "not_deployed" },
        configuration: null,
      }),
    ).toMatchObject({ allowed: true, enforcement: "staged" });
  });
});

describe("moduleDenialMessage", () => {
  const codes: ModuleDenialCode[] = [
    "module_disabled",
    "module_missing",
    "location_unavailable",
    "unauthorized",
    "stale_context",
    "configuration_unavailable",
    "invalid_configuration",
    "invalid_module",
  ];

  it("gives every code a safe sentence that leaks no internals", () => {
    for (const code of codes) {
      const message = moduleDenialMessage(code);
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toMatch(
        /location_module|postgres|PGRST|organization|uuid|\b[0-9a-f]{8}-/i,
      );
    }
  });

  it("does not reveal whether a module is disabled or was never configured", () => {
    expect(moduleDenialMessage("module_disabled")).toBe(
      moduleDenialMessage("module_missing"),
    );
  });
});
