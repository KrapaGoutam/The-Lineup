import { describe, expect, it } from "vitest";

import {
  MODULE_METADATA_MAX_BYTES,
  buildModuleConfigSnapshot,
  isModuleUsable,
  listMissingConfigurableModules,
  listModuleStates,
  mapModuleConfigRow,
  parseModuleMetadata,
  resolveModuleState,
  type LocationModuleConfig,
  type LocationModuleConfigRow,
  type ModuleConfigReadResult,
} from "./module-config";
import { CONFIGURABLE_MODULE_KEYS, MODULE_KEYS } from "./module-registry";

const LOC = "00000000-0000-0000-0000-0000000620b2";

function config(
  moduleKey: LocationModuleConfig["moduleKey"],
  isEnabled: boolean,
): LocationModuleConfig {
  return {
    locationId: LOC,
    moduleKey,
    isEnabled,
    metadata: {},
    createdAt: "2026-11-05T00:00:00Z",
    updatedAt: "2026-11-05T00:00:00Z",
    updatedBy: null,
  };
}

function row(
  over: Partial<LocationModuleConfigRow> = {},
): LocationModuleConfigRow {
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

const FAILURES: ReadonlyArray<ModuleConfigReadResult> = [
  { status: "location_unavailable", locationId: LOC, reason: "not_found" },
  { status: "unauthorized", reason: "unauthenticated" },
  { status: "unauthorized", reason: "permission_denied" },
  { status: "unavailable", reason: "schema_missing" },
  { status: "unavailable", reason: "database_error" },
  { status: "error", code: "invalid_row", message: "bad" },
  { status: "error", code: "unexpected", message: "boom" },
];

describe("module state resolution (V2-004.001)", () => {
  const snapshot = buildModuleConfigSnapshot(LOC, "active", [
    config("tasks", true),
    config("payroll", false),
  ]);

  it("MC-017: enabled, disabled and missing are three distinct states", () => {
    const enabled = resolveModuleState(snapshot, "tasks");
    const disabled = resolveModuleState(snapshot, "payroll");
    const missing = resolveModuleState(snapshot, "recipes");
    expect([enabled.status, disabled.status, missing.status]).toEqual([
      "enabled",
      "disabled",
      "missing",
    ]);
    expect(isModuleUsable(enabled)).toBe(true);
    expect(isModuleUsable(disabled)).toBe(false);
    // A missing configuration is NOT an explicitly enabled module.
    expect(isModuleUsable(missing)).toBe(false);
  });

  it("MC-018: no failure state is ever usable or looks like a configuration", () => {
    for (const failure of FAILURES) {
      for (const key of CONFIGURABLE_MODULE_KEYS) {
        const state = resolveModuleState(failure, key);
        expect(state.status).toBe(failure.status);
        expect(["enabled", "disabled", "missing"]).not.toContain(state.status);
        expect(isModuleUsable(state)).toBe(false);
      }
    }
  });

  it("Settings is system_required regardless of any read failure (no admin lock-out)", () => {
    for (const result of [snapshot, ...FAILURES]) {
      const state = resolveModuleState(result, "settings");
      expect(state).toEqual({ status: "system_required" });
      expect(isModuleUsable(state)).toBe(true);
    }
  });

  it("an inactive or archived location is not operationally usable", () => {
    for (const lifecycle of ["inactive", "archived"] as const) {
      const result = buildModuleConfigSnapshot(LOC, lifecycle, [
        config("tasks", true),
      ]);
      const state = resolveModuleState(result, "tasks");
      expect(state).toEqual({
        status: "location_unavailable",
        reason: lifecycle,
      });
      expect(isModuleUsable(state)).toBe(false);
      // ...but the management view can still read the stored decision.
      expect(result.configs.get("tasks")?.isEnabled).toBe(true);
    }
  });

  it("two locations of one organization resolve independently", () => {
    const nasa = buildModuleConfigSnapshot("nasa", "active", [
      config("bar_inventory", true),
    ]);
    const leagueCity = buildModuleConfigSnapshot("lc", "active", [
      config("bar_inventory", false),
    ]);
    expect(resolveModuleState(nasa, "bar_inventory").status).toBe("enabled");
    expect(resolveModuleState(leagueCity, "bar_inventory").status).toBe(
      "disabled",
    );
  });

  it("listModuleStates covers every module once, in registry order", () => {
    const entries = listModuleStates(snapshot);
    expect(entries.map((e) => e.module.key)).toEqual([...MODULE_KEYS]);
    expect(entries.at(-1)?.state.status).toBe("system_required");
  });

  it("listMissingConfigurableModules reports backfill candidates only for ok reads", () => {
    expect(listMissingConfigurableModules(snapshot)).toEqual(
      CONFIGURABLE_MODULE_KEYS.filter((k) => k !== "tasks" && k !== "payroll"),
    );
    for (const failure of FAILURES) {
      expect(listMissingConfigurableModules(failure)).toEqual([]);
    }
  });
});

describe("module metadata envelope (mirrors the database validator)", () => {
  it("accepts the documented shapes", () => {
    expect(parseModuleMetadata({})).toEqual({});
    expect(
      parseModuleMetadata({ schemaVersion: 1, note: "Seasonal", settings: {} }),
    ).toEqual({ schemaVersion: 1, note: "Seasonal", settings: {} });
  });

  it.each([
    ["null", null],
    ["array", ["a"]],
    ["string", "x"],
    ["roles smuggled in", { roles: ["owner"] }],
    ["permissions", { permissions: { write: true } }],
    ["credential-like", { token: "x" }],
    ["schemaVersion 2", { schemaVersion: 2 }],
    ["schemaVersion string", { schemaVersion: "1" }],
    ["blank note", { note: "   " }],
    ["non-string note", { note: 42 }],
    ["note too long", { note: "x".repeat(281) }],
    ["non-empty settings", { settings: { a: 1 } }],
    ["settings array", { settings: [] }],
    ["oversized", { note: "ok", pad: "y".repeat(MODULE_METADATA_MAX_BYTES) }],
  ])("rejects %s", (_label, value) => {
    expect(parseModuleMetadata(value)).toBeNull();
  });

  it("counts a 280-character note as valid and 281 as invalid (code points)", () => {
    expect(parseModuleMetadata({ note: "é".repeat(280) })).not.toBeNull();
    expect(parseModuleMetadata({ note: "é".repeat(281) })).toBeNull();
  });
});

describe("row mapping", () => {
  it("maps a valid row", () => {
    const mapped = mapModuleConfigRow(row({ metadata: { note: "n" } }));
    expect(mapped).toMatchObject({
      kind: "ok",
      config: { moduleKey: "tasks", isEnabled: true, metadata: { note: "n" } },
    });
  });

  it("flags an unrecognized module key (newer database) without trusting it", () => {
    const mapped = mapModuleConfigRow(
      row({
        module_key: "future_module" as LocationModuleConfigRow["module_key"],
      }),
    );
    expect(mapped).toEqual({
      kind: "unrecognized_module",
      moduleKey: "future_module",
    });
  });

  it("flags a row whose metadata violates the contract", () => {
    expect(
      mapModuleConfigRow(row({ metadata: { roles: ["owner"] } })).kind,
    ).toBe("invalid");
  });
});
